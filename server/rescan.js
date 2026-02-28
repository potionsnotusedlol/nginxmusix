const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const { openDatabase, parseTagToken } = require("./db");
const { resolvePath } = require("./media");

const SUPPORTED_EXTENSIONS = new Set([".mp3", ".m4a", ".ogg", ".flac", ".wav"]);

function slugify(input) {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function loadJson(filePath) {
  const contents = fs.readFileSync(filePath, "utf8");
  return JSON.parse(contents);
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTrackId(track, index) {
  if (track && track.id) {
    return String(track.id).trim();
  }

  const candidate = slugify(track && track.title ? track.title : `track-${index + 1}`);
  return candidate || `track-${index + 1}`;
}

function normalizePlaylistId(playlist, index) {
  if (playlist && playlist.id) {
    return String(playlist.id).trim();
  }

  const source = playlist && (playlist.slug || playlist.name) ? (playlist.slug || playlist.name) : `playlist-${index + 1}`;
  const candidate = slugify(source);
  return candidate || `playlist-${index + 1}`;
}

function normalizePlaylistSlug(playlist, fallbackId) {
  if (playlist && playlist.slug) {
    return slugify(playlist.slug);
  }
  if (playlist && playlist.name) {
    return slugify(playlist.name);
  }
  return slugify(fallbackId) || fallbackId;
}

function normalizeTag(rawTag) {
  if (rawTag && typeof rawTag === "object") {
    const group = String(rawTag.group || "custom").trim().toLowerCase() || "custom";
    const name = String(rawTag.name || "").trim();
    if (!name) {
      return null;
    }
    return { group, name };
  }

  return parseTagToken(rawTag);
}

function ensureUniqueId(idSet, candidate, fallbackPrefix) {
  let next = candidate || `${fallbackPrefix}-1`;
  if (!idSet.has(next)) {
    idSet.add(next);
    return next;
  }

  let counter = 2;
  while (idSet.has(`${next}-${counter}`)) {
    counter += 1;
  }

  const finalId = `${next}-${counter}`;
  idSet.add(finalId);
  return finalId;
}

function buildConfig() {
  const configPath = path.resolve(__dirname, "config.json");
  const config = loadJson(configPath);
  const baseDir = __dirname;

  return {
    raw: config,
    databasePath: resolvePath(baseDir, config.databasePath),
    libraryPath: resolvePath(baseDir, config.libraryJsonPath),
    musicDir: resolvePath(baseDir, config.musicDir),
    coversDir: resolvePath(baseDir, config.coversDir)
  };
}

function runRescan() {
  const config = buildConfig();
  fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
  fs.mkdirSync(config.musicDir, { recursive: true });
  fs.mkdirSync(config.coversDir, { recursive: true });

  if (!fs.existsSync(config.libraryPath)) {
    throw new Error(`Missing library metadata file: ${config.libraryPath}`);
  }

  const library = loadJson(config.libraryPath);
  const tracks = toArray(library.tracks);
  const playlists = toArray(library.playlists);

  const db = openDatabase(config.databasePath);

  const insertPlaylist = db.prepare(`
    INSERT INTO playlists (id, slug, name, description, cover_path)
    VALUES (@id, @slug, @name, @description, @coverPath)
  `);
  const insertTrack = db.prepare(`
    INSERT INTO tracks (
      id, file_path, title, artist, album, year, duration_sec, cover_path, mime, playable, updated_at
    ) VALUES (
      @id, @filePath, @title, @artist, @album, @year, @durationSec, @coverPath, @mime, @playable, datetime('now')
    )
  `);
  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO tags (id, name, group_name)
    VALUES (@id, @name, @groupName)
  `);
  const insertTrackTag = db.prepare(`
    INSERT OR IGNORE INTO track_tags (track_id, tag_id)
    VALUES (@trackId, @tagId)
  `);
  const insertPlaylistTrack = db.prepare(`
    INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, sort_order)
    VALUES (@playlistId, @trackId, @sortOrder)
  `);

  const playlistIds = new Set();
  const playlistSlugSet = new Set();
  const trackIds = new Set();
  const tagIds = new Set();
  const tagKeyToId = new Map();
  const playlistTrackOrder = new Map();

  const warnings = [];
  let missingFiles = 0;
  let unsupportedFormats = 0;
  let linkedPlaylistRefs = 0;

  const transaction = db.transaction(() => {
    db.exec(`
      DELETE FROM track_tags;
      DELETE FROM playlist_tracks;
      DELETE FROM tags;
      DELETE FROM tracks;
      DELETE FROM playlists;
    `);

    playlists.forEach((playlist, index) => {
      const id = normalizePlaylistId(playlist, index);
      if (playlistIds.has(id)) {
        throw new Error(`Duplicate playlist id "${id}" in library.json.`);
      }
      playlistIds.add(id);

      const slug = normalizePlaylistSlug(playlist, id);
      if (playlistSlugSet.has(slug)) {
        throw new Error(`Duplicate playlist slug "${slug}" in library.json.`);
      }
      playlistSlugSet.add(slug);

      insertPlaylist.run({
        id,
        slug,
        name: String((playlist && playlist.name) || id),
        description: playlist && playlist.description ? String(playlist.description) : "",
        coverPath: playlist && playlist.cover ? String(playlist.cover) : null
      });

      const trackRefs = toArray(playlist && playlist.trackIds);
      trackRefs.forEach((trackId, trackIndex) => {
        if (!trackId) {
          return;
        }
        const key = `${id}::${trackId}`;
        if (!playlistTrackOrder.has(key)) {
          playlistTrackOrder.set(key, trackIndex);
        }
      });
    });

    tracks.forEach((track, index) => {
      const trackId = normalizeTrackId(track, index);
      if (!track || !track.file) {
        warnings.push(`Track ${trackId} skipped: missing "file" path.`);
        return;
      }
      if (trackIds.has(trackId)) {
        throw new Error(`Duplicate track id "${trackId}" in library.json.`);
      }
      trackIds.add(trackId);

      const filePath = String(track.file).trim();
      const absoluteFilePath = path.resolve(config.musicDir, filePath);
      const extension = path.extname(filePath).toLowerCase();

      const fileExists = fs.existsSync(absoluteFilePath);
      if (!fileExists) {
        missingFiles += 1;
      }

      const extensionSupported = SUPPORTED_EXTENSIONS.has(extension);
      if (!extensionSupported) {
        unsupportedFormats += 1;
      }

      const mimeType = mime.lookup(extension) || "application/octet-stream";
      const playable = fileExists && extensionSupported ? 1 : 0;

      const parsedYear = Number.parseInt(track.year, 10);
      const parsedDuration = Number.parseInt(track.duration, 10);

      insertTrack.run({
        id: trackId,
        filePath,
        title: String(track.title || trackId),
        artist: String(track.artist || "Unknown Artist"),
        album: String(track.album || "Unknown Album"),
        year: Number.isFinite(parsedYear) ? parsedYear : null,
        durationSec: Number.isFinite(parsedDuration) ? parsedDuration : null,
        coverPath: track.cover ? String(track.cover) : null,
        mime: mimeType,
        playable
      });

      const normalizedTags = toArray(track.tags)
        .map(normalizeTag)
        .filter(Boolean);

      normalizedTags.forEach((tag) => {
        const dedupeKey = `${tag.group}\u0000${tag.name.toLowerCase()}`;
        if (!tagKeyToId.has(dedupeKey)) {
          const tagSlug = slugify(`${tag.group}-${tag.name}`) || "tag";
          const tagId = ensureUniqueId(tagIds, `tag-${tagSlug}`, "tag");
          tagKeyToId.set(dedupeKey, tagId);
          insertTag.run({
            id: tagId,
            name: tag.name,
            groupName: tag.group
          });
        }

        insertTrackTag.run({
          trackId,
          tagId: tagKeyToId.get(dedupeKey)
        });
      });

      const trackPlaylistIds = toArray(track.playlistIds).map((value) => String(value).trim()).filter(Boolean);
      trackPlaylistIds.forEach((playlistId, playlistIndex) => {
        const key = `${playlistId}::${trackId}`;
        if (!playlistTrackOrder.has(key)) {
          playlistTrackOrder.set(key, 100000 + index * 10 + playlistIndex);
        }
      });
    });

    playlistTrackOrder.forEach((sortOrder, key) => {
      const split = key.split("::");
      const playlistId = split[0];
      const trackId = split[1];

      if (!playlistIds.has(playlistId)) {
        warnings.push(`Playlist link skipped: playlist "${playlistId}" does not exist.`);
        return;
      }
      if (!trackIds.has(trackId)) {
        warnings.push(`Playlist link skipped: track "${trackId}" does not exist.`);
        return;
      }

      insertPlaylistTrack.run({
        playlistId,
        trackId,
        sortOrder
      });
      linkedPlaylistRefs += 1;
    });
  });

  transaction();

  console.log("Rescan complete.");
  console.log(`Tracks indexed: ${trackIds.size}`);
  console.log(`Playlists indexed: ${playlistIds.size}`);
  console.log(`Playlist links indexed: ${linkedPlaylistRefs}`);
  console.log(`Missing files: ${missingFiles}`);
  console.log(`Unsupported formats: ${unsupportedFormats}`);

  if (warnings.length) {
    console.log("Warnings:");
    warnings.forEach((message) => console.log(`- ${message}`));
  }
}

if (require.main === module) {
  try {
    runRescan();
    process.exitCode = 0;
  } catch (error) {
    console.error("Rescan failed.");
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  runRescan
};
