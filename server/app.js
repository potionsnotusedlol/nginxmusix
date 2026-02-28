const fs = require("fs");
const path = require("path");
const express = require("express");
const { runRescan } = require("./rescan");
const {
  getLibrarySummary,
  getPlaylistTracks,
  getTrackById,
  listPlaylists,
  listTags,
  listTracks,
  openDatabase
} = require("./db");
const { resolvePath } = require("./media");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadConfig() {
  const configPath = path.resolve(__dirname, "config.json");
  const raw = readJson(configPath);
  const baseDir = __dirname;

  return {
    host: raw.host || "0.0.0.0",
    port: Number(raw.port) || 3000,
    defaultPageSize: Number(raw.defaultPageSize) || 50,
    maxPageSize: Number(raw.maxPageSize) || 200,
    databasePath: resolvePath(baseDir, raw.databasePath),
    musicDir: resolvePath(baseDir, raw.musicDir),
    coversDir: resolvePath(baseDir, raw.coversDir),
    clientDir: resolvePath(baseDir, raw.clientDir)
  };
}

function parseListParam(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function createServer() {
  const config = loadConfig();

  try {
    if (!fs.existsSync(config.databasePath) || fs.statSync(config.databasePath).size === 0) {
      runRescan();
    }
  } catch (error) {
    console.warn(`Auto rescan skipped: ${error.message}`);
  }

  let db = openDatabase(config.databasePath);
  const bootSummary = getLibrarySummary(db);
  if ((bootSummary.tracks.total || 0) === 0) {
    try {
      db.close();
      runRescan();
      db = openDatabase(config.databasePath);
    } catch (error) {
      console.warn(`Auto rescan on empty library failed: ${error.message}`);
      db = openDatabase(config.databasePath);
    }
  }

  fs.mkdirSync(config.musicDir, { recursive: true });
  fs.mkdirSync(config.coversDir, { recursive: true });
  fs.mkdirSync(config.clientDir, { recursive: true });

  const app = express();
  app.disable("x-powered-by");

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({
      ok: true,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/library/summary", (req, res) => {
    const summary = getLibrarySummary(db);
    res.json(summary);
  });

  app.get("/api/tracks", (req, res) => {
    const tags = parseListParam(req.query.tag);
    const ids = parseListParam(req.query.ids);
    const result = listTracks(db, {
      search: req.query.search || "",
      tags,
      ids,
      playlistSlug: req.query.playlist || "",
      limit: req.query.limit,
      offset: req.query.offset,
      sort: req.query.sort || "title",
      includeUnavailable: String(req.query.includeUnavailable || "") === "1",
      defaultPageSize: config.defaultPageSize,
      maxPageSize: config.maxPageSize
    });

    res.json(result);
  });

  app.get("/api/tracks/:id", (req, res) => {
    const track = getTrackById(db, req.params.id, {
      includeUnavailable: String(req.query.includeUnavailable || "") === "1"
    });

    if (!track) {
      res.status(404).json({ error: "Track not found" });
      return;
    }

    res.json(track);
  });

  app.get("/api/tags", (req, res) => {
    const data = listTags(db, {
      group: req.query.group || null
    });
    res.json(data);
  });

  app.get("/api/playlists", (req, res) => {
    const data = listPlaylists(db);
    res.json({ items: data });
  });

  app.get("/api/playlists/:slug/tracks", (req, res) => {
    const data = getPlaylistTracks(db, req.params.slug, {
      limit: req.query.limit,
      offset: req.query.offset,
      includeUnavailable: String(req.query.includeUnavailable || "") === "1",
      defaultPageSize: config.defaultPageSize,
      maxPageSize: config.maxPageSize
    });

    if (!data) {
      res.status(404).json({ error: "Playlist not found" });
      return;
    }

    res.json(data);
  });

  app.use("/media", express.static(config.musicDir, {
    acceptRanges: true,
    fallthrough: false,
    index: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Accept-Ranges", "bytes");
    }
  }));

  app.use("/covers", express.static(config.coversDir, {
    acceptRanges: true,
    fallthrough: false,
    index: false,
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=3600");
    }
  }));

  app.use(express.static(config.clientDir, {
    extensions: ["html"],
    index: "index.html"
  }));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")
      || req.path.startsWith("/media/")
      || req.path.startsWith("/covers/")) {
      next();
      return;
    }

    const indexPath = path.join(config.clientDir, "index.html");
    if (!fs.existsSync(indexPath)) {
      res.status(500).json({ error: "Client application not found." });
      return;
    }
    res.sendFile(indexPath);
  });

  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(500).json({
      error: "Server error",
      detail: error.message
    });
  });

  return { app, config };
}

if (require.main === module) {
  const { app, config } = createServer();
  app.listen(config.port, config.host, () => {
    console.log(`nginxmusix API listening on http://${config.host}:${config.port}`);
  });
}

module.exports = {
  createServer
};
