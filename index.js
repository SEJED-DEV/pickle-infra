const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    SlashCommandBuilder, 
    Routes, 
    PermissionFlagsBits,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Partials,
    ChannelType,
    Collection,
    IntentsBitField
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const fs = require('fs');
const https = require('https');
const path = require('path');
require('dotenv').config();

// Configuration
let config;
try {
    config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
} catch (error) {
    console.error('Failed to load config.json:', error);
    process.exit(1);
}

// Ensure transcripts folder exists
const transcriptPath = path.join(__dirname, 'transcripts');
if (!fs.existsSync(transcriptPath)) {
    try { fs.mkdirSync(transcriptPath); } catch {}
}

const L_KEY = Buffer.from('aHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL1RTU0VKRUQvTGljZW5zZS1WZXJpZmljYXRpb24vcmVmcy9oZWFkcy9tYWluL2xpY2Vuc2UuanNvbg==', 'base64').toString();
let remote_data = null;

async function fetchRemote(url, depth = 0) {
    if (depth > 5) throw new Error('Too many redirects');
    return new Promise((resolve, reject) => {
        const options = {
            headers: { 
                'User-Agent': 'Mozilla/5.0',
                'accept-encoding': 'identity'
            }
        };
        console.log(`[License] Fetching: ${url} (Depth: ${depth})`);
        https.get(url, options, (res) => {
            console.log(`[License] Status: ${res.statusCode}`);
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const nextUrl = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
                return resolve(fetchRemote(nextUrl, depth + 1));
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                if (res.statusCode !== 200) return reject(`HTTP ${res.statusCode} at ${url}`);
                const body = Buffer.concat(chunks).toString('utf-8');
                resolve(body);
            });
        }).on('error', (e) => reject(`HTTPS Error: ${e.message}`));
    });
}

async function verifyLicense() {
    try {
        const body = await fetchRemote(L_KEY);
        const cleanedBody = body.trim().replace(/^\uFEFF/, '');
        remote_data = JSON.parse(cleanedBody);
        return true;
    } catch (e) {
        console.error('[License Error]', e.message);
        throw new Error(`Verification Failed: ${e.message}`);
    }
}

// Helper to replace Cortex custom emojis with standard ones
function cleanBranding(text) {
    if (!text) return text;
    return text
        .replace(/<:cortex_logo:\d+>/g, '🛡️')
        .replace(/<:cortex_Moderation:\d+>/g, '🔨')
        .replace(/<:cortex_ticket:\d+>/g, '🎫')
        .replace(/<:cortex_wave:\d+>/g, '👋')
        .replace(/<:cortex_upwards_chart:\d+>/g, '📈')
        .replace(/<:cortex_giveaways:\d+>/g, '🎉')
        .replace(/<:cortex_settings:\d+>/g, '⚙️');
}

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping
    ],
    partials: [
        Partials.Channel, 
        Partials.Message, 
        Partials.User, 
        Partials.Reaction, 
        Partials.GuildMember, 
        Partials.ThreadMember
    ]
});

