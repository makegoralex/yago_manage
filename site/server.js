const http = require("http");

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true, service: "staff-site" }));
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("staff site alive\n");
});

const PORT = process.env.PORT || 4101;
server.listen(PORT, () => console.log("staff-site running on", PORT));
