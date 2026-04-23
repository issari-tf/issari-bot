require('dotenv').config();

module.exports = {
    botToken: process.env.BOT_TOKEN,
    steamApiKey: process.env.STEAM_API_KEY || '',
    mcRcon: {
        host: process.env.MC_RCON_HOST,
        port: parseInt(process.env.MC_RCON_PORT),
        password: process.env.MC_RCON_PASS,
    },
    tfRcon0: {
        host: process.env.TF_RCON_HOST0,
        port: parseInt(process.env.TF_RCON_PORT0),
        password: process.env.TF_RCON_PASS0,
    },
    tfRcon1: {
        host: process.env.TF_RCON_HOST1,
        port: parseInt(process.env.TF_RCON_PORT1),
        password: process.env.TF_RCON_PASS1,
    },
    mcHost: process.env.MC_HOST || process.env.MC_RCON_HOST,
    mcPort: parseInt(process.env.MC_PORT || '25565', 10),

    statusChannelId: process.env.STATUS_CHANNEL_ID || '1414485330635001927',
    supportersChannelId: process.env.SUPPORTERS_CHANNEL_ID || '1398892513300975697',
    mcAlertChannelId: process.env.MC_ALERT_CHANNEL_ID || '1414156803528462399',
    tfAlertChannel0Id: process.env.TF_ALERT_CHANNEL0_ID || '1414160528774922293',
    tfAlertChannel1Id: process.env.TF_ALERT_CHANNEL1_ID || '1414160473389006848',

    activeRoleId: process.env.ACTIVE_ROLE_ID || '1353720821792899182',
    adminRoleId: process.env.ADMIN_ROLE_ID || '',

    refreshIntervalMs: parseInt(process.env.REFRESH_INTERVAL_MS, 10) || 60 * 1000,
    mcAlertThreshold: parseInt(process.env.MC_ALERT_THRESHOLD, 10) || 3,
    tfAlertThreshold: parseInt(process.env.TF_ALERT_THRESHOLD, 10) || 5,

    koFiLink: 'https://ko-fi.com/asanders',
    patreonLink: 'https://www.patreon.com/refugestudios',
    botFooter: { text: 'IssariBot', iconURL: 'https://i.imgur.com/7B4sXnL.png' },

    schedule: {
        enabled: true,
        time: "19:30",
        timezone: "Australia/Adelaide",
        channelId: "1414485330635001927",
        roleIds: {
            monday:    '1358009604117893240',
            tuesday:   '1358009670845071410',
            wednesday: '1358009742361886930',
            thursday:  '1358009789468246147',
            friday:    '1358009812914536478',
            saturday:  '1358009837132451862',
            sunday:    '1358009893621072027'
        },
        messages: [
            "{role} touch grass later, log in now",
            "{role} your excuses aren’t valid today",
            "{role} this is your sign",
            "{role} we summoned you",
            "{role} controller/keyboard. now."
        ]
    },

    // Leaderboard auto‑refresh
    leaderboardChannelId: process.env.LEADERBOARD_CHANNEL_ID || '1496902267033620701',
    leaderboardRefreshMs: parseInt(process.env.LEADERBOARD_REFRESH_MS, 10) || 5 * 60 * 1000,
};