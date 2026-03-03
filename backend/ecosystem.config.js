module.exports = {
  apps: [
    {
      name: "gofix-backend",
      script: "dist/server.js",
      instances: "max",
      exec_mode: "cluster",
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
