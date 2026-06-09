import { spawnSync } from 'child_process';

export default {
  execute({ task, systemPrompt, env }) {
    console.log(`[custom] Executing task #${task.task_number}...`);
    console.log('Custom adapter — replace this with your engine CLI.');

    const prompt = [
      `Task: ${task.title}`,
      task.description ? `\n${task.description}` : '',
      `\n\nSystem context:\n${systemPrompt}`,
    ].join('');

    // Example: spawn a custom CLI
    const result = spawnSync('your-cli', [
      '--prompt', prompt,
      '--system', systemPrompt,
      '--no-interactive',
    ], {
      stdio: 'inherit',
      env,
      shell: true,
    });

    return result.status;
  },
};
