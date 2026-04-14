const fs = require("fs");
const path = require("path");

function loadApiKey() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    throw new Error(
      "Missing .env file. Create one in the project root with:\nYOUTUBE_API_KEY=your_key_here",
    );
  }
  const content = fs.readFileSync(envPath, "utf-8");
  const match = content.match(/^YOUTUBE_API_KEY=(.+)$/m);
  if (!match || !match[1].trim()) {
    throw new Error("YOUTUBE_API_KEY not found in .env file.");
  }
  return match[1].trim();
}

async function searchYouTube(query, maxResults = 15) {
  const apiKey = loadApiKey();
  const params = new URLSearchParams({
    part: "snippet",
    q: `${query} karaoke`,
    type: "video",
    maxResults: String(maxResults),
    key: apiKey,
  });

  const url = `https://www.googleapis.com/youtube/v3/search?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  return data.items.map((item) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    channelTitle: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.medium.url,
  }));
}

// Batch fetch video titles by IDs (up to 50 per call)
async function getVideoDetails(videoIds) {
  const apiKey = loadApiKey();
  const results = [];

  // YouTube API allows max 50 IDs per request
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const params = new URLSearchParams({
      part: "snippet",
      id: batch.join(","),
      key: apiKey,
    });

    const url = `https://www.googleapis.com/youtube/v3/videos?${params}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`YouTube API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    for (const item of data.items) {
      results.push({
        videoId: item.id,
        title: item.snippet.title,
      });
    }
  }

  return results;
}

module.exports = { searchYouTube, getVideoDetails };
