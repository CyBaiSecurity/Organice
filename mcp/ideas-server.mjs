import { readFileSync, writeFileSync } from 'node:fs';

const filePath = process.argv[2];
if (!filePath) {
  process.stderr.write('Missing ideas file path\n');
  process.exit(1);
}

const MAX_REVIEW = 20000;

const tools = [
  {
    name: 'list_ideas',
    description: 'List idea id, title, status, and updatedAt. Does not return the body.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_idea',
    description: 'Return one idea title, body, status, taskId, and review.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'save_review',
    description: 'Store a review on one idea and mark that idea reviewed. Does not change the title.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['id', 'text'],
    },
  },
];

function send(message) {
  const json = JSON.stringify(message);
  const bytes = Buffer.byteLength(json);
  process.stdout.write(`Content-Length: ${bytes}\r\n\r\n${json}`);
}

function readIdeas() {
  let text;
  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    return { ok: false, error: 'Cannot read ideas file' };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, error: 'Unsupported organice file' };
  }
  if (data.organice !== 1 || !Array.isArray(data.ideas)) {
    return { ok: false, error: 'Unsupported organice file' };
  }
  return { ok: true, data };
}

function toolError(id, text) {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text }],
      isError: true,
    },
  });
}

function toolOk(id, value) {
  send({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: JSON.stringify(value) }],
      isError: false,
    },
  });
}

function callTool(name, args) {
  const loaded = readIdeas();
  if (!loaded.ok) return { error: loaded.error };
  const data = loaded.data;
  if (name === 'list_ideas') {
    const ideas = data.ideas
      .filter((idea) => idea && typeof idea === 'object')
      .map((idea) => ({
        id: idea.id,
        title: idea.title,
        status: idea.status,
        updatedAt: idea.updatedAt,
      }));
    return { value: ideas };
  }
  if (name === 'get_idea') {
    if (typeof args.id !== 'string') return { error: 'Idea not found' };
    const idea = data.ideas.find((item) => item && item.id === args.id);
    if (!idea) return { error: 'Idea not found' };
    return {
      value: {
        title: idea.title,
        body: idea.body,
        status: idea.status,
        taskId: idea.taskId,
        review: idea.review,
      },
    };
  }
  if (name === 'save_review') {
    if (typeof args.text !== 'string' || args.text.length > MAX_REVIEW) {
      return { error: 'Review text is invalid' };
    }
    if (typeof args.id !== 'string') return { error: 'Idea not found' };
    const idea = data.ideas.find((item) => item && item.id === args.id);
    if (!idea) return { error: 'Idea not found' };
    idea.review = { text: args.text, reviewedAt: new Date().toISOString() };
    idea.status = 'reviewed';
    data.organice = 1;
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
    return { value: { id: idea.id, status: idea.status, review: idea.review } };
  }
  return { error: `Unknown tool: ${name}` };
}

function handle(message) {
  if (typeof message !== 'object' || message === null) return;
  const id = message.id;
  if (id === undefined || id === null) return;
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'organice-ideas', version: '1.0.0' },
      },
    });
    return;
  }
  if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools } });
    return;
  }
  if (message.method === 'tools/call') {
    const params = message.params ?? {};
    const args =
      params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    const outcome = callTool(params.name, args);
    if (outcome.error) toolError(id, outcome.error);
    else toolOk(id, outcome.value);
    return;
  }
  send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: 'Method not found' },
  });
}

let buffer = Buffer.alloc(0);

function consume() {
  while (buffer.length > 0) {
    const separator = buffer.indexOf('\r\n\r\n');
    if (separator === -1) return;
    const header = buffer.subarray(0, separator).toString('utf8');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.subarray(separator + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = separator + 4;
    if (buffer.length < start + length) return;
    const raw = buffer.subarray(start, start + length).toString('utf8');
    buffer = buffer.subarray(start + length);
    try {
      handle(JSON.parse(raw));
    } catch {
      // A frame that is not JSON is dropped. The next frame is still read.
    }
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  consume();
});

process.stdin.on('end', () => {
  process.exit(0);
});
