#!/usr/bin/env node
import { nextTask, allTasks } from './local-db-client.js';

const command = process.argv[2];

switch (command) {
  case 'next-task': {
    const stage = process.argv[3];
    if (!stage) {
      console.error('Usage: node cli.js next-task <stage>');
      process.exit(1);
    }
    const task = nextTask(stage);
    if (task) {
      console.log(`Task #${task.task_number}: ${task.title}`);
      console.log(`  Stage: ${task.stage} | Status: ${task.status}`);
      if (task.locked_by) console.log(`  Locked by: ${task.locked_by}`);
    } else {
      console.log(`No tasks available in "${stage}".`);
    }
    break;
  }
  case 'list': {
    const stage = process.argv[3];
    const tasks = stage ? allTasks({ stage }) : allTasks({});
    if (tasks.length === 0) {
      console.log('No tasks found.');
      process.exit(0);
    }
    for (const t of tasks) {
      const lock = t.locked_by ? ` [locked by ${t.locked_by}]` : '';
      console.log(`#${t.task_number} ${t.title} — ${t.stage}${lock}`);
    }
    break;
  }
  default:
    console.log(`
Usage:
  node cli.js next-task <stage>   Show next unclaimed task in stage
  node cli.js list [stage]        List tasks (optionally filtered by stage)
`);
}
