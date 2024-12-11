const { expect } = require('chai');
const redisClient = require('../utils/redis');

describe('RedisClient', () => {
  it('should connect to Redis', async () => {
    const isAlive = redisClient.isAlive();
    expect(isAlive).to.be.true;
  });

  it('should set and get a key', async () => {
    await redisClient.set('testKey', 'testValue', 10);
    const value = await redisClient.get('testKey');
    expect(value).to.equal('testValue');
  });

  it('should delete a key', async () => {
    await redisClient.set('testKey', 'testValue', 10);
    await redisClient.del('testKey');
    const value = await redisClient.get('testKey');
    expect(value).to.be.null;
  });
});
