import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLOCKED_DIR = join(__dirname, '..', '.conveyor', 'alerts', 'blocked');

describe('Sync Daemon', () => {
  let daemon;

  before(async () => {
    if (existsSync(BLOCKED_DIR)) rmSync(BLOCKED_DIR, { recursive: true });
    daemon = await import('../.conveyor/shared/kanban/sync-daemon.js');
  });

  it('retryWithFixedInterval resolves on success', async () => {
    let calls = 0;
    const result = await daemon.retryWithFixedInterval(async () => {
      calls++;
      return 'ok';
    }, 3, 10);
    assert.equal(result, 'ok');
    assert.equal(calls, 1);
  });

  it('retryWithFixedInterval retries on failure', async () => {
    let calls = 0;
    try {
      await daemon.retryWithFixedInterval(async () => {
        calls++;
        throw new Error('fail');
      }, 3, 5);
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('fail'));
      assert.equal(calls, 3);
    }
  });

  it('writes alert file', () => {
    daemon.writeAlertFile(99, 'Test task', 'Something went wrong');
    const files = readdirSync(BLOCKED_DIR);
    assert.ok(files.length >= 1);
    const latest = files[files.length - 1];
    const content = readFileSync(join(BLOCKED_DIR, latest), 'utf8');
    assert.ok(content.includes('Test task'));
    assert.ok(content.includes('Something went wrong'));
  });

  it('sync daemon module exports expected functions', () => {
    assert.ok(typeof daemon.syncCycle === 'function');
    assert.ok(typeof daemon.retryWithFixedInterval === 'function');
    assert.ok(typeof daemon.writeAlertFile === 'function');
  });

  after(() => {
    if (existsSync(BLOCKED_DIR)) rmSync(BLOCKED_DIR, { recursive: true });
  });
});
