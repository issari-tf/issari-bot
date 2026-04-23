const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, CanvasRenderingContext2D } = require('canvas');
const { getSteamAvatar, styleSteamAvatar } = require('./steam_helpers');
const config = require('./config');

const WIN_TREE_FILE = path.join(__dirname, 'winTree.json');

class WinTreeManager {
    constructor() {
        this.data = this.load();
        if (Object.keys(this.data).length === 0) {
            this.initDummyData();
        }
    }

    load() {
        try {
            if (fs.existsSync(WIN_TREE_FILE)) {
                return JSON.parse(fs.readFileSync(WIN_TREE_FILE, 'utf8'));
            }
        } catch (err) {
            console.error('Failed to load winTree.json:', err);
        }
        return {};
    }

    save() {
        fs.writeFileSync(WIN_TREE_FILE, JSON.stringify(this.data, null, 2));
    }

    initDummyData() {
        const numPlayers = 80;
        const playerNames = Array.from({ length: numPlayers }, (_, i) => `Player${i+1}`);
        const numRoots = 5;
        const maxDepth = 4;

        const adj = {};
        for (const name of playerNames) adj[name] = [];

        const depth = {};

        for (let i = 0; i < numRoots; i++) depth[playerNames[i]] = 0;

        for (let i = numRoots; i < numPlayers; i++) {
            const child = playerNames[i];
            const candidates = playerNames.slice(0, i).filter(p => depth[p] < maxDepth);
            if (candidates.length === 0) {
                depth[child] = 0;
                continue;
            }
            const parent = candidates[Math.floor(Math.random() * candidates.length)];
            adj[parent].push(child);
            depth[child] = depth[parent] + 1;
        }

        this.data = adj;
        this.save();
        console.log(`✅ Initialized dummy win/loss tree with ${numPlayers} players.`);
    }

    addWin(winner, loser) {
        if (!this.data[winner]) this.data[winner] = [];
        if (!this.data[winner].includes(loser)) {
            this.data[winner].push(loser);
            this.save();
        }
        if (!this.data[loser]) this.data[loser] = [];
        this.save();
    }

    addRandomWins(count) {
        const allPlayers = this.getAllPlayers();
        if (allPlayers.length < 2) return 0;
        let added = 0;
        for (let i = 0; i < count; i++) {
            let winner, loser;
            do {
                winner = allPlayers[Math.floor(Math.random() * allPlayers.length)];
                loser = allPlayers[Math.floor(Math.random() * allPlayers.length)];
            } while (winner === loser);
            if (!this.data[winner].includes(loser)) {
                this.addWin(winner, loser);
                added++;
            }
        }
        if (added > 0) console.log(`Added ${added} random win relationship(s).`);
        return added;
    }

    resetToDummy() {
        this.initDummyData();
    }

    getAllPlayers() {
        return Object.keys(this.data);
    }

    getStats() {
        const wins = {};
        const losses = {};
        for (const winner of this.getAllPlayers()) {
            wins[winner] = this.data[winner].length;
            for (const loser of this.data[winner]) {
                losses[loser] = (losses[loser] || 0) + 1;
            }
        }
        for (const player of this.getAllPlayers()) {
            if (!losses[player]) losses[player] = 0;
            if (!wins[player]) wins[player] = 0;
        }
        return { wins, losses };
    }

