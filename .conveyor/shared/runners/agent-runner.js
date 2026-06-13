#!/usr/bin/env node
import { spawnSync } from 'child_process';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  nextTask,
  claimTask,
  transitionTask,
  incrementRetry,
  loadConfig,
} from '../kanban/local-db-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const PROFILES_DIR = join(__dirname, '..', '..', 'profiles');
const SHARED_SKILLS_DIR = join(__dirname, '..', 'skills');
const DEFAULT_LOGS_DIR = join(PROJECT_ROOT, '.conveyor', 'logs');
const DEFAULT_METRICS_DIR = join(PROJECT_ROOT, '.conveyor', 'metrics');
const DEFAULT_HOOK_TIMEOUT_MS = 300000;
const DEFAULT_AGENT_TIMEOUT_MS = 900000;
const FAILURE_CONTEXT_MAX_CHARS = 12000;

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

function resolveProjectPath(pathValue, fallback) {
  if (!pathValue) return fallback;
  return pathValue.startsWith('/') ? pathValue : join(PROJECT_ROOT, pathValue);
}

function toDateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function writeMetric(eventType, details = {}, options = {}) {
  const config = options.runtimeConfig ?? loadConfig();
  const metricsDir = options.metricsDir ?? resolveProjectPath(config.metrics?.dir, DEFAULT_METRICS_DIR);
  if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });
  const timestamp = new Date().toISOString();
  const path = join(metricsDir, `${timestamp.slice(0, 10)}.jsonl`);
  appendFileSync(path, `${JSON.stringify({ event: eventType, timestamp, ...details })}\n`, 'utf8');
  return path;
}

function findLatestFailureLog(task, options = {}) {
  const logsDir = options.logsDir ?? DEFAULT_LOGS_DIR;
  if (!existsSync(logsDir)) return null;
  const taskNumber = String(task.task_number);
  const taskId = String(task.id);
  const files = readdirSync(logsDir)
    .filter(file => file.endsWith('.md'))
    .filter(file => file.includes(`task-${taskNumber}`) || file.includes(`task-${taskId}`))
    .sort();
  if (!files.length) return null;
  return join(logsDir, files.at(-1));
}

function withPreviousFailureContext(profileName, task, options = {}) {
  if (profileName !== 'coder') return task;
  const latestLog = findLatestFailureLog(task, options);
  if (!latestLog) return task;
  const content = readFileSync(latestLog, 'utf8');
  const bounded = content.length > FAILURE_CONTEXT_MAX_CHARS
    ? content.slice(-FAILURE_CONTEXT_MAX_CHARS)
    : content;
  const description = [
    task.description || '',
    '',
    '## Previous failure context',
    `Source: ${latestLog}`,
    '',
    bounded,
  ].join('\n').trim();
  return { ...task, description };
}

function writeFailureLog(task, profileName, failure, options = {}) {
  const logsDir = options.logsDir ?? DEFAULT_LOGS_DIR;
  if (!existsSync(logsDir)) mkdirSync(logsDir, { recursive: true });
  const timestamp = new Date().toISOString();
  const safeTask = `task-${task.task_number ?? task.id}`;
  const path = join(logsDir, `${toDateStamp(new Date(timestamp))}__${safeTask}.md`);
  const metadata = {
    task_id: task.id,
    task_number: task.task_number,
    title: task.title,
    profile: profileName,
    failure_type: failure.failureType,
    command: failure.command ?? null,
    hook: failure.hook ?? null,
    exit_code: failure.exitCode ?? null,
    timed_out: Boolean(failure.timedOut),
    retry_count_before: task.retry_count ?? 0,
    timestamp,
  };
  const content = [
    `# Failure: Task #${task.task_number} - ${task.title}`,
    '',
    `Summary: ${failure.summary}`,
    '',
    '```json',
    JSON.stringify(metadata, null, 2),
    '```',
    '',
    '## Stdout',
    '```text',
    failure.stdout || '',
    '```',
    '',
    '## Stderr',
    '```text',
    failure.stderr || '',
    '```',
    '',
  ].join('\n');
  writeFileSync(path, content, 'utf8');
  return path;
}

function runWithTimeout(operation, timeoutMs, label) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.code = 'CONVEYOR_TIMEOUT';
      reject(err);
    }, timeoutMs);
    timeout.unref?.();
  });
  return Promise.race([
    Promise.resolve().then(operation),
    timeoutPromise,
  ]).finally(() => clearTimeout(timeout));
}

function hookTimeoutMs(config) {
  return config.hooks?.timeoutMs ?? config.hookTimeoutMs ?? DEFAULT_HOOK_TIMEOUT_MS;
}

function agentTimeoutMs(agentConfig = {}) {
  return agentConfig.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
}

function runHook(hookName, config = { hooks: {} }, options = {}) {
  const command = config.hooks?.[hookName];
  if (!command || typeof command !== 'string') {
    return {
      hook: hookName,
      command: null,
      exitCode: 1,
      stdout: '',
      stderr: `Hook "${hookName}" is not configured.`,
      timedOut: false,
    };
  }

  const timeoutMs = options.timeoutMs ?? hookTimeoutMs(config);
  const result = spawnSync(command, {
    cwd: PROJECT_ROOT,
    env: process.env,
    encoding: 'utf8',
    shell: true,
    timeout: timeoutMs,
  });

  return {
    hook: hookName,
    command,
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
    timedOut: result.error?.code === 'ETIMEDOUT',
  };
}

