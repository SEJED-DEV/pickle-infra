# 🤖 pickle-infra v1.0

![License](https://img.shields.io/badge/License-NC--NFR-red)
![Node](https://img.shields.io/badge/Node-v20--LTS-blue)
![DiscordJS](https://img.shields.io/badge/Discord.js-v14.11-indigo)


A high-performance Discord infrastructure designed for **Roblox Sales**, **Modular Support (ModMail)**, and **Server Engagement**. Equipped with a custom **Raw Gateway Fallback** to ensure 100% DM reliability.

---

## 🚀 Core Systems

### 📧 ModMail V2 (Zero-Packet Loss)
Bypasses library-level message filtering using a low-level WebSocket packet interceptor.
- **Auto-Threading**: Creates dedicated channels in a staff category.
- **Rich Transcripts**: Automatic HTML/Text logging of conversations.
- **Dual Support**: Supports both Slash Commands and `!reply` prefix.

### 🎁 Persistent Giveaways
Professional giveaway engine with dynamic Discord timestamps.
- **Persistence**: Saved to `giveaways.json`.
- **Functionality**: Start, End, and Reroll with one click.

### 🛡️ Admin Suite
Centralized configuration via `/setup`.
- **Welcome System**: Custom embeds, colors, and placeholders.
- **Branding**: Global theme management for all embeds.

---

## 📋 Commands Encyclopedia

| Command Group | Usage | Description | Permissions |
|---|---|---|---|
| `/setup welcome` | `/setup welcome [channel] [message] ...` | Configure join messages. | `Administrator` |
| `/setup modmail` | `/setup modmail [guild] [category] ...` | Initialize support system. | `Administrator` |
| `/modmail reply` | `/modmail reply [msg]` | Reply to a ticket. | `Staff` |
| `!reply` | `!reply [msg]` | Rapid-fire staff reply. | `Staff` |
| `/giveaway start` | `/giveaway start [time] [winners] [prize]` | Launch a prize pool. | `Manage Guild` |
| `/payment` | `/payment [price]` | View gamepass links. | `Everyone` |
| `/tax` | `/tax [amount]` | Roblox tax calculator (70%). | `Everyone` |

---

## 🛠️ Installation & Setup

### 1. Requirements
- Node.js **20.x (LTS)** or higher.
- A Discord App with **Message Content Intent** enabled.

### 2. Quickstart
```bash
# Clone the repository
git clone {your_repo_link} bot
cd bot

# Install dependencies
npm install

# Setup Environment
echo "DISCORD_TOKEN=your_token_here" >> .env
echo "CLIENT_ID=your_id_here" >> .env
echo "ORDER_LOG_CHANNEL_ID=your_log_id" >> .env

# Start
node index.js
```

### 3. Professional Hosting (Linux)
It is highly recommended to use **PM2** for production:
```bash
npm install pm2 -g
pm2 start index.js --name "pickle-infra"
pm2 save
```

---

## 📁 Technical Architecture

```text
.
├── index.js              # Core Engine & Raw Gateway Interceptor
├── config.json           # Live Configuration (setup by /setup)
├── tickets.json          # ModMail Persistence
├── giveaways.json        # Active Prize Persistence
├── blacklist.json        # Support Ban Records
├── guide.html            # Premium Self-Hosting Manual
└── transcripts/          # Auto-generated ticket records (.txt)
```

---

## 📖 Extended Documentation
For a deep dive into advanced hosting (Pterodactyl/Windows), internal JSON schemas, and security hardening, please refer to the **[Official Guide](file:///c:/Users/lassa/Desktop/bot/sold/guide.html)** included in this folder.

---

## ⚖️ License
Licensed under **Non-Commercial (NC) / Not For Resale (NFR)**.
- Unauthorized redistribution of source code is strictly prohibited.
- Technical support provided via the community server.

**Developer**: `@ts_122`  
**Contact**: [Discord Support Server](https://discord.gg/qBaYSPhDcG)