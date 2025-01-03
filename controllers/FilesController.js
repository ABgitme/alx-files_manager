const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const fsPromises = fs.promises;
const path = require('path');
const { ObjectId } = require('mongodb');
const mime = require('mime-types');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'];

    // Authenticate user using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    // Validate request body
    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }
    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const db = dbClient.client.db(dbClient.databaseName);
    const filesCollection = db.collection('files');

    // Handle parentId validation
    if (parentId !== 0) {
      const parentFile = await filesCollection.findOne({
        _id: new ObjectId(parentId),
      });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }
      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const fileDocument = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? '0' : new ObjectId(parentId),
    };

    // Handle folder creation
    if (type === 'folder') {
      const result = await filesCollection.insertOne(fileDocument);
      return res.status(201).json({
        id: result.insertedId,
        ...fileDocument,
      });
    }

    // Handle file/image creation
    const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
    await fsPromises.mkdir(folderPath, { recursive: true });

    const localPath = path.join(folderPath, uuidv4());
    await fsPromises.writeFile(localPath, Buffer.from(data, 'base64'));

    fileDocument.localPath = localPath;

    const result = await filesCollection.insertOne(fileDocument);

    return res.status(201).json({
      id: result.insertedId,
      ...fileDocument,
    });
  }

  // Retrieve file by ID
  static async getShow(req, res) {
    const token = req.headers['x-token'];

    // Authenticate user using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    try {
      const db = dbClient.client.db(dbClient.databaseName);
      const file = await db.collection('files').findOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId),
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.status(200).json(file);
    } catch (error) {
      return res.status(404).json({ error: 'Not found' });
    }
  }

  // Retrieve files with pagination
  static async getIndex(req, res) {
    const token = req.headers['x-token'];

    // Authenticate user using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || 0;
    const page = parseInt(req.query.page, 10) || 0;

    const limit = 20; // Max items per page
    const skip = page * limit;

    try {
      const db = dbClient.client.db(dbClient.databaseName);

      // Query files based on parentId
      const query = { userId: new ObjectId(userId) };
      if (parentId !== 0) {
        query.parentId = parentId === '0' ? '0' : new ObjectId(parentId);
      }

      const files = await db
        .collection('files')
        .aggregate([{ $match: query }, { $skip: skip }, { $limit: limit }])
        .toArray();

      return res.status(200).json(files);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Publish a file
  static async putPublish(req, res) {
    const token = req.headers['x-token'];

    // Authenticate user using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    try {
      const db = dbClient.client.db(dbClient.databaseName);
      const file = await db.collection('files').findOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId),
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Update isPublic to true
      await db
        .collection('files')
        .updateOne({ _id: new ObjectId(id) }, { $set: { isPublic: true } });

      const updatedFile = await db.collection('files').findOne({
        _id: new ObjectId(id),
      });

      return res.status(200).json(updatedFile);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Unpublish a file
  static async putUnpublish(req, res) {
    const token = req.headers['x-token'];

    // Authenticate user using token
    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    try {
      const db = dbClient.client.db(dbClient.databaseName);
      const file = await db.collection('files').findOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId),
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Update isPublic to false
      await db
        .collection('files')
        .updateOne({ _id: new ObjectId(id) }, { $set: { isPublic: false } });

      const updatedFile = await db.collection('files').findOne({
        _id: new ObjectId(id),
      });

      return res.status(200).json(updatedFile);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Get file content
  static async getFile(req, res) {
    try {
      const { id: fileId } = req.params;
      const size = req.query.size || 0;
      const token = req.header('X-Token');

      // Validate file ID
      if (!ObjectId.isValid(fileId)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Retrieve file document
      const db = dbClient.client.db(dbClient.databaseName);
      const file = await db
        .collection('files')
        .findOne({ _id: new ObjectId(fileId) });
      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Authenticate user and check file access
      if (!file.isPublic) {
        const userId = await redisClient.get(`auth_${token}`);
        if (!userId || String(file.userId) !== String(userId)) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      // Check if file is a folder
      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      // Verify file existence and read content
      const filePath = size ? `${file.localPath}_${size}` : file.localPath;
      try {
        const fileData = await fsPromises.readFile(filePath);

        // Determine MIME type and send file content
        const mimeType = mime.contentType(file.name) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        return res.status(200).send(fileData);
      } catch (err) {
        return res.status(404).json({ error: 'Not found' });
      }
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

module.exports = FilesController;
