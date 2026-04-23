const axios = require('axios');
const { createCanvas, loadImage } = require('canvas');

async function getSteamAvatar(steamId, apiKey) {
    const url = `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${apiKey}&steamids=${steamId}`;
    const response = await axios.get(url);
    const player = response.data.response.players[0];
    if (!player) throw new Error('Player not found');
    return player.avatarmedium;
}

async function styleSteamAvatar(imageUrl, size = 128) {
    const img = await loadImage(imageUrl);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, 0, 0, size, size);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd966';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    return canvas.toBuffer();
}

module.exports = { getSteamAvatar, styleSteamAvatar };