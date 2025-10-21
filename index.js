require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const { Rcon } = require('rcon-client');
const { status } = require('minecraft-server-util');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const MINECRAFT_RCON = {
  host:     process.env.MC_RCON_HOST,
  port:     process.env.MC_RCON_PORT,
  password: process.env.MC_RCON_PASS,
};

const TF_RCON0 = {
  host:     process.env.TF_RCON_HOST0,
  port:     process.env.TF_RCON_PORT0,
  password: process.env.TF_RCON_PASS0,
};

const TF_RCON1 = {
  host:     process.env.TF_RCON_HOST1,
  port:     process.env.TF_RCON_PORT1,
  password: process.env.TF_RCON_PASS1,
};

const SERVER_HOST = process.env.MC_HOST || MINECRAFT_RCON.host;
const SERVER_PORT = parseInt(process.env.MC_PORT || 25565, 10);

// --- Configuration ---
// Discord config
const STATUS_CHANNEL_ID = '1414485330635001927'; // Channel where the embed will be posted
const REFRESH_INTERVAL = 1 * 60 * 1000; // 10 minutes in milliseconds
const BOT_FOOTER = { text: 'IssariBot', iconURL: 'https://i.imgur.com/7B4sXnL.png' };

const KO_FI_LINK = 'https://ko-fi.com/asanders';
const PATREON_LINK = 'https://www.patreon.com/refugestudios';
const SUPPORTERS_CHANNEL_ID = '1398892513300975697';

const TF_CHANNEL0_GENERAL = '1414160528774922293'; // VSH
const TF_CHANNEL1_GENERAL = '1414160473389006848'; // HighTower
const MC_CHANNEL0_GENERAL = '1414156803528462399'; // Minecraft

const ACTIVE_ROLE_ID = '1353720821792899182'; // @active players

let MCAlertSent0 = false; // tracks if we've pinged
let TFAlertSent0 = false; // tracks if we've pinged
let TFAlertSent1 = false; // tracks if we've pinged


async function sendSupportEmbeds(client, message = null) {
  try {
    const channel = message ? message.channel : await client.channels.fetch(SUPPORTERS_CHANNEL_ID); 
    if (!channel) return console.error('Channel not found!');

    // --- Ko-fi Embed ---
    const kofiEmbed = new EmbedBuilder()
      .setTitle('☕ Support Us on Ko-fi!')
      .setDescription('If you enjoy our content, consider supporting us on Ko-fi. Every donation helps keep us going!')
      .setColor('#FF5E5B') // Ko-fi brand color
      .setThumbnail('https://cdn.ko-fi.com/cdn/kofi2.png') // Ko-fi logo
      .setTimestamp()
      .setFooter({ text: 'Thank you for your support!' });

    const kofiButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Donate on Ko-fi')
        .setStyle(ButtonStyle.Link)
        .setURL(KO_FI_LINK)
    );

    // --- Patreon Embed ---
    const patreonEmbed = new EmbedBuilder()
      .setTitle('💖 Support Us on Patreon!')
      .setDescription('Become a patron and get exclusive perks and early access to content. Every pledge helps us continue creating!')
      .setColor('#E85B46') // Patreon brand color
      .setThumbnail('https://upload.wikimedia.org/wikipedia/commons/7/7a/Patreon_logo.png') // Patreon logo
      .setTimestamp()
      .setFooter({ text: 'Thank you for your support!' });

    const patreonButton = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Support on Patreon')
        .setStyle(ButtonStyle.Link)
        .setURL(PATREON_LINK)
    );

    // --- Send embeds with buttons ---
    await channel.send({ embeds: [kofiEmbed], components: [kofiButton] });
    await channel.send({ embeds: [patreonEmbed], components: [patreonButton] });

    console.log('✅ Ko-fi and Patreon embeds sent successfully!');
  } catch (err) {
    console.error('Error sending support embeds:', err);
  }
}


