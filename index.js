const dotenv = require("dotenv");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const AWS = require("aws-sdk");
const { NodeIO } = require("@gltf-transform/core");
const { draco } = require("@gltf-transform/functions");

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

  socket.on("request_presigned_url", async ({ fileName, fileType }) => {
    try {
      console.log(`🔗 Generating pre-signed URL for ${fileName}`);

      const params = {
        Bucket: bucketName,
        Key: fileName,
        Expires: 300, // URL valid for 5 minutes
        ContentType: fileType,
      };

      const uploadUrl = await s3.getSignedUrlPromise("putObject", params);

      socket.emit("presigned_url", { uploadUrl, fileName });
    } catch (error) {
      console.error("❌ Error generating pre-signed URL:", error);
      socket.emit("presigned_url_error", {
        message: "Failed to generate upload URL",
      });
    }
  });

  //* Step 2: After upload, apply Draco compression
  socket.on("upload_complete", async ({ fileName }) => {
    try {
      console.log(`✅ Upload complete: ${fileName}`);
      console.log(`🔄 Fetching model from S3 for compression...`);

      // 1️⃣ **Download the uploaded file from S3**
      const getParams = { Bucket: bucketName, Key: fileName };
      const { Body } = await s3.send(new AWS.GetObjectCommand(getParams));
      const fileBuffer = await Body.transformToByteArray();

      console.log("🔹 File downloaded. Applying Draco compression...");

      // 2️⃣ **Apply Draco compression**
      const io = new NodeIO();
      const document = await io.readBinary(Buffer.from(fileBuffer));
      await document.transform(draco());
      const compressedBuffer = await io.writeBinary(document);

      console.log("🚀 Draco compression done. Replacing file in S3...");

      // 3️⃣ **Replace original file with compressed version**
      const putParams = {
        Bucket: bucketName,
        Key: fileName, // ✅ Overwrite the existing file
        Body: compressedBuffer,
        ContentType: "model/gltf-binary",
      };

      await s3.send(new AWS.PutObjectCommand(putParams));

      console.log("✅ Compressed model saved:", fileName);
      socket.emit("upload_success", {
        message: "Upload & compression successful!",
      });
    } catch (error) {
      console.error("❌ Compression Error:", error);
      socket.emit("upload_error", { message: "Compression failed" });
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
