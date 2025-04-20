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

const dynamoDB = new AWS.DynamoDB.DocumentClient(); // Initialize DynamoDB Document Client
const bucketName = process.env.AWS_BUCKET_NAME;

const TABLE_NAME = "Models"; // DynamoDB table name
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

  // Handle settings updates (only from the active controller)
  socket.on("settings_update", (data) => {
    if (socket.id === activeController) {
      socket.broadcast.emit("settings_update", data);
    }
  });

  // Handle settings updates (only from the active controller)
  socket.on("settings_update_local", (data) => {
    if (socket.id === activeController) {
      socket.emit("settings_update_local", data); // Emit to the sender
    }
  });

  //* Handle request for file list
  socket.on("get_files", async () => {
    try {
      const data = await s3.listObjectsV2({ Bucket: bucketName }).promise();
      const fileNames = data.Contents.map((item) => item.Key);

      // Fetch author data for each file from DynamoDB
      const filesWithAuthors = await Promise.all(
        fileNames.map(async (fileName) => {
          const params = {
            TableName: TABLE_NAME,
            Key: { id: fileName },
          };

          try {
            const result = await dynamoDB.get(params).promise();
            const author = result.Item ? result.Item.author : "Anonymous";
            console.log("Author fetched for", fileName, ":", author);
            return {
              name: fileName,
              url: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`,
              author: author,
            };
          } catch (error) {
            console.error("❌ Error fetching author for", fileName, error);
            return {
              name: fileName,
              url: `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`,
              author: "Anonymous",
            };
          }
        })
      );

      console.log("Files list with authors:", filesWithAuthors);
      socket.emit("files_list", filesWithAuthors);
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

  socket.on("request_presigned_url", async ({ fileName }) => {
    try {
      console.log(`🔗 Generating pre-signed URL for ${fileName}`);

      const params = {
        Bucket: bucketName,
        Key: fileName,
        Expires: 300, // URL valid for 5 minutes
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

  // ✅ Notify when upload is done
  // socket.on("upload_complete", ({ fileName }) => {
  //   console.log(`✅ Upload complete: ${fileName}`);

  //   const modelUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

  //   socket.broadcast.emit("model_uploaded", { fileName, modelUrl });

  //   socket.emit("upload_success", { message: "Upload successful!" });
  // });

  socket.on("upload_complete", async ({ fileName, author }) => {
    console.log(`✅ Upload complete: ${fileName}`);

    const modelUrl = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    const params = {
      TableName: TABLE_NAME,
      Item: {
        id: fileName, // Using the file name as unique identifier
        author: author || "Anonymous", // Default to "Anonymous" if no author is provided
        modelUrl: modelUrl,
      },
    };

    try {
      // Attempt to put the item into DynamoDB
      await dynamoDB.put(params).promise();
      console.log(`Metadata for ${fileName} saved to DynamoDB.`);

      // Broadcast event so the ModelPage can refresh and load this model
      socket.broadcast.emit("model_uploaded", { fileName, modelUrl });

      // Notify uploader about success
      socket.emit("upload_success", { message: "Upload successful!" });
    } catch (error) {
      // Detailed logging for the error
      console.error("❌ Error saving metadata to DynamoDB:", error);
      socket.emit("upload_error", {
        message:
          "Failed to save model metadata. Error details: " + error.message,
      });
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
