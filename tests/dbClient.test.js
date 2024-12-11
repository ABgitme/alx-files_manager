const { expect } = require('chai');
const dbClient = require('../utils/db');

describe('DbClient', () => {
  it('should connect to the database', async () => {
    const isAlive = dbClient.isAlive();
    expect(isAlive).to.be.true;
  });

  it('should return the number of documents in a collection', async () => {
    const count = await dbClient.nbDocuments('users');
    expect(count).to.be.a('number');
  });
});
