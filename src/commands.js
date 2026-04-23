const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('./config');
const imagePools = require('./image_pools');
const { fetchMinecraftStatus, fetchTF2Status } = require('./server_status');
const { sendGameTimePing } = require('./scheduled_pings');

function isAdmin(member) {
    if (!member) return false;
    if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) return true;
    return member.permissions.has('Administrator');
}

module.exports = (client, winTreeManager, steamLinksManager, leaderboardMessageId, refreshLeaderboard) => {
    const commands = {
        '!ping': {
            description: 'Responds with Pong! 🏓',
            execute: async (message) => message.reply('Pong! 🏓'),
        },
        '!mcplayers': {
            description: 'Show active Minecraft players.',
            execute: async (message) => {
                const embed = await fetchMinecraftStatus(null, imagePools.mc);
                await message.channel.send({ embeds: [embed] });
            },
        },
        '!cat': {
            description: 'Random cat image (optional text).',
            execute: async (message) => {
                const content = message.content.slice('!cat'.length).trim();
                const url = content ? `https://cataas.com/cat/says/${encodeURIComponent(content)}` : 'https://cataas.com/cat';
                await message.channel.send(url);
            },
        },
        '!donate': {
            description: 'Show donation links.',
            execute: async (message) => {
                const kofiEmbed = new EmbedBuilder()
                    .setTitle('☕ Support Us on Ko-fi!')
                    .setDescription('If you enjoy our content, consider supporting us on Ko-fi.')
                    .setColor('#FF5E5B')
                    .setThumbnail('https://cdn.ko-fi.com/cdn/kofi2.png')
                    .setTimestamp()
                    .setFooter({ text: 'Thank you for your support!' });
                const patreonEmbed = new EmbedBuilder()
                    .setTitle('💖 Support Us on Patreon!')
                    .setDescription('Become a patron and get exclusive perks.')
                    .setColor('#E85B46')
                    .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/7/7a/Patreon_logo.png')
                    .setTimestamp()
                    .setFooter({ text: 'Thank you for your support!' });
                const kofiButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Donate on Ko-fi').setStyle(ButtonStyle.Link).setURL(config.koFiLink));
                const patreonButton = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Support on Patreon').setStyle(ButtonStyle.Link).setURL(config.patreonLink));
                await message.channel.send({ embeds: [kofiEmbed], components: [kofiButton] });
                await message.channel.send({ embeds: [patreonEmbed], components: [patreonButton] });
            },
        },
        '!gametime': {
            description: '[Admin] Manually trigger the daily game time ping.',
            execute: async (message) => {
                if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
                await sendGameTimePing(client, message.client);
                await message.reply('✅ Game time ping sent!');
            },
        },
        '!recordwin': {
            description: '[Admin] Record that the winner beat the loser. Usage: !recordwin @winner @loser',
            execute: async (message) => {
                if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
                const mentions = message.mentions.users;
                if (mentions.size < 2) return message.reply('Please mention two players: `!recordwin @winner @loser`');
                const users = [...mentions.values()];
                const winner = users[0].username;
                const loser = users[1].username;
                if (winner === loser) return message.reply('Winner and loser must be different.');
                winTreeManager.addWin(winner, loser);
                await message.reply(`✅ Recorded **${winner}** beat **${loser}**.`);
                await refreshLeaderboard(client);
            },
        },
        '!wintree': {
            description: 'Display the hierarchical win/loss tree as a PNG image.',
            execute: async (message) => {
                const buffer = await winTreeManager.generateTreeImage();
                await message.channel.send({ files: [{ attachment: buffer, name: 'win-tree.png' }] });
            },
        },
        '!rank': {
            description: 'Display the ranked leaderboard as a PNG image.',
            execute: async (message) => {
                const buffer = await winTreeManager.generateLeaderboardImage(steamLinksManager);
                await message.channel.send({ files: [{ attachment: buffer, name: 'leaderboard.png' }] });
            },
        },
        '!linksteam': {
            description: 'Link your Steam account to your Discord username. Usage: !linksteam <steamid64>',
            execute: async (message) => {
                const parts = message.content.trim().split(/\s+/);
                const steamId = parts[1];
                if (!steamId || !/^\d{17}$/.test(steamId)) {
                    return message.reply('Invalid Steam ID. Provide a 17-digit SteamID64. Usage: `!linksteam 76561198XXXXXXXXX`');
                }
                steamLinksManager.link(message.author.username, steamId);
                await message.reply(`✅ Linked Steam ID \`${steamId}\` to **${message.author.username}**.`);
            },
        },
        '!setsteam': {
            description: '[Admin] Link a Steam ID to a Discord user. Usage: !setsteam @user <steamid64>',
            execute: async (message) => {
                if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
                const parts = message.content.trim().split(/\s+/);
                const steamId = parts[parts.length - 1];
                const mentioned = message.mentions.users.first();
                if (!mentioned || !/^\d{17}$/.test(steamId)) {
                    return message.reply('Usage: `!setsteam @user 76561198XXXXXXXXX`');
                }
                steamLinksManager.link(mentioned.username, steamId);
                await message.reply(`✅ Linked Steam ID \`${steamId}\` to **${mentioned.username}**.`);
            },
        },
        '!randomizewins': {
            description: '[Admin] Add random win relationships and refresh leaderboard.',
            execute: async (message) => {
                if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
                const added = winTreeManager.addRandomWins(5);
                await refreshLeaderboard(client);
                await message.reply(`✅ Added ${added} random win(s) and updated leaderboard.`);
            },
        },
        '!resetleaderboard': {
            description: '[Admin] Reset the win/loss tree to brand new dummy data.',
            execute: async (message) => {
                if (!isAdmin(message.member)) return message.reply('❌ Admin only.');
                winTreeManager.resetToDummy();
                await refreshLeaderboard(client);
                await message.reply('✅ Leaderboard reset to fresh dummy data.');
            },
        },
        '!help': {
            description: 'Show all commands.',
            execute: async (message) => {
                const embed = new EmbedBuilder().setTitle('📜 Bot Commands').setColor('#f1c40f').setDescription('Commands:').setTimestamp().setFooter(config.botFooter);
                for (const [cmd, obj] of Object.entries(commands)) embed.addFields({ name: cmd, value: obj.description, inline: false });
                await message.channel.send({ embeds: [embed] });
            },
        },
    };

    // Inject `refreshLeaderboard` into commands that need it (already done via closure).
    return commands;
};