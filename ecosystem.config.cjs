// PM2 process config for MikuHost-Api
// Usage:
//   pm2 start ecosystem.config.cjs      # start
//   pm2 restart mikuhost-api            # restart
//   pm2 stop mikuhost-api               # stop
//   pm2 logs mikuhost-api               # live logs
//   pm2 save && pm2 startup             # auto-start on boot
module.exports = {
  apps: [
    {
      name: "mikuhost-api",
      script: "dist/server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        // 0.0.0.0 is required: the edge proxy on the PVE host forwards public
        // traffic to this container's IP (192.168.11.41:8686) directly.
        HOST: "0.0.0.0",
        PORT: 8686
      }
    }
  ]
};
