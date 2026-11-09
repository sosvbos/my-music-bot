const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { exec } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const queueMap = new Map();

client.on('ready', () => {
    console.log(`Bot is ready and online: ${client.user.tag}! 🎵`);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const args = message.content.split(' ');
    const command = args[0].toLowerCase();
    const guildId = message.guild.id;

    if (command === 'play') {
        const voiceChannel = message.member?.voice.channel;
        if (!voiceChannel) {
            return message.reply('❌ يا ليت تدخل روم صوتي أول!');
        }

        const url = args[1];
        if (!url) {
            return message.reply('❌ يا ليت تحط رابط يوتيوب بعد الأمر!');
        }

        try {
            let connection = queueMap.get(guildId)?.connection;

            if (!connection) {
                connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                    selfDeaf: false,
                });
            }

            // الحفاظ على حالة التكرار السابقة إن وجدت للسيرفر
            const existingData = queueMap.get(guildId);
            const isLooping = existingData ? existingData.loop : false;

            if (existingData && existingData.filePath && fs.existsSync(existingData.filePath)) {
                try { fs.unlinkSync(existingData.filePath); } catch (e) {}
            }

            await message.reply('⚠️ **تنبيه وإبراء ذمة:** أنا بريء من سماع ما لا يرضي الله، اللهم قد بلغت اللهم فاشهد. (وما تقدمونه على أنفسكم انتم مسؤولون عنه).');

            const uniqueID = Date.now();
            const outputFilePath = path.join(__dirname, `audio_${uniqueID}.mp3`);

            // تشغيل yt-dlp بأقصى سرعة لتحميل الملف الصوتي ونقله للمشغل
            const commandYtDlp = `yt-dlp -x --audio-format mp3 --ffmpeg-location "${ffmpeg}" -o "${outputFilePath}" "${url}"`;

            exec(commandYtDlp, (error) => {
                if (error || !fs.existsSync(outputFilePath)) {
                    if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
                    message.channel.send('❌ عذراً، لم أستطع تحميل هذا المقطع.');
                    return;
                }

                let player = queueMap.get(guildId)?.player;
                if (!player) {
                    player = createAudioPlayer();
                    connection.subscribe(player);
                }

                const playAudio = (filePath) => {
                    const resource = createAudioResource(filePath, {
                        inputType: StreamType.Arbitrary,
                        inlineVolume: true
                    });
                    resource.volume?.setVolume(1.0);
                    player.play(resource);
                };

                playAudio(outputFilePath);

                // حفظ بيانات السيرفر (مع زر التكرار والمسار والرابط الحالي)
                queueMap.set(guildId, { player, connection, filePath: outputFilePath, url, loop: isLooping });

                // إرسال الأزرار العملية الفريش (إيقاف مؤقت، تكرار، إيقاف وخروج)
                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🎶 جاري تشغيل المقطع الصوتي')
                    .setDescription(`حالة التكرار: **${isLooping ? '🔂 مفعل' : '🔄 معطل'}**\nالبوت ثابت في الروم 24 ساعة.`);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('music_pause').setLabel('⏸️ مؤقت / استئناف').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('music_loop').setLabel(isLooping ? '🔂 إلغاء التكرار' : '🔁 تكرار الأغنية').setStyle(isLooping ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_stop').setLabel('⏹️ إيقاف وخروج').setStyle(ButtonStyle.Danger)
                );

                message.channel.send({ embeds: [embed], components: [row] });

                // حدث انتهاء الأغنية (يدعم التكرار التلقائي السريع لو مفعّل، ويحافظ على بقاء البوت في الروم)
                player.removeAllListeners(AudioPlayerStatus.Idle);
                player.on(AudioPlayerStatus.Idle, () => {
                    const currentData = queueMap.get(guildId);
                    if (currentData && currentData.loop && fs.existsSync(outputFilePath)) {
                        // إعادة تشغيل نفس الملف فوراً لو التكرار شغال
                        playAudio(outputFilePath);
                    } else {
                        if (fs.existsSync(outputFilePath)) {
                            try { fs.unlinkSync(outputFilePath); } catch (e) {}
                        }
                    }
                });

                player.removeAllListeners('error');
                player.on('error', err => {
                    console.error('Audio Player Error:', err);
                });
            });

        } catch (error) {
            console.error('Play Error:', error);
            message.reply('❌ حدث خطأ غير متوقع.');
        }
    }

    if (command === 'stop' || command === 'leave' || command === '!leave') {
        stopBot(guildId, message.guild);
        message.reply('🔒 تم إيقاف الصوت والخروج بنجاح.');
    }
});

// التعامل مع تفاعل الأزرار (فرش وسريع جداً)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;
    const guildId = interaction.guildId;
    const data = queueMap.get(guildId);

    if (interaction.customId === 'music_pause') {
        if (!data || !data.player) {
            return interaction.reply({ content: '❌ لا يوجد مقطع شغّال حالياً!', ephemeral: true });
        }

        const status = data.player.state.status;
        if (status === AudioPlayerStatus.Playing) {
            data.player.pause();
            await interaction.reply({ content: '⏸️ تم إيقاف المقطع مؤقتاً.', ephemeral: true });
        } else if (status === AudioPlayerStatus.Paused) {
            data.player.unpause();
            await interaction.reply({ content: '▶️ تم استئناف تشغيل المقطع.', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ لا يمكن تنفيذ الإجراء حالياً.', ephemeral: true });
        }
    }

    if (interaction.customId === 'music_loop') {
        if (!data) {
            return interaction.reply({ content: '❌ لا يوجد مقطع نشط لتكراره!', ephemeral: true });
        }

        data.loop = !data.loop;
        queueMap.set(guildId, data);

        await interaction.reply({ 
            content: data.loop ? '🔂 تم تفعيل تكرار الأغنية بنجاح!' : '🔄 تم إلغاء تكرار الأغنية.', 
            ephemeral: true 
        });
    }

    if (interaction.customId === 'music_stop') {
        stopBot(guildId, interaction.guild);
        await interaction.reply({ content: '⏹️ تم إيقاف الصوت وإخراج البوت بنجاح.', ephemeral: true });
    }
});

function stopBot(guildId, guild) {
    if (queueMap.has(guildId)) {
        const oldData = queueMap.get(guildId);
        try {
            oldData.player.stop(); 
            if (oldData.connection) oldData.connection.destroy();
            if (oldData.filePath && fs.existsSync(oldData.filePath)) {
                fs.unlinkSync(oldData.filePath);
            }
        } catch (e) {}
        queueMap.delete(guildId);
    }
    try {
        guild.members.me?.voice.disconnect();
    } catch (e) {}
}

client.login("");
