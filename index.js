const { addonBuilder, getInterface } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

// Configuration
const CONFIG = {
    maxResults: 20,
    timeout: 15000,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    omdbApiKey: process.env.OMDB_API_KEY || 'YOUR_OMDB_API_KEY_HERE' // Get free key from omdbapi.com
};

// Addon manifest
const manifest = {
    id: 'org.torrent.multi-scraper',
    version: '1.2.0',
    name: '🧲 Multi-Source Torrent Addon',
    description: 'Search torrents from multiple sources including ext.to and watchsomuch.to',
    
    resources: ['stream'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt'],
    
    config: [
        {
            key: 'quality',
            type: 'select',
            options: ['all', '4k', '1080p', '720p'],
            default: 'all',
            title: 'Preferred Quality'
        },
        {
            key: 'minSeeds',
            type: 'number',
            default: 5,
            title: 'Minimum Seeds'
        }
    ]
};

const builder = new addonBuilder(manifest);

// Rate limiter class
class RateLimiter {
    constructor(requestsPerMinute = 25) {
        this.requests = new Map();
        this.limit = requestsPerMinute;
    }
    
    async waitIfNeeded(domain) {
        const now = Date.now();
        const requests = this.requests.get(domain) || [];
        
        // Clean old requests
        const recentRequests = requests.filter(time => now - time < 60000);
        
        if (recentRequests.length >= this.limit) {
            const waitTime = 60000 - (now - recentRequests[0]) + 1000;
            console.log(`Rate limit hit for ${domain}, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        recentRequests.push(now);
        this.requests.set(domain, recentRequests);
    }
}

const rateLimiter = new RateLimiter();

// Cache for movie/series metadata
const metadataCache = new Map();

// Main stream handler
builder.defineStreamHandler(async ({ type, id, config }) => {
    try {
        console.log(`🔍 Searching streams for ${type}: ${id}`);
        
        const parts = id.split(':');
        const imdbId = parts[0];
        const season = parts[1] || null;
        const episode = parts[2] || null;
        
        // Get movie/series metadata
        const metadata = await getMetadata(imdbId);
        if (!metadata || !metadata.Title) {
            console.log('❌ Could not get metadata for:', imdbId);
            return { streams: [] };
        }
        
        console.log(`📖 Found: ${metadata.Title} (${metadata.Year})`);
        
        // Search all sources
        const searchPromises = [
            searchExtTo(metadata, type, season, episode, config),
            searchWatchSomuch(metadata, type, season, episode, config),
            searchGeneric(metadata, type, season, episode, config)
        ];
        
        const allResults = await Promise.allSettled(searchPromises);
        const allStreams = [];
        
        allResults.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                allStreams.push(...result.value);
            } else {
                console.error(`❌ Source ${index} failed:`, result.reason.message);
            }
        });
        
        // Filter and sort streams
        const filteredStreams = filterStreams(allStreams, config);
        const sortedStreams = sortStreams(filteredStreams);
        
        console.log(`✅ Found ${sortedStreams.length} streams`);
        return { streams: sortedStreams.slice(0, CONFIG.maxResults) };
        
    } catch (error) {
        console.error('❌ Stream handler error:', error);
        return { streams: [] };
    }
});

// Get metadata from OMDB API
async function getMetadata(imdbId) {
    const cacheKey = imdbId;
    if (metadataCache.has(cacheKey)) {
        return metadataCache.get(cacheKey);
    }
    
    try {
        const response = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=${CONFIG.omdbApiKey}`, {
            timeout: 5000
        });
        
        if (response.data && response.data.Response === 'True') {
            metadataCache.set(cacheKey, response.data);
            return response.data;
        }
    } catch (error) {
        console.error('OMDB API error:', error.message);
    }
    
    return null;
}

// Search ext.to
async function searchExtTo(metadata, type, season, episode, config) {
    try {
        await rateLimiter.waitIfNeeded('ext.to');
        
        let searchQuery = metadata.Title;
        if (type === 'series' && season && episode) {
            searchQuery += ` S${season.padStart(2, '0')}E${episode.padStart(2, '0')}`;
        } else if (type === 'movie') {
            searchQuery += ` ${metadata.Year}`;
        }
        
        console.log(`🔍 Searching ext.to for: ${searchQuery}`);
        
        const searchUrl = `https://ext.to/search?q=${encodeURIComponent(searchQuery)}`;
        const response = await makeRequest(searchUrl);
        
        if (!response || !response.data) {
            throw new Error('No response data');
        }
        
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Multiple selector attempts for different layouts
        const selectors = [
            '.torrent-item, .result-item, .search-result',
            'tr[class*="torrent"], tr[class*="result"]',
            '.list-group-item, .media, .card'
        ];
        
        for (const selector of selectors) {
            const items = $(selector);
            if (items.length > 0) {
                console.log(`📝 Found ${items.length} items with selector: ${selector}`);
                
                items.each((index, element) => {
                    try {
                        const $item = $(element);
                        
                        // Try multiple ways to extract data
                        const title = extractText($item, [
                            '.title, .name, .torrent-title, .result-title',
                            'a[href*="torrent"], a[href*="magnet"]',
                            'td:first-child, .media-heading'
                        ]);
                        
                        const magnetLink = extractMagnet($item);
                        
                        if (magnetLink && title && title.length > 5) {
                            const quality = extractQuality(title);
                            const seeds = extractSeeds($item);
                            const size = extractSize($item);
                            
                            streams.push({
                                name: `🧲 Ext.to`,
                                title: `${title}`,
                                url: magnetLink,
                                quality: quality,
                                seeds: seeds,
                                size: size,
                                source: 'ext.to',
                                behaviorHints: {
                                    notWebReady: true,
                                    bingeGroup: 'ext-to'
                                }
                            });
                        }
                    } catch (itemError) {
                        // Skip this item
                    }
                });
                
                if (streams.length > 0) break;
            }
        }
        
        console.log(`✅ Ext.to found ${streams.length} streams`);
        return streams;
        
    } catch (error) {
        console.error('❌ Ext.to search error:', error.message);
        return [];
    }
}

// Search watchsomuch.to
async function searchWatchSomuch(metadata, type, season, episode, config) {
    try {
        await rateLimiter.waitIfNeeded('watchsomuch.to');
        
        let searchQuery = metadata.Title;
        if (type === 'series' && season && episode) {
            searchQuery += ` season ${season} episode ${episode}`;
        } else if (type === 'movie') {
            searchQuery += ` ${metadata.Year}`;
        }
        
        console.log(`🔍 Searching watchsomuch.to for: ${searchQuery}`);
        
        const searchUrl = `https://watchsomuch.to/search?query=${encodeURIComponent(searchQuery)}`;
        const response = await makeRequest(searchUrl);
        
        if (!response || !response.data) {
            throw new Error('No response data');
        }
        
        const $ = cheerio.load(response.data);
        const streams = [];
        
        // Try different selectors
        const selectors = [
            '.result-item, .search-result, .movie-item',
            'article, .post, .entry',
            '.row .col, .grid-item'
        ];
        
        for (const selector of selectors) {
            const items = $(selector);
            if (items.length > 0) {
                console.log(`📝 WatchSomuch found ${items.length} items`);
                
                items.each((index, element) => {
                    try {
                        const $item = $(element);
                        
                        const title = extractText($item, [
                            '.title, .name, .result-title',
                            'h1, h2, h3, h4, h5',
                            'a[href*="torrent"], .download-link'
                        ]);
                        
                        const magnetLink = extractMagnet($item);
                        
                        if (magnetLink && title && title.length > 5) {
                            const quality = extractQuality(title);
                            const seeds = extractSeeds($item);
                            
                            streams.push({
                                name: `🎬 WatchSomuch`,
                                title: `${title}`,
                                url: magnetLink,
                                quality: quality,
                                seeds: seeds,
                                source: 'watchsomuch.to',
                                behaviorHints: {
                                    notWebReady: true,
                                    bingeGroup: 'watchsomuch'
                                }
                            });
                        }
                    } catch (itemError) {
                        // Skip this item
                    }
                });
                
                if (streams.length > 0) break;
            }
        }
        
        console.log(`✅ WatchSomuch found ${streams.length} streams`);
        return streams;
        
    } catch (error) {
        console.error('❌ WatchSomuch search error:', error.message);
        return [];
    }
}

// Generic search for other sources
async function searchGeneric(metadata, type, season, episode, config) {
    // You can add more sources here using the same pattern
    const sources = [
        // Add more torrent sites here if needed
        // { name: 'Site Name', url: 'https://example.com/search?q=', icon: '🔍' }
    ];
    
    const allStreams = [];
    
    for (const source of sources) {
        try {
            // Implement similar to above
            // const streams = await searchSpecificSource(source, metadata, type, season, episode);
            // allStreams.push(...streams);
        } catch (error) {
            console.error(`Generic source ${source.name} error:`, error.message);
        }
    }
    
    return allStreams;
}

// Helper functions
function extractText(element, selectors) {
    for (const selector of selectors) {
        const text = element.find(selector).first().text().trim();
        if (text && text.length > 3) {
            return text;
        }
    }
    return element.text().trim().split('\n')[0].trim();
}

function extractMagnet(element) {
    // Try multiple ways to find magnet links
    const magnetSelectors = [
        'a[href^="magnet:"]',
        '[data-magnet]',
        '.magnet-link',
        '.download-link[href*="magnet"]'
    ];
    
    for (const selector of magnetSelectors) {
        const link = element.find(selector).attr('href') || element.find(selector).data('magnet');
        if (link && link.startsWith('magnet:')) {
            return link;
        }
    }
    
    // Check if text contains magnet link
    const text = element.text();
    const magnetMatch = text.match(/magnet:\?[^\s"'<>]+/);
    return magnetMatch ? magnetMatch[0] : null;
}

function extractSeeds(element) {
    const seedSelectors = ['.seeds', '.seed', '[class*="seed"]', '.s'];
    for (const selector of seedSelectors) {
        const seedText = element.find(selector).text();
        const match = seedText.match(/(\d+)/);
        if (match) return parseInt(match[1]);
    }
    
    // Try to extract from text
    const text = element.text();
    const seedMatch = text.match(/(\d+)\s*seed/i);
    return seedMatch ? parseInt(seedMatch[1]) : 0;
}

function extractSize(element) {
    const sizeSelectors = ['.size', '.filesize', '[class*="size"]'];
    for (const selector of sizeSelectors) {
        const size = element.find(selector).text().trim();
        if (size && /\d+(\.\d+)?\s*(GB|MB|KB)/i.test(size)) {
            return size;
        }
    }
    
    // Try to extract from text
    const text = element.text();
    const sizeMatch = text.match(/(\d+(?:\.\d+)?\s*(?:GB|MB|KB))/i);
    return sizeMatch ? sizeMatch[1] : 'Unknown';
}

function extractQuality(title) {
    const qualityMap = {
        '2160p': '4K', '4k': '4K', 'uhd': '4K',
        '1080p': '1080p', 'fhd': '1080p',
        '720p': '720p', 'hd': '720p',
        '480p': '480p', 'sd': '480p'
    };
    
    const titleLower = title.toLowerCase();
    for (const [key, value] of Object.entries(qualityMap)) {
        if (titleLower.includes(key)) {
            return value;
        }
    }
    return 'Unknown';
}

function filterStreams(streams, config) {
    let filtered = streams.filter(stream => {
        // Filter by minimum seeds
        const minSeeds = config?.minSeeds || 5;
        if (stream.seeds < minSeeds) return false;
        
        // Filter by quality preference
        const preferredQuality = config?.quality || 'all';
        if (preferredQuality !== 'all' && stream.quality.toLowerCase() !== preferredQuality.toLowerCase()) {
            return false;
        }
        
        return true;
    });
    
    // Remove duplicates based on magnet hash
    const seen = new Set();
    filtered = filtered.filter(stream => {
        const hash = stream.url.match(/btih:([a-fA-F0-9]{40})/);
        if (hash) {
            const hashValue = hash[1].toLowerCase();
            if (seen.has(hashValue)) return false;
            seen.add(hashValue);
        }
        return true;
    });
    
    return filtered;
}

function sortStreams(streams) {
    const qualityOrder = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
    
    return streams.sort((a, b) => {
        // First by quality
        const qualityDiff = (qualityOrder[b.quality] || 0) - (qualityOrder[a.quality] || 0);
        if (qualityDiff !== 0) return qualityDiff;
        
        // Then by seeds
        return (b.seeds || 0) - (a.seeds || 0);
    });
}

async function makeRequest(url, options = {}) {
    const maxRetries = 3;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`🌐 Request to: ${url} (attempt ${i + 1})`);
            
            const response = await axios.get(url, {
                timeout: CONFIG.timeout,
                headers: {
                    'User-Agent': CONFIG.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1',
                },
                ...options
            });
            
            return response;
            
        } catch (error) {
            console.log(`❌ Request failed (${i + 1}/${maxRetries}): ${error.message}`);
            
            if (i === maxRetries - 1) throw error;
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

// For Vercel deployment
const addonInterface = builder.getInterface();

// Serve the addon (works for both local and Vercel)
if (require.main === module) {
    const express = require('express');
    const app = express();
    
    // Enable CORS
    app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', '*');
        next();
    });
    
    // Serve addon
    app.use('/', addonInterface);
    
    const port = process.env.PORT || 3000;
    app.listen(port, () => {
        console.log(`🚀 Addon running on port ${port}`);
        console.log(`📱 Add to Stremio: http://localhost:${port}/manifest.json`);
    });
}

// Export for Vercel
module.exports = (req, res) => {
    // Enable CORS for Vercel
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    return addonInterface(req, res);
};
