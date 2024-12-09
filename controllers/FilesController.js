import { v4 as uuidv4 } from 'uuid';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import fs from 'fs/promises';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

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

    const { parentId = 0, page = 0 } = req.query;

    const limit = 20; // Max items per page
    const skip = parseInt(page, 10) * limit;

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
        console.error('Invalid file ID');
        return res.status(404).json({ error: 'Not found' });
      }

      // Retrieve file document
      const filesCollection = dbClient.db.collection('files');
      const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });
      if (!file) {
        console.error('File document not found');
        return res.status(404).json({ error: 'Not found' });
      }

      // Authenticate user and check file access
      if (!file.isPublic) {
        const usersCollection = dbClient.db.collection('users');
        const user = token ? await usersCollection.findOne({ token }) : null;

        if (!user || String(file.userId) !== String(user._id)) {
          console.error('Unauthorized access');
          return res.status(404).json({ error: 'Not found' });
        }
      }

      // Check if file is a folder
      if (file.type === 'folder') {
        console.error('Attempt to access folder content');
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      // Verify file existence and read content
      const filePath = (size && `${file.localPath}_${size}`) || file.localPath;
      try {
        const fileData = await fs.readFile(filePath);

        // Determine MIME type and send file content
        const mimeType = mime.contentType(file.name) || 'application/octet-stream';
        res.setHeader('Content-Type', mimeType);
        return res.status(200).send(fileData);
      } catch (err) {
        console.error(`File not found at path: ${filePath}`);
        return res.status(404).json({ error: 'Not found' });
      }
    } catch (err) {
      console.error(`Unhandled error in getFile: ${err.message}`);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default FilesController;
