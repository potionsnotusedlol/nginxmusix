function buildQuery(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }
    if (Array.isArray(value)) {
      value
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .forEach((entry) => query.append(key, entry));
      return;
    }
    query.set(key, String(value));
  });

  return query.toString();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, 9000);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timeout for ${url}`);
    }
    throw new Error(`Network error for ${url}`);
  } finally {
    window.clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body.error || body.detail || "";
    } catch (error) {
      detail = "";
    }
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }

  return response.json();
}

export const api = {
  getLibrarySummary() {
    return fetchJson("/api/library/summary");
  },

  getTracks(params = {}) {
    const query = buildQuery(params);
    return fetchJson(`/api/tracks${query ? `?${query}` : ""}`);
  },

  getTrackById(trackId, params = {}) {
    const query = buildQuery(params);
    return fetchJson(`/api/tracks/${encodeURIComponent(trackId)}${query ? `?${query}` : ""}`);
  },

  getTags(group = "") {
    const query = buildQuery({ group });
    return fetchJson(`/api/tags${query ? `?${query}` : ""}`);
  },

  getPlaylists() {
    return fetchJson("/api/playlists");
  },

  getPlaylistTracks(slug, params = {}) {
    const query = buildQuery(params);
    return fetchJson(`/api/playlists/${encodeURIComponent(slug)}/tracks${query ? `?${query}` : ""}`);
  }
};