function runConfiguredHooks(task, profileName, config = { hooks: {} }, agentConfig = {}, options = {}) {
  const hooks = agentConfig.runHooks || [];
  for (const hookName of hooks) {
    writeMetric('hook_started', {
      profile: profileName,
      task_id: task.id,
      task_number: task.task_number,
      hook: hookName,
    }, options);

    const result = runHook(hookName, config, options);

    writeMetric('hook_finished', {
      profile: profileName,
      task_id: task.id,
      task_number: task.task_number,
      hook: hookName,
      exit_code: result.exitCode,
      timed_out: result.timedOut,
    }, options);

    if (result.exitCode !== 0) {
      return result;
    }
  }
  return null;
}

function retryTask(task, profileName, failure, options = {}) {
  const logPath = writeFailureLog(task, profileName, failure, options);
  const result = incrementRetry(task.id);
  const event = result.blocked ? 'task_blocked' : 'task_retried';
  writeMetric(event, {
    profile: profileName,
    task_id: task.id,
    task_number: task.task_number,
    retry_count: result.retryCount,
    failure_type: failure.failureType,
    log_path: logPath,
  }, options);
  return { ...result, logPath };
}

async function pollAgentOnce({ profileName, targetStage, nextStage, adapter, config = { hooks: {} }, agentConfig = {}, options = {} }) {
  const task = nextTask(targetStage);
  if (!task) {
    console.log(`[${profileName}] No tasks in "${targetStage}". Waiting...`);
    return { status: 'idle' };
  }

  console.log(`[${profileName}] Claiming task #${task.task_number}: ${task.title}`);
  const claimed = claimTask(task.id, profileName);
  if (!claimed) {
    console.log(`[${profileName}] Task #${task.task_number} already claimed. Skipping.`);
    return { status: 'claimed_elsewhere' };
  }

  writeMetric('task_claimed', {
    profile: profileName,
    task_id: task.id,
    task_number: task.task_number,
    stage: targetStage,
  }, options);

  try {
    const systemPrompt = buildSystemPrompt(profileName);
    const taskForAdapter = withPreviousFailureContext(profileName, task, options);
    const timeoutMs = agentTimeoutMs(agentConfig);

    writeMetric('adapter_started', {
      profile: profileName,
      task_id: task.id,
      task_number: task.task_number,
      timeout_ms: timeoutMs,
    }, options);

    const exitCode = await runWithTimeout(() => adapter.execute({
      task: taskForAdapter,
      systemPrompt,
      env: process.env,
      timeoutMs,
    }), timeoutMs, `${profileName} adapter`);

    writeMetric('adapter_finished', {
      profile: profileName,
      task_id: task.id,
      task_number: task.task_number,
      exit_code: exitCode,
    }, options);

    if (exitCode !== 0) {
      console.error(`[${profileName}] Task #${task.task_number} failed (exit ${exitCode}).`);
      const result = retryTask(task, profileName, {
        failureType: 'adapter_exit',
        summary: `${profileName} adapter exited with code ${exitCode}.`,
        exitCode,
      }, options);
      return { status: result.blocked ? 'blocked' : 'retried', ...result };
    }

    const hookFailure = runConfiguredHooks(task, profileName, config, agentConfig, options);
    if (hookFailure) {
      console.error(`[${profileName}] Hook "${hookFailure.hook}" failed for task #${task.task_number}.`);
      const result = retryTask(task, profileName, {
        failureType: hookFailure.timedOut ? 'timeout' : 'hook_failure',
        summary: hookFailure.timedOut
          ? `Hook "${hookFailure.hook}" timed out.`
          : `Hook "${hookFailure.hook}" exited with code ${hookFailure.exitCode}.`,
        hook: hookFailure.hook,
        command: hookFailure.command,
        exitCode: hookFailure.exitCode,
        stdout: hookFailure.stdout,
        stderr: hookFailure.stderr,
        timedOut: hookFailure.timedOut,
      }, options);
      return { status: result.blocked ? 'blocked' : 'retried', ...result };
    }

    console.log(`[${profileName}] Task #${task.task_number} completed. Moving to "${nextStage}".`);
    transitionTask(task.id, nextStage, nextStage);
    writeMetric('task_transitioned', {
      profile: profileName,
      task_id: task.id,
      task_number: task.task_number,
      next_stage: nextStage,
    }, options);
    return { status: 'transitioned', nextStage };
  } catch (err) {
    const isTimeout = err.code === 'CONVEYOR_TIMEOUT';
    console.error(`[${profileName}] Error executing task #${task.task_number}: ${err.message}`);
    const result = retryTask(task, profileName, {
      failureType: isTimeout ? 'timeout' : 'runner_error',
      summary: err.message,
      stderr: err.stack || err.message,
      timedOut: isTimeout,
    }, options);
    writeMetric('runner_error', {
      profile: profileName,
      task_id: task.id,
      task_number: task.task_number,
      error: err.message,
    }, options);
    return { status: result.blocked ? 'blocked' : 'retried', ...result };
  }
}

async function runAgent({ profileName, targetStage, nextStage, pollInterval, adapter, config = { hooks: {} }, agentConfig = {} }) {
  console.log(`Agent [${profileName}] starting. Polling "${targetStage}" every ${pollInterval}ms`);
  const poll = () => pollAgentOnce({ profileName, targetStage, nextStage, adapter, config, agentConfig });
  await poll();
  setInterval(poll, pollInterval);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const profileName = process.argv[2];
  if (!profileName) {
    console.error('Usage: node agent-runner.js <profile-name>');
    process.exit(1);
  }

  const configPath = join(PROJECT_ROOT, 'conveyor.config.js');
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
    config,
    agentConfig,
  }).catch(err => {
    console.error(`Agent [${profileName}] fatal error:`, err);
    process.exit(1);
  });
}

export {
  buildSystemPrompt,
  findLatestFailureLog,
  pollAgentOnce,
  runAgent,
  runConfiguredHooks,
  runHook,
  withPreviousFailureContext,
  writeFailureLog,
  writeMetric,
};
