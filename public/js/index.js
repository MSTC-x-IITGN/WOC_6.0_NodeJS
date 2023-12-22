const socket = io();

const createUsername = document.getElementById('createUsername');
const joinUsername = document.getElementById('joinUsername');
const joinRoomId = document.getElementById('joinRoomId');

let users = {};

const canvas = document.getElementById("canvasBoard");
const ctx = canvas.getContext("2d");

// create and join rooms
document.getElementById('createRoomBtn').addEventListener('click', () => {
  if (createUsername.value !== '') {
    socket.emit('createRoom', createUsername.value, (username, roomId) => {
      socket.emit('join', username, roomId);
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

socket.on("goToGamePage", (username, roomId) => {
  document.getElementById("indexPage").style.display = "none";
  document.getElementById("gamePage").style.display = "flex";
  document.getElementById("roomIdBtn").innerText = roomId;

  canvasSetup();
});

socket.on("addUser", (username, clientId) => {
  addUserItem(username, clientId);
  users[clientId] = {
    username: username,
    points: 0,
  }; 
});

socket.on("removeUser", (clientId) => {
  removeUserItem(clientId);
  delete users[clientId];
});

socket.on("userJoinedMessage", (username) => {
  addInfoChat(`${username} is joined`);
});

socket.on("userLeftMessage", (username) => {
  addInfoChat(`${username} is left`);
});

document.getElementsByClassName('roomIdBtn')[0].addEventListener('click', () => {
  const text = document.getElementById('roomIdBtn').innerText;
  navigator.clipboard.writeText(text);
});

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
  console.log(e.clientX, e.clientY);
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

socket.on("canDraw", () => {
  canvas.addEventListener('mousedown', mouseDownEventListener);
  canvas.addEventListener('mouseup', mouseUpEventListener);
  canvas.addEventListener('mousemove', mouseMoveEventListener);
  canvas.addEventListener('mouseout', mouseOutEventListener);
});

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
    <img src="images/userIcon.svg" alt="UserIcon" class="userIcon">
    <span class="userName">${username}</span>
    <span class="points" id="${clientId}">0</span>
  </div>
  
    <img src="images/deleteIcon.svg" alt="" class="deleteIcon">
  </div>`;

  document.getElementById("addUserBefore").insertAdjacentHTML("beforebegin", userItem);
}

const removeUserItem = (clientId) => {
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

const addInfoChat = (msg) => {
  const infoChat = `<div class="infoChat">
    <p>
      ${msg}
    </p>
  </div>`;
  document.getElementById("addChatBefore").insertAdjacentHTML("beforebegin", infoChat);
}

const updatUsersUI = () => {
  for(const [clientId, {points}] of Object.entries(users)){
    document.getElementsByClassName(clientId)[1].innerText = points;
  }
}
