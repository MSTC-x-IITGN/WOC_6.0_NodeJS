const socket = io();

const createUsername = document.getElementById('createUsername');
const joinUsername = document.getElementById('joinUsername');
const joinRoomId = document.getElementById('joinRoomId');
const msg = document.getElementById('msg');

let users = {};
let isDrawer = false;
let isHost = false;
let guessWord = "";
let guessWordLength = 0;
let whoIsDrawing = "";

var timer = null;

const canvas = document.getElementById("canvasBoard");
const ctx = canvas.getContext("2d");

// create and join rooms
document.getElementById('createRoomBtn').addEventListener('click', () => {
  if (createUsername.value !== '') {
    socket.emit('createRoom', createUsername.value, (username, roomId) => {
      socket.emit('join', username, roomId);
      isHost = true;
    });
  }
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  if(joinUsername.value !== '' && joinRoomId.value !== ''){
    socket.emit("validateRoom", joinUsername.value, joinRoomId.value, (username, roomId) => {
      socket.emit('join', username, roomId);
    });
  }
});

// event for showing game page and canvas setup
socket.on("goToGamePage", (username, roomId) => {
  document.getElementById("indexPage").style.display = "none";
  document.getElementById("gamePage").style.display = "flex";
  document.getElementById("roomIdBtn").innerText = roomId;

  canvasSetup();
});

// event for adding user in this client
socket.on("addUser", (username, clientId) => {
  addUserItem(username, clientId);
  users[clientId] = {
    username: username,
    score: 0,
  }; 
});

// event for remove user from this client
socket.on("removeUser", (clientId) => {
  removeUserItem(clientId);
  delete users[clientId];
});

// we can combine below five events into one singal event

socket.on("userJoinedMessage", (username) => {
  addInfoChat(`${username} is joined`);
});

socket.on("userLeftMessage", (username) => {
  addInfoChat(`${username} is left`, "red");
});

socket.on("drawerLeftMessage", () => {
  addInfoChat(`drawer is left`, "red");
});

socket.on("hostLeftMessage", () => {
  addInfoChat(`Host is left`, "red");
});

socket.on("userKickedMessage", (username) => {
  addInfoChat(`${username} is kicked off by Host`, "red");
});


// event for disconnecting from server
socket.on("forceDisconnect", () => {
  location.reload();
});

// copy roomId whenever roomBtn clicked
document.getElementsByClassName('roomIdBtn')[0].addEventListener('click', () => {
  const text = document.getElementById('roomIdBtn').innerText;
  navigator.clipboard.writeText(text);
});

// handle chat message here
document.getElementById("msgInput").addEventListener("submit", (e) => {
  e.preventDefault();
  if(msg.value !== ''){
    socket.emit("chat", msg.value);
    msg.value = "";
  }
});

// tell server to start game if start button was clicked by host only
socket.on("enableStartBtn", () => {
  const startBtn = document.getElementById("startGameBtn");
  startBtn.classList.remove('disabled');
  startBtn.addEventListener("click", () => {
    socket.emit("startGame");
  });
});

// get guess word from server if this client is drawer
socket.on("guessWord", (word) => {
  guessWord = word;
  document.getElementById("guessWord").innerText = guessWord;
  isDrawer = true;
});

// get guess word length for guessers
socket.on("guessWordLength", (length) => {
  guessWordLength = length;
  document.getElementById("guessWord").innerText = wordsAsBlank(guessWordLength);
  isDrawer = false;
});

// get information about drawer
socket.on("whoIsDrawing", (clientId, username) => {
  whoIsDrawing = username;

  // change drawer icon of this clientId
  document.getElementsByClassName(clientId)[1].setAttribute("src", "images/drawIcon.svg");

  // change all other icon to userIcon
  Object.keys(users).forEach((key) => {
    if(key !== clientId){
      document.getElementsByClassName(key)[1].setAttribute("src", "images/userIcon.svg");
    }
  });

  // add infoChat about who is drawing
  addInfoChat(`${username} is drawing`, 'orange');
});

// alert users that game is about to start in 5 sec
socket.on("alertUsersGameIsStarting", () => {
  // remove result screen if available
  const resultScreen = document.getElementById("resultScreen");
  if(resultScreen){
    resultScreen.remove();
  }
  if(isDrawer){
    showGameStartingScreenForDrawer(guessWord);
  }else{
    showGameStartingScreenForGuesser(whoIsDrawing);
  }
});

