#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { nextTask, claimTask, transitionTask, incrementRetry, releaseTask } from '../kanban/local-db-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(__dirname, '..', '..', 'profiles');
const SHARED_SKILLS_DIR = join(__dirname, '..', 'skills');

function loadProfileInstructions(profileName) {
  const path = join(PROFILES_DIR, profileName, 'INSTRUCTIONS.md');
  if (!existsSync(path)) {
    console.error(`Profile not found: ${profileName}`);
    process.exit(1);
  }
  return readFileSync(path, 'utf8');
}

function loadProfileSkills(profileName) {
  const skillsDir = join(PROFILES_DIR, profileName, 'skills');
  if (!existsSync(skillsDir)) return '';
  const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
  return files.map(f => readFileSync(join(skillsDir, f), 'utf8')).join('\n\n');
}

function loadSharedSkills() {
  if (!existsSync(SHARED_SKILLS_DIR)) return '';
  const files = readdirSync(SHARED_SKILLS_DIR).filter(f => f.endsWith('.md'));
  return files
    .map(f => `# ${f.replace('.md', '')}\n${readFileSync(join(SHARED_SKILLS_DIR, f), 'utf8')}`)
    .join('\n\n');
}

function buildSystemPrompt(profileName) {
  const instructions = loadProfileInstructions(profileName);
  const profileSkills = loadProfileSkills(profileName);
  const sharedSkills = loadSharedSkills();
  return [instructions, profileSkills, sharedSkills].filter(Boolean).join('\n\n---\n\n');
}

async function runAgent({ profileName, targetStage, nextStage, pollInterval, adapter }) {
  console.log(`Agent [${profileName}] starting. Polling "${targetStage}" every ${pollInterval}ms`);

  const poll = async () => {
    const task = nextTask(targetStage);
    if (!task) {
      console.log(`[${profileName}] No tasks in "${targetStage}". Waiting...`);
      return;
    }

    console.log(`[${profileName}] Claiming task #${task.task_number}: ${task.title}`);
    const claimed = claimTask(task.id, profileName);
    if (!claimed) {
      console.log(`[${profileName}] Task #${task.task_number} already claimed. Skipping.`);
      return;
    }

    try {
      const systemPrompt = buildSystemPrompt(profileName);
      const exitCode = await adapter.execute({
        task,
        systemPrompt,
        env: process.env,
      });

      if (exitCode === 0) {
        console.log(`[${profileName}] Task #${task.task_number} completed. Moving to "${nextStage}".`);
        transitionTask(task.id, nextStage, nextStage);
      } else {
        console.error(`[${profileName}] Task #${task.task_number} failed (exit ${exitCode}).`);
        const result = incrementRetry(task.id);
        if (result.blocked) {
          console.error(`[${profileName}] Task #${task.task_number} blocked after ${result.retryCount} failures.`);
        } else {
          console.log(`[${profileName}] Task #${task.task_number} returned to "To Do" (attempt ${result.retryCount}).`);
        }
      }
    } catch (err) {
      console.error(`[${profileName}] Error executing task #${task.task_number}: ${err.message}`);
      releaseTask(task.id);
    }
  };

  await poll();
  setInterval(poll, pollInterval);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const profileName = process.argv[2];
  if (!profileName) {
    console.error('Usage: node agent-runner.js <profile-name>');
    process.exit(1);
  }

  const configPath = join(__dirname, '..', '..', '..', '..', 'conveyor.config.js');
  const config = (await import(configPath)).default;
  const agentConfig = config.agents[profileName];
  if (!agentConfig) {
    console.error(`Agent "${profileName}" not found in conveyor.config.js`);
    process.exit(1);
  }

  const adapterPath = join(__dirname, 'adapters', `${agentConfig.engine}.js`);
  if (!existsSync(adapterPath)) {
    console.error(`Adapter not found: ${adapterPath}`);
    process.exit(1);
  }
  const adapter = (await import(adapterPath)).default;

  runAgent({
    profileName,
    targetStage: agentConfig.targetStage,
    nextStage: agentConfig.nextStage || agentConfig.nextStageSuccess || 'Done',
    pollInterval: agentConfig.pollInterval || 15000,
    adapter,
  }).catch(err => {
    console.error(`Agent [${profileName}] fatal error:`, err);
    process.exit(1);
  });
}
