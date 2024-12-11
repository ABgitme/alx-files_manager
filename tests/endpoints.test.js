const request = require('supertest');
const { expect } = require('chai');
const app = require('../app'); // Your Express app

describe('API Endpoints', () => {
  describe('GET /status', () => {
    it('should return 200 with status ok', async () => {
      const res = await request(app).get('/status');
      expect(res.status).to.equal(200);
      expect(res.body).to.deep.equal({ redis: true, db: true });
    });
  });

  describe('GET /stats', () => {
    it('should return 200 with user and file stats', async () => {
      const res = await request(app).get('/stats');
      expect(res.status).to.equal(200);
      expect(res.body).to.have.keys(['users', 'files']);
    });
  });

  describe('POST /users', () => {
    it('should create a new user', async () => {
      const res = await request(app)
        .post('/users')
        .send({ email: 'test@example.com', password: 'password123' });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('email', 'test@example.com');
    });
  });

  describe('GET /connect', () => {
    it('should authenticate and return a token', async () => {
      const res = await request(app)
        .get('/connect')
        .auth('test@example.com', 'password123');
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('token');
    });
  });

  describe('GET /disconnect', () => {
    it('should disconnect the user', async () => {
      const token = 'sampleToken';
      const res = await request(app).get('/disconnect').set('X-Token', token);
      expect(res.status).to.equal(204);
    });
  });

  describe('GET /users/me', () => {
    it('should return user details', async () => {
      const token = 'sampleToken';
      const res = await request(app).get('/users/me').set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('id');
      expect(res.body).to.have.property('email');
    });
  });

  describe('POST /files', () => {
    it('should create a new file', async () => {
      const token = 'sampleToken';
      const res = await request(app).post('/files').set('X-Token', token).send({
        name: 'testFile.txt',
        type: 'file',
        data: 'SGVsbG8gd29ybGQ=', // "Hello world" in Base64
      });
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('id');
    });
  });

  describe('GET /files/:id', () => {
    it('should return file details', async () => {
      const token = 'sampleToken';
      const fileId = 'sampleFileId';
      const res = await request(app)
        .get(`/files/${fileId}`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('id', fileId);
    });
  });

  describe('GET /files', () => {
    it('should return a paginated list of files', async () => {
      const token = 'sampleToken';
      const res = await request(app)
        .get('/files')
        .set('X-Token', token)
        .query({ page: 1 });
      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
    });
  });

  describe('PUT /files/:id/publish', () => {
    it('should publish a file', async () => {
      const token = 'sampleToken';
      const fileId = 'sampleFileId';
      const res = await request(app)
        .put(`/files/${fileId}/publish`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('isPublic', true);
    });
  });

  describe('PUT /files/:id/unpublish', () => {
    it('should unpublish a file', async () => {
      const token = 'sampleToken';
      const fileId = 'sampleFileId';
      const res = await request(app)
        .put(`/files/${fileId}/unpublish`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('isPublic', false);
    });
  });

  describe('GET /files/:id/data', () => {
    it('should return the file content', async () => {
      const token = 'sampleToken';
      const fileId = 'sampleFileId';
      const res = await request(app)
        .get(`/files/${fileId}/data`)
        .set('X-Token', token);
      expect(res.status).to.equal(200);
      expect(res.text).to.equal('Expected file content');
    });
  });
});