// start match event
socket.on("matchStart", (time) => {
  const modal = document.getElementsByClassName("modal")[0];
  if(modal){
    modal.remove();
  }

  updateUsersUI();
  startCountDown("timer", time);
});

// event for match is over
socket.on("matchOver", (word) => {
  if(timer !== null){
    clearInterval(timer);
    timer = null;
  }
  showMatchOver(word);
});

// event for showing results
socket.on("endOfRoundSummary", (results) => {
  appendResults(results);
})

// event for ending entire game
socket.on("endGame", () => {
  showFinalResult();
});


// below to events are for adding chats in chat section
socket.on("normalChat", (chat) => {
  addNormalChat(chat.sender, chat.message);
});

socket.on("infoChat", (msg, color) => {
  addInfoChat(msg, color);
});

// envent for guessers if they guessed correctly
socket.on("revealWord", (word) => {
  document.getElementById("guessWord").innerText = word;
});


// full canvas setup 
const canvasSetup = () => {
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;

  ctx.lineCap = 'round';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 5;

  document.getElementById('stroke').addEventListener('input', (e) => {
    ctx.strokeStyle = e.target.value;
  });
  
  document.getElementById('lineWidth').addEventListener('change', (e) => {
    ctx.lineWidth = e.target.value;
  });
  
  document.getElementById("clearCanvas").addEventListener("click", () => {
    socket.emit("clearRoomCanvas");
  });
}

let isDrawing = false;

const mouseDownEventListener = (e) => {
  isDrawing = true;
  ctx.beginPath();
  ctx.moveTo(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);
  socket.emit("draw", {
    x: e.clientX - canvas.offsetLeft,
    y: e.clientY - canvas.offsetTop,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
    isBegin: 1, // 1 represents drawing path starting
  });
};

const mouseUpEventListener = () => {
  isDrawing = false;
  ctx.closePath();
  socket.emit("draw", {
    x: -1,
    y: -1,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
    isBegin: -1, // -1 represents drawing path ending
  });
};

const mouseMoveEventListener = (e) => {
  if(!isDrawing){
    return;
  }
  draw(e.clientX - canvas.offsetLeft, e.clientY - canvas.offsetTop);
};

const mouseOutEventListener = () => {
  isDrawing = false;
  ctx.closePath();
  socket.emit("draw", {
    x: -1,
    y: -1,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
    isBegin: -1, // -1 represents drawing path ending
  });
};

// This user can draw (drawer)
socket.on("canDraw", () => {
  canvas.addEventListener('mousedown', mouseDownEventListener);
  canvas.addEventListener('mouseup', mouseUpEventListener);
  canvas.addEventListener('mousemove', mouseMoveEventListener);
  canvas.addEventListener('mouseout', mouseOutEventListener);
});

// This is user can't draw on canvas
socket.on("canNotDraw", () => {
  canvas.removeEventListener('mousedown', mouseDownEventListener);
  canvas.removeEventListener('mouseup', mouseUpEventListener);
  canvas.removeEventListener('mousemove', mouseMoveEventListener);
  canvas.removeEventListener('mouseout', mouseOutEventListener);
})

const draw = (x, y) => {

  ctx.lineTo(x, y);
  ctx.stroke();

  // broadcast to all other players
  socket.emit("draw", {
    x: x,
    y: y,
    strokeStyle: ctx.strokeStyle,
    lineWidth: ctx.lineWidth,
    isBegin: 0, // 0 represents drawing path continued
  });
}
  
// for receiving canvasData from drawer via server
socket.on("canvasData", (data) => {
  ctx.strokeStyle = data.strokeStyle;
  ctx.lineWidth = data.lineWidth;
  if(data.isBegin == 0){
    draw(data.x, data.y);
  }else if(data.isBegin == 1){
    ctx.beginPath();
    ctx.moveTo(data.x, data.y);
  }else{
    ctx.closePath();
  }
});


socket.on("clearCanvasData", () => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});


const addUserItem = (username, clientId) => {
  const userItem = `<div class="userItem ${clientId}">
  <div class="userInfo">
    <img src="images/userIcon.svg" alt="UserIcon" class="userIcon ${clientId}">
    <span class="userName">${username}</span>
    <span class="points ${clientId}">0</span>
  </div>
  
    <img src="images/deleteIcon.svg" alt="kickPlayer" class="deleteIcon" id=${clientId} clientId=${clientId}>
  </div>`;

  document.getElementById("addUserBefore").insertAdjacentHTML("beforebegin", userItem);

  document.getElementById(clientId).addEventListener('click', (e) => {
    socket.emit("kickUser", e.target.attributes.clientId.value);
  })
}