// Persistence functions
function getData(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}
function saveData(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

const gamepassLinks = new Map();

const commands = [
    new SlashCommandBuilder().setName('payment').setDescription('Shows gamepass for price').addIntegerOption(opt => opt.setName('price').setDescription('Price of the item').setRequired(true)),
    new SlashCommandBuilder().setName('setlink').setDescription('Link gamepass').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild).addIntegerOption(opt => opt.setName('price').setDescription('Price to link').setRequired(true)).addStringOption(opt => opt.setName('url').setDescription('Gamepass URL').setRequired(true)),
    new SlashCommandBuilder().setName('tax').setDescription('Calculate tax').addIntegerOption(opt => opt.setName('amount').setDescription('Amount to receive').setRequired(true)),
    new SlashCommandBuilder().setName('order_log').setDescription('Log sale').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addUserOption(opt => opt.setName('user').setDescription('The buyer').setRequired(true)).addStringOption(opt => opt.setName('item').setDescription('Item purchased').setRequired(true)),
    new SlashCommandBuilder().setName('license').setDescription('License info'),
    new SlashCommandBuilder().setName('giveaway').setDescription('Giveaway management').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('start').setDescription('Start giveaway').addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h)').setRequired(true)).addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setRequired(true)).addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true)))
        .addSubcommand(sub => sub.setName('end').setDescription('End giveaway').addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
        .addSubcommand(sub => sub.setName('reroll').setDescription('Reroll').addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))),
    
    new SlashCommandBuilder().setName('modmail').setDescription('ModMail ticket management').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub => sub.setName('reply').setDescription('Reply to the current ticket user').addStringOption(opt => opt.setName('message').setDescription('Message to send').setRequired(true)).addBooleanOption(opt => opt.setName('anonymous').setDescription('Hide your name?')))
        .addSubcommand(sub => sub.setName('close').setDescription('Close the current ticket').addStringOption(opt => opt.setName('reason').setDescription('Reason for closing')))
        .addSubcommand(sub => sub.setName('claim').setDescription('Claim this ticket'))
        .addSubcommand(sub => sub.setName('blacklist').setDescription('Blacklist a user from ModMail').addUserOption(opt => opt.setName('user').setDescription('User to blacklist').setRequired(true))),
    
    new SlashCommandBuilder().setName('setup').setDescription('Bot configuration system').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub => sub.setName('welcome').setDescription('Configure welcome system').addChannelOption(opt => opt.setName('channel').setDescription('Welcome channel').setRequired(true)).addStringOption(opt => opt.setName('message').setDescription('Welcome message ({user} for mention)')).addStringOption(opt => opt.setName('color').setDescription('Embed color (hex)')).addBooleanOption(opt => opt.setName('enabled').setDescription('Toggle welcome')))
        .addSubcommand(sub => sub.setName('modmail').setDescription('Configure ModMail system').addStringOption(opt => opt.setName('guild_id').setDescription('Server ID').setRequired(true)).addChannelOption(opt => opt.setName('category').setDescription('ModMail category').setRequired(true)).addChannelOption(opt => opt.setName('log_channel').setDescription('Log channel').setRequired(true)).addRoleOption(opt => opt.setName('staff_role').setDescription('Staff role').setRequired(true)))
        .addSubcommand(sub => sub.setName('giveaway').setDescription('Configure giveaway system').addStringOption(opt => opt.setName('color').setDescription('Giveaway embed color (hex)')))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Event Listeners
client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    console.log(`[Link] Bot Invite Link: https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`);
    console.log(`[Debug] Bot is in ${client.guilds.cache.size} servers: ${client.guilds.cache.map(g => g.name).join(', ') || 'NONE'}`);
    
    // Detailed Intent Check
    const intents = new IntentsBitField(client.options.intents);
    console.log(`[Debug] Active Intents Bitfield: ${intents.bitfield}`);
    console.log(`[Debug] Has MessageContent Intent: ${intents.has(GatewayIntentBits.MessageContent)}`);
    console.log(`[Debug] Has DirectMessages Intent: ${intents.has(GatewayIntentBits.DirectMessages)}`);
    
    const guildId = config.modmail.guildId;
    console.log(`[Debug] Looking for Guild ID: ${guildId}`);
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    
    if (guild) {
        console.log(`[ModMail] SUCCESS: Connected to Guild: ${guild.name}`);
        const category = await guild.channels.fetch(config.modmail.categoryId).catch(() => null);
        if (category) console.log(`[ModMail] SUCCESS: Found Ticket Category: ${category.name}`);
        else console.log(`[ModMail] ERROR: Category ID ${config.modmail.categoryId} not found in this guild!`);
    } else {
        console.log(`[ModMail] ERROR: Bot cannot find Guild ID ${guildId}.`);
    }

    try {
        await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    } catch (error) { console.error('[Error] Slash Registration:', error); }

    // Resume giveaways
    const gwData = getData('./giveaways.json');
    const now = Date.now();
    gwData.forEach(gw => {
        if (!gw.ended && gw.endTime > now) setTimeout(() => endGiveaway(gw.messageId), gw.endTime - now);
        else if (!gw.ended) endGiveaway(gw.messageId);
    });
});

client.on('guildMemberAdd', async member => {
    if (!config.welcome?.enabled || !config.welcome.channelId) return;
    const channel = member.guild.channels.cache.get(config.welcome.channelId);
    if (!channel) return;
    const welcomeMsg = config.welcome.message.replace('{user}', `<@${member.id}>`);
    const embed = new EmbedBuilder().setTitle('Welcome!').setDescription(welcomeMsg).setColor(config.welcome.color || '#5865F2').setThumbnail(member.user.displayAvatarURL());
    channel.send({ embeds: [embed] });
});

const processed = new Set();

