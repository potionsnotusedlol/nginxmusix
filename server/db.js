const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
const { toPublicPath } = require("./media");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const SORTS = {
  title: "LOWER(t.title) ASC, LOWER(t.artist) ASC",
  artist: "LOWER(t.artist) ASC, LOWER(t.title) ASC",
  album: "LOWER(t.album) ASC, LOWER(t.title) ASC",
  year: "t.year DESC, LOWER(t.title) ASC",
  recent: "t.updated_at DESC, LOWER(t.title) ASC"
};

function ensureDirectoryForFile(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function openDatabase(dbPath) {
  ensureDirectoryForFile(dbPath);

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  initializeSchema(db);

  return db;
}

function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      year INTEGER,
      duration_sec INTEGER,
      cover_path TEXT,
      mime TEXT NOT NULL,
      playable INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS track_tags (
      track_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (track_id, tag_id),
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      cover_path TEXT
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlist_id TEXT NOT NULL,
      track_id TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (playlist_id, track_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_title_artist_album ON tracks(title, artist, album);
    CREATE INDEX IF NOT EXISTS idx_tracks_playable ON tracks(playable);
    CREATE INDEX IF NOT EXISTS idx_tags_group_name ON tags(group_name, name);
    CREATE INDEX IF NOT EXISTS idx_track_tags_track ON track_tags(track_id);
    CREATE INDEX IF NOT EXISTS idx_track_tags_tag ON track_tags(tag_id);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_playlist ON playlist_tracks(playlist_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(track_id);
  `);
}

function normalizeLimit(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizeOffset(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function resolveSort(sort) {
  if (sort && SORTS[sort]) {
    return SORTS[sort];
  }
  return SORTS.title;
}

function normalizeTrackRow(row) {
  if (!row) {
    return null;
  }

  const mediaPath = row.file_path;
  const coverPath = row.cover_path || "";

  return {
    id: row.id,
    file: mediaPath,
    title: row.title,
    artist: row.artist,
    album: row.album,
    year: row.year,
    duration: row.duration_sec,
    cover: coverPath || null,
    mime: row.mime,
    playable: Boolean(row.playable),
    mediaUrl: `/media/${toPublicPath(mediaPath)}`,
    coverUrl: coverPath ? `/covers/${toPublicPath(coverPath)}` : null
  };
}

function parseTagToken(token) {
  const raw = String(token || "").trim();
  if (!raw) {
    return null;
  }

  const splitIndex = raw.indexOf(":");
  if (splitIndex === -1) {
    return { group: "custom", name: raw };
  }

  const group = raw.slice(0, splitIndex).trim().toLowerCase() || "custom";
  const name = raw.slice(splitIndex + 1).trim();
  if (!name) {
    return null;
  }

  return { group, name };
}

function buildTrackWhereClause(options) {
  const params = {};
  const where = [];
  const tagFilters = Array.isArray(options.tags) ? options.tags : [];
  const includeUnavailable = Boolean(options.includeUnavailable);

  if (!includeUnavailable) {
    where.push("t.playable = 1");
  }

  if (options.search) {
    params.search = `%${String(options.search).trim().toLowerCase()}%`;
    where.push(`(
      LOWER(t.title) LIKE @search
      OR LOWER(t.artist) LIKE @search
      OR LOWER(t.album) LIKE @search
      OR EXISTS (
        SELECT 1
        FROM track_tags tt
        INNER JOIN tags tg ON tg.id = tt.tag_id
        WHERE tt.track_id = t.id
          AND LOWER(tg.name) LIKE @search
      )
    )`);
  }

  if (options.playlistSlug) {
    params.playlistSlug = options.playlistSlug;
    where.push(`EXISTS (
      SELECT 1
      FROM playlist_tracks pt
      INNER JOIN playlists p ON p.id = pt.playlist_id
      WHERE pt.track_id = t.id
        AND p.slug = @playlistSlug
    )`);
  }

  tagFilters.forEach((tagToken, index) => {
    const parsed = parseTagToken(tagToken);
    if (!parsed) {
      return;
    }

    params[`tagName${index}`] = parsed.name.toLowerCase();
    if (parsed.group) {
      params[`tagGroup${index}`] = parsed.group.toLowerCase();
      where.push(`EXISTS (
        SELECT 1
        FROM track_tags tt
        INNER JOIN tags tg ON tg.id = tt.tag_id
        WHERE tt.track_id = t.id
          AND LOWER(tg.group_name) = @tagGroup${index}
          AND LOWER(tg.name) = @tagName${index}
      )`);
    } else {
      where.push(`EXISTS (
        SELECT 1
        FROM track_tags tt
        INNER JOIN tags tg ON tg.id = tt.tag_id
        WHERE tt.track_id = t.id
          AND LOWER(tg.name) = @tagName${index}
      )`);
    }
  });

  if (Array.isArray(options.ids) && options.ids.length > 0) {
    const placeholders = [];
    options.ids.forEach((id, index) => {
      const key = `id${index}`;
      placeholders.push(`@${key}`);
      params[key] = id;
    });
    where.push(`t.id IN (${placeholders.join(", ")})`);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  return { whereSql, params };
}

function attachTrackMetadata(db, tracks) {
  if (!tracks.length) {
    return tracks;
  }

  const placeholders = tracks.map((_, index) => `@id${index}`);
  const params = {};
  tracks.forEach((track, index) => {
    params[`id${index}`] = track.id;
  });

  const tagsRows = db.prepare(`
    SELECT
      tt.track_id AS trackId,
      tg.group_name AS groupName,
      tg.name AS tagName
    FROM track_tags tt
    INNER JOIN tags tg ON tg.id = tt.tag_id
    WHERE tt.track_id IN (${placeholders.join(", ")})
    ORDER BY tg.group_name ASC, LOWER(tg.name) ASC
  `).all(params);

  const playlistRows = db.prepare(`
    SELECT
      pt.track_id AS trackId,
      p.id AS playlistId,
      p.slug AS playlistSlug
    FROM playlist_tracks pt
    INNER JOIN playlists p ON p.id = pt.playlist_id
    WHERE pt.track_id IN (${placeholders.join(", ")})
    ORDER BY pt.sort_order ASC
  `).all(params);

  const tagsByTrack = new Map();
  tagsRows.forEach((row) => {
    if (!tagsByTrack.has(row.trackId)) {
      tagsByTrack.set(row.trackId, []);
    }
    tagsByTrack.get(row.trackId).push({
      group: row.groupName,
      name: row.tagName
    });
  });

  const playlistsByTrack = new Map();
  playlistRows.forEach((row) => {
    if (!playlistsByTrack.has(row.trackId)) {
      playlistsByTrack.set(row.trackId, []);
    }
    playlistsByTrack.get(row.trackId).push(row.playlistId);
  });

  tracks.forEach((track) => {
    const tagObjects = tagsByTrack.get(track.id) || [];
    track.tagObjects = tagObjects;
    track.tags = tagObjects.map((entry) => `${entry.group}:${entry.name}`);
    track.playlistIds = playlistsByTrack.get(track.id) || [];
  });

  return tracks;
}

function addMatchReasons(tracks, search) {
  const query = String(search || "").trim().toLowerCase();
  if (!query) {
    tracks.forEach((track) => {
      track.matchReasons = [];
    });
    return tracks;
  }

  tracks.forEach((track) => {
    const reasons = [];
    if (track.title && track.title.toLowerCase().includes(query)) {
      reasons.push("title");
    }
    if (track.artist && track.artist.toLowerCase().includes(query)) {
      reasons.push("artist");
    }
    if (track.album && track.album.toLowerCase().includes(query)) {
      reasons.push("album");
    }

    const tagsMatch = Array.isArray(track.tagObjects)
      && track.tagObjects.some((tag) => tag.name.toLowerCase().includes(query));
    if (tagsMatch) {
      reasons.push("tags");
    }

    track.matchReasons = reasons;
  });

  return tracks;
}

function listTracks(db, options = {}) {
  const idsRequested = Array.isArray(options.ids) && options.ids.length > 0;
  const fallbackLimit = idsRequested
    ? options.ids.length
    : (options.defaultPageSize || DEFAULT_LIMIT);
  const maxLimit = idsRequested
    ? Math.max(options.ids.length, options.maxPageSize || MAX_LIMIT)
    : (options.maxPageSize || MAX_LIMIT);

  const limit = normalizeLimit(
    options.limit,
    fallbackLimit,
    maxLimit
  );
  const offset = normalizeOffset(options.offset);
  const sortSql = resolveSort(options.sort);
  const where = buildTrackWhereClause(options);

  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM tracks t
    ${where.whereSql}
  `).get(where.params).total;

  const rows = db.prepare(`
    SELECT t.*
    FROM tracks t
    ${where.whereSql}
    ORDER BY ${sortSql}
    LIMIT @limit OFFSET @offset
  `).all({
    ...where.params,
    limit,
    offset
  });

  let tracks = rows.map(normalizeTrackRow);
  tracks = attachTrackMetadata(db, tracks);

  if (Array.isArray(options.ids) && options.ids.length > 0) {
    const rank = new Map();
    options.ids.forEach((id, index) => rank.set(id, index));
    tracks.sort((a, b) => (rank.get(a.id) ?? 999999) - (rank.get(b.id) ?? 999999));
  }

  tracks = addMatchReasons(tracks, options.search);

  return {
    items: tracks,
    total,
    limit,
    offset
  };
}

function getTrackById(db, id, options = {}) {
  if (!id) {
    return null;
  }

  const row = db.prepare(`
    SELECT *
    FROM tracks
    WHERE id = @id
  `).get({ id });

  if (!row) {
    return null;
  }

  if (!options.includeUnavailable && !row.playable) {
    return null;
  }

  const track = normalizeTrackRow(row);
  attachTrackMetadata(db, [track]);
  track.matchReasons = [];
  return track;
}

function listTags(db, options = {}) {
  const groupFilter = options.group ? String(options.group).toLowerCase() : null;

  const rows = db.prepare(`
    SELECT
      tg.group_name AS groupName,
      tg.name AS tagName,
      SUM(CASE WHEN t.playable = 1 THEN 1 ELSE 0 END) AS trackCount
    FROM tags tg
    LEFT JOIN track_tags tt ON tt.tag_id = tg.id
    LEFT JOIN tracks t ON t.id = tt.track_id
    WHERE (@groupFilter IS NULL OR LOWER(tg.group_name) = @groupFilter)
    GROUP BY tg.group_name, tg.name
    HAVING trackCount > 0
    ORDER BY tg.group_name ASC, LOWER(tg.name) ASC
  `).all({ groupFilter });

  const grouped = {};
  rows.forEach((row) => {
    if (!grouped[row.groupName]) {
      grouped[row.groupName] = [];
    }
    grouped[row.groupName].push({
      group: row.groupName,
      name: row.tagName,
      trackCount: row.trackCount
    });
  });

  return {
    grouped,
    items: rows.map((row) => ({
      group: row.groupName,
      name: row.tagName,
      trackCount: row.trackCount
    }))
  };
}

function listPlaylists(db) {
  const rows = db.prepare(`
    SELECT
      p.id,
      p.slug,
      p.name,
      p.description,
      p.cover_path AS coverPath,
      SUM(CASE WHEN t.playable = 1 THEN 1 ELSE 0 END) AS trackCount
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
    LEFT JOIN tracks t ON t.id = pt.track_id
    GROUP BY p.id, p.slug, p.name, p.description, p.cover_path
    ORDER BY LOWER(p.name) ASC
  `).all();

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || "",
    cover: row.coverPath || null,
    coverUrl: row.coverPath ? `/covers/${toPublicPath(row.coverPath)}` : null,
    trackCount: row.trackCount || 0
  }));
}

