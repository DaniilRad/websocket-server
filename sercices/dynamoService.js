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

module.exports = { getModelAuthor, saveModelMetadata };
