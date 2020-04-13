process.env.NODE_ENV = 'test';

global.should = require('should');
global.supertest = require('supertest');

require = require('esm')(module);

before(function() {
  console.log('global setup');
  process.chdir('test_data');
  var running = require('../src/server')({
    configPath: 'config.json',
    port: 8888,
    publicUrl: '/test/'
  });
  global.app = running.app;
  global.server = running.server;
  return running.startupPromise;
});

after(function() {
  console.log('global teardown');
  global.server.close(function() { console.log('Done'); process.exit(); });
});
