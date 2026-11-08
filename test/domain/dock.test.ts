import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dockClearance, dockHeight } from '../../src/theme/dock.ts';

test('dock height keeps two label lines and clearance follows that height', () => {
  assert.equal(dockHeight(), 72);
  assert.equal(dockHeight(1), 72);
  assert.equal(dockHeight(1.5), 76);
  assert.equal(dockHeight(2), 90);
  assert.equal(dockClearance(0), 128);
  assert.equal(dockClearance(0, 2), 146);
  assert.equal(dockClearance(32, 2), 130);
});