// --- Command definitions ---
const commands = {
  '!ping': {
    description: 'Responds with Pong! 🏓',
    execute: async (message) => message.reply('Pong! 🏓'),
  },
  '!mcplayers': {
    description: 'Show active Minecraft players on the server.',
    execute: async (message) => {
      try {
        const rcon = new Rcon(MINECRAFT_RCON);
        await rcon.connect();
        const response = await rcon.send('list');
        await rcon.end();

        const match = response.match(/players:\s?(.*)/i);
        const players = match && match[1] ? match[1].split(',').map(p => p.trim()) : [];

        const embed = new EmbedBuilder()
          .setTitle('🟢 Active Minecraft Players')
          .setColor('#1abc9c')
          .addFields(
            { name: 'Total Players', value: `${players.length}`, inline: true },
            { name: 'Players', value: players.length ? players.join(', ') : 'No one online', inline: false }
          )
          .setTimestamp()
          .setFooter(BOT_FOOTER);

        await message.channel.send({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await message.channel.send('❌ Could not fetch active players.');
      }
    },
  },
  '!cat': {
    description: 'Show a random cat image. You can add text, e.g., `!cat Hello`.',
    execute: async (message) => {
      const content = message.content.slice('!cat'.length).trim();
      const url = content
        ? `https://cataas.com/cat/says/${encodeURIComponent(content)}`
        : 'https://cataas.com/cat';
      await message.channel.send(url);
    },
  },
  '!donate': {
    description: 'Show Donation Links',
    execute: async (message) => {
      await sendSupportEmbeds(client, message);
    }
  },
  '!help': {
    description: 'Show this help message listing all commands.',
    execute: async (message) => {
      const embed = new EmbedBuilder()
        .setTitle('📜 Bot Commands')
        .setColor('#f1c40f')
        .setDescription('Here is a list of all available commands:')
        .setTimestamp()
        .setFooter(BOT_FOOTER);

      for (const [cmd, obj] of Object.entries(commands)) {
        embed.addFields({ name: cmd, value: obj.description, inline: false });
      }

      await message.channel.send({ embeds: [embed] });
    },
  },
};

// --- Fetch Minecraft Status ---
async function fetchMinecraftStatus(channel) {
  const hostname = 'IssariCraft';
  const imageURL = `https://cdn.mos.cms.futurecdn.net/Ch792iXiTjNCPVniby9aG9.jpg`;

  let playerCount = 0;
  let maxPlayers = 0;
  let players = [];

  console.log('[Minecraft] Fetching server status...');

  try {
    // --- Try using RCON ---
    console.log('[Minecraft] Connecting via RCON:', MINECRAFT_RCON);
    const rcon = new Rcon(MINECRAFT_RCON);
    await rcon.connect();
    console.log('[Minecraft] RCON connected.');

    const response = await rcon.send('list');
    console.log('[Minecraft] RCON response:', response);

    await rcon.end();
    console.log('[Minecraft] RCON connection closed.');

    const match = response.match(/There are (\d+) of a max(?: of)? (\d+) players online: ?(.*)/i);

    if (match) {
      playerCount = parseInt(match[1], 10);
      maxPlayers = parseInt(match[2], 10);
      players = match[3]
        ? match[3].split(',').map(p => p.trim()).filter(p => p.length > 0)
        : [];

      console.log(`[Minecraft] Parsed players: ${playerCount}/${maxPlayers}`);
      console.log('[Minecraft] Player list:', players);
    } else {
      console.warn('[Minecraft] Could not parse RCON response.');
    }

  } catch (rconErr) {
    console.warn('[Minecraft] ⚠️ RCON failed, falling back to ping:', rconErr.message);

    // --- Fallback: query server via Ping API ---
    try {
      console.log(`[Minecraft] Pinging ${SERVER_HOST}:${SERVER_PORT}...`);
      const result = await status(SERVER_HOST, SERVER_PORT, { timeout: 3000 });
      console.log('[Minecraft] Ping response:', result);

      playerCount = result.players.online;
      maxPlayers = result.players.max;
      players = result.players.sample
        ? result.players.sample.map(p => p.name)
        : [];

      console.log(`[Minecraft] Parsed ping data: ${playerCount}/${maxPlayers}`);
      console.log('[Minecraft] Player list:', players);
    } catch (pingErr) {
      console.error('[Minecraft] ❌ Ping failed:', pingErr.message);
    }
  }

  // --- Build embed ---
  const embed = new EmbedBuilder()
    .setTitle(hostname)
    .setColor('#1abc9c')
    .setThumbnail(imageURL)
    .addFields(
      { name: 'Server IP', value: `${SERVER_HOST}:${SERVER_PORT}`, inline: true },
      { name: 'Total Players', value: `${playerCount} / ${maxPlayers}`, inline: true },
      { name: 'Players Online', value: players.length ? players.join(', ') : 'No one online', inline: false }
    )
    .setTimestamp()
    .setFooter(BOT_FOOTER);

  console.log('[Minecraft] Embed ready:', {
    playerCount,
    maxPlayers,
    players,
  });

  // --- Optional: Alert when active ---
  if (channel) {
    console.log('[Minecraft] Checking alert threshold...');
    if (players.length >= 3 && !MCAlertSent0) {
      console.log('[Minecraft] Triggering alert ping...');
      await channel.send({
        content: `<@&${ACTIVE_ROLE_ID}>`,
        embeds: [embed],
        allowedMentions: { roles: [ACTIVE_ROLE_ID] },
      });
      MCAlertSent0 = true;
    } else if (players.length < 3 && MCAlertSent0) {
      console.log('[Minecraft] Resetting alert flag...');
      MCAlertSent0 = false;
    }
  }

  console.log('[Minecraft] ✅ Status fetch complete.');
  return embed;
}


async function fetchTF2Status(channel) {
  try {
    const rcon = new Rcon(TF_RCON0);
    await rcon.connect();
    const response = await rcon.send('status');
    await rcon.end();

    // --- Parse players ---
    const playerLines = response
      .split('\n')
      .filter(line => /^#\s+\d+/.test(line)); // only actual player rows

    const players = playerLines.map(line => {
      // Collapse multiple spaces into one
      const parts = line.trim().split(/\s+/);
      // name is wrapped in quotes (always parts[2])
      const name = parts[2].replace(/^"|"$/g, '');
      return name;
    });

    // --- Parse hostname ---
    // Example: 'hostname: Issari.TF FREE SEX'
    const hostnameMatch = response.match(/hostname:\s(.+)/i);
    const hostname = hostnameMatch ? hostnameMatch[1] : 'Unknown Host';

    // --- Parse map ---
    const mapMatch = response.match(/map\s+:\s(\S+)/i);
    const mapName = mapMatch ? mapMatch[1] : 'Unknown Map';

    // --- Map image ---
    // You can customize a map thumbnail URL based on your map name
    const mapImageURL = `https://teamwork.tf/images/map_context/${mapName}/spectator_0.jpg`;

    // --- Build embed ---
    const embed = new EmbedBuilder()
      .setTitle(hostname)
      .setColor('#1abc9c')
      .setThumbnail(mapImageURL) // small image on the side
      .addFields(
        { name: 'Server IP', value: `${TF_RCON0.host}:${TF_RCON0.port}`, inline: true },
       // { name: 'Hostname', value: hostname, inline: true },
        { name: 'Current Map', value: mapName, inline: true },
        { name: 'Total Players', value: `${players.length} / 100`, inline: false },
        { name: 'Players Online', value: players.length ? players.join(', ') : 'No one online', inline: false }
      )
      .setTimestamp()
      .setFooter(BOT_FOOTER);

    // Ping our players
    if (channel) {
      if (players.length >= 5 && !TFAlertSent0) {
        // Ping once
        await channel.send({
          content: `<@&${ACTIVE_ROLE_ID}>`, // this pings the role
          embeds: [embed],
          allowedMentions: { roles: [ACTIVE_ROLE_ID] }, // explicitly allow pinging this role
        });

        TFAlertSent0 = true; // mark that we've pinged
      } else if (players.length < 5 && TFAlertSent0) {
        // Reset alert flag once players drop below threshold
        TFAlertSent0 = false;
      }
    }

    return embed;

  } catch (err) {
    console.error('TF2 RCON Error:', err);
    return new EmbedBuilder()
      .setTitle('❌ TF2 Server Status')
      .setColor('#e74c3c')
      .setDescription('Could not fetch server status')
      .setFooter(BOT_FOOTER)
      .setTimestamp();
  }
}

async function fetchTF2Status2(channel) {
  try {
    const rcon = new Rcon(TF_RCON1);
    await rcon.connect();
    const response = await rcon.send('status');
    await rcon.end();

    // --- Parse players ---
    const playerLines = response
      .split('\n')
      .filter(line => /^#\s+\d+/.test(line)); // only actual player rows

    const players = playerLines.map(line => {
      // Collapse multiple spaces into one
      const parts = line.trim().split(/\s+/);
      // name is wrapped in quotes (always parts[2])
      const name = parts[2].replace(/^"|"$/g, '');
      return name;
    });

    // --- Parse hostname ---
    // Example: 'hostname: Issari.TF FREE SEX'
    const hostnameMatch = response.match(/hostname:\s(.+)/i);
    const hostname = hostnameMatch ? hostnameMatch[1] : 'Unknown Host';

    // --- Parse map ---
    const mapMatch = response.match(/map\s+:\s(\S+)/i);
    const mapName = mapMatch ? mapMatch[1] : 'Unknown Map';

    // --- Map image ---
    // You can customize a map thumbnail URL based on your map name
    const mapImageURL = `https://teamwork.tf/images/map_context/vsh_militaryzone/spectator_0.jpg`;

    // --- Build embed ---
    const embed = new EmbedBuilder()
      .setTitle(hostname)
      .setColor('#1abc9c')
      .setThumbnail(mapImageURL) // small image on the side
      .addFields(
        { name: 'Server IP', value: `${TF_RCON1.host}:${TF_RCON1.port}`, inline: true },
       // { name: 'Hostname', value: hostname, inline: true },
        { name: 'Current Map', value: mapName, inline: true },
        { name: 'Total Players', value: `${players.length} / 32`, inline: false },
        { name: 'Players Online', value: players.length ? players.join(', ') : 'No one online', inline: false }
      )
      .setTimestamp()
      .setFooter(BOT_FOOTER);
    
    // Ping our players
    if (channel) {
      if (players.length >= 5 && !TFAlertSent1) {
        // Ping once
        await channel.send({
          content: `<@&${ACTIVE_ROLE_ID}>`, // this pings the role
          embeds: [embed],
          allowedMentions: { roles: [ACTIVE_ROLE_ID] }, // explicitly allow pinging this role
        });

        TFAlertSent1 = true; // mark that we've pinged
      } else if (players.length < 5 && TFAlertSent1) {
        // Reset alert flag once players drop below threshold
        TFAlertSent1 = false;
      }
    }

    return embed;

  } catch (err) {
    console.error('TF2 RCON Error:', err);
    return new EmbedBuilder()
      .setTitle('❌ TF2 Server Status')
      .setColor('#e74c3c')
      .setDescription('Could not fetch server status')
      .setFooter(BOT_FOOTER)
      .setTimestamp();
  }
}

// --- Send and refresh embeds separately ---
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await sendSupportEmbeds(client);

  const channel = await client.channels.fetch(STATUS_CHANNEL_ID);
  if (!channel) return console.error('Channel not found!');

  // Send initial embeds
  const mcEmbed = await fetchMinecraftStatus();
  const tf2Embed = await fetchTF2Status();
  const tf2Embed1 = await fetchTF2Status2();

  const mcMessage = await channel.send({ embeds: [mcEmbed] });
  const tf2Message = await channel.send({ embeds: [tf2Embed] });
  const tf2Message1 = await channel.send({ embeds: [tf2Embed1] });

  // Refresh Minecraft embed
  setInterval(async () => {
    const alertChannel = await client.channels.fetch(MC_CHANNEL0_GENERAL);
    const updatedMCEmbed = await fetchMinecraftStatus(alertChannel);
    await mcMessage.edit({ embeds: [updatedMCEmbed] });
  }, REFRESH_INTERVAL);

  // Refresh TF2 embed
  setInterval(async () => {
    const alertChannel = await client.channels.fetch(TF_CHANNEL1_GENERAL);
    const updatedTF2Embed = await fetchTF2Status(alertChannel);
    await tf2Message.edit({ embeds: [updatedTF2Embed] });
  }, REFRESH_INTERVAL);

  // Refresh TF2 embed
  setInterval(async () => {
    const alertChannel = await client.channels.fetch(TF_CHANNEL0_GENERAL);
    const updatedTF2Embed = await fetchTF2Status2(alertChannel);
    await tf2Message1.edit({ embeds: [updatedTF2Embed] });
  }, REFRESH_INTERVAL);
});


// --- Message listener ---
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const command = Object.keys(commands).find(cmd =>
    cmd === message.content || message.content.startsWith(cmd)
  );

  if (command) {
    await commands[command].execute(message);
  }
});

// --- Login ---
client.login(process.env.BOT_TOKEN);