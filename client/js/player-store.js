const STORAGE_KEY = "nginxmusix.player.v1";

function defaultState() {
  return {
    queueTrackIds: [],
    currentTrackId: null,
    currentIndex: -1,
    currentTime: 0,
    isPlaying: false,
    volume: 1,
    repeatMode: "off",
    shuffle: false
  };
}

function sanitizeState(candidate) {
  const fallback = defaultState();
  if (!candidate || typeof candidate !== "object") {
    return fallback;
  }

  return {
    queueTrackIds: Array.isArray(candidate.queueTrackIds)
      ? candidate.queueTrackIds.map((entry) => String(entry))
      : fallback.queueTrackIds,
    currentTrackId: candidate.currentTrackId ? String(candidate.currentTrackId) : null,
    currentIndex: Number.isInteger(candidate.currentIndex) ? candidate.currentIndex : -1,
    currentTime: Number.isFinite(candidate.currentTime) ? Math.max(0, candidate.currentTime) : 0,
    isPlaying: Boolean(candidate.isPlaying),
    volume: Number.isFinite(candidate.volume) ? Math.min(1, Math.max(0, candidate.volume)) : fallback.volume,
    repeatMode: ["off", "all", "one"].includes(candidate.repeatMode) ? candidate.repeatMode : fallback.repeatMode,
    shuffle: Boolean(candidate.shuffle)
  };
}

export function createPlayerStore() {
  let state = defaultState();
  const listeners = new Set();

  try {
    const persisted = localStorage.getItem(STORAGE_KEY);
    if (persisted) {
      state = sanitizeState(JSON.parse(persisted));
    }
  } catch (error) {
    state = defaultState();
  }

  function notify() {
    listeners.forEach((listener) => listener(state));
  }

  function setState(patch) {
    state = sanitizeState({
      ...state,
      ...patch
    });
    notify();
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  function persist() {
    const payload = {
      queueTrackIds: state.queueTrackIds,
      currentTrackId: state.currentTrackId,
      currentIndex: state.currentIndex,
      currentTime: state.currentTime,
      isPlaying: state.isPlaying,
      volume: state.volume,
      repeatMode: state.repeatMode,
      shuffle: state.shuffle
    };

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      // Ignore persistence errors.
    }
  }

  return {
    getState() {
      return state;
    },
    setState,
    subscribe,
    persist
  };
}
