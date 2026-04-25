require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const imagePools = require('./image_pools');
const WinTreeManager = require('./leaderboard');
const SteamLinksManager = require('./steam_links');
const { fetchMinecraftStatus, fetchTF2Status } = require('./server_status');
const { startScheduledPings } = require('./scheduled_pings');
const buildCommands = require('./commands');

// ----------------------------------------------------------------------
//  Persistent Status Message IDs
// ----------------------------------------------------------------------
const STATUS_IDS_FILE = path.join(__dirname, 'statusMessages.json');
let statusMessageIds = { mc: null, tf0: null, tf1: null };

function loadStatusMessageIds() {
    try {
        if (fs.existsSync(STATUS_IDS_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATUS_IDS_FILE, 'utf8'));
            statusMessageIds = { ...statusMessageIds, ...data };
        }
    } catch (err) {
        console.error('Failed to load statusMessages.json:', err);
    }
}

function saveStatusMessageIds() {
    fs.writeFileSync(STATUS_IDS_FILE, JSON.stringify(statusMessageIds, null, 2));
}

// ----------------------------------------------------------------------
//  Leaderboard message persistence
// ----------------------------------------------------------------------
const LEADERBOARD_MSG_FILE = path.join(__dirname, 'leaderboardMessage.json');
let leaderboardMessageId = null;

function loadLeaderboardMessageId() {
    try {
        if (fs.existsSync(LEADERBOARD_MSG_FILE)) {
            const data = JSON.parse(fs.readFileSync(LEADERBOARD_MSG_FILE, 'utf8'));
            leaderboardMessageId = data.id;
        }
    } catch (err) { console.error('Failed to load leaderboardMessage.json:', err); }
}

function saveLeaderboardMessageId() {
    fs.writeFileSync(LEADERBOARD_MSG_FILE, JSON.stringify({ id: leaderboardMessageId }, null, 2));
}

// ----------------------------------------------------------------------
//  Refresh leaderboard function (used by commands and auto‑refresh)
// ----------------------------------------------------------------------
async function refreshLeaderboard(client) {
    const leaderboardChannel = await client.channels.fetch(config.leaderboardChannelId).catch(() => null);
    if (!leaderboardChannel || !leaderboardMessageId) return;
    const newBuffer = await winTreeManager.generateLeaderboardImage(steamLinksManager);
    try {
        const msg = await leaderboardChannel.messages.fetch(leaderboardMessageId);
        await msg.edit({ files: [{ attachment: newBuffer, name: 'leaderboard.png' }] });
        console.log('Leaderboard refreshed.');
    } catch (err) {
        console.error('Failed to edit leaderboard message, sending new one:', err);
        const newMsg = await leaderboardChannel.send({ files: [{ attachment: newBuffer, name: 'leaderboard.png' }] });
        leaderboardMessageId = newMsg.id;
        saveLeaderboardMessageId();
    }
}

// ----------------------------------------------------------------------
//  Database configuration (same as in databases.cfg)
// ----------------------------------------------------------------------
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'blue_stats',
    waitForConnections: true,
    connectionLimit: 5
};

// ----------------------------------------------------------------------
//  Create managers
// ----------------------------------------------------------------------
const steamLinksManager = new SteamLinksManager();  // may later be replaced with MySQL version
const winTreeManager = new WinTreeManager(dbConfig, steamLinksManager);
// ----------------------------------------------------------------------
//  Discord client setup
// ----------------------------------------------------------------------
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
});

