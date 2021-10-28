const config = require('./config');
const {
  Storage
} = require('@google-cloud/storage');
const storage = new Storage();
const bucket = storage.bucket(config.gcloud.bucket);

async function deleteFile(path) {
  const blob = bucket.file(path);
  const exists = await blob.exists();
  if (exists[0]) {
    await blob.delete();
    console.log(`deleted ${path}`);
  } else {
    console.log(`${path} does not exist`)
  }
}

function uploadFileStream(path) {
  const blob = bucket.file(path);
  const blobStream = blob.createWriteStream();

  blobStream.on('error', console.log);

  blobStream.on('finish', () => {
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
    console.log(`Uploaded file ${path} to https://storage.googleapis.com/${bucket.name}/${blob.name}`);
  });
  return blobStream;
}

function publicURL(path) {
  return `https://${bucket.name}.storage.googleapis.com/${path}`;
}

module.exports.deleteFile = deleteFile;
module.exports.uploadFileStream = uploadFileStream;
module.exports.publicURL = publicURL;
