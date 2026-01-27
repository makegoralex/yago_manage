module.exports = {
  apps: [
    {
      name: "staff-site",
      cwd: __dirname,
      script: "site/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 4101,
        DATA_DIR: "/var/lib/staff.yago-app"
      }
    },
    {
      name: "staff-bot",
      cwd: __dirname,
      script: "bot/bot.js",
      env: {
        NODE_ENV: "production",
        DATA_DIR: "/var/lib/staff.yago-app"
      }
    }
  ]
};
