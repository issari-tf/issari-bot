const config = require('./config');

let lastPingDate = null;

async function sendGameTimePing(client, targetDate = null) {
    const now = targetDate || new Date();
    const { timezone, channelId, roleIds, messages } = config.schedule;
    if (!messages || messages.length === 0) {
        console.error('No messages defined in schedule.messages');
        return;
    }
    const dayIndex = now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long' }).toLowerCase();
    const roleId = roleIds[dayIndex];
    if (!roleId) {
        console.warn(`No role ID configured for ${dayIndex}`);
        return;
    }
    const channel = await client.channels.fetch(channelId).catch(err => console.error('Ping channel not found:', err));
    if (!channel) return;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const pingMessage = randomMessage.replace('{role}', `<@&${roleId}>`);
    await channel.send(pingMessage);
    console.log(`Game time ping sent for ${dayIndex} with message: "${randomMessage}"`);
}

function startScheduledPings(client) {
    if (!config.schedule.enabled) return;
    const { time, timezone } = config.schedule;
    const [targetHour, targetMinute] = time.split(':').map(Number);
    setInterval(async () => {
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false });
        const currentTime = formatter.format(now);
        const [currentHour, currentMinute] = currentTime.split(':').map(Number);
        if (currentHour === targetHour && currentMinute === targetMinute) {
            const today = now.toLocaleDateString('en-US', { timeZone: timezone });
            if (lastPingDate === today) return;
            await sendGameTimePing(client, now);
            lastPingDate = today;
        }
    }, 60 * 1000);
}

module.exports = { sendGameTimePing, startScheduledPings };