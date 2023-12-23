const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));


// setup for generating room id
const { customAlphabet } = require('nanoid');
const generateRandomId = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890", 5);

// setup for generating random words
const { generateSlug } = require('random-word-slugs');
const slugOptions = {
  partsOfSpeech: ["noun"],
  categories: {
    noun: ["animals", "food", "science", "sports", "technology", "thing"],
  }
}

const generateRandomWord = () => {
  return generateSlug(1, slugOptions).toLowerCase();
}

// one and only singal route
app.get('/', (req, res) => {
  return res.sendFile("public/index.html", { root: __dirname });
});


let rooms = {}; // store all the rooms along with all room players

// Indicates match ending
const endMatch = (socket) => {

  try {
    // calculate scores of all players and pass to all client to show result
    const results = [];

    let totalDrawerScore = 0;
    rooms[socket.roomId].users.forEach((userSocket) => {
      if (rooms[socket.roomId].drawer !== userSocket) {
        totalDrawerScore += (rooms[socket.roomId].scoreThisMatch[userSocket.clientId] ?? 0);
        results.push({
          clientId: userSocket.clientId,
          username: userSocket.username,
          score: rooms[socket.roomId].score[userSocket.clientId] ?? 0,
        });
      }
    });


    if (rooms[socket.roomId].score[rooms[socket.roomId].drawer.clientId]) {
      rooms[socket.roomId].score[rooms[socket.roomId].drawer.clientId] += Math.floor(totalDrawerScore / 4);
    } else {
      rooms[socket.roomId].score[rooms[socket.roomId].drawer.clientId] = Math.floor(totalDrawerScore / 4);
    }


    results.push({
      clientId: rooms[socket.roomId].drawer.clientId,
      username: rooms[socket.roomId].drawer.username,
      score: rooms[socket.roomId].score[rooms[socket.roomId].drawer.clientId] ?? 0,
    });

    // passing results to client
    io.in(socket.roomId).emit("endOfRoundSummary", results);
    resetMatchData(socket.roomId);


    rooms[socket.roomId].intermissionTimer = setTimeout(() => {

      clearTimeout(rooms[socket.roomId].intermissionTimer);

      io.in(socket.roomId).emit("matchStartCountDown");

      rooms[socket.roomId].nextDrawerIndex++;

      if (rooms[socket.roomId].nextDrawerIndex >= rooms[socket.roomId].users.length) {
        // one round ends

        rooms[socket.roomId].remainingRounds--;

        if (rooms[socket.roomId].remainingRounds <= 0) {
          // game ended if zero round left
          endGame(socket.roomId);
        }
        rooms[socket.roomId].nextDrawerIndex = 0;
      }

      startMatch(socket);

    }, 5000); // time between match end and new match start

  } catch (e) {
    console.log(e);
  }
}

// Indicates start of match
const startMatch = (socket) => {
  try {

    if (rooms[socket.roomId].remainingRounds <= 0) {
      return;
    }

    if (rooms[socket.roomId].nextDrawerIndex >= rooms[socket.roomId].users.length) {
      // one round ends

      rooms[socket.roomId].remainingRounds--;

      if (rooms[socket.roomId].remainingRounds <= 0) {
        endGame(socket.roomId);
      }
      rooms[socket.roomId].nextDrawerIndex = 0;
    }

    // set who is drawer of this match
    rooms[socket.roomId].drawer = rooms[socket.roomId].users[rooms[socket.roomId].nextDrawerIndex];

    // generate guess word
    rooms[socket.roomId].currentWord = generateRandomWord();

    // send word to drawer
    rooms[socket.roomId].drawer.emit("guessWord", rooms[socket.roomId].currentWord);

    // send client id of drawer to all 
    io.in(socket.roomId).emit("whoIsDrawing", rooms[socket.roomId].drawer.clientId, rooms[socket.roomId].drawer.username);

    // send guessWord Length to all except drawer
    rooms[socket.roomId].drawer.to(socket.roomId).emit("guessWordLength", rooms[socket.roomId].currentWord.length);

    // events for who can draw and who can't
    rooms[socket.roomId].drawer.emit("canDraw");
    rooms[socket.roomId].drawer.to(socket.roomId).emit("canNotDraw");

    // Event for showing match starting screen
    io.in(socket.roomId).emit("alertUsersGameIsStarting");

    io.in(socket.roomId).emit("clearCanvasData");

    rooms[socket.roomId].roundStartTimer = setTimeout(() => {
      clearTimeout(rooms[socket.roomId].roundStartTimer);

      // event to tell client to start match
      io.in(socket.roomId).emit("matchStart", rooms[socket.roomId].timeForGuess);
      rooms[socket.roomId].matchInProgress = true;

      // end match after given time
      rooms[socket.roomId].timer = setInterval(() => {
        rooms[socket.roomId].timeRemaining--;
        if (rooms[socket.roomId].timeRemaining < 0) {

          // event to tell client match is over and show match over screen
          io.in(socket.roomId).emit("matchOver", rooms[socket.roomId].currentWord);
          endMatch(socket);
          clearInterval(rooms[socket.roomId].timer);
        }

      }, 1000);

    }, 5000); // time for alert user that match is going to start

  } catch (e) {
    console.log(e);
  }
}

