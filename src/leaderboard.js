const mysql = require('mysql2/promise');
const { createCanvas, loadImage, CanvasRenderingContext2D } = require('canvas');
const { getSteamAvatar, styleSteamAvatar } = require('./steam_helpers');
const config = require('./config');

// Add roundRect polyfill immediately after requiring canvas
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}
class WinTreeManager {
    constructor(dbConfig, steamLinksManager) {
        this.dbConfig = dbConfig;
        this.steamLinks = steamLinksManager;
        this.pool = null;
        this.cache = {
            stats: null,
            lastFetch: 0
        };
    }

    async connect() {
        if (!this.pool) {
            this.pool = mysql.createPool(this.dbConfig);
        }
        return this.pool;
    }

    async getStats() {
        // Cache for 30 seconds
        const now = Date.now();
        if (this.cache.stats && (now - this.cache.lastFetch) < 30000) {
            return this.cache.stats;
        }

        const pool = await this.connect();
        const [rows] = await pool.query('SELECT steamid, wins, losses FROM player_stats');
        
        const wins = {};
        const losses = {};
        
        for (const row of rows) {
            const steamId = row.steamid;
            // Convert SteamID2 (STEAM_0:X:XXXXXX) to SteamID64 if needed by avatar API
            // The avatar helper may expect SteamID64; adjust accordingly.
            const playerName = await this.steamLinks.getName(steamId) || steamId;
            wins[playerName] = row.wins;
            losses[playerName] = row.losses;
        }
        
        const result = { wins, losses };
        this.cache.stats = result;
        this.cache.lastFetch = now;
        return result;
    }

    async getAllPlayers() {
        const { wins } = await this.getStats();
        return Object.keys(wins);
    }

    async getRankings() {
        const { wins, losses } = await this.getStats();
        const players = Object.keys(wins).map(name => ({
            name,
            wins: wins[name],
            losses: losses[name],
            ratio: wins[name] + losses[name] === 0 ? 0 : wins[name] / (wins[name] + losses[name])
        }));
        
        players.sort((a, b) => {
            if (a.wins !== b.wins) return b.wins - a.wins;
            if (a.ratio !== b.ratio) return b.ratio - a.ratio;
            return a.losses - b.losses;
        });
        
        const rankMap = new Map();
        players.forEach((p, idx) => rankMap.set(p.name, idx + 1));
        return rankMap;
    }

