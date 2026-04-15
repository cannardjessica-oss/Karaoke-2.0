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

  db.run(`
    CREATE TABLE IF NOT EXISTS song_tags (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id     INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
      singer_name TEXT    NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(song_id, singer_name)
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
  db.run("DELETE FROM song_tags WHERE song_id = ?", [id]);
  db.run("DELETE FROM songs WHERE id = ?", [id]);
  save();
}

function addTag(songId, singerName) {
  try {
    db.run("INSERT INTO song_tags (song_id, singer_name) VALUES (?, ?)", [
      songId,
      singerName.trim(),
    ]);
    save();
    return { success: true };
  } catch (err) {
    if (err.message.includes("UNIQUE constraint failed")) {
      return { success: false, error: "Already tagged by this singer." };
    }
    throw err;
  }
}

function removeTag(songId, singerName) {
  db.run("DELETE FROM song_tags WHERE song_id = ? AND singer_name = ?", [
    songId,
    singerName.trim(),
  ]);
  save();
}

function updateTag(songId, oldName, newName) {
  try {
    db.run(
      "UPDATE song_tags SET singer_name = ? WHERE song_id = ? AND singer_name = ?",
      [newName.trim(), songId, oldName.trim()],
    );
    save();
    return { success: true };
  } catch (err) {
    if (err.message.includes("UNIQUE constraint failed")) {
      // Target name already exists for this song — merge by removing the old one
      db.run("DELETE FROM song_tags WHERE song_id = ? AND singer_name = ?", [
        songId,
        oldName.trim(),
      ]);
      save();
      return { success: true };
    }
    throw err;
  }
}

function getSongsBySinger(singerName) {
  const stmt = db.prepare(
    `SELECT s.* FROM songs s
     INNER JOIN song_tags t ON t.song_id = s.id
     WHERE t.singer_name = ?
     ORDER BY s.title ASC`,
  );
  stmt.bind([singerName.trim()]);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function getAllSingers() {
  const stmt = db.prepare(
    "SELECT DISTINCT singer_name FROM song_tags ORDER BY singer_name ASC",
  );
  const names = [];
  while (stmt.step()) {
    names.push(stmt.getAsObject().singer_name);
  }
  stmt.free();
  return names;
}

function getTagsForSong(songId) {
  const stmt = db.prepare(
    "SELECT singer_name FROM song_tags WHERE song_id = ? ORDER BY singer_name ASC",
  );
  stmt.bind([songId]);
  const names = [];
  while (stmt.step()) {
    names.push(stmt.getAsObject().singer_name);
  }
  stmt.free();
  return names;
}

function getAllTaggedSongs() {
  const stmt = db.prepare(
    `SELECT s.*, t.singer_name, t.id AS tag_id
     FROM songs s
     INNER JOIN song_tags t ON t.song_id = s.id
     ORDER BY t.singer_name ASC, s.title ASC`,
  );
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
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
  addTag,
  removeTag,
  updateTag,
  getSongsBySinger,
  getAllSingers,
  getTagsForSong,
  getAllTaggedSongs,
};
