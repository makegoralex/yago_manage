console.log("staff-bot alive");

setInterval(() => {
  console.log("bot heartbeat", new Date().toISOString());
}, 60000);
