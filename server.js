const express = require("express");
const path = require("path");
const os = require("os");
const db = require("./database");
const youtube = require("./youtube");

let server;

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "127.0.0.1";
}

let onPlay = null;

function start(port = 3000, options = {}) {
  onPlay = options.onPlay || null;
  const app = express();
  app.use(express.json());

  // Serve static assets
  app.get("/banner.png", (_req, res) => {
    res.sendFile(path.join(__dirname, "banner.png"));
  });

  app.get("/mobile-banner.png", (_req, res) => {
    res.sendFile(path.join(__dirname, "mobile-banner.png"));
  });

  // Serve the mobile page
  app.get("/", (_req, res) => {
    res.sendFile(path.join(__dirname, "mobile.html"));
  });

  // ── API Routes ──────────────────────────────────────────
  app.get("/api/songs", (_req, res) => {
    res.json(db.getAllSongs());
  });

  app.get("/api/songs/search", (req, res) => {
    const q = req.query.q || "";
    res.json(db.searchSongs(q));
  });

  app.post("/api/songs", (req, res) => {
    const { title, artist, youtubeId } = req.body;
    if (!title || !artist || !youtubeId) {
      return res
        .status(400)
        .json({ error: "title, artist, and youtubeId are required" });
    }
    const result = db.addSong(title, artist, youtubeId);
    res.json(result);
  });

  app.delete("/api/songs/:id", (req, res) => {
    const id = Number(req.params.id);
    db.deleteSong(id);
    res.json({ success: true });
  });

  app.put("/api/songs/:id", (req, res) => {
    const id = Number(req.params.id);
    const { title, artist } = req.body;
    if (!title || !artist) {
      return res.status(400).json({ error: "title and artist are required" });
    }
    db.updateSong(id, title, artist);
    res.json({ success: true });
  });

  app.post("/api/play", (req, res) => {
    const { youtubeId } = req.body;
    if (!youtubeId)
      return res.status(400).json({ error: "youtubeId is required" });
    if (onPlay) onPlay(youtubeId);
    res.json({ success: true });
  });

  app.get("/player/:id", (req, res) => {
    const vid = req.params.id;
    res.send(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;overflow:hidden;background:#000}iframe{width:100vw;height:100vh;border:0}</style></head><body><iframe src="https://www.youtube.com/embed/${vid}?autoplay=1&fs=1" allow="autoplay;fullscreen;encrypted-media" allowfullscreen></iframe></body></html>`,
    );
  });

  app.get("/api/youtube/search", async (req, res) => {
    const q = req.query.q || "";
    if (!q) return res.status(400).json({ error: "query is required" });
    try {
      const results = await youtube.searchYouTube(q);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Tag / Favorites API ─────────────────────────────
  app.get("/api/tags", (_req, res) => {
    res.json(db.getAllTaggedSongs());
  });

  app.post("/api/tags", (req, res) => {
    const { songId, singerName } = req.body;
    if (!songId || !singerName) {
      return res
        .status(400)
        .json({ error: "songId and singerName are required" });
    }
    res.json(db.addTag(songId, singerName));
  });

  app.delete("/api/tags", (req, res) => {
    const { songId, singerName } = req.body;
    if (!songId || !singerName) {
      return res
        .status(400)
        .json({ error: "songId and singerName are required" });
    }
    db.removeTag(songId, singerName);
    res.json({ success: true });
  });

  app.put("/api/tags", (req, res) => {
    const { songId, oldName, newName } = req.body;
    if (!songId || !oldName || !newName) {
      return res
        .status(400)
        .json({ error: "songId, oldName, and newName are required" });
    }
    res.json(db.updateTag(songId, oldName, newName));
  });

  const ip = getLocalIP();
  server = app.listen(port, "0.0.0.0", () => {
    console.log(`Mobile server running at http://${ip}:${port}`);
  });

  return { ip, port };
}

function stop() {
  if (server) server.close();
}

module.exports = { start, stop, getLocalIP };
