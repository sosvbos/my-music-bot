const { Client, GatewayIntentBits } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus 
} = require('@discordjs/voice');
const playdl = require('play-dl');

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

// نظام منع السبام
const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Secure Graduation Bot is online.`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    const validCommands = ['ping', 'play', 'loop', 'stop'];
    if (!validCommands.includes(command)) return;

    // تطبيق مانع السبام
    const userId = message.author.id;
    const now = Date.now();
    if (cooldowns.has(userId)) {
        const expirationTime = cooldowns.get(userId) + COOLDOWN_TIME;
        if (now < expirationTime) return;
    }
    cooldowns.set(userId, now);
    setTimeout(() => cooldowns.delete(userId), COOLDOWN_TIME);

    if (command === 'ping') {
        return message.reply('Pong! البوت شغال وسليم 100% 🎵');
    }

    // أمر التشغيل: play [الرابط]
    if (command === 'play') {
        const query = args.slice(1).join(' ');
        if (!query) return message.reply('❌ يرجى كتابة الرابط أو اسم المقاطع بعد الأمر، هكذا: `play رابط_اليوتيوب`');

        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply('❌ لازم تكون في روم صوتي عشان تشتغل الأغنية!');

        try {
            // إرسال تنبيه وإبراء الذمة فوراً
            await message.reply('⚠️ **تنبيه وإبراء ذمة:** أنا بريء من سماع ما لا يرضي الله، اللهم قد بلغت اللهم فاشهد. *(وما تقدمونه على أنفسكم انتم مسؤولون عنه)*\n\n⏳ جاري جلب المقطع وتجاوز الحظر...');
            
            currentStreamUrl = query;

            currentConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });

            // طريقة آمنة ومضمونة لسحب الصوت وتجاوز حظر يوتيوب في السيرفرات السحابية
            let streamData;
            let targetUrl = query;

            if (!query.startsWith('http')) {
                const searchResults = await playdl.search(query, { limit: 1 });
                if (searchResults.length > 0) {
                    targetUrl = searchResults[0].url;
                } else {
                    return message.channel.send('❌ لم يتم العثور على نتائج مطابقة للبحث.');
                }
            }

            const validatedSource = await playdl.video_info(targetUrl);
            streamData = await playdl.stream(validatedSource.video_details.url, { 
                discordPlayerCompatibility: true,
                quality: 2 
            });

            const resource = createAudioResource(streamData.stream, {
                inputType: streamData.type
            });

            player.play(resource);
            currentConnection.subscribe(player);

            message.channel.send('🎶 بدأ تشغيل الصوت في الروم بنجاح!');
        } catch (error) {
            console.error('PLAY ERROR:', error);
            message.reply('❌ حدث خطأ أثناء تشغيل الصوت، تأكد من صحة الرابط.');
        }
    }

    // أمر التكرار: loop
    if (command === 'loop') {
        isLooping = !isLooping;
        if (isLooping) {
            return message.reply('🔂 تم تفعيل **التكرار (Loop)**.');
        } else {
            return message.reply('🔁 تم إيقاف **التكرار (Loop)**.');
        }
    }

    // أمر الإيقاف: stop
    if (command === 'stop') {
        isLooping = false;
        currentStreamUrl = null;
        player.stop();
        if (currentConnection) {
            currentConnection.destroy();
            currentConnection = null;
        }
        return message.reply('🛑 تم إيقاف الصوت ومغادرة الروم بنجاح.');
    }
});

// إعادة التشغيل التلقائي عند تفعيل اللوب
player.on(AudioPlayerStatus.Idle, async () => {
    if (isLooping && currentStreamUrl && currentConnection) {
        try {
            const streamData = await playdl.stream(currentStreamUrl, { discordPlayerCompatibility: true });
            const resource = createAudioResource(streamData.stream, {
                inputType: streamData.type
            });
            player.play(resource);
        } catch (error) {
            console.error(error);
        }
    }
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("ERROR: DISCORD_TOKEN is missing in Railway Variables!");
    process.exit(1);
}

client.login(token);