const removeUserItem = (clientId) => {
  if(document.getElementsByClassName(clientId)[0])
  document.getElementsByClassName(clientId)[0].remove();
}

const addNormalChat = (username, msg) => {
  const normalChat = `<div class="normalChat">
    <p>
      <b>${username}: </b><span>${msg}</span>
    </p>
  </div>`;
  document.getElementById("addChatBefore").insertAdjacentHTML("beforebegin", normalChat);
}

const addInfoChat = (msg, color="blue") => {
  const infoChat = `<div class="infoChat" style="color: ${color}">
    <p>
      ${msg}
    </p>
  </div>`;
  document.getElementById("addChatBefore").insertAdjacentHTML("beforebegin", infoChat);
}

const updateUsersUI = () => {
  for(const [clientId, {score}] of Object.entries(users)){
    document.getElementsByClassName(clientId)[2].innerText = score;
  }
}

const showGameStartingScreenForDrawer = (word) => {
  const addModalBefore = document.getElementById("addModalBefore");
  const modal = `<div class="modal" style="color:white">
    <h1>You are Drawing</h1>
    <h1>Word: ${word}</h1>
    <br>
    <h1>Others have to Guess</h1>
    <br>
    <h1 id="modalCountDown">5</h1>
  </div>`;
  addModalBefore.insertAdjacentHTML('beforebegin', modal);
  startCountDown("modalCountDown", 5);
}

const showGameStartingScreenForGuesser = (whoIsDrawing) => {
  const addModalBefore = document.getElementById("addModalBefore");
  const modal = `<div class="modal" style="color:white">
    <h1>${whoIsDrawing} is Drwaing</h1>
    <br>
    <h1>You have to guess</h1>
    <br>
    <h1 id="modalCountDown">5</h1>
  </div>`
  addModalBefore.insertAdjacentHTML('beforebegin', modal);
  startCountDown("modalCountDown", 5);
} 

const startCountDown = (id, countDown) => {
  countDown = Number(countDown);

  if(document.getElementById(id)){
    document.getElementById(id).innerText = countDown;
  }

  let count = countDown;
  if(timer !== null){
    clearInterval(timer);
    timer = null;
  }

  timer = setInterval(() => {
    count--;
    if(document.getElementById(id)){
      document.getElementById(id).innerText = count;
    }else{
      clearInterval(timer);
      timer = null;
    }

    if(count == 0){
      clearInterval(timer);
      timer = null;
    }

  }, 1000);

}

const wordsAsBlank = (length) => {
  let word = "";
  if(length > 0){
    word += '_';
  }
  for(let i = 1; i < length; i++){
    word += " _";
  }

  return word;
}

const showMatchOver = (word) => {
  const addModalBefore = document.getElementById("addModalBefore");
  const resultScreen = `<div id="resultScreen" style="color:white">
    <h1>Match Over</h1>
    <h1>Guess Word : ${word}</h1>
    <p>Time Out</p>
    <br>
    <div id="resultList">
    </div>
  </div>`;
  addModalBefore.insertAdjacentHTML('beforebegin', resultScreen);
}

const appendResults = (results) => {
  const resultList = document.getElementById("resultList");
  if(resultList){
    results.forEach(({clientId, username, score}) => {
      users[clientId].score = score;
      const p = document.createElement("p");
      p.innerText = `${username} : ${score}`;
      resultList.appendChild(p);
    });
  }
}

const showFinalResult = () => {
  let resultScreen = document.getElementById("resultScreen");
  if(resultScreen){
    resultScreen.remove();
  }

  const addModalBefore = document.getElementById("addModalBefore");
  resultScreen = `<div id="resultScreen">
    <h1>Game Over - Final LeaderBoard</h1>
    <br>
    <div id="resultList">
    </div>
    <br>
    <button id="startNewGame" class="${(isHost) ? '' : 'disabled'}"> Start New Game </button>
  </div>`;

  addModalBefore.insertAdjacentHTML('beforebegin', resultScreen);
  document.getElementById("startNewGame").addEventListener('click', () => {
    socket.emit("startGame");
  });
  const resultList = document.getElementById("resultList");
  if(resultList){
    Object.keys(users).forEach((clientId) => {
      const p = document.createElement("p");
      p.innerText = `${users[clientId].username} : ${users[clientId].score}`;
      resultList.appendChild(p);
    });
  }
}