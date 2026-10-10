import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('./ideas-server.mjs', import.meta.url));

function frame(value) {
  const json = JSON.stringify(value);
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

function pull(buffer) {
  const separator = buffer.indexOf('\r\n\r\n');
  if (separator === -1) return null;
  const header = buffer.subarray(0, separator).toString('utf8');
  const match = /Content-Length:\s*(\d+)/i.exec(header);
  if (!match) return { rest: buffer.subarray(separator + 4), message: null };
  const length = Number(match[1]);
  const start = separator + 4;
  if (buffer.length < start + length) return null;
  return {
    rest: buffer.subarray(start + length),
    message: buffer.subarray(start, start + length).toString('utf8'),
  };
}

function startServer(filePath) {
  const child = spawn(process.execPath, [serverPath, filePath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  let buffer = Buffer.alloc(0);
  const queue = [];
  const pending = [];
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  function deliver(message) {
    const waiter = pending.shift();
    if (waiter) waiter.resolve(message);
    else queue.push(message);
  }

  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      const parsed = pull(buffer);
      if (!parsed) break;
      buffer = parsed.rest;
      if (parsed.message) deliver(JSON.parse(parsed.message));
    }
  });

  child.on('exit', (code) => {
    const error = new Error(`server exited ${code}: ${stderr}`);
    while (pending.length > 0) pending.shift().reject(error);
  });

  return {
    send(value) {
      child.stdin.write(frame(value));
    },
    next() {
      const existing = queue.shift();
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          resolve(message) {
            clearTimeout(timer);
            resolve(message);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          },
        };
        const timer = setTimeout(() => {
          const index = pending.indexOf(waiter);
          if (index !== -1) pending.splice(index, 1);
          reject(new Error(`timed out waiting for the server: ${stderr}`));
        }, 3000);
        pending.push(waiter);
      });
    },
    async close() {
      child.stdin.end();
      await new Promise((resolve) => {
        if (child.exitCode !== null) resolve();
        else {
          const timer = setTimeout(() => {
            child.kill();
            resolve();
          }, 1000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        }
      });
    },
  };
}

function sampleFile() {
  return {
    organice: 1,
    exportedAt: '2026-10-08T00:00:00.000Z',
    ideas: [
      {
        id: 'idea-1',
        title: 'Keep this title',
        body: 'SECRET-BODY',
        status: 'raw',
        taskId: null,
        updatedAt: '2026-10-07T00:00:00.000Z',
        review: null,
      },
      {
        id: 'idea-2',
        title: 'Second title',
        body: 'Other body',
        status: 'compiled',
        taskId: 'task-9',
        updatedAt: '2026-10-07T01:00:00.000Z',
        review: null,
      },
    ],
  };
}

test('missing file path exits 1', async () => {
  const child = spawn(process.execPath, [serverPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const code = await new Promise((resolve) => {
    child.on('exit', resolve);
  });
  assert.equal(code, 1);
  assert.equal(stderr, 'Missing ideas file path\n');
});

test('the server lists ideas, returns one, and saves a review without changing the title', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'organice-ideas-'));
  const filePath = join(directory, 'ideas.json');
  writeFileSync(filePath, JSON.stringify(sampleFile()));
  const client = startServer(filePath);
  try {
    client.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    });
    const initialized = await client.next();
    assert.equal(initialized.id, 1);
    assert.equal(initialized.result.protocolVersion, '2024-11-05');
    assert.deepEqual(initialized.result.capabilities, { tools: {} });
    assert.deepEqual(initialized.result.serverInfo, { name: 'organice-ideas', version: '1.0.0' });

    client.send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    client.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const listed = await client.next();
    assert.equal(listed.id, 2);
    const names = listed.result.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, ['get_idea', 'list_ideas', 'save_review']);

    client.send({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'list_ideas', arguments: {} },
    });
    const listResult = await client.next();
    assert.equal(listResult.result.isError, false);
    const summaries = JSON.parse(listResult.result.content[0].text);
    assert.equal(listResult.result.content[0].text.includes('SECRET-BODY'), false);
    assert.deepEqual(summaries[0], {
      id: 'idea-1',
      title: 'Keep this title',
      status: 'raw',
      updatedAt: '2026-10-07T00:00:00.000Z',
    });

    client.send({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'get_idea', arguments: { id: 'idea-1' } },
    });
    const got = await client.next();
    assert.deepEqual(JSON.parse(got.result.content[0].text), {
      title: 'Keep this title',
      body: 'SECRET-BODY',
      status: 'raw',
      taskId: null,
      review: null,
    });

    client.send({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'save_review', arguments: { id: 'idea-1', text: 'Ship the smaller version.' } },
    });
    const saved = await client.next();
    assert.equal(saved.result.isError, false);
    const file = JSON.parse(readFileSync(filePath, 'utf8'));
    assert.equal(file.organice, 1);
    assert.equal(file.ideas[0].title, 'Keep this title');
    assert.equal(file.ideas[0].body, 'SECRET-BODY');
    assert.equal(file.ideas[0].taskId, null);
    assert.equal(file.ideas[0].status, 'reviewed');
    assert.equal(file.ideas[0].review.text, 'Ship the smaller version.');
    assert.equal(Number.isNaN(Date.parse(file.ideas[0].review.reviewedAt)), false);
    assert.equal(file.ideas[1].title, 'Second title');
    assert.equal(file.ideas[1].status, 'compiled');
    const raw = readFileSync(filePath, 'utf8');
    assert.match(raw, /\n {2}"organice": 1/);
  } finally {
    await client.close();
  }
});

test('a bad version or an oversized review does not write', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'organice-ideas-'));
  const filePath = join(directory, 'ideas.json');
  const original = JSON.stringify(sampleFile());
  writeFileSync(filePath, original);
  const client = startServer(filePath);
  try {
    client.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'save_review', arguments: { id: 'idea-1', text: 'x'.repeat(20001) } },
    });
    const tooLong = await client.next();
    assert.equal(tooLong.result.isError, true);
    assert.equal(readFileSync(filePath, 'utf8'), original);

    client.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_idea', arguments: { id: 'missing' } },
    });
    const missing = await client.next();
    assert.equal(missing.result.isError, true);
    assert.equal(readFileSync(filePath, 'utf8'), original);
  } finally {
    await client.close();
  }

  const wrongPath = join(directory, 'wrong.json');
  const wrong = JSON.stringify({ organice: 2, exportedAt: 'x', ideas: [] });
  writeFileSync(wrongPath, wrong);
  const wrongClient = startServer(wrongPath);
  try {
    wrongClient.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'list_ideas', arguments: {} },
    });
    const listed = await wrongClient.next();
    assert.equal(listed.result.isError, true);
    wrongClient.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'save_review', arguments: { id: 'idea-1', text: 'nope' } },
    });
    const saved = await wrongClient.next();
    assert.equal(saved.result.isError, true);
    assert.equal(readFileSync(wrongPath, 'utf8'), wrong);
  } finally {
    await wrongClient.close();
  }
});
