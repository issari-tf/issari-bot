# IssariBot

A feature‑rich Discord bot that monitors **Minecraft** and **Team Fortress 2** servers, maintains a **hierarchical win/loss leaderboard** (ranked pyramid), allows **Steam avatar linking**, and sends **scheduled daily role pings** with random messages.

> *“Who beat whom?”* – This bot answers that question with a beautiful PNG leaderboard and an interactive win‑recording system.

---

## ✨ Features

- 🖥️ **Server status** – Live Minecraft and TF2 server status with random background images.
- 🏆 **Hierarchical ranked pyramid** – Tracks wins/losses between players, displayed as a **PNG graph** (arrows = winner → loser).
- 📈 **Leaderboard** – Sorted by wins, win ratio, then fewest losses. Shows Steam avatars (if linked).
- 🔄 **Auto‑refresh** – Leaderboard automatically gains random wins every 5 minutes (configurable).
- 🎭 **Steam integration** – Players can link their Steam accounts to show their avatar on the leaderboard.
- ⏰ **Scheduled pings** – Daily role pings at a configurable time (different role per weekday) with random motivational messages.
- 🛠️ **Admin commands** – Record wins, reset the tree, add random wins, link Steam IDs for others.

---

## 📦 Requirements

- Node.js **v18+**
- A Discord Bot Token ([Discord Developer Portal](https://discord.com/developers/applications))
- RCON access to your Minecraft and TF2 servers (optional – falls back to server ping)
- Steam Web API key (optional – for avatars)

---

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/issari-bot.git
   cd issari-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables** – copy `.env.example` to `.env` and fill in your values (see below).

4. **Run the bot**
   ```bash
   npm start
   ```

> On Linux, you may need to install canvas system dependencies:
> ```bash
> sudo apt-get update
> sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
> ```

---

## ⚙️ Configuration (`.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `BOT_TOKEN` | Your Discord bot token | `ODMy...` |
| `STEAM_API_KEY` | Steam Web API key (optional) | `XXXXXXXXXXXXXXXXXXXXX` |
| `MC_RCON_HOST` | Minecraft RCON host | `127.0.0.1` |
| `MC_RCON_PORT` | Minecraft RCON port | `25575` |
| `MC_RCON_PASS` | Minecraft RCON password | `secret` |
| `TF_RCON_HOST0` | First TF2 server RCON host | `play.issari.tf` |
| `TF_RCON_PORT0` | First TF2 server RCON port | `27015` |
| `TF_RCON_PASS0` | First TF2 server RCON password | `rconpass` |
| `TF_RCON_HOST1` | Second TF2 server (VSH) | `vsh.issari.tf` |
| `TF_RCON_PORT1` | Second TF2 server RCON port | `27015` |
| `TF_RCON_PASS1` | Second TF2 server RCON password | `rconpass` |
| `STATUS_CHANNEL_ID` | Channel where status embeds are posted | `123456789012345678` |
| `LEADERBOARD_CHANNEL_ID` | Channel where the auto‑refreshing leaderboard lives | `1496902267033620701` |
| `ACTIVE_ROLE_ID` | Role to ping when servers are active | `1353720821792899182` |
| `ADMIN_ROLE_ID` | Role allowed to run admin commands (optional) | `...` |
| `LEADERBOARD_REFRESH_MS` | How often to add random wins (ms) | `300000` (5 min) |
| `MC_ALERT_THRESHOLD` | Min players to trigger alert ping | `3` |
| `TF_ALERT_THRESHOLD` | Min players to trigger alert ping | `5` |

All Discord channel IDs and role IDs are optional – defaults are set to the original server’s IDs (change them!).

---

## 📝 Commands

| Command | Description | Permissions |
|---------|-------------|-------------|
| `!ping` | Replies with Pong! | Everyone |
| `!mcplayers` | Shows active Minecraft players | Everyone |
| `!cat [text]` | Random cat image (optional text) | Everyone |
| `!donate` | Displays Ko‑fi and Patreon links | Everyone |
| `!rank` | Sends the leaderboard PNG | Everyone |
| `!wintree` | Sends the hierarchical win/loss pyramid PNG | Everyone |
| `!linksteam <steamid64>` | Links your Steam ID to your Discord name | Everyone |
| `!recordwin @winner @loser` | Records that winner beat loser | Admin |
| `!randomizewins` | Adds 5 random win relationships | Admin |
| `!resetleaderboard` | Resets the tree to fresh dummy data | Admin |
| `!setsteam @user <steamid64>` | Links Steam ID for another user | Admin |
| `!gametime` | Manually triggers the daily role ping | Admin |
| `!help` | Shows all commands | Everyone |

---

## 🧠 How the win/loss tree works

- Every player starts with no wins/losses.
- Using `!recordwin @Alice @Bob` you create an edge: **Alice → Bob** (Alice beat Bob).
- The bot builds a directed acyclic graph (DAG) and computes **global ranks**:
  1. Most wins
  2. Highest win ratio (wins / games)
  3. Fewest losses
- The **leaderboard** shows the top 25 players with their Steam avatars (if linked).
- The **hierarchical pyramid** (`!wintree`) places the best players at the top (roots = players who never lost) and draws arrows downwards to players they beat.

---

## 🖼️ Example outputs

### Leaderboard PNG
![leaderboard example](https://via.placeholder.com/800x400?text=Leaderboard+PNG)

### Win/Loss Pyramid
![win tree example](https://via.placeholder.com/800x400?text=Win+Tree+PNG)

---

## 🔀 File structure (refactored)

```
issari-bot/
├── config.js                 # Loads environment variables
├── steamHelpers.js           # Steam avatar fetching / styling
├── imagePools.js             # Random server background images
├── steamLinksManager.js      # Maps Discord names → SteamID64
├── winTreeManager.js         # Core win/loss logic + PNG generation
├── serverStatus.js           # Minecraft / TF2 status fetchers
├── scheduledPings.js         # Daily role ping scheduler
├── commands.js               # All command definitions
├── index.js                  # Main bot entry point
├── .env                      # Your secrets (not committed)
├── winTree.json              # Persistent win/loss data
├── steamLinks.json           # Persistent Steam ID links
├── statusMessages.json       # Stores status embed message IDs
└── leaderboardMessage.json   # Stores leaderboard message ID
```

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

---

## 📄 License

ISC © [Issari.TF](https://issari.tf)

---

## 🙏 Acknowledgements

- [discord.js](https://discord.js.org/)
- [node-canvas](https://github.com/Automattic/node-canvas)
- [Steam Web API](https://steamcommunity.com/dev)
- Minecraft and TF2 communities