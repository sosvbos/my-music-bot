const { Client, GatewayIntentBits } = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState } = require('@discordjs/voice');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

let activeConnection = null;
let timerId = null;

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}! Timer Voice Bot is online.`);
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // أمر الانضمام والجلوس (مع مدة اختيارية بالساعات)
    // مثال: join (يبقى للأبد / مدة غير محدودة)
    // مثال: join 5 (يبقى 5 ساعات ثم يخرج تلقائياً)
    if (command === 'join') {
        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) return message.reply('❌ لازم تكون في روم صوتي عشان أدخل!');

        const hours = parseFloat(args[1]); // عدد الساعات (اختياري)

        try {
            if (activeConnection) {
                activeConnection.destroy();
                if (timerId) clearTimeout(timerId);
            }

            activeConnection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: voiceChannel.guild.id,
                adapterCreator: voiceChannel.guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: true, // ممتنع عن الكلام عشان يبقى هادئ ومتكي
            });

            // الحفاظ على الاتصال وثباته ضد الانقطاع
            activeConnection.on(VoiceConnectionStatus.Disconnected, async () => {
                try {
                    await Promise.race([
                        entersState(activeConnection, VoiceConnectionStatus.Signalling, 5_000),
                        entersState(activeConnection, VoiceConnectionStatus.Connecting, 5_000),
                    ]);
                } catch (error) {
                    if (activeConnection) activeConnection.destroy();
                }
            });

            if (hours && !isNaN(hours) && hours > 0) {
                const ms = hours * 60 * 60 * 1000;
                message.reply(`🛋️ ابشر! دخلت الروم وبجلس فيه لمدة **${hours} ساعات** ثم أطلع تلقائياً.`);
                
                timerId = setTimeout(() => {
                    if (activeConnection) {
                        activeConnection.destroy();
                        activeConnection = null;
                        message.channel.send('⏰ انتهى الوقت المحدد، طلعت من الروم الصوتي.');
                    }
                }, ms);
            } else {
                message.reply('🛋️ ابشر! دخلت الروم وبجلس فيه **بشكل دائم (مدة لامحدودة / 24/7)** حتى تكتب أمر الخروج.');
            }

        } catch (error) {
            console.error('JOIN ERROR:', error);
            message.reply('❌ حدث خطأ أثناء محاولة الدخول للروم.');
        }
    }

    // أمر الخروج اليدوي: leave
    if (command === 'leave') {
        if (!activeConnection) {
            return message.reply('❌ البوت ليس متصلاً بأي روم أصلاً!');
        }

        activeConnection.destroy();
        activeConnection = null;
        if (timerId) clearTimeout(timerId);
        
        return message.reply('👋 تم إخراج البوت ومغادرة الروم بنجاح.');
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
