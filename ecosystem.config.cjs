module.exports = {
  apps: [
    {
      name: 'vps-pulse',
      script: 'server/index.js',
      cwd: '/opt/vps-pulse',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '250M',
      env: {
        NODE_ENV: 'production',
        PORT: '7777',
        VPS_IP: '139.162.52.81'
      }
    }
  ]
};
