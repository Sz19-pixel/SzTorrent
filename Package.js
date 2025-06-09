{
  "name": "stremio-torrent-addon",
  "version": "1.2.0",
  "description": "Multi-source torrent addon for Stremio",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "nodemon index.js",
    "test": "node test.js"
  },
  "keywords": [
    "stremio",
    "addon",
    "torrent",
    "streaming"
  ],
  "author": "Your Name",
  "license": "MIT",
  "dependencies": {
    "stremio-addon-sdk": "^1.6.8",
    "axios": "^1.6.0",
    "cheerio": "^1.0.0-rc.12",
    "express": "^4.18.2"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  },
  "engines": {
    "node": ">=14.0.0"
  }
}
