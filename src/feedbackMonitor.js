// Forwards Discord activity to the Refuge server-control dashboard
// (apps/api's /api/internal/* routes) so it can be surfaced on the
// Community page: recent messages across the server + guild stats
// (member count, online count).

const REFUGE_API_URL = process.env.REFUGE_API_URL || 'http://127.0.0.1:4000';
const REFUGE_API_TOKEN = process.env.REFUGE_API_TOKEN || '';

async function postJson(path, body) {
    if (!REFUGE_API_TOKEN) return;
    try {
        const res = await fetch(`${REFUGE_API_URL}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${REFUGE_API_TOKEN}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            console.error(`[feedbackMonitor] POST ${path} -> ${res.status}`);
        }
    } catch (err) {
        console.error(`[feedbackMonitor] POST ${path} failed:`, err.message);
    }
}

/** Forward a non-bot guild message to the dashboard's community feed. */
async function recordMessage(message) {
    if (!message.guild || !message.content) return;
    await postJson('/api/internal/discord-messages', {
        messageId: message.id,
        guildId: message.guild.id,
        channelId: message.channel.id,
        channelName: 'name' in message.channel ? message.channel.name : 'unknown',
        authorId: message.author.id,
        authorName: message.author.tag ?? message.author.username,
        content: message.content,
        createdAt: message.createdTimestamp,
    });
}

/** Periodically push guild-wide stats (member count, presence count, icon). */
function startGuildStatsReporter(client, intervalMs = 5 * 60 * 1000) {
    async function report() {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        const fullGuild = await guild.fetch().catch(() => guild);
        await postJson('/api/internal/discord-guild', {
            guildId: fullGuild.id,
            guildName: fullGuild.name,
            memberCount: fullGuild.memberCount ?? fullGuild.approximateMemberCount ?? 0,
            presenceCount: fullGuild.approximatePresenceCount ?? null,
            iconUrl: fullGuild.iconURL ? fullGuild.iconURL() : null,
        });
    }
    report();
    setInterval(report, intervalMs);
}

module.exports = { recordMessage, startGuildStatsReporter };
