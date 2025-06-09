export default function handler(req, res) {
  const manifest = {
    id: "community.sz-torrent",
    version: "1.0.0",
    name: "SzTorrent",
    description: "Stremio Addon that streams from Telegram",
    resources: ["stream"],
    types: ["movie"],
    idPrefixes: ["tt"],
    behaviorHints: {
      configurable: false,
      configurationRequired: false
    }
  };

  res.setHeader("Content-Type", "application/json");
  res.status(200).json(manifest);
}
