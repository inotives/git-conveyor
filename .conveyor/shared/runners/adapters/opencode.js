import { spawnSync } from 'child_process';

export default {
  execute({ task, systemPrompt, env }) {
    console.log(`[opencode] Executing task #${task.task_number}...`);
    const prompt = [
      `Task: ${task.title}`,
      task.description ? `\n${task.description}` : '',
      `\n\nSystem context:\n${systemPrompt}`,
    ].join('');

    const result = spawnSync('opencode', [
      '--no-interactive',
      '--prompt', prompt,
    ], {
      stdio: 'inherit',
      env: { ...env, OPENCODE_API_KEY: env.OPENCODE_API_KEY },
      shell: true,
    });

    return result.status;
  },
};