    getRankings() {
        const { wins, losses } = this.getStats();
        const players = this.getAllPlayers().map(p => ({
            name: p,
            wins: wins[p],
            losses: losses[p],
            ratio: wins[p] + losses[p] === 0 ? 0 : wins[p] / (wins[p] + losses[p])
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

    async generateTreeImage() {
        // ... (full existing method, unchanged) ...
        const adj = this.data;
        const allPlayers = Object.keys(adj);
        if (allPlayers.length === 0) {
            const canvas = createCanvas(800, 400);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ffd966';
            ctx.font = '32px "Segoe UI", Arial';
            ctx.fillText('🏆 No win/loss records yet.', 50, 200);
            return canvas.toBuffer();
        }

        const { wins, losses } = this.getStats();
        const rankMap = this.getRankings();

        const losersSet = new Set();
        for (const winner of allPlayers) {
            for (const loser of adj[winner]) losersSet.add(loser);
        }
        let roots = allPlayers.filter(p => !losersSet.has(p));
        if (roots.length === 0) {
            const canvas = createCanvas(800, 400);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ffaa55';
            ctx.font = '32px "Segoe UI", Arial';
            ctx.fillText('⚠️ Cycle detected – cannot display tree.', 50, 200);
            return canvas.toBuffer();
        }
        roots.sort((a, b) => rankMap.get(a) - rankMap.get(b));

        const depthMap = new Map();
        const queue = [];
        for (const root of roots) {
            depthMap.set(root, 0);
            queue.push(root);
        }
        while (queue.length) {
            const node = queue.shift();
            const depth = depthMap.get(node);
            for (const child of adj[node] || []) {
                if (!depthMap.has(child) || depthMap.get(child) > depth + 1) {
                    depthMap.set(child, depth + 1);
                    queue.push(child);
                }
            }
        }
        for (const node of allPlayers) {
            if (!depthMap.has(node)) depthMap.set(node, 0);
        }
        const maxDepth = Math.max(...depthMap.values());

        const nodesByDepth = new Map();
        for (const [node, depth] of depthMap.entries()) {
            if (!nodesByDepth.has(depth)) nodesByDepth.set(depth, []);
            nodesByDepth.get(depth).push(node);
        }
        for (const depth of nodesByDepth.keys()) {
            nodesByDepth.get(depth).sort((a, b) => rankMap.get(a) - rankMap.get(b));
        }

        let maxNodesPerDepth = 0;
        for (const depth of nodesByDepth.keys()) {
            maxNodesPerDepth = Math.max(maxNodesPerDepth, nodesByDepth.get(depth).length);
        }
        let nodeWidth = Math.max(140, 280 - Math.floor(maxNodesPerDepth / 5) * 12);
        let nodeHeight = Math.max(80, 130 - Math.floor(maxNodesPerDepth / 6) * 8);
        const horizontalSpacing = nodeWidth + 50;
        const verticalSpacing = nodeHeight + 60;
        const marginX = 100;
        const marginY = 100;

        let requiredWidth = marginX * 2;
        for (let d = 0; d <= maxDepth; d++) {
            const count = (nodesByDepth.get(d) || []).length;
            const widthNeeded = marginX + (count - 1) * horizontalSpacing + nodeWidth;
            if (widthNeeded > requiredWidth) requiredWidth = widthNeeded;
        }
        const canvasWidth = Math.min(5000, Math.max(1200, requiredWidth));
        const canvasHeight = marginY * 2 + (maxDepth + 1) * verticalSpacing;

        const canvas = createCanvas(canvasWidth, canvasHeight);
        const ctx = canvas.getContext('2d');

        const bgGrad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        bgGrad.addColorStop(0, '#0a0a1a');
        bgGrad.addColorStop(1, '#0f1123');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.strokeStyle = '#2c3e5033';
        ctx.lineWidth = 1;
        for (let y = 60; y < canvasHeight; y += 60) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvasWidth, y); ctx.stroke();
        }

        const positions = new Map();
        for (let d = 0; d <= maxDepth; d++) {
            const nodes = nodesByDepth.get(d) || [];
            const totalWidth = (nodes.length - 1) * horizontalSpacing;
            let startX = (canvasWidth - totalWidth) / 2;
            for (let i = 0; i < nodes.length; i++) {
                positions.set(nodes[i], {
                    x: startX + i * horizontalSpacing,
                    y: marginY + d * verticalSpacing
                });
            }
        }

        const drawArrow = (from, to) => {
            const fromX = from.x + nodeWidth / 2;
            const fromY = from.y + nodeHeight;
            const toX = to.x + nodeWidth / 2;
            const toY = to.y;
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            ctx.lineTo(toX, toY);
            ctx.strokeStyle = '#ffaa44';
            ctx.lineWidth = 2.5;
            ctx.shadowBlur = 6;
            ctx.shadowColor = '#ffaa4480';
            ctx.stroke();
            ctx.shadowBlur = 0;

            const angle = Math.atan2(toY - fromY, toX - fromX);
            const arrowSize = 10;
            const arrowX = toX - arrowSize * Math.cos(angle);
            const arrowY = toY - arrowSize * Math.sin(angle);
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - arrowSize * Math.cos(angle - Math.PI/6), arrowY - arrowSize * Math.sin(angle - Math.PI/6));
            ctx.lineTo(arrowX - arrowSize * Math.cos(angle + Math.PI/6), arrowY - arrowSize * Math.sin(angle + Math.PI/6));
            ctx.fillStyle = '#ffaa44';
            ctx.fill();
        };

        for (const [parent, children] of Object.entries(adj)) {
            const parentPos = positions.get(parent);
            if (!parentPos) continue;
            for (const child of children) {
                const childPos = positions.get(child);
                if (!childPos) continue;
                drawArrow(parentPos, childPos);
            }
        }

        for (const [node, pos] of positions.entries()) {
            const winCount = wins[node] || 0;
            const lossCount = losses[node] || 0;
            const totalGames = winCount + lossCount;
            const winRatio = totalGames === 0 ? 0 : winCount / totalGames;
            const rank = rankMap.get(node);

            const gradCard = ctx.createLinearGradient(pos.x, pos.y, pos.x + nodeWidth, pos.y + nodeHeight);
            if (winRatio >= 0.6) gradCard.addColorStop(0, '#1e3a2f');
            else if (winRatio >= 0.4) gradCard.addColorStop(0, '#3a2e1e');
            else gradCard.addColorStop(0, '#3a1e1e');
            gradCard.addColorStop(1, '#0f0f1a');

            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.roundRect(pos.x, pos.y, nodeWidth, nodeHeight, 12);
            ctx.fillStyle = gradCard;
            ctx.fill();
            ctx.strokeStyle = '#ffaa44';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;

            const medalRadius = Math.min(28, nodeWidth / 5);
            const medalX = pos.x + medalRadius + 5;
            const medalY = pos.y + medalRadius + 5;
            ctx.beginPath();
            ctx.arc(medalX, medalY, medalRadius, 0, Math.PI * 2);
            if (rank === 1) ctx.fillStyle = '#ffd700';
            else if (rank === 2) ctx.fillStyle = '#c0c0c0';
            else if (rank === 3) ctx.fillStyle = '#cd7f32';
            else ctx.fillStyle = '#2c3e50';
            ctx.fill();
            ctx.strokeStyle = '#ffffffcc';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            ctx.fillStyle = '#111';
            const fontSizeRank = Math.max(16, Math.min(24, medalRadius - 6));
            ctx.font = `bold ${fontSizeRank}px "Segoe UI", Arial`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`#${rank}`, medalX, medalY);

            const nameFontSize = Math.max(14, Math.min(22, nodeWidth / 12));
            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${nameFontSize}px "Segoe UI", Arial`;
            ctx.textAlign = 'center';
            ctx.fillText(node, pos.x + nodeWidth / 2, pos.y + nodeHeight / 2 - 8);

            const statsFontSize = Math.max(12, Math.min(18, nodeWidth / 14));
            ctx.font = `${statsFontSize}px "Segoe UI", Arial`;
            ctx.fillStyle = '#dddddd';
            const statsText = `🏆 ${winCount}   💀 ${lossCount}`;
            ctx.fillText(statsText, pos.x + nodeWidth / 2, pos.y + nodeHeight / 2 + 18);

            const barWidth = nodeWidth - 20;
            const barX = pos.x + 10;
            const barY = pos.y + nodeHeight - 12;
            ctx.fillStyle = '#2a2a3a';
            ctx.fillRect(barX, barY, barWidth, 5);
            const fillWidth = barWidth * Math.min(1, winRatio);
            const barGrad = ctx.createLinearGradient(barX, barY, barX + fillWidth, barY);
            if (winRatio >= 0.6) barGrad.addColorStop(0, '#81c784');
            else if (winRatio >= 0.4) barGrad.addColorStop(0, '#ffb74d');
            else barGrad.addColorStop(0, '#ef5350');
            barGrad.addColorStop(1, '#ffffff80');
            ctx.fillStyle = barGrad;
            ctx.fillRect(barX, barY, fillWidth, 5);
        }

        const headerHeight = 110;
        ctx.fillStyle = '#000000cc';
        ctx.fillRect(0, 0, canvasWidth, headerHeight);
        ctx.fillStyle = '#ffd966';
        ctx.font = `bold ${Math.min(48, canvasWidth / 20)}px "Segoe UI", Arial`;
        ctx.fillText('🏆 HIERARCHICAL RANKED PYRAMID', 60, 65);
        ctx.font = `${Math.min(18, canvasWidth / 35)}px "Segoe UI", Arial`;
        ctx.fillStyle = '#ccccdd';
        ctx.fillText('Arrow direction: winner → loser   │   Global rank based on wins, ratio, losses   │   Sorted by rank left to right', 60, 105);

        const now = new Date();
        const dateStr = now.toLocaleString();
        ctx.font = '14px monospace';
        ctx.fillStyle = '#888899';
        ctx.fillText(`Last updated: ${dateStr}`, canvasWidth - 280, canvasHeight - 20);

        return canvas.toBuffer();
    }

    async generateLeaderboardImage(steamLinksManager) {
        const { wins, losses } = this.getStats();
        const allPlayers = this.getAllPlayers();

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
            ratio: (wins[p] || 0) + (losses[p] || 0) === 0
                ? 0 : (wins[p] || 0) / ((wins[p] || 0) + (losses[p] || 0))
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

        // ── Background ──
        const bg = ctx.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, 960);
        bg.addColorStop(0, '#0e1535');
        bg.addColorStop(1, '#060810');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = '#ffffff04';
        ctx.lineWidth = 1;
        for (let x = 0; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        for (let y = 0; y < H; y += 80) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

        // ── Load avatars ──
        const avatarImages = new Map();
        if (config.steamApiKey) {
            await Promise.all(displayPlayers.map(async (player) => {
                const steamId = steamLinksManager.getSteamId(player.name);
                if (!steamId) return;
                try {
                    const url = await getSteamAvatar(steamId, config.steamApiKey);
                    const buf = await styleSteamAvatar(url, 128);
                    avatarImages.set(player.name, await loadImage(buf));
                } catch { /* default */ }
            }));
        }

        // ── Helpers ──
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

        // ── Header ──
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

        // ── Podium cards ──
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

        // ── Divider ──
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

        // ── Rankings (2 columns) ──
        const COL_W  = (W - 80) / 2;    // 920
        const COL_L  = 40;
        const COL_R  = W / 2 + 20;
        const SPLIT  = Math.ceil(rankPlayers.length / 2);
        const ROW_H  = rankPlayers.length === 0 ? 54
            : Math.min(58, Math.floor((RANK_H - 24) / Math.max(1, SPLIT)));
        const ROWS_Y = RANK_Y + 24;

        // stat offsets relative to col start
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

        // ── Footer ──
        ctx.fillStyle = '#000000cc';
        ctx.fillRect(0, FOOTER_Y, W, FOOTER_H);
        ctx.font = '14px monospace'; ctx.fillStyle = '#1e2d46'; ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText('IssariBot', 24, FOOTER_Y + 20);
        ctx.textAlign = 'right';
        ctx.fillText(
            `Updated: ${new Date().toLocaleString()}  •  Showing top ${displayPlayers.length} of ${allPlayers.length} players`,
            W - 24, FOOTER_Y + 20
        );

        return canvas.toBuffer();
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