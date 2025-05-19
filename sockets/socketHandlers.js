const {
  deleteFile,
  generatePresignedUrl,
  getModelUrl,
} = require("../sercices/s3Service");
const {
  saveModelMetadata,
  getModelAuthor,
  getAllModels,
} = require("../sercices/dynamoService");

// Current active controller (Only one can control at a time)
let activeController = null;

// All socket handlers
function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    // Connection event for ControlPage
    socket.on("request_control", () => {
      if (!activeController || socket.id === activeController) {
        activeController = socket.id;
        socket.emit("control_granted");
        console.log(`🎮 Control granted to: ${socket.id}`);
      } else {
        socket.emit("control_denied");
        console.log(`🚫 Control denied to: ${socket.id}`);
      }
    });

    // Emit the camera settings to ModelPage
    socket.on("camera_update", (data) => {
      if (socket.id === activeController) {
        socket.broadcast.emit("camera_update", data);
      }
    });

    // Emit settings to ModelPage from ControlPage
    socket.on("settings_update", (data) => {
      if (socket.id === activeController) {
        io.emit("settings_update", data);
      }
    });

    socket.on("model_settings_update", (data) => {
      if (socket.id === activeController) {
        io.emit("model_settings_update", data);
      }
    });

    // Emit settings to ControlPage from ControlPage
    socket.on("settings_update_local", (data) => {
      if (socket.id === activeController) {
        socket.emit("settings_update_local", data);
      }
    });

    socket.on("model_switch", (currentIndex) => {
      socket.broadcast.emit("update_index", currentIndex);
    });

    // Emit list of files from DynamoDB (with author information)
    socket.on("get_files", async () => {
      try {
        const { tukeModels, userModels } = await getAllModels();
        socket.emit("files_list", { tukeModels, userModels });
      } catch (error) {
        console.error("❌ List Files Error:", error);
        socket.emit("files_error", { message: "Failed to list files" });
      }
    });

    // Emit notification of deleted file
    socket.on("delete_file", async ({ fileName, folder }) => {
      try {
        await deleteFile(fileName, folder);
        socket.emit("delete_success", { fileName, folder });
      } catch (error) {
        console.error("❌ Delete Error:", error);
        socket.emit("delete_error", { message: "Failed to delete file" });
      }
    });

    // Emit pre-signed URL of file for uploading
    socket.on("request_presigned_url", async ({ fileName, folder }) => {
      try {
        const uploadUrl = await generatePresignedUrl(fileName, folder);
        socket.emit("presigned_url", { uploadUrl, fileName });
      } catch (error) {
        console.error("❌ Error generating pre-signed URL:", error);
        socket.emit("presigned_url_error", {
          message: "Failed to generate upload URL",
        });
      }
    });

    // Emit notification of upload completion
    socket.on("upload_complete", async ({ fileName, author, folder }) => {
      try {
        const modelUrl = getModelUrl(fileName, folder);
        await saveModelMetadata(fileName, author, modelUrl, folder);
        io.emit("model_uploaded", { fileName, modelUrl, author, folder });
      } catch (error) {
        console.error("❌ Error saving metadata:", error);
        socket.emit("upload_error", {
          message: "Failed to save model metadata",
        });
      }
    });

    // Disconnect event
    socket.on("disconnect", () => {
      if (socket.id === activeController) {
        console.log(
          `❌🎮 Controller Disconnected: ${socket.id}, freeing control.`
        );
        activeController = null;
      } else {
        console.log(`❌ Page Disconnected: ${socket.id}`);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
