const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const TERMS_VERSION = '1';

function createDatabase(databasePath, maxGuilds = 1000) {
  const resolvedPath = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      welcome_channel_id TEXT NOT NULL,
      goodbye_channel_id TEXT NOT NULL,
      terms_version TEXT NOT NULL,
      terms_accepted_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_guild_settings_last_activity
      ON guild_settings(last_activity_at);
  `);

  const get = db.prepare('SELECT * FROM guild_settings WHERE guild_id = ?');
  const count = db.prepare('SELECT COUNT(*) AS count FROM guild_settings');
  const upsert = db.prepare(`
    INSERT INTO guild_settings (
      guild_id, welcome_channel_id, goodbye_channel_id, terms_version,
      terms_accepted_at, last_activity_at, created_at, updated_at
    ) VALUES (
      @guildId, @welcomeChannelId, @goodbyeChannelId, @termsVersion,
      @now, @now, @now, @now
    )
    ON CONFLICT(guild_id) DO UPDATE SET
      welcome_channel_id = excluded.welcome_channel_id,
      goodbye_channel_id = excluded.goodbye_channel_id,
      terms_version = excluded.terms_version,
      terms_accepted_at = excluded.terms_accepted_at,
      last_activity_at = excluded.last_activity_at,
      updated_at = excluded.updated_at
  `);

  return {
    getGuild(guildId) {
      return get.get(guildId);
    },
    getGuildCount() {
      return count.get().count;
    },
    saveGuild({ guildId, welcomeChannelId, goodbyeChannelId, now = Date.now() }) {
      const existing = get.get(guildId);
      if (!existing && count.get().count >= maxGuilds) return false;
      upsert.run({
        guildId,
        welcomeChannelId,
        goodbyeChannelId,
        termsVersion: TERMS_VERSION,
        now,
      });
      return true;
    },
    touchActivity(guildId, now = Date.now()) {
      return db.prepare(`
        UPDATE guild_settings SET last_activity_at = ?, updated_at = ?
        WHERE guild_id = ?
      `).run(now, now, guildId).changes > 0;
    },
    deleteGuild(guildId) {
      return db.prepare('DELETE FROM guild_settings WHERE guild_id = ?').run(guildId).changes > 0;
    },
    deleteInactive(cutoff) {
      return db.prepare('DELETE FROM guild_settings WHERE last_activity_at < ?').run(cutoff).changes;
    },
    close() {
      db.close();
    },
  };
}

module.exports = { createDatabase };
