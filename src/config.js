require('dotenv').config();

function positiveNumber(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function csv(name) {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function unitInterval(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
}

module.exports = {
  discordToken: process.env.DISCORD_TOKEN,
  databasePath: process.env.DATABASE_PATH || 'data/guardian.sqlite',
  maxConfiguredGuilds: 1000,
  inactiveGuildDays: 30,
  welcomeBackgroundPath: process.env.WELCOME_BACKGROUND_PATH || 'assets/welcome-background.png',
  welcomeText: process.env.WELCOME_TEXT || '{user} đã tham gia {server}!',
  goodbyeText: process.env.GOODBYE_TEXT || '{user} đã rời {server}.',
  spamMessageLimit: positiveNumber('SPAM_MESSAGE_LIMIT', 5),
  spamWindowMs: positiveNumber('SPAM_WINDOW_SECONDS', 8) * 1000,
  duplicateMessageLimit: positiveNumber('DUPLICATE_MESSAGE_LIMIT', 3),
  massMentionLimit: positiveNumber('MASS_MENTION_LIMIT', 5),
  blockedWords: csv('BLOCKED_WORDS'),
  blockedDomains: csv('BLOCKED_DOMAINS'),
  aiApiKeys: (process.env.AI_API_KEYS || process.env.AI_API_KEY || process.env.GROQ_API_KEY || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean),
  aiApiKey: process.env.AI_API_KEY || process.env.GROQ_API_KEY,
  aiModel: process.env.AI_MODEL || process.env.GROQ_MODEL || 'qwen3.8-27b',
  aiVisionModel: process.env.AI_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
  aiRequestIntervalMs: positiveNumber('AI_REQUEST_INTERVAL_SECONDS', 60) * 1000,
  aiMaxCallsPerHour: positiveNumber('AI_MAX_CALLS_PER_HOUR', positiveNumber('GROQ_MAX_CALLS_PER_HOUR', 60)),
  aiUserCooldownMs: positiveNumber('AI_USER_COOLDOWN_SECONDS', positiveNumber('GROQ_USER_COOLDOWN_SECONDS', 30)) * 1000,
  aiMinConfidence: Math.min(1, positiveNumber('AI_MIN_CONFIDENCE', positiveNumber('GROQ_MIN_CONFIDENCE', 0.9))),
  aiSampleRate: unitInterval('AI_SAMPLE_RATE', 0.2),
  aiBatchSize: Math.min(10, Math.floor(positiveNumber('AI_BATCH_SIZE', 5))),
  aiBatchIntervalMs: positiveNumber('AI_BATCH_INTERVAL_MS', 3000),
  aiMaxPending: positiveNumber('AI_MAX_PENDING', 500),
};
