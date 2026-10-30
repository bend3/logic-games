const PREFIX = 'logic-games:';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable (private mode): the game still works, it just won't persist.
    }
  },
  remove(key) {
    localStorage.removeItem(PREFIX + key);
  },
};
