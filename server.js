const http = require("http");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  res.writeHead(200);
  res.end("staff alive");
});

const PORT = process.env.PORT || 4101;
server.listen(PORT, () => console.log("staff running on", PORT));
