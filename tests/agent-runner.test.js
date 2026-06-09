import { describe, it } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Agent Runner', () => {

  it('profile INSTRUCTIONS.md files exist and contain role info', () => {
    for (const profile of ['project-manager', 'coder', 'reviewer']) {
      const path = join(__dirname, '..', '.conveyor', 'profiles', profile, 'INSTRUCTIONS.md');
      assert.ok(existsSync(path), `Missing INSTRUCTIONS.md for ${profile}`);
      const content = readFileSync(path, 'utf8');
      assert.ok(content.includes('## Role'), `${profile} INSTRUCTIONS.md missing Role section`);
    }
  });

  it('coder profile has 3 skills', () => {
    const skillsDir = join(__dirname, '..', '.conveyor', 'profiles', 'coder', 'skills');
    const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    assert.equal(files.length, 3);
  });

  it('reviewer profile has security-checks skill', () => {
    const skillsDir = join(__dirname, '..', '.conveyor', 'profiles', 'reviewer', 'skills');
    const files = readdirSync(skillsDir);
    assert.ok(files.includes('security-checks.md'));
  });

  it('shared skills directory has 3 files', () => {
    const sharedDir = join(__dirname, '..', '.conveyor', 'shared', 'skills');
    const files = readdirSync(sharedDir).filter(f => f.endsWith('.md'));
    assert.equal(files.length, 3);
  });

  it('adapter files exist for all configured engines', () => {
    const adaptersDir = join(__dirname, '..', '.conveyor', 'shared', 'runners', 'adapters');
    const expected = ['claude.js', 'codex.js', 'opencode.js', 'pi.js', 'custom.js'];
    for (const file of expected) {
      assert.ok(existsSync(join(adaptersDir, file)), `Missing adapter: ${file}`);
    }
  });

  it('adapter modules export execute function', async () => {
    for (const name of ['pi', 'codex', 'claude', 'opencode']) {
      const adapter = await import(`../.conveyor/shared/runners/adapters/${name}.js`);
      assert.ok(adapter.default, `Adapter ${name} has no default export`);
      assert.equal(typeof adapter.default.execute, 'function', `Adapter ${name}.execute is not a function`);
    }
  });
});
