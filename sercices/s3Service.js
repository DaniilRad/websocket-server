const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config();
const { deleteFileFromDatabase } = require("./dynamoService");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const bucketName = process.env.AWS_BUCKET_NAME;

async function listFiles() {
  const data = await s3.listObjectsV2({ Bucket: bucketName }).promise();
  return data.Contents.map((item) => item.Key);
}

async function deleteFile(fileName, folder) {
  try {
    // Vymaž súbor z S3
    const key = `${folder}/${fileName}`;
    await s3.deleteObject({ Bucket: bucketName, Key: key }).promise();
    console.log(`File ${key} deleted from S3.`);

    // Vymaž aj z DynamoDB
    await deleteFileFromDatabase(fileName);
    console.log(`File metadata for ${fileName} deleted from DynamoDB.`);
  } catch (error) {
    console.error("❌ Delete Error:", error);
    throw new Error("Failed to delete file");
  }
}

async function generatePresignedUrl(fileName, folder) {
  const key = `${folder}/${fileName}`;
  const params = {
    Bucket: bucketName,
    Key: key,
    Expires: 300, // 5 minút
  };
  return s3.getSignedUrlPromise("putObject", params);
}

function getModelUrl(fileName, folder) {
  return `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${folder}/${fileName}`;
}

module.exports = {
  listFiles,
  deleteFile,
  generatePresignedUrl,
  getModelUrl,
};