// Build commands with dependencies
const commands = buildCommands(client, winTreeManager, steamLinksManager, leaderboardMessageId, refreshLeaderboard);

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}`);

    loadStatusMessageIds();

    // Send support embeds once to supporters channel
    const supportersChannel = await client.channels.fetch(config.supportersChannelId).catch(() => null);
    if (supportersChannel) {
        const fakeMessage = { channel: supportersChannel, reply: async (content) => supportersChannel.send(content) };
        await commands['!donate'].execute(fakeMessage);
    }

    const statusChannel = await client.channels.fetch(config.statusChannelId);
    if (!statusChannel) {
        console.error('Status channel not found!');
        return;
    }

    async function getOrCreateMessage(key, fetchFunction, ...args) {
        const storedId = statusMessageIds[key];
        if (storedId) {
            try {
                const msg = await statusChannel.messages.fetch(storedId);
                const embed = await fetchFunction(...args);
                await msg.edit({ embeds: [embed] });
                return msg;
            } catch (err) {
                console.log(`Could not find status message ${key} (${storedId}), sending new one.`);
            }
        }
        const embed = await fetchFunction(...args);
        const msg = await statusChannel.send({ embeds: [embed] });
        statusMessageIds[key] = msg.id;
        saveStatusMessageIds();
        return msg;
    }

    const mcMsg = await getOrCreateMessage('mc', fetchMinecraftStatus, null, imagePools.mc);
    const tfMsg0 = await getOrCreateMessage('tf0', fetchTF2Status, config.tfRcon0, null, imagePools.hightower, '');
    const tfMsg1 = await getOrCreateMessage('tf1', fetchTF2Status, config.tfRcon1, null, imagePools.vsh, '(VSH)');

    const mcAlertChannel = await client.channels.fetch(config.mcAlertChannelId).catch(() => null);
    const tfAlertChannel0 = await client.channels.fetch(config.tfAlertChannel0Id).catch(() => null);
    const tfAlertChannel1 = await client.channels.fetch(config.tfAlertChannel1Id).catch(() => null);

    let lastMcAlertSent = false, lastTf0AlertSent = false, lastTf1AlertSent = false;

    setInterval(async () => {
        // Minecraft
        const newMcEmbed = await fetchMinecraftStatus(mcAlertChannel, imagePools.mc);
        await mcMsg.edit({ embeds: [newMcEmbed] });
        const mcPlayers = newMcEmbed.data.fields?.find(f => f.name === '📋 Player List')?.value.split('\n').filter(l => l.startsWith('•')).length || 0;
        if (mcPlayers >= config.mcAlertThreshold && !lastMcAlertSent && mcAlertChannel) {
            await mcAlertChannel.send({ content: `<@&${config.activeRoleId}>`, embeds: [newMcEmbed], allowedMentions: { roles: [config.activeRoleId] } });
            lastMcAlertSent = true;
        } else if (mcPlayers < config.mcAlertThreshold && lastMcAlertSent) lastMcAlertSent = false;

        // TF2 HighTower
        const newTfEmbed0 = await fetchTF2Status(config.tfRcon0, tfAlertChannel0, imagePools.hightower, '');
        await tfMsg0.edit({ embeds: [newTfEmbed0] });
        const tf0Players = newTfEmbed0.data.fields?.find(f => f.name === '📋 Player List')?.value.split('\n').filter(l => l.startsWith('•')).length || 0;
        if (tf0Players >= config.tfAlertThreshold && !lastTf0AlertSent && tfAlertChannel0) {
            await tfAlertChannel0.send({ content: `<@&${config.activeRoleId}>`, embeds: [newTfEmbed0], allowedMentions: { roles: [config.activeRoleId] } });
            lastTf0AlertSent = true;
        } else if (tf0Players < config.tfAlertThreshold && lastTf0AlertSent) lastTf0AlertSent = false;

        // TF2 VSH
        const newTfEmbed1 = await fetchTF2Status(config.tfRcon1, tfAlertChannel1, imagePools.vsh, '(VSH)');
        await tfMsg1.edit({ embeds: [newTfEmbed1] });
        const tf1Players = newTfEmbed1.data.fields?.find(f => f.name === '📋 Player List')?.value.split('\n').filter(l => l.startsWith('•')).length || 0;
        if (tf1Players >= config.tfAlertThreshold && !lastTf1AlertSent && tfAlertChannel1) {
            await tfAlertChannel1.send({ content: `<@&${config.activeRoleId}>`, embeds: [newTfEmbed1], allowedMentions: { roles: [config.activeRoleId] } });
            lastTf1AlertSent = true;
        } else if (tf1Players < config.tfAlertThreshold && lastTf1AlertSent) lastTf1AlertSent = false;
    }, config.refreshIntervalMs);

    startScheduledPings(client);

    // ------------------------------------------------------------------
    //  LEADERBOARD PERSISTENT MESSAGE & AUTO REFRESH
    // ------------------------------------------------------------------
    const leaderboardChannel = await client.channels.fetch(config.leaderboardChannelId).catch(() => null);
    if (!leaderboardChannel) {
        console.warn(`Leaderboard channel ${config.leaderboardChannelId} not found. Skipping.`);
    } else {
        loadLeaderboardMessageId();
        let leaderboardMsg = null;
        if (leaderboardMessageId) {
            try {
                leaderboardMsg = await leaderboardChannel.messages.fetch(leaderboardMessageId);
            } catch (err) {
                console.log('Leaderboard message not found, will send new one.');
            }
        }
        if (!leaderboardMsg) {
            const buffer = await winTreeManager.generateLeaderboardImage(steamLinksManager);
            leaderboardMsg = await leaderboardChannel.send({ files: [{ attachment: buffer, name: 'leaderboard.png' }] });
            leaderboardMessageId = leaderboardMsg.id;
            saveLeaderboardMessageId();
        } else {
            const buffer = await winTreeManager.generateLeaderboardImage(steamLinksManager);
            await leaderboardMsg.edit({ files: [{ attachment: buffer, name: 'leaderboard.png' }] });
        }

        // Auto‑refresh: add 2-5 random wins every leaderboardRefreshMs
        setInterval(async () => {
            winTreeManager.addRandomWins(2 + Math.floor(Math.random() * 4));
            await refreshLeaderboard(client);
            console.log('Leaderboard auto‑refreshed with random wins.');
        }, config.leaderboardRefreshMs);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    const cmdName = Object.keys(commands).find(cmd => message.content === cmd || message.content.startsWith(`${cmd} `));
    if (cmdName) {
        try {
            await commands[cmdName].execute(message);
        } catch (err) {
            console.error(`Error executing ${cmdName}:`, err);
            await message.reply('Something went wrong.');
        }
    }
});

client.login(config.botToken);