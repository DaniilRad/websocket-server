const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const AWS = require("aws-sdk");

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

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const bucketName = process.env.AWS_BUCKET_NAME;
const PORT = process.env.PORT || 8080;
let activeController = null; // Store the active controller ID

io.on("connection", (socket) => {
  console.log(`✅ User Connected: ${socket.id}`);

  // Handle control request
  socket.on("request_control", () => {
    console.log("ActiveControler: " + activeController);
    if (!activeController || socket.id === activeController) {
      activeController = socket.id;
      socket.emit("control_granted");
      console.log(`🎮 Control granted to: ${socket.id}`);
    } else {
      socket.emit("control_denied");
      console.log(`🚫 Control denied to: ${socket.id}`);
    }
  });

  // Handle camera updates (only from the active controller)
  socket.on("camera_update", (data) => {
    if (socket.id === activeController) {
      socket.broadcast.emit("camera_update", data);
    }
  });

  //* Handle file upload
  socket.on("upload_file", async ({ fileName, fileBuffer, fileType }) => {
    console.log(`📤 Uploading file: ${fileName}`);

    try {
      const uploadResult = await s3
        .upload({
          Bucket: bucketName,
          Key: fileName,
          Body: Buffer.from(fileBuffer, "base64"), // Convert from base64
          ContentType: fileType,
        })
        .promise();

      console.log("✅ File uploaded:", uploadResult.Location);
      socket.emit("upload_success", { url: uploadResult.Location });
    } catch (error) {
      console.error("❌ Upload Error:", error);
      socket.emit("upload_error", { message: "Failed to upload file" });
    }
  });

  //* Handle request for file list
  socket.on("get_files", async () => {
    try {
      const data = await s3.listObjectsV2({ Bucket: bucketName }).promise();
      const files = data.Contents.map((item) => ({
        name: item.Key,
        url: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${item.Key}`,
      }));
      console.log("Files list: " + files);
      socket.emit("files_list", files);
    } catch (error) {
      console.error("❌ List Files Error:", error);
      socket.emit("files_error", { message: "Failed to list files" });
    }
  });

  //* Handle file delete request
  socket.on("delete_file", async ({ fileName }) => {
    console.log(`🗑 Deleting file: ${fileName}`);

    try {
      await s3.deleteObject({ Bucket: bucketName, Key: fileName }).promise();
      socket.emit("delete_success", { fileName });
    } catch (error) {
      console.error("❌ Delete Error:", error);
      socket.emit("delete_error", { message: "Failed to delete file" });
    }
  });

  // Release control when the active controller disconnects
  socket.on("disconnect", () => {
    if (socket.id === activeController) {
      console.log(`❌ Controller Disconnected: ${socket.id}, freeing control.`);
      activeController = null;
    } else {
      console.log(`❌ Page Disconnected: ${socket.id}, freeing control.`);
    }
  });
});

server.listen(PORT, () => {
  console.log("🚀 Server running on PORT 8080");
});
