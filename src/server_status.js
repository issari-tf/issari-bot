const { Rcon } = require('rcon-client');
const { status } = require('minecraft-server-util');
const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const imagePools = require('./image_pools');

function getColorFromFill(current, max) {
    if (max === 0) return '#e74c3c';
    const ratio = current / max;
    if (ratio >= 0.5) return '#2ecc71';
    if (ratio >= 0.25) return '#f39c12';
    return '#e74c3c';
}

function formatPlayerList(players, maxDisplay = 20) {
    if (!players.length) return 'No one online';
    if (players.length <= maxDisplay) return players.map(p => `• ${p}`).join('\n');
    const shown = players.slice(0, maxDisplay).map(p => `• ${p}`).join('\n');
    return `${shown}\n*and ${players.length - maxDisplay} more...*`;
}

async function fetchMinecraftStatus(alertChannel = null, imageSource = null) {
    console.log('[Minecraft] Fetching status...');
    let playerCount = 0, maxPlayers = 0, players = [], serverOnline = true;
    try {
        const rcon = new Rcon(config.mcRcon);
        await rcon.connect();
        const response = await rcon.send('list');
        await rcon.end();
        const match = response.match(/There are (\d+) of a max(?: of)? (\d+) players online: ?(.*)/i);
        if (match) {
            playerCount = parseInt(match[1], 10);
            maxPlayers = parseInt(match[2], 10);
            players = match[3] ? match[3].split(',').map(p => p.trim()).filter(p => p) : [];
        } else throw new Error('Could not parse RCON list');
    } catch (rconErr) {
        console.warn('[Minecraft] RCON failed, fallback to ping:', rconErr.message);
        try {
            const result = await status(config.mcHost, config.mcPort, { timeout: 3000 });
            playerCount = result.players.online;
            maxPlayers = result.players.max;
            players = result.players.sample ? result.players.sample.map(p => p.name) : [];
        } catch (pingErr) {
            console.error('[Minecraft] Ping also failed:', pingErr.message);
            serverOnline = false;
        }
    }
    const color = serverOnline ? getColorFromFill(playerCount, maxPlayers) : '#e74c3c';
    let largeImageUrl;
    if (Array.isArray(imageSource) && imageSource.length) {
        largeImageUrl = imageSource[Math.floor(Math.random() * imageSource.length)];
    } else if (typeof imageSource === 'string') {
        largeImageUrl = imageSource;
    } else {
        largeImageUrl = serverOnline ? `https://mcapi.us/server/image?ip=${config.mcHost}&port=${config.mcPort}` : 'https://i.imgur.com/placeholder.png';
    }
    const embed = new EmbedBuilder()
        .setAuthor({ name: 'IssariCraft', iconURL: 'https://cdn-icons-png.flaticon.com/512/3316/3316737.png' })
        .setTitle('⛏️ Minecraft Server Status')
        .setURL(`https://mcsrvstat.us/server/${config.mcHost}`)
        .setColor(color)
        .setImage(largeImageUrl)
        .setThumbnail('https://cdn-icons-png.flaticon.com/512/3316/3316737.png')
        .addFields(
            { name: '📡 Server IP', value: `${config.mcHost}:${config.mcPort}`, inline: true },
            { name: '👥 Players', value: `${playerCount} / ${maxPlayers}`, inline: true },
            { name: '🟢 Status', value: serverOnline ? 'Online' : 'Offline', inline: true },
            { name: '📋 Player List', value: formatPlayerList(players), inline: false }
        )
        .setTimestamp()
        .setFooter(config.botFooter);
    if (alertChannel && players.length >= config.mcAlertThreshold) {
        await alertChannel.send({ content: `<@&${config.activeRoleId}>`, embeds: [embed], allowedMentions: { roles: [config.activeRoleId] } });
    }
    return embed;
}

async function fetchTF2Status(rconConfig, channelForAlerts = null, mapImageSource = null, serverLabel = '') {
    try {
        const rcon = new Rcon(rconConfig);
        await rcon.connect();
        const response = await rcon.send('status');
        await rcon.end();
        const playerLines = response.split('\n').filter(line => /^#\s+\d+/.test(line));
        const players = playerLines.map(line => {
            const parts = line.trim().split(/\s+/);
            return parts[2]?.replace(/^"|"$/g, '') || 'Unknown';
        }).filter(Boolean);
        const hostnameMatch = response.match(/hostname:\s(.+)/i);
        const hostname = hostnameMatch ? hostnameMatch[1] : 'Unknown Host';
        const mapMatch = response.match(/map\s+:\s(\S+)/i);
        const mapName = mapMatch ? mapMatch[1] : 'Unknown Map';
        const maxPlayersMatch = response.match(/maxplayers\s+:\s(\d+)/i);
        const maxPlayers = maxPlayersMatch ? parseInt(maxPlayersMatch[1], 10) : 100;
        let largeImageUrl;
        if (Array.isArray(mapImageSource) && mapImageSource.length) {
            largeImageUrl = mapImageSource[Math.floor(Math.random() * mapImageSource.length)];
        } else if (typeof mapImageSource === 'string') {
            largeImageUrl = mapImageSource;
        } else {
            largeImageUrl = `https://teamwork.tf/images/map_context/${mapName}/overview_0.jpg`;
        }
        const color = getColorFromFill(players.length, maxPlayers);
        const embed = new EmbedBuilder()
            .setAuthor({ name: hostname, iconURL: 'https://wiki.teamfortress.com/w/images/thumb/9/9e/TF2_logo.svg/200px-TF2_logo.svg.png' })
            .setTitle(`🔫 Team Fortress 2 ${serverLabel}`)
            .setColor(color)
            .setImage(largeImageUrl)
            .setThumbnail('https://wiki.teamfortress.com/w/images/thumb/9/9e/TF2_logo.svg/200px-TF2_logo.svg.png')
            .addFields(
                { name: '🌐 Server IP', value: `${rconConfig.host}:${rconConfig.port}`, inline: true },
                { name: '🗺️ Current Map', value: mapName, inline: true },
                { name: '👥 Players', value: `${players.length} / ${maxPlayers}`, inline: true },
                { name: '📋 Player List', value: formatPlayerList(players), inline: false }
            )
            .setTimestamp()
            .setFooter(config.botFooter);
        if (channelForAlerts && players.length >= config.tfAlertThreshold) {
            await channelForAlerts.send({ content: `<@&${config.activeRoleId}>`, embeds: [embed], allowedMentions: { roles: [config.activeRoleId] } });
        }
        return embed;
    } catch (err) {
        console.error(`TF2 RCON Error for ${rconConfig.host}:`, err);
        return new EmbedBuilder()
            .setTitle('❌ TF2 Server Status')
            .setColor('#e74c3c')
            .setDescription('Could not fetch server status – RCON may be unreachable or password wrong.')
            .setFooter(config.botFooter)
            .setTimestamp();
    }
}

module.exports = { fetchMinecraftStatus, fetchTF2Status };