    async generateLeaderboardImage(steamLinksManager) {
        const { wins, losses } = await this.getStats();
        const allPlayers = await this.getAllPlayers();
        const W = 1920, H = 1080;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        if (allPlayers.length === 0) {
            ctx.fillStyle = '#060810';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 56px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('No win/loss records yet.', W / 2, H / 2);
            return canvas.toBuffer();
        }

        const players = allPlayers.map(p => ({
            name: p,
            wins: wins[p] || 0,
            losses: losses[p] || 0,
            ratio: (wins[p] || 0) + (losses[p] || 0) === 0 ? 0 : (wins[p] || 0) / ((wins[p] || 0) + (losses[p] || 0))
        })).sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (b.ratio !== a.ratio) return b.ratio - a.ratio;
            return a.losses - b.losses;
        });

        const displayPlayers = players.slice(0, 20);
        const podiumPlayers = displayPlayers.slice(0, 3);
        const rankPlayers   = displayPlayers.slice(3);

        // Layout zones
        const HEADER_H  = 140;
        const PODIUM_Y  = HEADER_H;
        const PODIUM_H  = 350;
        const DIVIDER_Y = PODIUM_Y + PODIUM_H;
        const DIVIDER_H = 38;
        const RANK_Y    = DIVIDER_Y + DIVIDER_H;
        const FOOTER_H  = 40;
        const FOOTER_Y  = H - FOOTER_H;
        const RANK_H    = FOOTER_Y - RANK_Y;

        // Background
        const bg = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, 960);
        bg.addColorStop(0, '#0e1535');
        bg.addColorStop(1, '#060810');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        // Grid
        ctx.strokeStyle = '#ffffff04';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        // Load avatars
        const avatarImages = new Map();
        if (config.steamApiKey) {
            await Promise.all(displayPlayers.map(async (player) => {
                const steamId = await this.steamLinks.getSteamId(player.name);
                if (!steamId) return;
                try {
                    const url = await getSteamAvatar(steamId, config.steamApiKey);
                    const buf = await styleSteamAvatar(url, 128);
                    avatarImages.set(player.name, await loadImage(buf));
                } catch { /* use default */ }
            }));
        }

        // Helpers
        const drawAvatar = (name, cx, cy, r) => {
            const img = avatarImages.get(name);
            if (img) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.clip();
                ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
                ctx.restore();
            } else {
                const hue = (name.charCodeAt(0) * 47) % 360;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = `hsl(${hue}, 42%, 22%)`;
                ctx.fill();
                ctx.fillStyle = '#ffffffaa';
                ctx.font = `bold ${Math.round(r * 0.72)}px Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(name[0].toUpperCase(), cx, cy + 1);
            }
        };

        const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
        const winBar = (bx, by, bw, bh, ratio) => {
            rr(bx, by, bw, bh, bh / 2);
            ctx.fillStyle = '#111928';
            ctx.fill();
            if (ratio > 0) {
                const fw = bw * Math.min(1, ratio);
                const g = ctx.createLinearGradient(bx, 0, bx + fw, 0);
                if (ratio >= 0.6) { g.addColorStop(0, '#43a047'); g.addColorStop(1, '#a5d6a7'); }
                else if (ratio >= 0.4) { g.addColorStop(0, '#f57c00'); g.addColorStop(1, '#ffcc80'); }
                else { g.addColorStop(0, '#e53935'); g.addColorStop(1, '#ef9a9a'); }
                ctx.fillStyle = g;
                rr(bx, by, fw, bh, bh / 2);
                ctx.fill();
            }
        };

        // Header
        const hGrad = ctx.createLinearGradient(0, 0, 0, HEADER_H);
        hGrad.addColorStop(0, '#000000f2');
        hGrad.addColorStop(1, '#0a0d1e99');
        ctx.fillStyle = hGrad;
        ctx.fillRect(0, 0, W, HEADER_H);
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 64px Arial';
        ctx.textAlign = 'left';
        ctx.fillText('⚔  TOURNAMENT STANDINGS', 60, 92);
        ctx.font = '21px Arial';
        ctx.fillStyle = '#556688';
        ctx.fillText('Ranked by wins  •  win ratio  •  fewest losses', 66, 127);
        ctx.textAlign = 'right';
        ctx.font = 'bold 26px Arial';
        ctx.fillStyle = '#ffd70077';
        ctx.fillText('SEASON 1', W - 60, 75);
        ctx.font = '19px Arial';
        ctx.fillStyle = '#334466';
        ctx.fillText(`${allPlayers.length} players  •  ${new Date().toLocaleDateString()}`, W - 60, 112);

        const hLine = ctx.createLinearGradient(0, 0, W, 0);
        hLine.addColorStop(0, '#00000000'); hLine.addColorStop(0.15, '#ffd700cc');
        hLine.addColorStop(0.5, '#ff8800cc'); hLine.addColorStop(0.85, '#ffd700cc');
        hLine.addColorStop(1, '#00000000');
        ctx.strokeStyle = hLine; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, HEADER_H - 1); ctx.lineTo(W, HEADER_H - 1); ctx.stroke();

        // Podium
        const MEDAL = ['#ffd700', '#c0c0c0', '#cd7f32'];
        const GLOW  = ['#ffd70060', '#c0c0c055', '#cd7f3255'];
        const TINT  = ['#150f00cc', '#0d1218cc', '#110900cc'];
        const C1   = { w: 600, h: 320 };
        const C23  = { w: 510, h: 278 };
        const GAP  = 36;
        const podiumBottom = PODIUM_Y + PODIUM_H - 8;
        const c1y  = podiumBottom - C1.h;
        const c23y = podiumBottom - C23.h + 14;
        const c1x  = (W - C1.w) / 2;
        const c2x  = c1x - C23.w - GAP;
        const c3x  = c1x + C1.w + GAP;

        const drawPodiumCard = (player, rank, cx, cy, cw, ch) => {
            const mc = MEDAL[rank - 1], gc = GLOW[rank - 1], tc = TINT[rank - 1];
            ctx.shadowColor = gc; ctx.shadowBlur = 40;
            rr(cx, cy, cw, ch, 18); ctx.fillStyle = tc; ctx.fill();
            ctx.shadowBlur = 0;
            const cg = ctx.createLinearGradient(cx, cy, cx, cy + ch);
            cg.addColorStop(0, '#ffffff0d'); cg.addColorStop(1, '#00000000');
            rr(cx, cy, cw, ch, 18); ctx.fillStyle = cg; ctx.fill();
            rr(cx, cy, cw, ch, 18);
            const bg2 = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch);
            bg2.addColorStop(0, mc + 'dd'); bg2.addColorStop(0.5, mc + '44'); bg2.addColorStop(1, mc + 'dd');
            ctx.strokeStyle = bg2; ctx.lineWidth = rank === 1 ? 3 : 2; ctx.stroke();

            const avR  = rank === 1 ? 62 : 50;
            const avCx = cx + cw / 2;
            const avCy = cy + avR + 32;
            ctx.beginPath(); ctx.arc(avCx, avCy, avR + 6, 0, Math.PI * 2);
            ctx.strokeStyle = mc; ctx.lineWidth = rank === 1 ? 4 : 3; ctx.stroke();
            ctx.shadowColor = gc; ctx.shadowBlur = 22;
            drawAvatar(player.name, avCx, avCy, avR);
            ctx.shadowBlur = 0;

            const bR = rank === 1 ? 24 : 20;
            const bx = avCx + avR * 0.68, by = avCy + avR * 0.68;
            ctx.beginPath(); ctx.arc(bx, by, bR, 0, Math.PI * 2);
            ctx.fillStyle = mc; ctx.fill();
            ctx.strokeStyle = '#06080f'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = '#111'; ctx.font = `bold ${rank === 1 ? 22 : 18}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`#${rank}`, bx, by);

            const nameY = avCy + avR + 26;
            ctx.fillStyle = '#ffffff'; ctx.font = `bold ${rank === 1 ? 32 : 26}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
            let dn = player.name;
            while (ctx.measureText(dn).width > cw - 50 && dn.length > 3) dn = dn.slice(0, -1);
            if (dn !== player.name) dn += '…';
            ctx.fillText(dn, avCx, nameY);

            const pct  = Math.round(player.ratio * 100);
            const sY   = nameY + (rank === 1 ? 42 : 34);
            const gap2 = rank === 1 ? 100 : 80;
            ctx.font = `bold ${rank === 1 ? 20 : 17}px Arial`;
            ctx.fillStyle = '#4fc97a'; ctx.fillText(`W: ${player.wins}`, avCx - gap2, sY);
            ctx.fillStyle = '#f06060'; ctx.fillText(`L: ${player.losses}`, avCx, sY);
            ctx.fillStyle = player.ratio >= 0.6 ? '#4fc97a' : player.ratio >= 0.4 ? '#f0a020' : '#f06060';
            ctx.fillText(`${pct}%`, avCx + gap2, sY);
            winBar(cx + 28, cy + ch - 28, cw - 56, 7, player.ratio);
        };

        if (podiumPlayers.length >= 2) drawPodiumCard(podiumPlayers[1], 2, c2x, c23y, C23.w, C23.h);
        if (podiumPlayers.length >= 3) drawPodiumCard(podiumPlayers[2], 3, c3x, c23y, C23.w, C23.h);
        if (podiumPlayers.length >= 1) drawPodiumCard(podiumPlayers[0], 1, c1x, c1y, C1.w, C1.h);

        // Divider
        ctx.fillStyle = '#000000bb';
        ctx.fillRect(0, DIVIDER_Y, W, DIVIDER_H);
        const dvMid = DIVIDER_Y + DIVIDER_H / 2;
        const dvLabel = '◆  FULL STANDINGS  ◆';
        ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffd70088';
        ctx.fillText(dvLabel, W / 2, dvMid);
        const lhw = ctx.measureText(dvLabel).width / 2 + 30;
        const dL = ctx.createLinearGradient(60, 0, W / 2 - lhw, 0);
        dL.addColorStop(0, '#00000000'); dL.addColorStop(1, '#ffd70066');
        ctx.strokeStyle = dL; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(60, dvMid); ctx.lineTo(W / 2 - lhw, dvMid); ctx.stroke();
        const dR = ctx.createLinearGradient(W / 2 + lhw, 0, W - 60, 0);
        dR.addColorStop(0, '#ffd70066'); dR.addColorStop(1, '#00000000');
        ctx.strokeStyle = dR;
        ctx.beginPath(); ctx.moveTo(W / 2 + lhw, dvMid); ctx.lineTo(W - 60, dvMid); ctx.stroke();

        // Rankings (2 columns)
        const COL_W  = (W - 80) / 2;    // 920
        const COL_L  = 40;
        const COL_R  = W / 2 + 20;
        const SPLIT  = Math.ceil(rankPlayers.length / 2);
        const ROW_H  = rankPlayers.length === 0 ? 54
            : Math.min(58, Math.floor((RANK_H - 24) / Math.max(1, SPLIT)));
        const ROWS_Y = RANK_Y + 24;

        const SO = { w: 510, l: 640, r: 770 };

        for (const colX of [COL_L, COL_R]) {
            ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
            ctx.textBaseline = 'middle'; ctx.fillStyle = '#283550';
            ctx.fillText('WINS',   colX + SO.w, RANK_Y + 12);
            ctx.fillText('LOSSES', colX + SO.l, RANK_Y + 12);
            ctx.fillText('RATE',   colX + SO.r, RANK_Y + 12);
        }

        for (let i = 0; i < rankPlayers.length; i++) {
            const player = rankPlayers[i];
            const rank   = i + 4;
            const col    = i < SPLIT ? 0 : 1;
            const ri     = i < SPLIT ? i : i - SPLIT;
            const rx     = col === 0 ? COL_L : COL_R;
            const ry     = ROWS_Y + ri * ROW_H;
            const mid    = ry + ROW_H / 2;

            if (ri % 2 === 0) { ctx.fillStyle = '#ffffff04'; ctx.fillRect(rx, ry, COL_W, ROW_H); }

            // rank badge
            ctx.beginPath(); ctx.arc(rx + 22, mid, 17, 0, Math.PI * 2);
            ctx.fillStyle = '#10172a'; ctx.fill();
            ctx.strokeStyle = '#233050'; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.fillStyle = '#6677aa';
            ctx.font = `bold ${rank < 10 ? 13 : 11}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`#${rank}`, rx + 22, mid);

            // avatar
            const avCx = rx + 60;
            drawAvatar(player.name, avCx, mid, 20);
            ctx.beginPath(); ctx.arc(avCx, mid, 20, 0, Math.PI * 2);
            ctx.strokeStyle = '#243452'; ctx.lineWidth = 1.5; ctx.stroke();

            // name
            ctx.fillStyle = '#dde1ea'; ctx.font = 'bold 17px Arial';
            ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            let dn = player.name;
            while (ctx.measureText(dn).width > 390 && dn.length > 3) dn = dn.slice(0, -1);
            if (dn !== player.name) dn += '…';
            ctx.fillText(dn, rx + 90, mid - 7);

            // bar
            winBar(rx + 90, mid + 9, 390, 4, player.ratio);

            // stats
            const s1 = mid - 7, s2 = mid + 10;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.font = 'bold 19px Arial'; ctx.fillStyle = '#4fc97a';
            ctx.fillText(String(player.wins), rx + SO.w, s1);
            ctx.font = '11px Arial'; ctx.fillStyle = '#253448';
            ctx.fillText('wins', rx + SO.w, s2);
            ctx.font = 'bold 19px Arial'; ctx.fillStyle = '#f06060';
            ctx.fillText(String(player.losses), rx + SO.l, s1);
            ctx.font = '11px Arial'; ctx.fillStyle = '#253448';
            ctx.fillText('losses', rx + SO.l, s2);
            const pct = Math.round(player.ratio * 100);
            ctx.font = 'bold 19px Arial';
            ctx.fillStyle = player.ratio >= 0.6 ? '#4fc97a' : player.ratio >= 0.4 ? '#f0a020' : '#f06060';
            ctx.fillText(`${pct}%`, rx + SO.r, s1);
            ctx.font = '11px Arial'; ctx.fillStyle = '#253448';
            ctx.fillText('rate', rx + SO.r, s2);

            ctx.strokeStyle = '#ffffff09'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(rx, ry + ROW_H); ctx.lineTo(rx + COL_W, ry + ROW_H); ctx.stroke();
        }

        // column separator
        ctx.strokeStyle = '#192038'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(W / 2, RANK_Y); ctx.lineTo(W / 2, FOOTER_Y); ctx.stroke();

        // Footer
        ctx.fillStyle = '#000000cc';
        ctx.fillRect(0, FOOTER_Y, W, FOOTER_H);
        ctx.font = '14px monospace'; ctx.fillStyle = '#1e2d46'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('IssariBot', 24, FOOTER_Y + 20);
        ctx.textAlign = 'right';
        ctx.fillText(`Updated: ${new Date().toLocaleString()}  •  Showing top ${displayPlayers.length} of ${allPlayers.length} players`, W - 24, FOOTER_Y + 20);

        return canvas.toBuffer();
    }

    // Optional: method to manually update a win (if bot should also write to DB)
    async addWin(winnerName, loserName) {
        const winnerSteam = await this.steamLinks.getSteamId(winnerName);
        const loserSteam = await this.steamLinks.getSteamId(loserName);
        if (!winnerSteam || !loserSteam) throw new Error('Unknown player');
        const pool = await this.connect();
        // Increment winner's wins, loser's losses
        await pool.query(
            'INSERT INTO player_stats (steamid, wins, losses) VALUES (?, 1, 0) ON DUPLICATE KEY UPDATE wins = wins + 1',
            [winnerSteam]
        );
        await pool.query(
            'INSERT INTO player_stats (steamid, wins, losses) VALUES (?, 0, 1) ON DUPLICATE KEY UPDATE losses = losses + 1',
            [loserSteam]
        );
        this.cache.stats = null; // invalidate cache
    }

    async close() {
        if (this.pool) await this.pool.end();
    }
}

// roundRect polyfill
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x + r, y);
        this.lineTo(x + w - r, y);
        this.quadraticCurveTo(x + w, y, x + w, y + r);
        this.lineTo(x + w, y + h - r);
        this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        this.lineTo(x + r, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - r);
        this.lineTo(x, y + r);
        this.quadraticCurveTo(x, y, x + r, y);
        return this;
    };
}

module.exports = WinTreeManager;