function getPlaylistTracks(db, slug, options = {}) {
  const playlist = db.prepare(`
    SELECT id, slug, name, description, cover_path AS coverPath
    FROM playlists
    WHERE slug = @slug
  `).get({ slug });

  if (!playlist) {
    return null;
  }

  const limit = normalizeLimit(
    options.limit,
    options.defaultPageSize || DEFAULT_LIMIT,
    options.maxPageSize || MAX_LIMIT
  );
  const offset = normalizeOffset(options.offset);
  const includeUnavailable = Boolean(options.includeUnavailable);

  const availabilityClause = includeUnavailable ? "" : "AND t.playable = 1";

  const total = db.prepare(`
    SELECT COUNT(*) AS total
    FROM playlist_tracks pt
    INNER JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = @playlistId
      ${availabilityClause}
  `).get({ playlistId: playlist.id }).total;

  const rows = db.prepare(`
    SELECT t.*
    FROM playlist_tracks pt
    INNER JOIN tracks t ON t.id = pt.track_id
    WHERE pt.playlist_id = @playlistId
      ${availabilityClause}
    ORDER BY pt.sort_order ASC, LOWER(t.title) ASC
    LIMIT @limit OFFSET @offset
  `).all({
    playlistId: playlist.id,
    limit,
    offset
  });

  let tracks = rows.map(normalizeTrackRow);
  tracks = attachTrackMetadata(db, tracks);

  return {
    playlist: {
      id: playlist.id,
      slug: playlist.slug,
      name: playlist.name,
      description: playlist.description || "",
      cover: playlist.coverPath || null,
      coverUrl: playlist.coverPath ? `/covers/${toPublicPath(playlist.coverPath)}` : null
    },
    items: tracks,
    total,
    limit,
    offset
  };
}

function getLibrarySummary(db) {
  const tracks = db.prepare(`
    SELECT
      COUNT(*) AS totalTracks,
      SUM(CASE WHEN playable = 1 THEN 1 ELSE 0 END) AS availableTracks,
      SUM(CASE WHEN playable = 0 THEN 1 ELSE 0 END) AS unavailableTracks,
      MAX(updated_at) AS lastIndexedAt
    FROM tracks
  `).get();

  const tagCount = db.prepare("SELECT COUNT(*) AS total FROM tags").get().total;
  const playlistCount = db.prepare("SELECT COUNT(*) AS total FROM playlists").get().total;

  return {
    tracks: {
      total: tracks.totalTracks || 0,
      available: tracks.availableTracks || 0,
      unavailable: tracks.unavailableTracks || 0
    },
    tags: tagCount || 0,
    playlists: playlistCount || 0,
    lastIndexedAt: tracks.lastIndexedAt || null
  };
}

module.exports = {
  getLibrarySummary,
  getPlaylistTracks,
  getTrackById,
  listPlaylists,
  listTags,
  listTracks,
  openDatabase,
  parseTagToken
};
