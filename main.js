const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  globalShortcut,
} = require("electron");
const path = require("path");
const fs = require("fs");
const XLSX = require("xlsx");
const db = require("./database");
const youtube = require("./youtube");
const mobileServer = require("./server");

let mainWindow;
let mobileUrl = "";
let playerWindows = [];

function openPlayerWindow(youtubeId) {
  // Close any existing player windows
  playerWindows.forEach((w) => {
    if (!w.isDestroyed()) w.close();
  });
  playerWindows = [];

  const playerWin = new BrowserWindow({
    fullscreen: true,
    autoHideMenuBar: true,
    backgroundColor: "#000",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  playerWindows.push(playerWin);
  playerWin.on("closed", () => {
    playerWindows = playerWindows.filter((w) => w !== playerWin);
  });
  playerWin.loadURL(
    `https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId)}`,
  );
  playerWin.webContents.on("did-finish-load", () => {
    playerWin.webContents.executeJavaScript(`
      const iv = setInterval(() => {
        const btn = document.querySelector('.ytp-fullscreen-button');
        if (btn) { btn.click(); clearInterval(iv); }
      }, 500);
      setTimeout(() => clearInterval(iv), 10000);

      // Watch for video ending and close the window
      const endIv = setInterval(() => {
        const vid = document.querySelector('video');
        if (vid) {
          vid.addEventListener('ended', () => window.close());
          clearInterval(endIv);
        }
      }, 500);
      setTimeout(() => clearInterval(endIv), 10000);
    `);
  });
  playerWin.webContents.on("before-input-event", (_e, input) => {
    if (input.key === "Escape") playerWin.close();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Karaoke Database",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");

  // F11 toggles fullscreen, Escape exits fullscreen
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.key === "F11" && input.type === "keyDown") {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    if (
      input.key === "Escape" &&
      input.type === "keyDown" &&
      mainWindow.isFullScreen()
    ) {
      mainWindow.setFullScreen(false);
    }
  });
}

// ── IPC Handlers ──────────────────────────────────────────────

ipcMain.handle("mobile:url", () => mobileUrl);

ipcMain.handle("db:getAllSongs", () => {
  return db.getAllSongs();
});

ipcMain.handle("db:addSong", (_event, { title, artist, youtubeId }) => {
  return db.addSong(title, artist, youtubeId);
});

ipcMain.handle("db:updateSong", (_event, { id, title, artist }) => {
  db.updateSong(id, title, artist);
  return { success: true };
});

ipcMain.handle("db:deleteSong", (_event, id) => {
  db.deleteSong(id);
  return db.getAllSongs();
});

ipcMain.handle("db:searchLocal", (_event, query) => {
  return db.searchSongs(query);
});

ipcMain.handle("youtube:search", async (_event, query) => {
  return youtube.searchYouTube(query);
});

ipcMain.handle("play:open", (_event, youtubeId) => {
  openPlayerWindow(youtubeId);
});

ipcMain.handle("import:csv", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: "Import Spreadsheet",
    filters: [{ name: "Spreadsheets", extensions: ["xlsx", "xls", "csv"] }],
    properties: ["openFile"],
  });
  if (canceled || !filePaths.length)
    return { success: false, error: "cancelled" };

  const filePath = filePaths[0];
  const workbook = XLSX.readFile(filePath, { cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Get all rows as JSON (header row becomes keys)
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  if (!jsonRows.length)
    return {
      success: false,
      error: "Spreadsheet is empty or has no data rows.",
    };

  // Find the Artist column and Song column from headers
  const headers = Object.keys(jsonRows[0]);
  const artistKey = headers.find((h) => h.toLowerCase().includes("artist"));
  const songKey = headers.find((h) => /song|title|link|url|video/i.test(h));

  if (!artistKey || !songKey) {
    return {
      success: false,
      error: `Could not find Artist and Song columns. Found headers: ${headers.join(", ")}`,
    };
  }

  // Build a map of hyperlinks from the sheet
  // Hyperlinks are stored in sheet['!hyperlinks'] or cell.l.Target
  const hyperlinkMap = {}; // row index (0-based data) -> URL
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  const songColIdx = headers.indexOf(songKey);

  // Find the actual column letter for the song column
  // Headers are in row 0, data starts row 1
  for (let R = range.s.r + 1; R <= range.e.r; R++) {
    const cellAddr = XLSX.utils.encode_cell({ r: R, c: songColIdx });
    const cell = sheet[cellAddr];
    if (cell && cell.l && cell.l.Target) {
      hyperlinkMap[R - range.s.r - 1] = cell.l.Target;
    }
  }

  // Extract rows — try hyperlink first, then cell text
  const rows = [];
  for (let i = 0; i < jsonRows.length; i++) {
    const artist = String(jsonRows[i][artistKey] || "").trim();
    const cellText = String(jsonRows[i][songKey] || "").trim();
    const hyperlink = hyperlinkMap[i] || "";

    if (!artist) continue;

    // Try extracting video ID from hyperlink first, then from cell text
    const videoId = extractYouTubeId(hyperlink) || extractYouTubeId(cellText);
    const songTitle = cellText; // Keep the display text as a fallback title

    if (videoId) {
      rows.push({ artist, videoId, songTitle });
    }
  }

  if (!rows.length)
    return {
      success: false,
      error: "No valid YouTube URLs found in the spreadsheet.",
    };

  // Batch fetch video titles from YouTube
  const videoIds = rows.map((r) => r.videoId);
  let videoDetails;
  try {
    videoDetails = await youtube.getVideoDetails(videoIds);
  } catch (err) {
    return {
      success: false,
      error: `Failed to fetch video details: ${err.message}`,
    };
  }

  const titleMap = {};
  for (const v of videoDetails) {
    titleMap[v.videoId] = v.title;
  }

  // Insert into database — use the spreadsheet song text as title (it's cleaner than YouTube's)
  let added = 0;
  const skippedSongs = [];
  for (const row of rows) {
    const title = row.songTitle || titleMap[row.videoId] || "Unknown";
    const result = db.addSong(title, row.artist, row.videoId);
    if (result.success) added++;
    else skippedSongs.push({ title, artist: row.artist, reason: result.error });
  }

  return {
    success: true,
    added,
    skipped: skippedSongs.length,
    skippedSongs,
    total: rows.length,
  };
});

// Extract YouTube video ID from various URL formats
function extractYouTubeId(str) {
  if (!str) return null;
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /\/v\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = str.match(p);
    if (m) return m[1];
  }
  if (/^[a-zA-Z0-9_-]{11}$/.test(str.trim())) return str.trim();
  return null;
}

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(async () => {
  await db.initialize();
  createWindow();

  // Start mobile web server
  const { ip, port } = mobileServer.start(3000, {
    onPlay: (youtubeId) => {
      openPlayerWindow(youtubeId);
    },
  });
  mobileUrl = `http://${ip}:${port}`;
  console.log(`Mobile access: ${mobileUrl}`);

  globalShortcut.register("F11", () => {
    if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
  });
  globalShortcut.register("Escape", () => {
    if (mainWindow && mainWindow.isFullScreen())
      mainWindow.setFullScreen(false);
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  mobileServer.stop();
  globalShortcut.unregisterAll();
  if (process.platform !== "darwin") app.quit();
});