async function processModmail(author, content, attachments, msgId) {
    if (processed.has(msgId)) return;
    processed.add(msgId);
    setTimeout(() => processed.delete(msgId), 300000); // 5 min cache

    console.log(`[ModMail] Processing message from ${author.tag || author.username}`);
    
    const tickets = getData('./tickets.json');
    const blacklist = getData('./blacklist.json');
    if (blacklist.includes(author.id)) return;

    let ticket = tickets.find(t => t.userId === author.id && !t.closed);
    const guildId = config.modmail.guildId;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return console.error('[ModMail] Guild not found.');

    if (!ticket) {
        const categoryId = config.modmail.categoryId;
        const category = await guild.channels.fetch(categoryId).catch(() => null);
        if (!category) return;

        try {
            const ticketChannel = await guild.channels.create({
                name: `ticket-${author.username}`,
                type: ChannelType.GuildText,
                parent: category,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: config.modmail.staffRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            ticket = { userId: author.id, channelId: ticketChannel.id, username: author.tag || author.username, openedAt: Date.now(), closed: false, messages: [] };
            tickets.push(ticket);
            saveData('./tickets.json', tickets);

            const alertEmbed = new EmbedBuilder()
                .setTitle('📩 New ModMail Ticket')
                .setAuthor({ name: author.tag || author.username, iconURL: author.displayAvatarURL?.() || `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png` })
                .setDescription(`A new ticket has been opened by <@${author.id}>.\n\n**Staff Commands:**\n> \`/modmail reply <msg>\` - Reply to user\n> \`/modmail close\` - Close ticket\n> \`/modmail claim\` - Claim ticket\n> \`!reply <msg>\` - Quick reply`)
                .setColor(0x57F287)
                .setTimestamp();
            await ticketChannel.send({ embeds: [alertEmbed] });
            
            // Send instructions to the user
            try {
                const userEmbed = new EmbedBuilder().setTitle('ModMail Opened').setDescription('Your message has been sent to our staff. Please wait for a reply.').setColor(0x5865F2);
                await author.send({ embeds: [userEmbed] }).catch(() => null);
            } catch {}
        } catch (err) {
            console.error('[ModMail] Ticket creation failed:', err);
            return;
        }
    }

    const channel = guild.channels.cache.get(ticket.channelId);
    if (channel) {
        const userMsg = new EmbedBuilder()
            .setAuthor({ name: author.tag || author.username, iconURL: author.displayAvatarURL?.() || `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png` })
            .setDescription(content || '*(No text content)*')
            .setColor(0x5865F2)
            .setTimestamp();
        
        let attachmentUrl = (attachments instanceof Collection) ? attachments.first()?.url : attachments?.[0]?.url;
        if (attachmentUrl) userMsg.setImage(attachmentUrl);
        
        await channel.send({ embeds: [userMsg] });
        ticket.messages.push(`[${new Date().toLocaleString()}] User: ${content}`);
        saveData('./tickets.json', tickets);
        
        // Confirmation to user (Fixing the object to ensure .send works)
        try {
            const user = await client.users.fetch(author.id);
            if (user) await user.send('✅ **Message delivered to staff!**').catch(() => null);
        } catch (e) {
            console.error('[ModMail] Failed to notify user:', e.message);
        }
    }
}

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // Handle Prefix Commands (!reply) in ticket channels
    if (message.guild) {
        const tickets = getData('./tickets.json');
        const ticket = tickets.find(t => t.channelId === message.channelId && !t.closed);
        if (ticket && message.content.startsWith('!reply ')) {
            const replyMsg = message.content.slice(7);
            const user = await client.users.fetch(ticket.userId).catch(() => null);
            if (user) {
                const embed = new EmbedBuilder().setTitle('Support Reply').setDescription(replyMsg).setColor(0x57F287).setFooter({ text: `Staff: ${message.author.tag}` }).setTimestamp();
                try {
                    await user.send({ embeds: [embed] });
                    const logEmbed = new EmbedBuilder().setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() }).setDescription(replyMsg).setColor(0x57F287).setTimestamp();
                    await message.reply({ embeds: [logEmbed] });
                    ticket.messages.push(`[${new Date().toLocaleString()}] Staff (${message.author.tag}): ${replyMsg}`);
                    saveData('./tickets.json', tickets);
                } catch { message.reply('Could not DM user.'); }
            }
            return;
        }
    }

    // DEBUG: LOG ALL INCOMING MESSAGES
    if (message.guild === null) {
        await processModmail(message.author, message.content, message.attachments, message.id);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'giveaway_join') {
            const giveaways = getData('./giveaways.json');
            const gw = giveaways.find(g => g.messageId === interaction.message.id);
            if (!gw || gw.ended) return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });
            if (gw.participants.includes(interaction.user.id)) return interaction.reply({ content: 'Already joined!', ephemeral: true });
            gw.participants.push(interaction.user.id);
            saveData('./giveaways.json', giveaways);
            await interaction.reply({ content: 'Joined!', ephemeral: true });
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setFooter({ text: `Entries: ${gw.participants.length} | Ends at` });
            await interaction.message.edit({ embeds: [embed] });
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;
    const { commandName, options } = interaction;

    if (commandName === 'setup') {
        const sub = options.getSubcommand();
        if (sub === 'welcome') {
            config.welcome.channelId = options.getChannel('channel').id;
            config.welcome.message = options.getString('message') || config.welcome.message;
            config.welcome.color = options.getString('color') || config.welcome.color;
            config.welcome.enabled = options.getBoolean('enabled') ?? config.welcome.enabled;
            saveData('./config.json', config);
            await interaction.reply({ content: 'Welcome system updated!', ephemeral: true });
        }
        if (sub === 'modmail') {
            config.modmail.guildId = options.getString('guild_id');
            config.modmail.categoryId = options.getChannel('category').id;
            config.modmail.logChannelId = options.getChannel('log_channel').id;
            config.modmail.staffRoleId = options.getRole('staff_role').id;
            saveData('./config.json', config);
            await interaction.reply({ content: 'ModMail system updated!', ephemeral: true });
        }
        if (sub === 'giveaway') {
            config.giveaway.color = options.getString('color') || config.giveaway.color;
            saveData('./config.json', config);
            await interaction.reply({ content: 'Giveaway system updated!', ephemeral: true });
        }
    }

    if (commandName === 'modmail') {
        const sub = options.getSubcommand();
        const tickets = getData('./tickets.json');
        const ticket = tickets.find(t => t.channelId === interaction.channelId && !t.closed);
        if (!ticket && sub !== 'blacklist') return interaction.reply({ content: 'This command can only be used in an active ticket channel.', ephemeral: true });

        if (sub === 'reply') {
            const msg = options.getString('message');
            const anon = options.getBoolean('anonymous') || false;
            const user = await client.users.fetch(ticket.userId);
            const embed = new EmbedBuilder().setTitle('Support Reply').setDescription(msg).setColor(0x57F287).setFooter({ text: anon ? 'Support Team' : `Staff: ${interaction.user.tag}` }).setTimestamp();
            try {
                await user.send({ embeds: [embed] });
                const logEmbed = new EmbedBuilder().setAuthor({ name: anon ? 'Anonymous Reply' : interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setDescription(msg).setColor(0x57F287).setTimestamp();
                await interaction.reply({ embeds: [logEmbed] });
                ticket.messages.push(`[${new Date().toLocaleString()}] Staff (${interaction.user.tag})${anon ? ' [ANON]' : ''}: ${msg}`);
                saveData('./tickets.json', tickets);
            } catch { interaction.reply({ content: 'Failed to DM user.', ephemeral: true }); }
        }
        if (sub === 'claim') {
            await interaction.reply({ content: `Claimed by <@${interaction.user.id}>!`, embeds: [new EmbedBuilder().setDescription(`Staff: **${interaction.user.tag}**`).setColor(0xFFA500)] });
            ticket.claimedBy = interaction.user.id;
            saveData('./tickets.json', tickets);
        }
        if (sub === 'close') {
            const reason = options.getString('reason') || 'No reason provided';
            ticket.closed = true; ticket.closedAt = Date.now(); saveData('./tickets.json', tickets);
            const user = await client.users.fetch(ticket.userId);
            try { user.send(`Ticket closed. Reason: ${reason}`); } catch {}
            await interaction.reply('Closing ticket...');
            const transcript = ticket.messages.join('\n');
            const fullPath = path.join(transcriptPath, `transcript-${ticket.userId}-${Date.now()}.txt`);
            let saved = false; try { fs.writeFileSync(fullPath, transcript); saved = true; } catch {}
            const logChannel = client.channels.cache.get(config.modmail.logChannelId);
            const logEmbed = new EmbedBuilder().setTitle('Ticket Closed').addFields({ name: 'User', value: `<@${ticket.userId}>` }, { name: 'Reason', value: reason }).setColor(0xED4245).setTimestamp();
            if (logChannel) await logChannel.send({ embeds: [logEmbed], files: saved ? [fullPath] : [] });
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }
        if (sub === 'blacklist') {
            const target = options.getUser('user');
            const bl = getData('./blacklist.json');
            if (bl.includes(target.id)) return interaction.reply({ content: 'Already blacklisted.', ephemeral: true });
            bl.push(target.id); saveData('./blacklist.json', bl);
            interaction.reply({ content: `Blacklisted <@${target.id}>.`, ephemeral: true });
        }
    }

    if (commandName === 'license') {
        if (!remote_data) return interaction.reply({ content: 'No data.', ephemeral: true });
        const e1 = new EmbedBuilder().setTitle(cleanBranding(remote_data.license.title)).setDescription(cleanBranding(remote_data.license.text)).setColor(0x2B2D31);
        await interaction.reply({ embeds: [e1] });
    }

    if (commandName === 'payment') {
        const link = gamepassLinks.get(options.getInteger('price'));
        if (!link) return interaction.reply({ content: 'No link.', ephemeral: true });
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Payment').setDescription(`[Pay Here](${link})`).setColor(0x00AE86)] });
    }
    if (commandName === 'setlink') { gamepassLinks.set(options.getInteger('price'), options.getString('url')); await interaction.reply({ content: 'Set!', ephemeral: true }); }
    if (commandName === 'tax') { const amt = options.getInteger('amount'); await interaction.reply({ embeds: [new EmbedBuilder().setTitle('Tax').addFields({ name: 'Pay', value: `${Math.ceil(amt/0.7)} R$` }).setColor(0xFFA500)] }); }
});

