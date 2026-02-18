module.exports = {
  apps: [
    {
      name: 'titan-midnight-supervisor',
      script: 'scripts/midnight-supervisor.mjs',
      cwd: __dirname,
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 50,
      min_uptime: '10s',
      restart_delay: 2000,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
      out_file: '../../.titan/pm2-midnight.out.log',
      error_file: '../../.titan/pm2-midnight.err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss.SSS Z',
    },
  ],
};

