import { spawnSync } from 'child_process';

export default {
  execute({ task, systemPrompt, env }) {
    console.log(`[pi] Executing task #${task.task_number}...`);
    const prompt = [
      `Task: ${task.title}`,
      task.description ? `\n${task.description}` : '',
      `\n\nSystem context:\n${systemPrompt}`,
    ].join('');

    const result = spawnSync('pi', [
      '--mode', 'print',
      '--prompt', prompt,
    ], {
      stdio: 'inherit',
      env: { ...env, PI_API_KEY: env.PI_API_KEY },
      shell: true,
    });

    return result.status;
  },
};
