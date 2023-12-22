const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server);

// setup for generating room id
const { customAlphabet } = require('nanoid');
const generateRandomId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890", 5);

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  return res.sendFile("public/index.html", {root : __dirname});
});

let rooms = {};

io.on('connection', (socket) => {

  // creating a client id for other client interactions
  socket.clientId = generateRandomId(20);
  
  socket.on("createRoom", (username, callback) => {
    // generate room id
    let roomId = generateRandomId();

    socket.username = username;
    socket.roomId = roomId;
    rooms[roomId] = {
      users: [],
      host: socket,
      drawer: socket, // later change to null
    };
    socket.emit("canDraw");
    callback(username, roomId);
  });

  socket.on("join", (username, roomId) => {
    socket.join(roomId);
    
    socket.emit("goToGamePage", username, roomId);  
    rooms[roomId].users.forEach((userSocket) => {
      socket.emit("addUser", userSocket.username, userSocket.clientId);
    });
    
    rooms[roomId].users.push(socket);
    io.to(roomId).emit("userJoinedMessage", username);
    io.to(roomId).emit("addUser", username, socket.clientId);
  });

  socket.on("validateRoom", (username, joinRoomId, callback) => {
    if(joinRoomId in rooms){
      socket.username = username;
      socket.roomId = joinRoomId;
      callback(username, joinRoomId);
    }
  });

  socket.on("draw", (data) => {
    if(rooms[socket.roomId]?.drawer === socket){
      socket.to(socket.roomId).emit("canvasData", data);
    }
  });

  socket.on("clearRoomCanvas", () => {
    if(rooms[socket.roomId]?.drawer === socket){
      io.to(socket.roomId).emit("clearCanvasData");
    }
  });

  socket.on("disconnect", () => {
    if(socket.roomId){
      if(rooms[socket.roomId].users.length == 1){
        delete rooms[socket.roomId];
      }else{
        rooms[socket.roomId].users.splice(rooms[socket.roomId].users.indexOf(socket), 1);
        socket.to(socket.roomId).emit("userLeftMessage", socket.username);
        socket.to(socket.roomId).emit("removeUser", socket.clientId);
      }
      socket.leave(socket.roomId);
    }
  });
});


server.listen(3000, () => {
  console.log("server started at 3000...");
});