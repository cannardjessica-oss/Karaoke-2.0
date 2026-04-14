// ── DOM References ────────────────────────────────────────────
const ytSearchInput = document.getElementById("yt-search-input");
const ytSearchBtn = document.getElementById("yt-search-btn");
const ytResultsSection = document.getElementById("yt-results-section");
const ytResultsContainer = document.getElementById("yt-results");
const ytResultsClose = document.getElementById("yt-results-close");
const localSearchInput = document.getElementById("local-search-input");
const songsTbody = document.getElementById("songs-tbody");
const noSongsMsg = document.getElementById("no-songs-msg");
const toast = document.getElementById("toast");

// Tabs & panels
const tabs = document.querySelectorAll(".tab");
const allSongsPanel = document.getElementById("all-songs-panel");
const artistPanel = document.getElementById("artist-panel");
const artistList = document.getElementById("artist-list");
const noArtistsMsg = document.getElementById("no-artists-msg");

// Sort state
let currentSort = null; // null = date (default), "title", "artist"
let sortDirection = "asc";
let activeTab = "all-songs";
let allSongsCache = [];

// Manual add modal
const addModal = document.getElementById("add-modal");
const manualTitle = document.getElementById("manual-title");
const manualArtist = document.getElementById("manual-artist");
const manualYtid = document.getElementById("manual-ytid");
const manualAddBtn = document.getElementById("manual-add-btn");
const manualCancelBtn = document.getElementById("manual-cancel-btn");
const manualError = document.getElementById("manual-error");

// ── Toast helper ──────────────────────────────────────────────
function showToast(message, success = true) {
  toast.textContent = message;
  toast.className = success ? "toast-success" : "";
  setTimeout(() => toast.classList.add("hidden"), 3000);
}

// ── Decode HTML entities from YouTube API ─────────────────────
function decodeHTML(html) {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}

// ── Parse artist & song from YouTube video title ─────────────
function parseVideoTitle(rawTitle) {
  let title = rawTitle;

  // Remove anything inside parentheses or brackets
  title = title.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "");

  // Normalize all pipe variations to " | "
  title = title.replace(/\s*\|{1,}\s*/g, " | ");

  // Normalize dashes to " - " (but not inside words like "hip-hop")
  title = title.replace(/\s+[-–—]\s+/g, " - ");

  // Split into segments by separators
  const segments = title.split(/\s+[-–—|]\s+/);

  // Fluff patterns — if a segment is entirely fluff, discard it
  const fluffWords = [
    "karaoke",
    "instrumental",
    "lyrics",
    "lyric",
    "with lyrics",
    "official video",
    "official audio",
    "official music video",
    "music video",
    "audio",
    "video",
    "official",
    "sing along",
    "singalong",
    "backing track",
    "acoustic",
    "hd",
    "4k",
    "1080p",
    "720p",
    "cover",
    "remix",
    "live",
    "ft\\.?",
    "feat\\.?",
    "featuring",
    "version",
    "ver\\.?",
    "original",
    "no vocals",
    "no vocal",
    "minus one",
    "piano",
    "guitar",
    "higher key",
    "lower key",
    "male key",
    "female key",
    "with backing vocals",
    "without backing vocals",
    "karafun",
    "stingray karaoke",
    "sing king",
    "sing2piano",
    "sing2guitar",
    "sing2music",
  ];
  const fluffPattern = new RegExp(
    "^(" + fluffWords.join("|") + ")(\\s+(" + fluffWords.join("|") + "))*$",
    "i",
  );

  // Keep only non-fluff segments
  const meaningful = segments
    .map((s) => s.trim())
    .filter((s) => s && !fluffPattern.test(s));

  if (meaningful.length >= 2) {
    return {
      artist: cleanField(meaningful[0]),
      song: cleanField(meaningful[1]),
    };
  }

  if (meaningful.length === 1) {
    // Try splitting the remaining segment on " - " etc. one more time
    const inner = meaningful[0];
    const seps = [" - ", " – ", " — ", " : "];
    for (const sep of seps) {
      const idx = inner.indexOf(sep);
      if (idx > 0) {
        return {
          artist: cleanField(inner.substring(0, idx)),
          song: cleanField(inner.substring(idx + sep.length)),
        };
      }
    }
    return { artist: "", song: cleanField(inner) };
  }

  return { artist: "", song: cleanField(title) };
}

