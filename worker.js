const Bull = require('bull');
const imageThumbnail = require('image-thumbnail');
const fs = require('fs').promises;
const { ObjectId } = require('mongodb');
const dbClient = require('./utils/db');

const fileQueue = new Bull('fileQueue');

fileQueue.process(async (job) => {
  const { userId, fileId } = job.data;

  if (!fileId) throw new Error('Missing fileId');
  if (!userId) throw new Error('Missing userId');

  const filesCollection = dbClient.client
    .db(dbClient.databaseName)
    .collection('files');
  const file = await filesCollection.findOne({
    _id: new ObjectId(fileId),
    userId: new ObjectId(userId),
  });

  if (!file) throw new Error('File not found');
  if (file.type !== 'image') return;

  const originalPath = file.localPath;

  try {
    const sizes = [500, 250, 100];

    // Generate thumbnails in parallel
    const thumbnailPromises = sizes.map(async (size) => {
      const options = { width: size };
      const thumbnail = await imageThumbnail(originalPath, options);
      const thumbnailPath = `${originalPath}_${size}`;
      await fs.writeFile(thumbnailPath, thumbnail);
      console.log(`Thumbnail generated: ${thumbnailPath}`);
    });

    await Promise.all(thumbnailPromises);
  } catch (err) {
    console.error(`Error generating thumbnails: ${err.message}`);
  }
});
