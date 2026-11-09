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
    console.log(`Logged in as ${client.user.tag}! Music Bot is 100% ready.`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // أمر الفحص (بدون علامة تعجب)
    if (command === 'ping') {
        message.reply('Pong! البوت شغال وسليم 100% 🎵');
    }

    // أمر التشغيل: play [الرابط]
    if (command === 'play') {
        const url = args[1];
        if (!url) return message.reply('❌ يرجى كتابة الرابط بعد الأمر مباشرة، هكذا: `play رابط_اليوتيوب`');

        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply('❌ لازم تكون في روم صوتي عشان تشتغل الأغنية!');

        try {
            message.reply('⏳ جاري جلب الأغنية وتشغيلها...');
            currentStreamUrl = url;

            currentConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false,
            });

            // سحب الرابط بصيغة صوتية مباشرة تضمن توافق التشغيل
            ytDlpWrap.exec([
                url,
                '-g',
                '-f', 'bestaudio'
            ]).then(output => {
                const audioUrl = output.trim().split('\n')[0];
                if (!audioUrl) {
                    return message.channel.send('❌ تعذر استخراج رابط الصوت من يوتيوب.');
                }

                const resource = createAudioResource(audioUrl);
                player.play(resource);
                currentConnection.subscribe(player);

                message.channel.send('🎶 بدأ تشغيل الأغنية بنجاح!');
            }).catch(err => {
                console.error(err);
                message.channel.send('❌ حدث خطأ أثناء جلب الرابط، تأكد أن الرابط صحيح.');
            });

        } catch (error) {
            console.error(error);
            message.reply('❌ حدث خطأ أثناء تشغيل الأغنية.');
        }
    }

    // أمر التكرار: loop
    if (command === 'loop') {
        isLooping = !isLooping;
        if (isLooping) {
            message.reply('🔂 تم تفعيل **التكرار (Loop)** لهذه الأغنية.');
        } else {
            message.reply('🔁 تم إيقاف **التكرار (Loop)**.');
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
        message.reply('🛑 تم إيقاف الموسيقى ومغادرة الروم بنجاح.');
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
