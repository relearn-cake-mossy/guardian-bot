const test = require('node:test');
const assert = require('node:assert/strict');
const { createAiModerator, getImageUrl } = require('../src/groq');

function config(overrides = {}) {
  return {
    aiApiKey: 'test-key',
    aiModel: 'text-model',
    aiVisionModel: 'vision-model',
    aiRequestIntervalMs: 60_000,
    aiMaxCallsPerHour: 10,
    aiUserCooldownMs: 1000,
    aiMinConfidence: 0.9,
    aiSampleRate: 1,
    aiBatchSize: 2,
    aiBatchIntervalMs: 60_000,
    aiMaxPending: 10,
    ...overrides,
  };
}

function message(id, overrides = {}) {
  return {
    content: `message ${id}`,
    guild: { id: 'guild' },
    author: { id },
    attachments: new Map(),
    embeds: [],
    ...overrides,
  };
}

test('samples eligible messages and sends a batch in one request', async (context) => {
  let request;
  const moderator = createAiModerator(config(), {
    random: () => 0,
    client: {
      chat: {
        completions: {
          create: async (options) => {
            request = options;
            return {
              choices: [{
                message: {
                  content: JSON.stringify({
                    results: [{ index: 1, moderate: true, confidence: 0.95, reason: 'Spam' }],
                  }),
                },
              }],
            };
          },
        },
      },
    },
  });
  context.after(() => moderator.close());

  let detected;
  moderator.enqueue(message('one'), () => assert.fail('Unexpected violation'));
  moderator.enqueue(message('two'), (violation) => { detected = violation; });

  for (let attempts = 0; attempts < 20 && !detected; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(request.messages[1].content[0].text.includes('"index":0'), true);
  assert.equal(request.model, 'text-model');
  assert.deepEqual(detected, { reason: 'AI: Spam' });
});

test('skips messages outside the random sample', (context) => {
  let requests = 0;
  const moderator = createAiModerator(config({ aiSampleRate: 0.2 }), {
    random: () => 0.9,
    client: {
      chat: { completions: { create: async () => { requests++; } } },
    },
  });
  context.after(() => moderator.close());

  assert.equal(moderator.enqueue(message('sampled out'), () => {}), false);
  assert.equal(requests, 0);
});

test('limits AI requests to one per configured interval', async (context) => {
  const requestTimes = [];
  const moderator = createAiModerator(config({
    aiBatchSize: 1,
    aiBatchIntervalMs: 1,
    aiRequestIntervalMs: 30,
  }), {
    random: () => 0,
    client: {
      chat: {
        completions: {
          create: async () => {
            requestTimes.push(Date.now());
            return { choices: [{ message: { content: '{"results":[]}' } }] };
          },
        },
      },
    },
  });
  context.after(() => moderator.close());

  moderator.enqueue(message('first'), () => {});
  moderator.enqueue(message('second'), () => {});
  for (let attempts = 0; attempts < 50 && requestTimes.length < 2; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.equal(requestTimes.length, 2);
  assert.ok(requestTimes[1] - requestTimes[0] >= 25);
});

test('falls back to the next API key when a request fails', async (context) => {
  const attemptedKeys = [];
  const moderator = createAiModerator(config({
    aiApiKeys: ['key-one', 'key-two'],
    aiBatchSize: 1,
  }), {
    random: () => 0,
    clients: ['key-one', 'key-two'].map((key) => ({
      chat: {
        completions: {
          create: async () => {
            attemptedKeys.push(key);
            if (key === 'key-one') throw new Error('API unavailable');
            return { choices: [{ message: { content: '{"results":[]}' } }] };
          },
        },
      },
    })),
  });
  context.after(() => moderator.close());

  moderator.enqueue(message('fallback'), () => {});
  for (let attempts = 0; attempts < 20 && attemptedKeys.length < 2; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.deepEqual(attemptedKeys, ['key-one', 'key-two']);
});

test('extracts image attachments and uses the vision model for sampled image batches', async (context) => {
  const image = {
    url: 'https://cdn.example/image.png',
    contentType: 'image/png',
  };
  const imageMessage = message('image-spam', {
    attachments: new Map([['image-id', image]]),
  });
  assert.equal(getImageUrl(imageMessage), image.url);

  let request;
  const moderator = createAiModerator(config({ aiBatchSize: 1 }), {
    random: () => 0,
    client: {
      chat: {
        completions: {
          create: async (options) => {
            request = options;
            return { choices: [{ message: { content: '{"results":[]}' } }] };
          },
        },
      },
    },
  });
  context.after(() => moderator.close());

  moderator.enqueue(imageMessage, () => {});
  for (let attempts = 0; attempts < 20 && !request; attempts++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(request.model, 'vision-model');
  assert.equal(request.messages[1].content.some((part) => part.type === 'image_url'), true);
});
