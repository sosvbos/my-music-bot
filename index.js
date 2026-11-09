
const {
    Client,
    GatewayIntentBits,
    Events,
    PermissionsBitField
} = require('discord.js');

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
    entersState
} = require('@discordjs/voice');

const { spawn } = require('child_process');

// ========================================
// CONFIGURATION
// ========================================

const TOKEN = process.env.DISCORD_TOKEN;
const PREFIX = '';
const COOLDOWN = 2500;
const MAX_QUEUE = 100;

if (!TOKEN) {
    console.error('ERROR: DISCORD_TOKEN is missing!');
    process.exit(1);
}

// ========================================
// DISCORD CLIENT
// ========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.MessageContent
    ]
});

const guilds = new Map();
const cooldowns = new Map();

// ========================================
// GUILD PLAYER SYSTEM
// ========================================

function getState(guildId) {
    if (guilds.has(guildId)) {
        return guilds.get(guildId);
    }

    const player = createAudioPlayer();

    const state = {
        player,
        connection: null,
        channel: null,
        queue: [],
        current: null,
        loop: false,
        generation: 0,
        reconnecting: false
    };

    player.on(AudioPlayerStatus.Idle, () => {
        const track = state.current;

        if (track && state.loop && !track.skipped) {
            state.queue.unshift({
                url: track.url,
                requestedBy: track.requestedBy
            });
        }

        state.current = null;

        if (track) {
            killTrack(track);
        }

        playNext(guildId).catch(console.error);
    });

    player.on('error', error => {
        console.error('PLAYER ERROR:', error.message);

        const track = state.current;

        if (track) {
            track.skipped = true;
            killTrack(track);
        }

        state.current = null;

        playNext(guildId).catch(console.error);
    });

    guilds.set(guildId, state);

    return state;
}

// ========================================
// PROCESS MANAGEMENT
// ========================================

function killTrack(track) {
    if (!track) return;

    for (const proc of [track.ytdlp, track.ffmpeg]) {
        if (proc && proc.exitCode === null && !proc.killed) {
            try {
                proc.kill('SIGKILL');
            } catch (error) {
                console.error('PROCESS KILL ERROR:', error.message);
            }
        }
    }
}

// ========================================
// VOICE CONNECTION
// ========================================

async function connectVoice(channel, state) {
    if (
        state.connection &&
        state.connection.state.status === VoiceConnectionStatus.Destroyed
    ) {
        state.connection = null;
    }

    if (
        state.connection &&
        state.connection.joinConfig.channelId !== channel.id
    ) {
        state.connection.destroy();
        state.connection = null;
    }

    if (!state.connection) {
        state.channel = channel;

        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });

        state.connection = connection;

        connection.subscribe(state.player);

        connection.on('error', error => {
            console.error('VOICE ERROR:', error.message);
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            if (state.reconnecting) return;

            state.reconnecting = true;

            try {
                await Promise.race([
                    entersState(
                        connection,
                        VoiceConnectionStatus.Connecting,
                        5000
                    ),
                    entersState(
                        connection,
                        VoiceConnectionStatus.Signalling,
                        5000
                    ),
                    entersState(
                        connection,
                        VoiceConnectionStatus.Ready,
                        5000
                    )
                ]);
            } catch {
                console.log('Reconnecting voice connection...');

                if (state.connection === connection) {
                    connection.destroy();
                    state.connection = null;
                }

                if (state.channel && state.queue.length >= 0) {
                    try {
                        await connectVoice(state.channel, state);
                    } catch (error) {
                        console.error('RECONNECT FAILED:', error);
                    }
                }
            } finally {
                state.reconnecting = false;
            }
        });
    }

    await entersState(
        state.connection,
        VoiceConnectionStatus.Ready,
        20000
    );

    return state.connection;
}

// ========================================
// AUDIO PLAYBACK
// ========================================

