const test = require('node:test');
const assert = require('node:assert/strict');
const { createModerationEngine } = require('../src/moderation');

function setup(overrides = {}) {
  let now = 1000;
  const engine = createModerationEngine({
    spamMessageLimit: 5,
    spamWindowMs: 8000,
    duplicateMessageLimit: 3,
    massMentionLimit: 5,
    blockedWords: ['badword'],
    blockedDomains: ['bad.example'],
    ...overrides,
  }, () => now++);
  return engine;
}

function message(content, userId = 'user-1', users = 0, roles = 0, guildId = 'guild-1') {
  return {
    content,
    author: { id: userId },
    guild: { id: guildId },
    mentions: {
      users: { size: users },
      roles: { size: roles },
    },
  };
}

test('blocks a configured word without matching a larger word', () => {
  const engine = setup();
  assert.equal(engine.inspect(message('a BADWORD here')).reason, 'Sử dụng từ bị cấm');
  assert.equal(engine.inspect(message('badwording', 'user-2')), null);
});

test('blocks the configured domain and its subdomains, not lookalikes', () => {
  const engine = setup();
  assert.equal(engine.inspect(message('https://sub.bad.example/path')).reason, 'Chia sẻ liên kết thuộc danh sách chặn');
  assert.equal(engine.inspect(message('https://bad.example.evil.test', 'user-2')), null);
});

test('detects mention floods, repeated messages, and rapid messages', () => {
  const engine = setup();
  assert.equal(engine.inspect(message('hello', 'mentions', 5)).reason, 'Nhắc tên quá nhiều người hoặc vai trò');
  const duplicate = setup();
  duplicate.inspect(message('same'));
  duplicate.inspect(message('same'));
  assert.equal(duplicate.inspect(message('same', 'user-1', 0, 0, 'guild-2')), null);
  assert.equal(duplicate.inspect(message('same')).reason, 'Gửi lặp lại cùng một nội dung');
  const spam = setup();
  for (let i = 0; i < 4; i++) spam.inspect(message(`message ${i}`));
  assert.equal(spam.inspect(message('fifth')).reason, 'Gửi quá nhiều tin nhắn trong thời gian ngắn');
});