// Clean up a parsed field — trim separators, extra spaces, stray punctuation
function cleanField(str) {
  return str
    .replace(/[\s\-–—|:,\/\\]+$/g, "")
    .replace(/^[\s\-–—|:,\/\\]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ── Render YouTube search results ────────────────────────────
function renderYouTubeResults(results) {
  ytResultsContainer.innerHTML = "";

  if (!results.length) {
    ytResultsContainer.innerHTML = '<p class="muted">No results found.</p>';
    return;
  }

  results.forEach((item) => {
    const decoded = decodeHTML(item.title);
    const parsed = parseVideoTitle(decoded);
    const card = document.createElement("div");
    card.className = "yt-card";
    card.innerHTML = `
      <img src="${item.thumbnail}" alt="" loading="lazy" />
      <div class="yt-card-info">
        <div class="yt-card-title">${parsed.song}</div>
        <div class="yt-card-channel">${parsed.artist || decodeHTML(item.channelTitle)}</div>
      </div>
      <div class="yt-card-actions">
        <button class="btn-small btn-play" data-action="preview" data-id="${item.videoId}">▶ Preview</button>
        <button class="btn-small" data-action="add" data-id="${item.videoId}"
                data-title="${item.title.replace(/"/g, "&quot;")}"
                data-channel="${item.channelTitle.replace(/"/g, "&quot;")}">+ Add</button>
      </div>
    `;
    ytResultsContainer.appendChild(card);
  });

  ytResultsSection.classList.remove("hidden");
}

// ── Sort songs array based on current sort state ──────────────
function sortSongs(songs) {
  if (!currentSort) return songs;
  const sorted = [...songs].sort((a, b) => {
    const aVal = (a[currentSort] || "").toLowerCase();
    const bVal = (b[currentSort] || "").toLowerCase();
    return aVal.localeCompare(bVal);
  });
  return sortDirection === "desc" ? sorted.reverse() : sorted;
}

// ── Update sort arrow indicators ──────────────────────────────
function updateSortArrows() {
  document.querySelectorAll(".sort-arrow").forEach((arrow) => {
    arrow.className = "sort-arrow";
  });
  if (currentSort) {
    const th = document.querySelector(
      `th[data-sort="${currentSort}"] .sort-arrow`,
    );
    if (th) th.classList.add(sortDirection);
  }
}

// ── Render saved songs table ──────────────────────────────────
function renderSongs(songs) {
  const sorted = sortSongs(songs);
  songsTbody.innerHTML = "";
  noSongsMsg.classList.toggle("hidden", sorted.length > 0);

  sorted.forEach((song, idx) => {
    const tr = document.createElement("tr");
    tr.dataset.songId = song.id;
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td class="editable" contenteditable="true" data-field="title" data-song-id="${song.id}">${decodeHTML(song.title)}</td>
      <td class="editable" contenteditable="true" data-field="artist" data-song-id="${song.id}">${decodeHTML(song.artist)}</td>
      <td>
        <button class="btn-small btn-play" data-action="play" data-id="${song.youtube_id}" title="Play on YouTube"><svg width="24" height="18" viewBox="0 0 68 48"><rect rx="10" ry="10" width="68" height="48" fill="#f00"/><polygon points="27,14 27,34 46,24" fill="#fff"/></svg></button>
        <button class="btn-small btn-menu" data-action="menu" data-youtube-id="${song.youtube_id}">⋮</button>
      </td>
    `;
    songsTbody.appendChild(tr);
  });
  updateSortArrows();
}

// ── Render By Artist accordion ────────────────────────────────
function renderByArtist(songs) {
  artistList.innerHTML = "";
  noArtistsMsg.classList.toggle("hidden", songs.length > 0);

  // Group by artist (case-insensitive)
  const groups = {};
  songs.forEach((song) => {
    const key = (song.artist || "Unknown").trim().toLowerCase();
    if (!groups[key])
      groups[key] = { display: song.artist || "Unknown", songs: [] };
    groups[key].songs.push(song);
  });

  // Sort artists A-Z
  const sortedKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b));

  sortedKeys.forEach((key) => {
    const group = groups[key];
    // Sort songs within group by title A-Z
    group.songs.sort((a, b) =>
      (a.title || "")
        .toLowerCase()
        .localeCompare((b.title || "").toLowerCase()),
    );

    const div = document.createElement("div");
    div.className = "artist-group";
    div.innerHTML = `
      <div class="artist-group-header">
        <span class="artist-chevron">▶</span>
        <span class="artist-name">${decodeHTML(group.display)}</span>
        <span class="artist-count">${group.songs.length} song${group.songs.length !== 1 ? "s" : ""}</span>
      </div>
      <div class="artist-group-songs">
        ${group.songs
          .map(
            (song) => `
          <div class="artist-song-item" data-song-id="${song.id}">
            <span class="artist-song-title">${decodeHTML(song.title)}</span>
            <button class="btn-small btn-play" data-action="play" data-id="${song.youtube_id}" title="Play on YouTube"><svg width="24" height="18" viewBox="0 0 68 48"><rect rx="10" ry="10" width="68" height="48" fill="#f00"/><polygon points="27,14 27,34 46,24" fill="#fff"/></svg></button>
            <button class="btn-small btn-menu" data-action="menu" data-youtube-id="${song.youtube_id}">⋮</button>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
    artistList.appendChild(div);
  });
}

// ── Artist accordion toggle ───────────────────────────────────
artistList.addEventListener("click", (e) => {
  const header = e.target.closest(".artist-group-header");
  if (header) {
    header.parentElement.classList.toggle("open");
    return;
  }

  // Play / menu buttons inside artist panel
  const btn = e.target.closest("button");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "play") {
    window.api.playSong(btn.dataset.id);
  }
  if (action === "menu") {
    const item = btn.closest(".artist-song-item");
    if (!item || !item.dataset.songId) return;
    ctxTargetSongId = Number(item.dataset.songId);
    ctxTargetRow = null;
    ctxTargetYoutubeId = btn.dataset.youtubeId;
    ctxMenu.classList.remove("hidden");
    const rect = btn.getBoundingClientRect();
    const menuW = ctxMenu.offsetWidth;
    const menuH = ctxMenu.offsetHeight;
    const x =
      rect.right + menuW > window.innerWidth ? rect.left - menuW : rect.right;
    const y =
      rect.bottom + menuH > window.innerHeight
        ? window.innerHeight - menuH - 4
        : rect.bottom;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
  }
});

// ── Load all songs ────────────────────────────────────────────
async function loadSongs() {
  const songs = await window.api.getAllSongs();
  allSongsCache = songs;
  if (activeTab === "all-songs") {
    renderSongs(songs);
  } else {
    renderByArtist(songs);
  }
}

// ── Tab switching ─────────────────────────────────────────────
tabs.forEach((tab) => {
  tab.addEventListener("click", async () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;

    if (activeTab === "all-songs") {
      allSongsPanel.classList.add("active");
      artistPanel.classList.add("hidden");
      artistPanel.classList.remove("active");
      allSongsPanel.classList.remove("hidden");
    } else {
      artistPanel.classList.add("active");
      allSongsPanel.classList.add("hidden");
      allSongsPanel.classList.remove("active");
      artistPanel.classList.remove("hidden");
    }

    // Re-render from cache or fetch
    const query = localSearchInput.value.trim();
    const songs = query
      ? await window.api.searchLocal(query)
      : await window.api.getAllSongs();
    allSongsCache = songs;
    if (activeTab === "all-songs") {
      renderSongs(songs);
    } else {
      renderByArtist(songs);
    }
  });
});

// ── Sortable column header clicks ─────────────────────────────
document.querySelectorAll("th.sortable").forEach((th) => {
  th.addEventListener("click", () => {
    const field = th.dataset.sort;
    if (currentSort === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      currentSort = field;
      sortDirection = "asc";
    }
    renderSongs(allSongsCache);
  });
});

// ── YouTube search ────────────────────────────────────────────
async function doYouTubeSearch() {
  const query = ytSearchInput.value.trim();
  if (!query) return;

  ytSearchBtn.disabled = true;
  ytSearchBtn.innerHTML = '<span class="spinner"></span>Searching…';

  try {
    const results = await window.api.searchYouTube(query);
    renderYouTubeResults(results);
  } catch (err) {
    showToast(`Search failed: ${err.message}`, false);
  } finally {
    ytSearchBtn.disabled = false;
    ytSearchBtn.textContent = "Search";
  }
}

// ── Event: YouTube search ─────────────────────────────────────
ytSearchBtn.addEventListener("click", doYouTubeSearch);
ytSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") doYouTubeSearch();
});

// ── Event: Close YouTube results ──────────────────────────────
ytResultsClose.addEventListener("click", () => {
  ytResultsSection.classList.add("hidden");
});

// ── Event: YouTube results clicks (preview / add) ────────────
ytResultsContainer.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;
  const videoId = btn.dataset.id;

  if (action === "preview") {
    await window.api.playSong(videoId);
  }

  if (action === "add") {
    const rawTitle = decodeHTML(btn.dataset.title);
    const parsed = parseVideoTitle(rawTitle);
    const title = parsed.song;
    const artist = parsed.artist || decodeHTML(btn.dataset.channel);

    const result = await window.api.addSong(title, artist, videoId);
    if (result.success) {
      showToast("Song added!");
      await loadSongs();
    } else {
      showToast(result.error, false);
    }
  }
});

// ── Context menu variables (must be before click handler) ────
const ctxMenu = document.getElementById("context-menu");
let ctxTargetSongId = null;
let ctxTargetRow = null;
let ctxTargetYoutubeId = null;

// ── Event: Songs table clicks ────────────────────────────────
songsTbody.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;

  const action = btn.dataset.action;

  if (action === "play") {
    await window.api.playSong(btn.dataset.id);
  }

  if (action === "menu") {
    const row = btn.closest("tr");
    if (!row || !row.dataset.songId) return;

    ctxTargetSongId = Number(row.dataset.songId);
    ctxTargetRow = row;
    ctxTargetYoutubeId = btn.dataset.youtubeId;
    ctxMenu.classList.remove("hidden");

    const rect = btn.getBoundingClientRect();
    const menuW = ctxMenu.offsetWidth;
    const menuH = ctxMenu.offsetHeight;
    const x =
      rect.right + menuW > window.innerWidth ? rect.left - menuW : rect.right;
    const y =
      rect.bottom + menuH > window.innerHeight
        ? window.innerHeight - menuH - 4
        : rect.bottom;
    ctxMenu.style.left = `${x}px`;
    ctxMenu.style.top = `${y}px`;
  }
});

// ── Right-click context menu for song rows ───────────────────
songsTbody.addEventListener("contextmenu", (e) => {
  const row = e.target.closest("tr");
  if (!row || !row.dataset.songId) return;
  e.preventDefault();

  ctxTargetSongId = Number(row.dataset.songId);
  ctxTargetRow = row;
  const menuBtn = row.querySelector('[data-action="menu"]');
  ctxTargetYoutubeId = menuBtn ? menuBtn.dataset.youtubeId : null;
  ctxMenu.classList.remove("hidden");

  const menuW = ctxMenu.offsetWidth;
  const menuH = ctxMenu.offsetHeight;
  const x =
    e.clientX + menuW > window.innerWidth
      ? window.innerWidth - menuW - 4
      : e.clientX;
  const y =
    e.clientY + menuH > window.innerHeight
      ? window.innerHeight - menuH - 4
      : e.clientY;
  ctxMenu.style.left = `${x}px`;
  ctxMenu.style.top = `${y}px`;
});

document.addEventListener("click", (e) => {
  if (e.target.closest("#context-menu")) return;
  if (e.target.closest('[data-action="menu"]')) return;
  ctxMenu.classList.add("hidden");
});

document.getElementById("ctx-swap").addEventListener("click", async () => {
  if (ctxTargetSongId == null || !ctxTargetRow) return;
  const titleCell = ctxTargetRow.querySelector('[data-field="title"]');
  const artistCell = ctxTargetRow.querySelector('[data-field="artist"]');
  const oldTitle = titleCell.textContent.trim();
  const oldArtist = artistCell.textContent.trim();
  await window.api.updateSong(ctxTargetSongId, oldArtist, oldTitle);
  titleCell.textContent = oldArtist;
  artistCell.textContent = oldTitle;
  showToast("Swapped title & artist!");
  ctxMenu.classList.add("hidden");
  ctxTargetSongId = null;
  ctxTargetRow = null;
});

document.getElementById("ctx-delete").addEventListener("click", async () => {
  if (ctxTargetSongId == null) return;
  await window.api.deleteSong(ctxTargetSongId);
  showToast("Song deleted.");
  ctxMenu.classList.add("hidden");
  ctxTargetSongId = null;
  ctxTargetRow = null;
  await loadSongs();
});

// ── Event: Inline edit (save on blur or Enter) ──────────────────
songsTbody.addEventListener(
  "blur",
  async (e) => {
    const cell = e.target;
    if (!cell.classList.contains("editable")) return;

    const songId = Number(cell.dataset.songId);
    const field = cell.dataset.field;
    const value = cell.textContent.trim();

    if (!value) {
      showToast("Field cannot be empty.", false);
      await loadSongs();
      return;
    }

    const songs = await window.api.getAllSongs();
    const song = songs.find((s) => s.id === songId);
    if (!song) return;

    const title = field === "title" ? value : song.title;
    const artist = field === "artist" ? value : song.artist;

    await window.api.updateSong(songId, title, artist);
    showToast("Song updated!");
  },
  true,
);

songsTbody.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("editable")) {
    e.preventDefault();
    e.target.blur();
  }
});

// ── Event: Filter saved songs locally ─────────────────────────
let filterTimeout;
localSearchInput.addEventListener("input", () => {
  clearTimeout(filterTimeout);
  filterTimeout = setTimeout(async () => {
    const query = localSearchInput.value.trim();
    let songs;
    if (query) {
      songs = await window.api.searchLocal(query);
    } else {
      songs = await window.api.getAllSongs();
    }
    allSongsCache = songs;
    if (activeTab === "all-songs") {
      renderSongs(songs);
    } else {
      renderByArtist(songs);
    }
  }, 300);
});

// ── Manual add modal ──────────────────────────────────────────
manualCancelBtn.addEventListener("click", () => {
  addModal.classList.add("hidden");
  manualError.classList.add("hidden");
});

manualAddBtn.addEventListener("click", async () => {
  const title = manualTitle.value.trim();
  const artist = manualArtist.value.trim();
  const ytid = manualYtid.value.trim();

  if (!title || !artist || !ytid) {
    manualError.textContent = "All fields are required.";
    manualError.classList.remove("hidden");
    return;
  }

  const result = await window.api.addSong(title, artist, ytid);
  if (result.success) {
    addModal.classList.add("hidden");
    showToast("Song added!");
    manualTitle.value = "";
    manualArtist.value = "";
    manualYtid.value = "";
    await loadSongs();
  } else {
    manualError.textContent = result.error;
    manualError.classList.remove("hidden");
  }
});

// ── Init ──────────────────────────────────────────────────────
loadSongs();

// Show mobile URL in header
(async () => {
  const url = await window.api.getMobileUrl();
  const badge = document.getElementById("mobile-url");
  if (url && badge) {
    badge.textContent = `📱 ${url}`;
    badge.title = "Open this URL on your phone (same Wi-Fi). Click to copy.";
    badge.addEventListener("click", () => {
      navigator.clipboard.writeText(url);
      showToast("Mobile URL copied to clipboard!");
    });
  }
})();
