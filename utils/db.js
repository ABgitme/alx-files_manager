import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || '27017';
    const database = process.env.DB_DATABASE || 'files_manager';
    const url = `mongodb://${host}:${port}`;

    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.databaseName = database;

    this.connected = false;
    this.initConnection();
  }

  async initConnection() {
    try {
      await this.client.connect();
      this.connected = true;
      const db = this.client.db(this.databaseName);
      this.usersCollection = db.collection('users');
      this.filesCollection = db.collection('files');
    } catch (err) {
      console.error(`MongoDB connection error: ${err}`);
      this.connected = false;
    }
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    return this.usersCollection.countDocuments();
  }

  async nbFiles() {
    return this.filesCollection.countDocuments();
  }
}

const dbClient = new DBClient();
export default dbClient;
