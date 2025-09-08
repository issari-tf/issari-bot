require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Create a new bot client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, // for slash commands
    GatewayIntentBits.GuildMessages, // for reading messages
    GatewayIntentBits.MessageContent // needed if you want to read message text
  ],
});

// When the bot is ready
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Simple message listener
client.on('messageCreate', (message) => {
  if (message.author.bot) return; // ignore bots

  if (message.content === '!ping') {
    message.reply('Pong! 🏓');
  }
});

// Login using token from .env
client.login(process.env.BOT_TOKEN);
