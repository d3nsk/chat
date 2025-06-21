import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// 静的ファイルの配信
app.use(express.static(path.join(__dirname, '../public')));

// 接続中のユーザーを管理
const connectedUsers = new Map<string, string>();

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // ユーザーが参加
  socket.on('join', (username: string) => {
    connectedUsers.set(socket.id, username);
    socket.broadcast.emit('userJoined', { id: socket.id, username });
    socket.emit('userList', Array.from(connectedUsers.entries()));
    console.log(`${username} joined the chat`);
  });

  // WebRTC offer
  socket.on('offer', (data: { target: string; offer: RTCSessionDescriptionInit }) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      from: socket.id
    });
  });

  // WebRTC answer
  socket.on('answer', (data: { target: string; answer: RTCSessionDescriptionInit }) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      from: socket.id
    });
  });

  // ICE candidate
  socket.on('ice-candidate', (data: { target: string; candidate: RTCIceCandidateInit }) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // メッセージの転送（P2P接続が確立されていない場合のフォールバック）
  socket.on('message', (data: { target: string; message: string }) => {
    socket.to(data.target).emit('message', {
      message: data.message,
      from: socket.id,
      username: connectedUsers.get(socket.id)
    });
  });

  // 接続解除
  socket.on('disconnect', () => {
    const username = connectedUsers.get(socket.id);
    connectedUsers.delete(socket.id);
    socket.broadcast.emit('userLeft', { id: socket.id, username });
    console.log(`${username || socket.id} left the chat`);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
}); 