const { Client, GatewayIntentBits } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus 
} = require('@discordjs/voice');
const YtDlpWrap = require('yt-dlp-wrap').default;
const ytDlpWrap = new YtDlpWrap();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

const player = createAudioPlayer();
let currentStreamUrl = null;
let isLooping = false;
let currentConnection = null;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! 24/7 Unstoppable Music Bot is online.`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // أمر الفحص
    if (command === '!ping') {
        message.reply('Pong! البوت شغال وسليم 100% 🎵');
    }

    // أمر تشغيل الأغنية بدون أقواس: !play [الرابط]
    if (command === '!play') {
        const url = args[1];
        if (!url) return message.reply('❌ يرجى كتابة الرابط بعد الأمر مباشرة، هكذا: `!play رابط_اليوتيوب`');

        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply('❌ لازم تكون في روم صوتي عشان تشتغل الأغنية!');

        try {
            message.reply('⏳ جاري جلب الأغنية وتشغيلها بصوت صافي...');
            currentStreamUrl = url;

            // البقاء المستمر في الروم بدون انقطاع
            currentConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });

            // استخدام إعدادات الصوت القياسية لضمان وضوح وقوة الصوت
            const stream = ytDlpWrap.execStream([
                url, 
                '-f', 'bestaudio', 
                '--no-check-certificates'
            ]);
            
            const resource = createAudioResource(stream);

            player.play(resource);
            currentConnection.subscribe(player);

            message.channel.send('🎶 بدأ تشغيل الأغنية بنجاح!');
        } catch (error) {
            console.error(error);
            message.reply('❌ حدث خطأ أثناء تشغيل الأغنية.');
        }
    }

    // أمر تكرار الأغنية (Loop)
    if (command === '!loop') {
        isLooping = !isLooping;
        if (isLooping) {
            message.reply('🔂 تم تفعيل **التكرار (Loop)** لهذه الأغنية.');
        } else {
            message.reply('🔁 تم إيقاف **التكرار (Loop)**.');
        }
    }
});

// إعادة تشغيل الأغنية تلقائياً في حال تفعيل اللوب أو استمرار التشغيل
player.on(AudioPlayerStatus.Idle, () => {
    if (isLooping && currentStreamUrl && currentConnection) {
        const stream = ytDlpWrap.execStream([currentStreamUrl, '-f', 'bestaudio']);
        const resource = createAudioResource(stream);
        player.play(resource);
    }
});

// معالجة الأخطاء لضمان عدم توقف البوت أبداً (يعمل 24/7 بدون حدود)
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("ERROR: DISCORD_TOKEN is missing in Railway Variables!");
    process.exit(1);
}

client.login(token);
