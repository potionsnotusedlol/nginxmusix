import { api } from "./api.js";
import { createPlayerController } from "./player-controls.js";
import { createPlayerStore } from "./player-store.js";
import { navigate, startRouter } from "./router.js";
import { initSearch } from "./search.js";
import { initSidebar } from "./sidebar.js";
import { initTheme } from "./theme.js";
import { renderHomeView } from "./views/home.js";
import { renderPlaylistsView, renderPlaylistDetailView } from "./views/playlists.js";
import { renderSongsView } from "./views/songs.js";
import { renderTagDetailView, renderTagsView } from "./views/tags.js";

const elements = {
  root: document.getElementById("view-root"),
  toastRegion: document.getElementById("toast-region"),
  audio: document.getElementById("audio-element"),
  playPauseButton: document.getElementById("play-pause-btn"),
  prevButton: document.getElementById("prev-btn"),
  nextButton: document.getElementById("next-btn"),
  shuffleButton: document.getElementById("shuffle-btn"),
  repeatButton: document.getElementById("repeat-btn"),
  muteButton: document.getElementById("mute-btn"),
  volumeIcon: document.getElementById("volume_icon_svg"),
  seekSlider: document.getElementById("seek-slider"),
  volumeSlider: document.getElementById("volume-slider"),
  titleLabel: document.getElementById("player-title"),
  artistLabel: document.getElementById("player-artist"),
  coverImage: document.getElementById("player-cover"),
  elapsedLabel: document.getElementById("elapsed-label"),
  durationLabel: document.getElementById("duration-label"),
  sidebarNav: document.getElementById("sidebar-nav"),
  sidebarCollapseButton: document.getElementById("sidebar-collapse-btn"),
  mobileMenuButton: document.getElementById("mobile-menu-btn"),
  searchForm: document.getElementById("sidebar-search-form"),
  searchInput: document.getElementById("sidebar-search-input"),
  themeSelect: document.getElementById("theme-select")
};

const trackCache = new Map();

function assertRequiredElements(map) {
  const requiredKeys = [
    "root",
    "toastRegion",
    "audio",
    "playPauseButton",
    "prevButton",
    "nextButton",
    "shuffleButton",
    "repeatButton",
    "muteButton",
    "seekSlider",
    "volumeSlider",
    "titleLabel",
    "artistLabel",
    "coverImage",
    "elapsedLabel",
    "durationLabel",
    "sidebarNav",
    "sidebarCollapseButton",
    "mobileMenuButton",
    "searchForm",
    "searchInput",
    "themeSelect"
  ];

  const missing = requiredKeys.filter((key) => !map[key]);
  if (missing.length) {
    throw new Error(`Missing DOM nodes: ${missing.join(", ")}`);
  }
}

function showToast(message, mode = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${mode}`.trim();
  toast.textContent = message;
  elements.toastRegion.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 4200);
}

assertRequiredElements(elements);

const store = createPlayerStore();
const player = createPlayerController({
  audio: elements.audio,
  store,
  showToast,
  elements
});

function decorateTrack(track) {
  if (!track || !track.id) {
    return null;
  }

  const normalized = { ...track };
  normalized.browserPlayable = player.canPlayTrack(normalized);
  normalized.unavailableReason = normalized.browserPlayable
    ? ""
    : player.getUnavailableReason(normalized);

  trackCache.set(normalized.id, normalized);
  return normalized;
}

function decorateTracks(tracks) {
  return (tracks || [])
    .map(decorateTrack)
    .filter(Boolean);
}

async function fetchTracksByIds(ids) {
  const uniqueIds = Array.from(new Set((ids || []).filter(Boolean)));
  if (!uniqueIds.length) {
    return [];
  }

  const missing = uniqueIds.filter((id) => !trackCache.has(id));
  if (missing.length) {
    const response = await api.getTracks({
      ids: missing,
      includeUnavailable: 1,
      limit: missing.length
    });
    decorateTracks(response.items || []);
  }

  return uniqueIds
    .map((id) => trackCache.get(id))
    .filter(Boolean);
}

function playCollection(tracks, startTrackId) {
  const decorated = decorateTracks(tracks);
  const playable = decorated.filter((track) => track.browserPlayable);

  if (!playable.length) {
    showToast("No playable tracks in this selection.", "warn");
    return;
  }

  const requested = decorated.find((track) => track.id === startTrackId);
  let nextStartId = startTrackId;

  if (!requested || !requested.browserPlayable) {
    nextStartId = playable[0].id;
    if (requested && requested.unavailableReason) {
      showToast(requested.unavailableReason, "warn");
    }
  }

  player.replaceQueue(playable, nextStartId, true);
}

function activeSection(route) {
  if (route.name === "playlist-detail" || route.name === "playlists") {
    return "playlists";
  }
  if (route.name === "tag-detail" || route.name === "tags") {
    return "tags";
  }
  if (route.name === "songs" || route.name === "search") {
    return "songs";
  }
  return "home";
}

const sidebar = initSidebar({
  collapseButton: elements.sidebarCollapseButton,
  mobileMenuButton: elements.mobileMenuButton,
  navRoot: elements.sidebarNav
});

const search = initSearch({
  form: elements.searchForm,
  input: elements.searchInput,
  navigateToSearch(query) {
    if (!query) {
      navigate("/songs");
      return;
    }
    navigate("/search", { q: query, page: 1 });
  }
});

initTheme(elements.themeSelect);

const viewContext = {
  api,
  decorateTracks,
  playCollection,
  showToast,
  navigate(path, query = {}) {
    navigate(path, query);
  }
};

let renderCounter = 0;

async function renderRoute(route) {
  const current = ++renderCounter;
  sidebar.setActive(activeSection(route));
  search.sync(route);

  try {
    if (route.name === "home") {
      await renderHomeView(elements.root, viewContext);
      return;
    }
    if (route.name === "songs" || route.name === "search") {
      await renderSongsView(elements.root, viewContext, route);
      return;
    }
    if (route.name === "playlists") {
      await renderPlaylistsView(elements.root, viewContext);
      return;
    }
    if (route.name === "playlist-detail") {
      await renderPlaylistDetailView(elements.root, viewContext, route);
      return;
    }
    if (route.name === "tags") {
      await renderTagsView(elements.root, viewContext);
      return;
    }
    if (route.name === "tag-detail") {
      await renderTagDetailView(elements.root, viewContext, route);
      return;
    }
    await renderHomeView(elements.root, viewContext);
  } catch (error) {
    if (current !== renderCounter) {
      return;
    }
    elements.root.innerHTML = `
      <div class="empty-panel">
        <strong>View failed to load</strong>
        <div class="track-meta-small">${error.message}</div>
      </div>
    `;
    showToast(`View error: ${error.message}`, "warn");
  }
}

async function bootstrap() {
  startRouter(renderRoute);
  player.restoreQueue(fetchTracksByIds).catch((error) => {
    showToast(`Queue restore failed: ${error.message}`, "warn");
  });
}

bootstrap().catch((error) => {
  elements.root.innerHTML = `
    <div class="empty-panel">
      <strong>Application failed to start</strong>
      <div class="track-meta-small">${error.message}</div>
    </div>
  `;
  showToast(`Startup failed: ${error.message}`, "warn");
});