async function playNext(guildId) {
    const state = getState(guildId);

    if (state.current) return;

    if (state.queue.length === 0) {
        console.log(`[${guildId}] Queue is empty.`);
        return;
    }

    const trackInfo = state.queue.shift();

    const track = {
        ...trackInfo,
        ytdlp: null,
        ffmpeg: null,
        skipped: false,
        generation: ++state.generation
    };

    state.current = track;

    console.log(`[${guildId}] Playing: ${track.url}`);

    try {
        if (!state.connection || !state.channel) {
            throw new Error('Voice connection is not available.');
        }

        // Start yt-dlp
        const ytdlp = spawn('yt-dlp', [
            '--no-warnings',
            '--no-progress',
            '--no-playlist',
            '--socket-timeout',
            '20',
            '--retries',
            '3',
            '-f',
            'bestaudio/best',
            '-o',
            '-',
            track.url
        ], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        track.ytdlp = ytdlp;

        // Start FFmpeg
        const ffmpeg = spawn('ffmpeg', [
            '-hide_banner',
            '-loglevel',
            'error',
            '-i',
            'pipe:0',
            '-f',
            's16le',
            '-ar',
            '48000',
            '-ac',
            '2',
            'pipe:1'
        ], {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        track.ffmpeg = ffmpeg;

        let ytErrors = '';
        let ffErrors = '';

        ytdlp.stderr.on('data', data => {
            ytErrors += data.toString();
            ytErrors = ytErrors.slice(-5000);
        });

        ffmpeg.stderr.on('data', data => {
            ffErrors += data.toString();
            ffErrors = ffErrors.slice(-5000);
        });

        ytdlp.on('error', error => {
            console.error('YT-DLP SPAWN ERROR:', error.message);
        });

        ffmpeg.on('error', error => {
            console.error('FFMPEG SPAWN ERROR:', error.message);
        });

        ytdlp.on('close', code => {
            if (code !== 0 && code !== null) {
                console.error('YT-DLP EXIT:', code, ytErrors);
            }
        });

        ffmpeg.on('close', code => {
            if (code !== 0 && code !== null) {
                console.error('FFMPEG EXIT:', code, ffErrors);
            }
        });

        // Connect audio pipeline
        ytdlp.stdout.pipe(ffmpeg.stdin);

        const resource = createAudioResource(ffmpeg.stdout, {
            inputType: StreamType.Raw
        });

        // Ensure track wasn't replaced
        if (state.current !== track) {
            killTrack(track);
            return;
        }

        state.player.play(resource);

        console.log(`[${guildId}] Audio started.`);

    } catch (error) {
        console.error('PLAYBACK ERROR:', error);

        killTrack(track);

        if (state.current === track) {
            state.current = null;
        }

        await playNext(guildId);
    }
}

// ========================================
// MESSAGE COMMANDS
// ========================================

client.on(Events.MessageCreate, async message => {
    if (message.author.bot || !message.guild) return;

    let content = message.content.trim();

    if (PREFIX && !content.startsWith(PREFIX)) return;

    if (PREFIX) {
        content = content.slice(PREFIX.length);
    }

    const args = content.split(/\s+/);

    const command = args.shift()?.toLowerCase();

    const commands = [
        'play',
        'stop',
        'skip',
        'loop',
        'pause',
        'resume',
        'queue',
        'leave',
        'ping'
    ];

    if (!commands.includes(command)) return;

    // Cooldown
    const userId = message.author.id;
    const now = Date.now();

    if (
        cooldowns.has(userId) &&
        now - cooldowns.get(userId) < COOLDOWN
    ) {
        return;
    }

    cooldowns.set(userId, now);

    setTimeout(() => {
        cooldowns.delete(userId);
    }, COOLDOWN);

    const state = getState(message.guild.id);

    // PING
    if (command === 'ping') {
        return message.reply('🏓 Pong! البوت يعمل بنجاح.');
    }

    // PLAY
    if (command === 'play') {
        const url = args[0];

        if (!url) {
            return message.reply(
                '❌ الاستخدام: `play رابط_الأغنية`'
            );
        }

        let parsed;

        try {
            parsed = new URL(url);

            if (!['http:', 'https:'].includes(parsed.protocol)) {
                throw new Error('Invalid URL');
            }
        } catch {
            return message.reply('❌ الرابط غير صالح.');
        }

        const voiceChannel = message.member.voice.channel;

        if (!voiceChannel) {
            return message.reply(
                '❌ يجب أن تدخل روم صوتي أولاً.'
            );
        }

        if (state.queue.length >= MAX_QUEUE) {
            return message.reply('❌ قائمة الانتظار ممتلئة.');
        }

        const permissions = voiceChannel.permissionsFor(
            message.guild.members.me
        );

        if (
            !permissions ||
            !permissions.has([
                PermissionsBitField.Flags.Connect,
                PermissionsBitField.Flags.Speak
            ])
        ) {
            return message.reply(
                '❌ البوت يحتاج صلاحيات Connect و Speak.'
            );
        }

        try {
            await connectVoice(voiceChannel, state);

            state.queue.push({
                url,
                requestedBy: message.author.username
            });

            await message.reply(
                `🎵 تمت إضافة الأغنية إلى القائمة.\nعدد الأغاني المنتظرة: ${state.queue.length}`
            );

            if (!state.current) {
                await playNext(message.guild.id);
            }

        } catch (error) {
            console.error('PLAY COMMAND ERROR:', error);

            return message.reply(
                '❌ تعذر الاتصال بالروم الصوتي.'
            );
        }
    }

    // LOOP
    else if (command === 'loop') {
        state.loop = !state.loop;

        return message.reply(
            state.loop
                ? '🔂 تم تفعيل التكرار.'
                : '🔁 تم إيقاف التكرار.'
        );
    }

    // SKIP
    else if (command === 'skip') {
        if (!state.current) {
            return message.reply('❌ لا توجد أغنية تعمل.');
        }

        state.current.skipped = true;

        killTrack(state.current);

        state.player.stop(true);

        return message.reply('⏭️ تم تخطي الأغنية.');
    }

    // STOP
    else if (command === 'stop') {
        state.queue = [];
        state.loop = false;

        if (state.current) {
            state.current.skipped = true;
            killTrack(state.current);
            state.current = null;
        }

        state.player.stop(true);

        return message.reply(
            '🛑 تم إيقاف التشغيل ومسح القائمة. البوت سيبقى في الروم.'
        );
    }

    // PAUSE
    else if (command === 'pause') {
        const success = state.player.pause();

        return message.reply(
            success
                ? '⏸️ تم إيقاف الأغنية مؤقتاً.'
                : '❌ لا توجد أغنية تعمل.'
        );
    }

    // RESUME
    else if (command === 'resume') {
        const success = state.player.unpause();

        return message.reply(
            success
                ? '▶️ تم استكمال الأغنية.'
                : '❌ لا توجد أغنية متوقفة.'
        );
    }

    // QUEUE
    else if (command === 'queue') {
        if (!state.current && state.queue.length === 0) {
            return message.reply('📭 قائمة الانتظار فارغة.');
        }

        const list = state.queue
            .slice(0, 15)
            .map((track, index) =>
                `${index + 1}. ${track.url}`
            )
            .join('\n');

        return message.reply(
            `🎶 **قائمة الانتظار**\n` +
            `${state.current ? '▶️ توجد أغنية تعمل حالياً.\n' : ''}` +
            `${list || 'لا توجد أغنيات أخرى.'}`
        );
    }

    // LEAVE
    else if (command === 'leave') {
        state.queue = [];
        state.loop = false;

        if (state.current) {
            state.current.skipped = true;
            killTrack(state.current);
            state.current = null;
        }

        state.player.stop(true);

        if (state.connection) {
            state.connection.destroy();
            state.connection = null;
        }

        state.channel = null;

        return message.reply(
            '👋 غادرت الروم الصوتي.'
        );
    }
});

// ========================================
// BOT READY
// ========================================

client.once(Events.ClientReady, readyClient => {
    console.log('================================');
    console.log(`✅ Bot: ${readyClient.user.tag}`);
    console.log('🎵 Music system: ONLINE');
    console.log('================================');
});

// ========================================
// ERROR HANDLING
// ========================================

process.on('unhandledRejection', error => {
    console.error('UNHANDLED REJECTION:', error);
});

process.on('uncaughtException', error => {
    console.error('UNCAUGHT EXCEPTION:', error);
});

// ========================================
// LOGIN
// ========================================

client.login(TOKEN).catch(error => {
    console.error('LOGIN ERROR:', error);
    process.exit(1);
});
