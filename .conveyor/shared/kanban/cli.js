#!/usr/bin/env node
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { nextTask, allTasks } from './local-db-client.js';

function main(argv = process.argv.slice(2)) {
  const command = argv[0];

  switch (command) {
    case 'next-task': {
      const stage = argv[1];
      if (!stage) {
        console.error('Usage: node cli.js next-task <stage>');
        return 1;
      }
      const task = nextTask(stage);
      if (task) {
        console.log(`Task #${task.task_number}: ${task.title}`);
        console.log(`  Stage: ${task.stage} | Status: ${task.status}`);
        if (task.locked_by) console.log(`  Locked by: ${task.locked_by}`);
      } else {
        console.log(`No tasks available in "${stage}".`);
      }
      return 0;
    }
    case 'list': {
      const stage = argv[1];
      const tasks = stage ? allTasks({ stage }) : allTasks({});
      if (tasks.length === 0) {
        console.log('No tasks found.');
        return 0;
      }
      for (const t of tasks) {
        const lock = t.locked_by ? ` [locked by ${t.locked_by}]` : '';
        console.log(`#${t.task_number} ${t.title} — ${t.stage}${lock}`);
      }
      return 0;
    }
    default:
      console.log(`
Usage:
  node cli.js next-task <stage>   Show next unclaimed task in stage
  node cli.js list [stage]        List tasks (optionally filtered by stage)
`);
      return 0;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main();
}

export { main };
