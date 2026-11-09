const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createDatabase } = require('../src/database');

test('stores setup, enforces the guild cap, and prunes inactive settings', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-db-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const database = createDatabase(path.join(directory, 'test.sqlite'), 1);
  context.after(() => database.close());

  assert.equal(database.saveGuild({
    guildId: 'guild-1',
    welcomeChannelId: 'welcome-1',
    goodbyeChannelId: 'goodbye-1',
    now: 100,
  }), true);
  assert.equal(database.getGuildCount(), 1);
  assert.equal(database.getGuild('guild-1').terms_version, '1');
  assert.equal(database.saveGuild({
    guildId: 'guild-2',
    welcomeChannelId: 'welcome-2',
    goodbyeChannelId: 'goodbye-2',
    now: 200,
  }), false);

  assert.equal(database.touchActivity('guild-1', 300), true);
  assert.equal(database.deleteInactive(250), 0);
  assert.equal(database.deleteInactive(301), 1);
  assert.equal(database.getGuildCount(), 0);
  assert.equal(database.deleteGuild('guild-1'), false);
});

test('allows existing server setup to update channels at capacity', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-db-'));
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = createDatabase(path.join(directory, 'test.sqlite'), 1);
  context.after(() => database.close());

  database.saveGuild({
    guildId: 'guild-1',
    welcomeChannelId: 'old-welcome',
    goodbyeChannelId: 'old-goodbye',
    now: 100,
  });
  assert.equal(database.saveGuild({
    guildId: 'guild-1',
    welcomeChannelId: 'new-welcome',
    goodbyeChannelId: 'new-goodbye',
    now: 200,
  }), true);
  assert.equal(database.getGuild('guild-1').welcome_channel_id, 'new-welcome');
  assert.equal(database.getGuildCount(), 1);
});
