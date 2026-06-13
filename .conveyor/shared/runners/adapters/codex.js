import { spawnSync } from 'child_process';

export default {
  execute({ task, systemPrompt, env, timeoutMs }) {
    console.log(`[codex] Executing task #${task.task_number}...`);
    const prompt = [
      `Task: ${task.title}`,
      task.description ? `\n${task.description}` : '',
      `\n\nSystem context:\n${systemPrompt}`,
    ].join('');

    const result = spawnSync('codex', [
      '--quiet',
      '--prompt', prompt,
    ], {
      stdio: 'inherit',
      env: { ...env, OPENAI_API_KEY: env.OPENAI_API_KEY },
      shell: true,
      timeout: timeoutMs,
    });

    return result.status ?? 1;
  },
};
