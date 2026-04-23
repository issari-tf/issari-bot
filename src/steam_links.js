const fs = require('fs');
const path = require('path');

const STEAM_LINKS_FILE = path.join(__dirname, 'steamLinks.json');

class SteamLinksManager {
    constructor() {
        this.data = this.load();
    }

    load() {
        try {
            if (fs.existsSync(STEAM_LINKS_FILE)) {
                return JSON.parse(fs.readFileSync(STEAM_LINKS_FILE, 'utf8'));
            }
        } catch (err) {
            console.error('Failed to load steamLinks.json:', err);
        }
        return {};
    }

    save() {
        fs.writeFileSync(STEAM_LINKS_FILE, JSON.stringify(this.data, null, 2));
    }

    link(username, steamId) {
        this.data[username] = steamId;
        this.save();
    }

    getSteamId(username) {
        return this.data[username] || null;
    }
}

module.exports = SteamLinksManager;