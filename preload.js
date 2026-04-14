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

  // YouTube
  searchYouTube: (query) => ipcRenderer.invoke("youtube:search", query),

  // Playback
  playSong: (youtubeId) => ipcRenderer.invoke("play:open", youtubeId),

  // Import
  importCSV: () => ipcRenderer.invoke("import:csv"),

  // Mobile
  getMobileUrl: () => ipcRenderer.invoke("mobile:url"),
});
