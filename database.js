const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");

let db;
let dbPath;

async function initialize() {
  const SQL = await initSqlJs();
  dbPath = path.join(app.getPath("userData"), "karaoke.db");

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS songs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      artist      TEXT    NOT NULL,
      youtube_id  TEXT    NOT NULL UNIQUE,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  save();
}

function save() {
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function getAllSongs() {
  const stmt = db.prepare("SELECT * FROM songs ORDER BY created_at DESC");
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function addSong(title, artist, youtubeId) {
  try {
    db.run("INSERT INTO songs (title, artist, youtube_id) VALUES (?, ?, ?)", [
      title,
      artist,
      youtubeId,
    ]);
    save();
    return { success: true };
  } catch (err) {
    if (err.message.includes("UNIQUE constraint failed")) {
      return { success: false, error: "Song already exists in the database." };
    }
    throw err;
  }
}

function updateSong(id, title, artist) {
  db.run("UPDATE songs SET title = ?, artist = ? WHERE id = ?", [
    title,
    artist,
    id,
  ]);
  save();
}

function upsertSong(title, artist, youtubeId) {
  try {
    db.run("INSERT INTO songs (title, artist, youtube_id) VALUES (?, ?, ?)", [
      title,
      artist,
      youtubeId,
    ]);
    save();
    return { success: true, action: "added" };
  } catch (err) {
    if (err.message.includes("UNIQUE constraint failed")) {
      db.run("UPDATE songs SET title = ?, artist = ? WHERE youtube_id = ?", [
        title,
        artist,
        youtubeId,
      ]);
      save();
      return { success: true, action: "updated" };
    }
    throw err;
  }
}

function deleteSong(id) {
  db.run("DELETE FROM songs WHERE id = ?", [id]);
  save();
}

function searchSongs(query) {
  const stmt = db.prepare(
    `SELECT * FROM songs
     WHERE title LIKE ? OR artist LIKE ?
     ORDER BY created_at DESC`,
  );
  stmt.bind([`%${query}%`, `%${query}%`]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

module.exports = {
  initialize,
  getAllSongs,
  addSong,
  updateSong,
  upsertSong,
  deleteSong,
  searchSongs,
};
