const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const { registerSocketHandlers } = require("./sockets/socketHandlers");

dotenv.config();

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "https://3d-web-app-three.vercel.app"],
    methods: ["GET", "POST"],
  },
});

registerSocketHandlers(io);

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});
