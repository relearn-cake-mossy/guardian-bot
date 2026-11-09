const URL_PATTERN = /https?:\/\/[^\s<]+/gi;

function normalizeText(text) {
  return text.toLowerCase().normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '');
}

function containsBlockedWord(text, words) {
  const normalized = normalizeText(text);
  return words.some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}($|[^\\p{L}\\p{N}_])`, 'u').test(normalized);
  });
}

function hasBlockedDomain(text, blockedDomains) {
  const urls = text.match(URL_PATTERN) || [];
  return urls.some((url) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      return blockedDomains.some((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
      return false;
    }
  });
}

function createModerationEngine(config, clock = Date.now) {
  const activity = new Map();

  function getActivity(userId, now) {
    const entry = activity.get(userId) || { timestamps: [], messages: [] };
    entry.timestamps = entry.timestamps.filter((timestamp) => now - timestamp < config.spamWindowMs);
    if (activity.size > 5000 && !activity.has(userId)) {
      const oldestUser = activity.keys().next().value;
      if (oldestUser) activity.delete(oldestUser);
    }
    activity.set(userId, entry);
    return entry;
  }

  return {
    inspect(message) {
      const text = message.content || '';
      const userId = `${message.guild.id}:${message.author.id}`;
      const now = clock();
      const entry = getActivity(userId, now);
      entry.timestamps.push(now);
      entry.messages.push(normalizeText(text));
      entry.messages = entry.messages.slice(-config.duplicateMessageLimit);

      if (message.mentions.users.size + message.mentions.roles.size >= config.massMentionLimit) {
        return { reason: 'Nhắc tên quá nhiều người hoặc vai trò' };
      }
      if (containsBlockedWord(text, config.blockedWords)) {
        return { reason: 'Sử dụng từ bị cấm' };
      }
      if (hasBlockedDomain(text, config.blockedDomains)) {
        return { reason: 'Chia sẻ liên kết thuộc danh sách chặn' };
      }
      if (entry.timestamps.length >= config.spamMessageLimit) {
        return { reason: 'Gửi quá nhiều tin nhắn trong thời gian ngắn' };
      }
      if (
        entry.messages.length === config.duplicateMessageLimit
        && new Set(entry.messages).size === 1
      ) {
        return { reason: 'Gửi lặp lại cùng một nội dung' };
      }
      return null;
    },
  };
}

module.exports = { createModerationEngine };
