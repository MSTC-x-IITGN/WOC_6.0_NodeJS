const { log } = require('console');
const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  return res.sendFile("public/index.html", {root : __dirname});
});

app.get('/:roomId', (req, res) => {
  return res.sendFile("public/game.html", {root : __dirname});
})

server.listen(3000, () => {
  console.log("server started at 3000...");
});