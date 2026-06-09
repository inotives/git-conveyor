import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('conveyor.config.js', () => {
  it('loads and exports default config', async () => {
    const config = (await import('../conveyor.config.js')).default;
    assert.ok(config);
    assert.equal(config.project.name, 'git-conveyor');
    assert.ok(Array.isArray(config.stages));
    assert.ok(config.stages.includes('Backlog'));
    assert.ok(config.stages.includes('Blocked'));
    assert.ok(config.stages.includes('Done'));
  });

  it('defines all three agents', async () => {
    const config = (await import('../conveyor.config.js')).default;
    assert.ok(config.agents.pm);
    assert.ok(config.agents.coder);
    assert.ok(config.agents.reviewer);
  });

  it('configures reviewer with Blocked-aware fallback', async () => {
    const config = (await import('../conveyor.config.js')).default;
    assert.equal(config.agents.reviewer.nextStageFailure, 'To Do');
    assert.equal(config.agents.reviewer.nextStageSuccess, 'Done');
  });

  it('includes retry settings via configs.yaml', async () => {
    const db = await import('../.conveyor/shared/kanban/local-db-client.js');
    const cfg = db.loadConfig();
    assert.equal(cfg.retry.maxAttempts, 3);
    assert.equal(cfg.retry.intervalMs, 60000);
  });
});
