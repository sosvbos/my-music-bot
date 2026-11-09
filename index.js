const { Client, GatewayIntentBits } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus 
} = require('@discordjs/voice');
const { YtDlpWrap } = require('yt-dlp-wrap');
const ytDlpWrap = new YtDlpWrap();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Bot is online 24/7.`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // أمر تجريبي للتأكد أن البوت يشتغل
    if (message.content === '!ping') {
        message.reply('Pong! البوت شغال وسليم 100% 🎵');
    }
});

// التأكد من قراءة التوكن من Railway وتجنب أي خطأ
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("ERROR: DISCORD_TOKEN is missing in Railway Variables!");
    process.exit(1);
}

client.login(token);
