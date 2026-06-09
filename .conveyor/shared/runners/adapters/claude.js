import { spawnSync } from 'child_process';

export default {
  execute({ task, systemPrompt, env }) {
    console.log(`[claude] Executing task #${task.task_number}...`);
    const prompt = [
      `Task: ${task.title}`,
      task.description ? `\n${task.description}` : '',
      `\n\nSystem context:\n${systemPrompt}`,
    ].join('');

    const result = spawnSync('claude', [
      '--prompt', prompt,
    ], {
      stdio: 'inherit',
      env: { ...env, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY },
      shell: true,
    });

    return result.status;
  },
};
