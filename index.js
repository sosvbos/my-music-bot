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

// نظام منع السبام
const cooldowns = new Map();
const COOLDOWN_TIME = 3000;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Bot is online with Disclaimer.`);
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

    // أمر التشغيل: play [الرابط] (مع إرسال تنبيه وإبراء ذمة أولاً)
    if (command === 'play') {
        const url = args[1];
        if (!url) return message.reply('❌ يرجى كتابة الرابط بعد الأمر مباشرة، هكذا: `play رابط_اليوتيوب`');

        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply('❌ لازم تكون في روم صوتي عشان تشتغل الأغنية!');

        try {
            // إرسال تنبيه وإبراء الذمة فوراً عند طلب التشغيل
            await message.reply('⚠️ **تنبيه وإبراء ذمة:** أنا بريء من سماع ما لا يرضي الله، اللهم قد بلغت اللهم فاشهد. *(وما تقدمونه على أنفسكم انتم مسؤولون عنه)*\n\n⏳ جاري جلب الأغنية وتشغيلها...');
            
            currentStreamUrl = url;

            currentConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });

            // الطريقة الأولى المستقرة لاستخراج الرابط
            ytDlpWrap.exec([
                url,
                '-g',
                '-f', 'bestaudio'
            ]).then(output => {
                const audioUrl = output.trim().split('\n')[0];
                if (!audioUrl) {
                    return message.channel.send('❌ تعذر استخراج الرابط الصوتي من يوتيوب.');
                }

                const resource = createAudioResource(audioUrl);
                player.play(resource);
                currentConnection.subscribe(player);

                message.channel.send('🎶 بدأ تشغيل الصوت في الروم بنجاح!');
            }).catch(err => {
                console.error(err);
                message.channel.send('❌ حدث خطأ أثناء جلب الرابط، تأكد من صحة الرابط.');
            });

        } catch (error) {
            console.error(error);
            message.reply('❌ حدث خطأ أثناء تشغيل الصوت.');
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
player.on(AudioPlayerStatus.Idle, () => {
    if (isLooping && currentStreamUrl && currentConnection) {
        ytDlpWrap.exec([
            currentStreamUrl,
            '-g',
            '-f', 'bestaudio'
        ]).then(output => {
            const audioUrl = output.trim().split('\n')[0];
            if (audioUrl) {
                const resource = createAudioResource(audioUrl);
                player.play(resource);
            }
        }).catch(console.error);
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
