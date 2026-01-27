module.exports = {
  apps: [
    {
      name: "staff-site",
      cwd: __dirname,
      script: "site/server.js",
      env: {
        NODE_ENV: "production",
        PORT: 4101
      }
    },
    {
      name: "staff-bot",
      cwd: __dirname,
      script: "bot/bot.js",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
