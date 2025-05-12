const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config();

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

async function deleteFile(fileName) {
  await s3.deleteObject({ Bucket: bucketName, Key: fileName }).promise();
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
