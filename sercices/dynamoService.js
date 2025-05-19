// services/dynamoService.js
const AWS = require("aws-sdk");

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = "Models";

const getModelAuthor = async (fileName) => {
  const params = {
    TableName: TABLE_NAME,
    Key: { id: fileName },
  };

  try {
    const result = await dynamoDB.get(params).promise();
    return result.Item ? result.Item.author : "Anonymous";
  } catch (error) {
    throw new Error("Failed to fetch author");
  }
};

const deleteFileFromDatabase = async (fileName) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      Key: {
        id: fileName,
      },
    };

    await dynamoDB.delete(params).promise();
    console.log(`File metadata for ${fileName} deleted from DynamoDB.`);
  } catch (error) {
    console.error("❌ DynamoDB Delete Error:", error);
    throw new Error("Failed to delete file from DynamoDB");
  }
};

const saveModelMetadata = async (fileName, author, modelUrl, folder) => {
  console.log("SAVE_MODEL_METADATA: ", fileName, author, modelUrl, folder);
  const params = {
    TableName: TABLE_NAME,
    Item: {
      id: fileName,
      author: author,
      modelUrl: modelUrl,
      folder: folder,
    },
  };

  await dynamoDB.put(params).promise();
};

// Get all models from DynamoDB (with metadata like author)
async function getAllModels() {
  const params = {
    TableName: TABLE_NAME,
  };

  //scan table and return only ids of items
  const data = await dynamoDB.scan(params).promise();
  const modelsList = data.Items.map((item) => ({
    id: item.id,
    author: item.author,
    url: item.modelUrl,
    folder: item.folder,
  }));

  const tukeModels = modelsList.filter(
    (model) => model.folder === "tuke-models"
  );
  const userModels = modelsList.filter(
    (model) => model.folder === "user-models"
  );

  // Return both lists
  return { tukeModels, userModels };
}

module.exports = {
  getModelAuthor,
  saveModelMetadata,
  getAllModels,
  deleteFileFromDatabase,
};
