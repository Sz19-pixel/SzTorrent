# SzTorrent 

🧲 Stremio Multi-Source Torrent Addon

A Stremio addon to search torrents from multiple sources including ext.to and watchsomuch.to

⚠️ Important Notice

This addon is intended for educational purposes only. Make sure to use it in accordance with the laws of your country.

🚀 Installation and Usage

1. Install Node.js

# Download Node.js from https://nodejs.org/
# Or using a package manager:
# Ubuntu/Debian:
sudo apt install nodejs npm

# macOS:
brew install node

# Windows: Download from the official website

2. Set Up the Project

# Create a new folder
mkdir stremio-torrent-addon
cd stremio-torrent-addon

# Create the files
# Copy the code from the artifacts above into:
# - index.js (main code)
# - package.json

3. Install Dependencies

npm install

4. Get an OMDB API Key (Optional but Recommended)

# Go to http://www.omdbapi.com/apikey.aspx
# Get a free key
# Add it as an environment variable or in the code
export OMDB_API_KEY="your_api_key_here"

5. Run the Addon

# Regular run
npm start

# Development mode with auto-restart
npm run dev

📱 Adding the Addon to Stremio

Method 1: Local Installation

1. Run the addon on your device


2. Open Stremio


3. Choose "Add-ons" from the menu


4. Click "Community Add-ons"


5. Enter the URL: http://localhost:3000/manifest.json



Method 2: Deploy to Heroku

# Install Heroku CLI
npm install -g heroku

# Log in
heroku login

# Create an app
heroku create your-addon-name

# Add environment variable
heroku config:set OMDB_API_KEY="your_api_key"

# Deploy the code
git init
git add .
git commit -m "Initial commit"
git push heroku main

# Your URL will be: https://your-addon-name.herokuapp.com/manifest.json

🔧 Customization & Development

Add New Sources

// In the searchGeneric function, add:
const sources = [
    { 
        name: 'New Site', 
        url: 'https://newsite.com/search?q=', 
        icon: '🆕' 
    }
];

Modify Selectors

// In searchExtTo or searchWatchSomuch functions
// Edit the selectors array based on the site's structure:
const selectors = [
    '.new-torrent-class',
    '.updated-result-item',
    // Add more as needed
];

Modify Filtering

// In filterStreams function
// Add new filtering rules:
if (stream.title.includes('CAM') || stream.title.includes('TS')) {
    return false; // Ignore low-quality versions
}

🐛 Troubleshooting

Common Issues:

1. No results:

Ensure the websites are up

Check the selectors in the code

Review console.log for errors



2. Rate Limiting:

Reduce the number of requests per second

Add more delay between requests



3. CORS Errors:

Ensure you're running the addon on localhost

Or use a deployment service like Heroku




Debugging:

# Run with extra logs
DEBUG=* npm start

# Or
NODE_ENV=development npm start

📊 Performance Monitoring

The addon logs useful info in the console:

🔍 Searching streams for... - Search started

📖 Found: Movie Title - Data found

✅ Source found X streams - Results from each source

❌ Error messages - Error logs


🔒 Security & Privacy

The addon stores no personal data

Does not track user activity

Uses a standard User-Agent to avoid blocking

Applies rate limiting to protect sources


🆕 Future Updates

[ ] Add more sources

[ ] Improve search algorithm

[ ] Add data caching

[ ] Web interface for settings

[ ] Arabic language search support


📝 License

MIT License - For educational purposes only

🤝 Contributions

To improve the addon:

1. Fork the project


2. Create a new development branch


3. Add your improvements


4. Submit a Pull Request




---

Note: This addon is intended for learning and development. Use it responsibly and according to your country's laws.

 