client.on('error', console.error);
client.on('debug', d => {
    if (d.includes('Ignoring message') || d.includes('partial')) console.log(`[Djs Debug] ${d}`);
});
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// RAW Gateway Debugger & Fallback
client.on('raw', async packet => {
    if (packet.t === 'MESSAGE_CREATE') {
        const data = packet.d;
        if (data.author.bot) return;

        // Fallback for DMs if messageCreate doesn't fire
        if (!data.guild_id) {
            console.log(`[Raw Fallback] Processing DM from ${data.author.username}`);
            await processModmail(data.author, data.content, data.attachments, data.id);
        } else {
            console.log(`[Raw Debug] Guild Message from: ${data.author.username}`);
        }
    }
});

async function init() {
    console.log('Verifying license...');
    try {
        await verifyLicense();
        console.log('License Verified.');
        await client.login(process.env.DISCORD_TOKEN);
    } catch (e) {
        console.error('CRITICAL ERROR: ' + e);
        process.exit(1);
    }
}

// Giveaway Utils
async function endGiveaway(messageId) {
    const data = getData('./giveaways.json');
    const gw = data.find(g => g.messageId === messageId);
    if (!gw || gw.ended) return false;
    gw.ended = true; saveData('./giveaways.json', data);
    const channel = client.channels.cache.get(gw.channelId);
    if (!channel) return true;
    try {
        const message = await channel.messages.fetch(messageId);
        const winners = [];
        if (gw.participants.length > 0) {
            const pool = [...gw.participants];
            for (let i = 0; i < Math.min(gw.winnersCount, pool.length); i++) winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        const embed = EmbedBuilder.from(message.embeds[0]).setTitle('🎉 ENDED 🎉').setDescription(`Prize: **${gw.prize}**\nWinners: ${winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'None'}`).setFooter({ text: 'Ended' });
        await message.edit({ embeds: [embed], components: [] });
        if (winners.length > 0) channel.send(`Congrats ${winners.map(w => `<@${w}>`).join(', ')}!`);
    } catch {}
    return true;
}

async function rerollGiveaway(messageId) {
    const data = getData('./giveaways.json');
    const gw = data.find(g => g.messageId === messageId);
    if (!gw || !gw.ended) return false;
    const channel = client.channels.cache.get(gw.channelId);
    const winners = [];
    if (gw.participants.length > 0) {
        const pool = [...gw.participants];
        for (let i = 0; i < Math.min(gw.winnersCount, pool.length); i++) winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    if (winners.length > 0) channel.send(`🎉 Reroll: Congrats ${winners.map(w => `<@${w}>`).join(', ')}!`);
    return true;
}

init();