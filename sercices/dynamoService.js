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

const saveModelMetadata = async (fileName, author, modelUrl) => {
  const params = {
    TableName: TABLE_NAME,
    Item: {
      id: fileName,
      author: author,
      modelUrl: modelUrl,
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
  const modelsIds = data.Items.map((item) => ({
    id: item.id,
  }));
  return modelsIds;
}

module.exports = { getModelAuthor, saveModelMetadata, getAllModels };