// reset required data after each match
const resetMatchData = (roomId) => {
  rooms[roomId].drawer = null;
  rooms[roomId].timeRemaining = rooms[roomId].timeForGuess;
  rooms[roomId].guessesCorrectly = [];
  rooms[roomId].scoreThisMatch = [];
  rooms[roomId].matchInProgress = false;
  rooms[roomId].currentWord = "";
}

// function to end whole game
const endGame = (roomId) => {
  rooms[roomId].gameStarted = false;
  io.in(roomId).emit("endGame");
}

// reset required data if player want to start new game
const resetRoundData = (roomId) => {
  rooms[roomId].drawer = null;
  rooms[roomId].timeRemaining = rooms[roomId].timeForGuess;
  rooms[roomId].guessesCorrectly = [];
  rooms[roomId].scoreThisMatch = [];
  rooms[roomId].matchInProgress = false;
  rooms[roomId].currentWord = null;
  rooms[roomId].remainingRounds = 1;
  rooms[roomId].currentWord = null;
  rooms[roomId].score = [];
}

io.on('connection', (socket) => {
  try {
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
        drawer: null,
        nextDrawerIndex: 0,
        remainingRounds: 1,
        timeForGuess: 10,
        timeRemaining: 0,
        currentWord: null,
        gameStarted: false,
        guessesCorrectly: [],
        score: [],
        scoreThisMatch: [],
        matchInProgress: false,
      };

      callback(username, roomId);
    });

    // to join the room 
    socket.on("join", (username, roomId) => {
      if (rooms.hasOwnProperty(roomId)) {

        if (rooms[roomId].gameStarted === true) {
          // game has started. so, user can't join
          socket.emit("error", {
            message: "Game has started.",
          })
          return;
        }
      }
      socket.join(roomId);

      // tell client to show game page
      socket.emit("goToGamePage", username, roomId);
      if (rooms[socket.roomId].host === socket) {
        socket.emit("enableStartBtn");
      }

      // add all room users in the client side of new joined user
      rooms[roomId].users.forEach((userSocket) => {
        socket.emit("addUser", userSocket.username, userSocket.clientId);
      });

      rooms[roomId].users.push(socket);
      io.to(roomId).emit("userJoinedMessage", username);
      io.to(roomId).emit("addUser", username, socket.clientId);
    });

    // to validate if given room exist
    socket.on("validateRoom", (username, joinRoomId, callback) => {

      if (rooms.hasOwnProperty(joinRoomId)) {
        socket.username = username;
        socket.roomId = joinRoomId;
        callback(username, joinRoomId);
      }
    });


    // Canvas related Events
    socket.on("draw", (data) => {
      if (rooms[socket.roomId]?.drawer === socket) {
        socket.to(socket.roomId).emit("canvasData", data);
      }
    });

    // event if drawer clears canavs then reflect to all room members
    socket.on("clearRoomCanvas", () => {
      if (rooms[socket.roomId]?.drawer === socket) {
        io.to(socket.roomId).emit("clearCanvasData");
      }
    });

    // Game related Events
    socket.on("startGame", () => {
      if (rooms[socket.roomId].host === socket) {
        rooms[socket.roomId].gameStarted = true;
        resetRoundData(socket.roomId);
        startMatch(socket);
      }
    });

    // chat event handles chats and guesses
    socket.on("chat", (chat) => {
      if (chat === undefined || chat.trim() == "") return;

      if (!rooms[socket.roomId].matchInProgress) {
        io.in(socket.roomId).emit("normalChat", {
          sender: socket.username,
          message: chat,
        });
      } else {
        const caseIgnoredChat = chat.toString().toLowerCase();
        if (caseIgnoredChat === rooms[socket.roomId].currentWord && rooms[socket.roomId].guessesCorrectly[socket.clientId] !== true && rooms[socket.roomId].drawer !== socket) {
          // guess is correct 
          rooms[socket.roomId].guessesCorrectly[socket.clientId] = true;


          const score = (rooms[socket.roomId].timeRemaining / rooms[socket.roomId].timeForGuess) * 1000;

          if (rooms[socket.roomId].score[socket.clientId]) {
            rooms[socket.roomId].score[socket.clientId] += score;
          } else {
            rooms[socket.roomId].score[socket.clientId] = score;
          }

          rooms[socket.roomId].scoreThisMatch[socket.clientId] = score;

          // reveal word who guesses correctly
          io.to(socket.roomId).emit("revealWord", rooms[socket.roomId].currentWord);

          io.in(socket.roomId).emit("infoChat", `${socket.username} has correctly guessed!`, "green");

          // round over when all users guessed word correctly
          let allUsersHaveGuessed = true;
          rooms[socket.roomId].users.forEach((userSocket) => {
            if (rooms[socket.roomId].guessesCorrectly[userSocket.clientId] !== true) {
              allUsersHaveGuessed = false;
            }
          });

          if (allUsersHaveGuessed) {
            io.in(socket.roomId).emit("matchOver", rooms[socket.roomId].currentWord);

            clearInterval(rooms[socket.roomId].timer);
            endMatch(socket);
          }

        } else {
          io.in(socket.roomId).emit("normalChat", {
            sender: socket.username,
            message: chat,
          });
        }
      }
    });

    // event for kick user - only host can do this
    socket.on("kickUser", (clientId) => {
      if (!rooms.hasOwnProperty(socket.roomId)) {
        return;
      }
      // check if host made event or not
      if (rooms[socket.roomId].host === socket) {

        // if host is trying to remove himself
        if (socket.clientId == clientId) {
          return;
        }
        // retrieve socket from clientId
        rooms[socket.roomId].users.forEach((userSocket) => {
          if (userSocket.clientId === clientId) {
            io.to(socket.roomId).emit("userKickedMessage", userSocket.username);
            userSocket.emit("forceDisconnect");
          }
        });

      }
    });

    // if any player disconnects
    socket.on("disconnect", () => {
      if (socket.roomId && rooms.hasOwnProperty(socket.roomId)) {

        // only one member remaining in room then free all data
        if (rooms[socket.roomId].users.length == 1) {
          // make sure to clear all setIntervals and setTimeOuts
          if (rooms[socket.roomId].timer) {
            clearInterval(rooms[socket.roomId].timer);
          }
          if (rooms[socket.roomId].intermissionTimer) {
            clearTimeout(rooms[socket.roomId].intermissionTimer);
          }
          if (rooms[socket.roomId].roundStartTimer) {
            clearTimeout(rooms[socket.roomId].roundStartTimer);
          }
          delete rooms[socket.roomId];
          io.socketsLeave(socket.roomId); // it basically empty given room

        } else {

          // delete all data related to this player on server and on all others client side
          rooms[socket.roomId].users.splice(rooms[socket.roomId].users.indexOf(socket), 1);
          socket.to(socket.roomId).emit("userLeftMessage", socket.username);
          socket.to(socket.roomId).emit("removeUser", socket.clientId);

          // if user is host
          if (rooms[socket.roomId].host === socket) {
            io.to(socket.roomId).emit("hostLeftMessage");

            // kick all the users
            io.to(socket.roomId).emit("forceDisconnect");
            // make sure to clear all setIntervals and setTimeOuts
            if (rooms[socket.roomId].timer) {
              clearInterval(rooms[socket.roomId].timer);
            }
            if (rooms[socket.roomId].intermissionTimer) {
              clearTimeout(rooms[socket.roomId].intermissionTimer);
            }
            if (rooms[socket.roomId].roundStartTimer) {
              clearTimeout(rooms[socket.roomId].roundStartTimer);
            }
            delete rooms[socket.roomId];
            io.socketsLeave(socket.roomId);
            return;
          }

          // if user is drawer then end the current match 
          if (rooms[socket.roomId].drawer === socket && rooms[socket.roomId].matchInProgress) {
            socket.to(socket.roomId).emit("drawerLeftMessage");

            io.in(socket.roomId).emit("matchOver", rooms[socket.roomId].currentWord);

            rooms[socket.roomId].nextDrawerIndex--;
            endMatch(socket);
            clearInterval(rooms[socket.roomId].timer);
          }

          socket.leave(socket.roomId);
        }

      }
    });


  } catch (e) {
    console.log(e);
  }
});

server.listen(3000, () => {
  console.log("server started at 3000...");
});