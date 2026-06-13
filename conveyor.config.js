export default {

  project: {
    name: 'git-conveyor',
    github: {
      owner: 'inotives',
      repo: 'git-conveyor',
      projectNumber: 1,
    },
  },

  db: {
    path: '.conveyor/shared/kanban/kanban.db',
  },

  hooks: {
    test: 'npm test',
    lint: 'npm run lint',
    build: 'npm run build',
    'security-checks': 'node .conveyor/shared/hooks/security-checks.js',
    timeoutMs: 300000,
  },

  stages: [
    'Backlog',
    'To Do',
    'In Progress',
    'Review',
    'Blocked',
    'Done',
  ],

  agents: {
    pm: {
      engine: 'claude',
      targetStage: 'Backlog',
      nextStage: 'To Do',
      pollInterval: 10000,
      timeoutMs: 900000,
    },
    coder: {
      engine: 'codex',
      targetStage: 'To Do',
      nextStage: 'Review',
      pollInterval: 12000,
      timeoutMs: 900000,
    },
    reviewer: {
      engine: 'pi',
      model: 'qwen-2.5-coder',
      targetStage: 'Review',
      nextStageSuccess: 'Done',
      nextStageFailure: 'To Do',
      pollInterval: 15000,
      timeoutMs: 600000,
      runHooks: ['test', 'lint', 'security-checks'],
    },
  },

};
