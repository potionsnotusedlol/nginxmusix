function formatTime(seconds) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function nextRepeatMode(mode) {
  if (mode === "off") {
    return "all";
  }
  if (mode === "all") {
    return "one";
  }
  return "off";
}

const VOLUME_ICON_BASE = `
  <path transform="translate(2,11.149)" d="m23.477 39.911c1.4129 0 2.431-1.0389 2.431-2.431v-33.141c0-1.3921-1.0181-2.5349-2.4726-2.5349-1.0181 0-1.7038 0.43634-2.805 1.4752l-9.2046 8.6644c-0.14545 0.12464-0.31166 0.18698-0.51945 0.18698h-6.2126c-2.9297 0-4.5088 1.5999-4.5088 4.7374v8.0411c0 3.1167 1.5791 4.7166 4.5088 4.7166h6.2126c0.20779 0 0.374 0.06234 0.51945 0.18698l9.2046 8.7475c0.99732 0.93501 1.8285 1.3506 2.8466 1.3506z"></path>
`;
const VOLUME_ICON_WAVE_1 = `
  <path transform="translate(2,11.149)" d="m34.864 29.959c0.70647 0.49868 1.7246 0.35323 2.3271-0.47787 1.6205-2.1817 2.5971-5.3815 2.5971-8.6436 0-3.2621-0.9766-6.4411-2.5971-8.6436-0.60255-0.83111-1.5999-0.97655-2.3271-0.49868-0.89345 0.62336-1.0181 1.683-0.35319 2.5765 1.2051 1.6207 1.9323 4.0932 1.9323 6.5658 0 2.4726-0.76881 4.9451-1.9531 6.5866-0.62332 0.89345-0.51945 1.9116 0.374 2.5349z"></path>
`;
const VOLUME_ICON_WAVE_2 = `
  <path transform="translate(2,11.149)" d="m43.154 35.569c0.81021 0.54023 1.8077 0.33245 2.3894-0.49867 2.7426-3.8231 4.3426-8.9137 4.3426-14.233 0-5.3399-1.5583-10.451-4.3426-14.254-0.60255-0.81034-1.5791-1.0181-2.3894-0.47787-0.78979 0.54021-0.91447 1.5583-0.29106 2.4518 2.2647 3.3245 3.6779 7.6878 3.6779 12.28s-1.3923 8.9969-3.6779 12.28c-0.60255 0.89345-0.49872 1.9116 0.29106 2.4518z"></path>
`;
const VOLUME_ICON_WAVE_3 = `
  <path transform="translate(2,11.149)" d="m51.527 41.241c0.76894 0.51945 1.7872 0.31166 2.3898-0.54021 3.8438-5.423 6.0255-12.446 6.0255-19.864s-2.2443-14.42-6.0255-19.864c-0.60255-0.87268-1.6209-1.0805-2.3898-0.54021-0.78936 0.56098-0.91404 1.5791-0.31149 2.4518 3.3451 4.9244 5.423 11.241 5.423 17.952 0 6.7113-1.9945 13.132-5.423 17.952-0.60255 0.87268-0.47787 1.8908 0.31149 2.4518z"></path>
`;

function volumeIconMarkup(volumePercent) {
  if (volumePercent === 0) {
    return VOLUME_ICON_BASE;
  }
  if (volumePercent < 30) {
    return `${VOLUME_ICON_BASE}${VOLUME_ICON_WAVE_1}`;
  }
  if (volumePercent < 80) {
    return `${VOLUME_ICON_BASE}${VOLUME_ICON_WAVE_1}${VOLUME_ICON_WAVE_2}`;
  }
  return `${VOLUME_ICON_BASE}${VOLUME_ICON_WAVE_1}${VOLUME_ICON_WAVE_2}${VOLUME_ICON_WAVE_3}`;
}

