const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // Database
  getAllSongs: () => ipcRenderer.invoke("db:getAllSongs"),
  addSong: (title, artist, youtubeId) =>
    ipcRenderer.invoke("db:addSong", { title, artist, youtubeId }),
  updateSong: (id, title, artist) =>
    ipcRenderer.invoke("db:updateSong", { id, title, artist }),
  deleteSong: (id) => ipcRenderer.invoke("db:deleteSong", id),
  searchLocal: (query) => ipcRenderer.invoke("db:searchLocal", query),

  // Tags / Favorites
  addTag: (songId, singerName) =>
    ipcRenderer.invoke("db:addTag", { songId, singerName }),
  removeTag: (songId, singerName) =>
    ipcRenderer.invoke("db:removeTag", { songId, singerName }),
  updateTag: (songId, oldName, newName) =>
    ipcRenderer.invoke("db:updateTag", { songId, oldName, newName }),
  getSongsBySinger: (singerName) =>
    ipcRenderer.invoke("db:getSongsBySinger", singerName),
  getAllSingers: () => ipcRenderer.invoke("db:getAllSingers"),
  getTagsForSong: (songId) => ipcRenderer.invoke("db:getTagsForSong", songId),
  getAllTaggedSongs: () => ipcRenderer.invoke("db:getAllTaggedSongs"),

  // YouTube
  searchYouTube: (query) => ipcRenderer.invoke("youtube:search", query),

  // Playback
  playSong: (youtubeId) => ipcRenderer.invoke("play:open", youtubeId),

  // Import
  importCSV: () => ipcRenderer.invoke("import:csv"),

  // Mobile
  getMobileUrl: () => ipcRenderer.invoke("mobile:url"),
  getMobileQr: () => ipcRenderer.invoke("mobile:qr"),
});
