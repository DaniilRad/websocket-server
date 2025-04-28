const {
  listFiles,
  deleteFile,
  generatePresignedUrl,
  getModelUrl,
} = require("../sercices/s3Service");
const {
  saveModelMetadata,
  getModelAuthor,
} = require("../sercices/dynamoService");

let activeController = null; // Udržiava ID aktuálneho ovládača

function registerSocketHandlers(io) {
  io.on("connection", (socket) => {
    console.log(`✅ User Connected: ${socket.id}`);

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

    socket.on("camera_update", (data) => {
      if (socket.id === activeController) {
        socket.broadcast.emit("camera_update", data);
      }
    });

    socket.on("settings_update", (data) => {
      if (socket.id === activeController) {
        socket.broadcast.emit("settings_update", data);
      }
    });

    socket.on("settings_update_local", (data) => {
      if (socket.id === activeController) {
        socket.emit("settings_update_local", data);
      }
    });

    socket.on("get_files", async () => {
      try {
        const fileNames = await listFiles();
        const filesWithAuthors = await Promise.all(
          fileNames.map(async (fileName) => {
            const author = await getModelAuthor(fileName);
            return {
              name: fileName,
              url: getModelUrl(fileName),
              author: author || "Anonymous",
            };
          })
        );
        socket.emit("files_list", filesWithAuthors);
      } catch (error) {
        console.error("❌ List Files Error:", error);
        socket.emit("files_error", { message: "Failed to list files" });
      }
    });

    socket.on("delete_file", async ({ fileName }) => {
      try {
        await deleteFile(fileName);
        socket.emit("delete_success", { fileName });
      } catch (error) {
        console.error("❌ Delete Error:", error);
        socket.emit("delete_error", { message: "Failed to delete file" });
      }
    });

    socket.on("request_presigned_url", async ({ fileName }) => {
      try {
        const uploadUrl = await generatePresignedUrl(fileName);
        socket.emit("presigned_url", { uploadUrl, fileName });
      } catch (error) {
        console.error("❌ Error generating pre-signed URL:", error);
        socket.emit("presigned_url_error", {
          message: "Failed to generate upload URL",
        });
      }
    });

    socket.on("upload_complete", async ({ fileName, author }) => {
      try {
        const modelUrl = getModelUrl(fileName);
        await saveModelMetadata(fileName, author, modelUrl);
        socket.broadcast.emit("model_uploaded", { fileName, modelUrl, author });
        socket.emit("upload_success", { message: "Upload successful!" });
      } catch (error) {
        console.error("❌ Error saving metadata:", error);
        socket.emit("upload_error", {
          message: "Failed to save model metadata",
        });
      }
    });

    socket.on("disconnect", () => {
      if (socket.id === activeController) {
        console.log(
          `❌ Controller Disconnected: ${socket.id}, freeing control.`
        );
        activeController = null;
      } else {
        console.log(`❌ Page Disconnected: ${socket.id}`);
      }
    });
  });
}

module.exports = { registerSocketHandlers };
