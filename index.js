require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');

// Get token either from CLI argument or .env
const token = process.argv[2] || process.env.BOT_TOKEN;

if (!token) {
  console.error("❌ No bot token provided! Use: node index.js <BOT_TOKEN>");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!ping') {
    message.reply('Pong! 🏓');
  }
});

// Login using the token
client.login(token);