function updateVolumeIcon(elements, volume) {
  if (!elements.volumeIcon) {
    return;
  }

  const clamped = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
  const percent = Math.round(clamped * 100);
  elements.volumeIcon.innerHTML = volumeIconMarkup(percent);

  const muted = percent === 0;
  const muteText = muted ? "Unmute" : "Mute";
  elements.muteButton.title = muteText;
  elements.muteButton.setAttribute("aria-label", muteText);
  const muteLabel = elements.muteButton.querySelector(".sr-only");
  if (muteLabel) {
    muteLabel.textContent = muteText;
  }
}

export function createPlayerController(options) {
  const {
    audio,
    store,
    elements,
    showToast
  } = options;

  let queue = [];
  let pendingSeekTime = null;
  let previousVolume = 1;
  const defaultCoverUrl = (elements.coverImage && elements.coverImage.dataset.defaultCover)
    ? elements.coverImage.dataset.defaultCover
    : "./assets/default-note.png";

  const persistTimer = window.setInterval(() => {
    store.persist();
  }, 2500);

  function canPlayTrack(track) {
    if (!track || !track.playable) {
      return false;
    }
    if (!track.mime) {
      return true;
    }

    const support = audio.canPlayType(track.mime);
    return support === "maybe" || support === "probably";
  }

  function getUnavailableReason(track) {
    if (!track) {
      return "Track not found.";
    }
    if (!track.playable) {
      return "Track file is unavailable on the server.";
    }
    return "Track codec is not supported by this browser.";
  }

  function getCurrentTrack() {
    const state = store.getState();
    if (state.currentIndex < 0 || state.currentIndex >= queue.length) {
      return null;
    }
    return queue[state.currentIndex];
  }

  function updateTransportUi(state) {
    const playing = Boolean(state.isPlaying);
    elements.playPauseButton.classList.toggle("is-playing", playing);
    elements.playPauseButton.title = playing ? "Pause" : "Play";
    elements.playPauseButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    const playPauseLabel = elements.playPauseButton.querySelector(".sr-only");
    if (playPauseLabel) {
      playPauseLabel.textContent = playing ? "Pause" : "Play";
    }

    elements.shuffleButton.classList.toggle("active", Boolean(state.shuffle));
    elements.shuffleButton.setAttribute("aria-pressed", state.shuffle ? "true" : "false");

    elements.repeatButton.classList.toggle("active", state.repeatMode !== "off");
    elements.repeatButton.dataset.repeatMode = state.repeatMode;
    elements.repeatButton.setAttribute("aria-pressed", state.repeatMode !== "off" ? "true" : "false");
    const repeatText = state.repeatMode === "one"
      ? "Repeat one"
      : state.repeatMode === "all"
        ? "Repeat all"
        : "Repeat";
    elements.repeatButton.title = repeatText;
    elements.repeatButton.setAttribute("aria-label", repeatText);

    const volumePercent = Math.round((state.volume || 0) * 100);
    if (Number(elements.volumeSlider.value) !== volumePercent) {
      elements.volumeSlider.value = String(volumePercent);
    }
    updateVolumeIcon(elements, state.volume);

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const seekMax = duration > 0 ? 1000 : 0;
    elements.seekSlider.max = String(seekMax);
    elements.seekSlider.value = duration > 0
      ? String(Math.min(1000, Math.round((state.currentTime / duration) * 1000)))
      : "0";
    elements.elapsedLabel.textContent = formatTime(state.currentTime);
    elements.durationLabel.textContent = formatTime(duration);
  }

  function updateNowPlaying(track) {
    if (!track) {
      elements.titleLabel.textContent = "Nothing is playing";
      elements.artistLabel.textContent = "Choose a track to begin";
      elements.coverImage.src = defaultCoverUrl;
      elements.coverImage.alt = "Default note cover";
      return;
    }

    elements.titleLabel.textContent = track.title;
    elements.artistLabel.textContent = `${track.artist} - ${track.album}`;
    elements.coverImage.src = track.coverUrl || defaultCoverUrl;
    elements.coverImage.alt = `${track.title} cover`;
  }

  function handlePlaybackBlocked() {
    store.setState({ isPlaying: false });
    showToast("Autoplay was blocked. Press Play to continue.", "warn");
  }

  function loadTrackAt(index, options = {}) {
    const autoplay = Boolean(options.autoplay);
    const startTime = Number.isFinite(options.startTime) ? options.startTime : 0;

    if (index < 0 || index >= queue.length) {
      return false;
    }

    const track = queue[index];
    if (!canPlayTrack(track)) {
      showToast(getUnavailableReason(track), "warn");
      return false;
    }

    store.setState({
      currentIndex: index,
      currentTrackId: track.id,
      currentTime: startTime
    });

    updateNowPlaying(track);
    pendingSeekTime = startTime;
    audio.src = track.mediaUrl;
    audio.load();

    if (autoplay) {
      audio.play().catch(handlePlaybackBlocked);
    }

    return true;
  }

  function nextIndexFromState(manual = false) {
    const state = store.getState();
    if (!queue.length) {
      return -1;
    }

    if (state.shuffle && queue.length > 1) {
      let candidate = Math.floor(Math.random() * queue.length);
      if (candidate === state.currentIndex) {
        candidate = (candidate + 1) % queue.length;
      }
      return candidate;
    }

    if (!manual && state.repeatMode === "one") {
      return state.currentIndex;
    }

    const next = state.currentIndex + 1;
    if (next >= queue.length) {
      if (state.repeatMode === "all") {
        return 0;
      }
      return -1;
    }

    return next;
  }

  function previousIndexFromState() {
    const state = store.getState();
    if (!queue.length) {
      return -1;
    }
    const previous = state.currentIndex - 1;
    if (previous < 0) {
      return state.repeatMode === "all" ? queue.length - 1 : 0;
    }
    return previous;
  }

  function playNext(manual = false) {
    const index = nextIndexFromState(manual);
    if (index === -1) {
      audio.pause();
      store.setState({
        isPlaying: false,
        currentTime: 0
      });
      return false;
    }
    return loadTrackAt(index, { autoplay: true, startTime: 0 });
  }

  function playPrevious() {
    if (audio.currentTime > 5) {
      audio.currentTime = 0;
      store.setState({ currentTime: 0 });
      return true;
    }
    const index = previousIndexFromState();
    return loadTrackAt(index, { autoplay: true, startTime: 0 });
  }

  function replaceQueue(tracks, startTrackId = null, autoplay = true) {
    const normalized = Array.isArray(tracks) ? tracks.filter((track) => track && track.id) : [];
    queue = normalized;

    if (!queue.length) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      store.setState({
        queueTrackIds: [],
        currentTrackId: null,
        currentIndex: -1,
        currentTime: 0,
        isPlaying: false
      });
      updateNowPlaying(null);
      return false;
    }

    let startIndex = 0;
    if (startTrackId) {
      const selectedIndex = queue.findIndex((entry) => entry.id === startTrackId);
      if (selectedIndex >= 0) {
        startIndex = selectedIndex;
      }
    }

    const ids = queue.map((track) => track.id);
    store.setState({
      queueTrackIds: ids,
      currentTrackId: ids[startIndex] || null,
      currentIndex: startIndex,
      currentTime: 0
    });

    return loadTrackAt(startIndex, { autoplay, startTime: 0 });
  }

  async function restoreQueue(fetchTracksByIds) {
    const state = store.getState();
    const ids = Array.isArray(state.queueTrackIds) ? state.queueTrackIds : [];
    if (!ids.length) {
      return;
    }

    try {
      const tracks = await fetchTracksByIds(ids);
      const validTracks = tracks.filter((track) => track && track.id);
      if (!validTracks.length) {
        return;
      }

      queue = validTracks;
      const restoredIds = validTracks.map((track) => track.id);
      let index = restoredIds.indexOf(state.currentTrackId);
      if (index < 0) {
        index = 0;
      }

      store.setState({
        queueTrackIds: restoredIds,
        currentTrackId: restoredIds[index],
        currentIndex: index,
        currentTime: state.currentTime
      });

      loadTrackAt(index, {
        autoplay: false,
        startTime: state.currentTime
      });

      if (state.isPlaying) {
        audio.play().catch(handlePlaybackBlocked);
      }
    } catch (error) {
      showToast(`Queue restore failed: ${error.message}`, "warn");
    }
  }

  function togglePlayPause() {
    if (!queue.length) {
      return false;
    }

    if (audio.paused) {
      audio.play().catch(handlePlaybackBlocked);
      return true;
    }

    audio.pause();
    return true;
  }

  function setVolume(volume) {
    const normalized = Math.min(1, Math.max(0, volume));
    audio.volume = normalized;
    store.setState({ volume: normalized });
  }

  elements.playPauseButton.addEventListener("click", () => {
    togglePlayPause();
  });
  elements.nextButton.addEventListener("click", () => {
    playNext(true);
  });
  elements.prevButton.addEventListener("click", () => {
    playPrevious();
  });
  elements.shuffleButton.addEventListener("click", () => {
    const state = store.getState();
    store.setState({ shuffle: !state.shuffle });
  });
  elements.repeatButton.addEventListener("click", () => {
    const state = store.getState();
    store.setState({ repeatMode: nextRepeatMode(state.repeatMode) });
  });
  elements.muteButton.addEventListener("click", () => {
    const currentVolume = store.getState().volume;
    if (currentVolume > 0) {
      previousVolume = currentVolume;
      setVolume(0);
    } else {
      setVolume(previousVolume > 0 ? previousVolume : 1);
    }
  });

  elements.seekSlider.addEventListener("input", () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    if (!duration) {
      return;
    }
    const ratio = Number(elements.seekSlider.value) / 1000;
    const nextTime = Math.max(0, Math.min(duration, duration * ratio));
    audio.currentTime = nextTime;
    store.setState({ currentTime: nextTime });
  });

  elements.volumeSlider.addEventListener("input", () => {
    const volume = Number(elements.volumeSlider.value) / 100;
    setVolume(volume);
  });

  elements.coverImage.addEventListener("error", () => {
    if (elements.coverImage.getAttribute("src") !== defaultCoverUrl) {
      elements.coverImage.src = defaultCoverUrl;
    }
  });

  audio.addEventListener("play", () => {
    store.setState({ isPlaying: true });
  });

  audio.addEventListener("pause", () => {
    store.setState({ isPlaying: false });
  });

  audio.addEventListener("loadedmetadata", () => {
    if (Number.isFinite(pendingSeekTime) && pendingSeekTime > 0) {
      audio.currentTime = Math.min(audio.duration || pendingSeekTime, pendingSeekTime);
    }
    pendingSeekTime = null;
    const state = store.getState();
    updateTransportUi(state);
  });

  audio.addEventListener("timeupdate", () => {
    store.setState({ currentTime: audio.currentTime || 0 });
  });

  audio.addEventListener("ended", () => {
    playNext(false);
  });

  audio.addEventListener("error", () => {
    showToast("Playback error for this file.", "warn");
    playNext(false);
  });

  store.subscribe((state) => {
    updateTransportUi(state);
  });

  setVolume(store.getState().volume);
  updateNowPlaying(null);

  return {
    canPlayTrack,
    getUnavailableReason,
    getQueue() {
      return queue.slice();
    },
    getCurrentTrack,
    playNext,
    playPrevious,
    replaceQueue,
    restoreQueue,
    setVolume,
    togglePlayPause,
    destroy() {
      window.clearInterval(persistTimer);
      store.persist();
    }
  };
}
