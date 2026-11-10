const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');
const config = require('./src/config');
const { createModerationEngine } = require('./src/moderation');
const { createAiModerator } = require('./src/groq');
const { createWelcomeCard } = require('./src/welcome-card');
const { createDatabase } = require('./src/database');

if (!config.discordToken) {
  console.error('Thiếu DISCORD_TOKEN. Hãy tạo file .env theo .env.example.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const moderation = createModerationEngine(config);
const aiModerator = createAiModerator(config);
const database = createDatabase(config.databasePath, config.maxConfiguredGuilds);
const inactivePeriodMs = config.inactiveGuildDays * 24 * 60 * 60 * 1000;

const setupCommand = new SlashCommandBuilder()
  .setName('setup')
  .setDescription('Thiết lập Guardian cho server (tối đa 1.000 server)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addChannelOption((option) => option
    .setName('welcome_channel')
    .setDescription('Kênh gửi thiệp chào mừng thành viên mới')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true))
  .addChannelOption((option) => option
    .setName('goodbye_channel')
    .setDescription('Kênh gửi tin nhắn tạm biệt')
    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    .setRequired(true));

const termsEmbed = new EmbedBuilder()
  .setColor(0x7c3aed)
  .setTitle('Điều khoản và miễn trừ trách nhiệm Guardian')
  .setDescription([
    'Bằng cách chọn **Đồng ý và thiết lập**, quản trị viên xác nhận đã đọc và đồng ý:',
    '',
    '1. Guardian lưu ID server, ID hai kênh đã chọn, thời điểm chấp thuận và thời điểm hoạt động gần nhất trong SQLite để cung cấp dịch vụ. Cấu hình bị xóa sau 30 ngày không có tin nhắn từ người dùng hoặc khi bot rời server.',
    '2. Bộ lọc tự động có thể xóa nhầm hoặc bỏ sót nội dung. Quản trị viên server chịu trách nhiệm kiểm tra cấu hình, xử lý khiếu nại và quyết định biện pháp phù hợp.',
    '3. Khi bật AI, nội dung tin nhắn tối đa 400 ký tự có thể được gửi tới nhà cung cấp AI bên thứ ba để phân loại. AI hỗ trợ tiếng Việt, tiếng Anh, tiếng Trung (giản thể và phồn thể), tiếng Pháp và tiếng Hàn, nhưng có thể nhận diện sai. Không gửi thông tin bí mật qua Discord; việc xử lý tuân theo chính sách của nhà cung cấp.',
    '4. Dịch vụ được cung cấp “nguyên trạng”, không bảo đảm hoạt động liên tục hoặc ngăn chặn mọi hành vi vi phạm. Nhà phát triển không chịu trách nhiệm về nội dung do thành viên đăng hoặc thiệt hại phát sinh trong phạm vi pháp luật cho phép.',
    '5. Quản trị viên phải thông báo cho thành viên về bot và bảo đảm việc sử dụng phù hợp quy định Discord, luật áp dụng và chính sách quyền riêng tư của server.',
    '',
    'Đây là thông báo điều khoản cơ bản, không thay thế tư vấn pháp lý. Chỉ người có quyền **Manage Server** mới nên xác nhận.',
  ].join('\n'));

async function registerCommands(applicationId) {
  const rest = new REST({ version: '10' }).setToken(config.discordToken);
  await rest.put(Routes.applicationCommands(applicationId), { body: [setupCommand.toJSON()] });
}

function renderText(template, member) {
  return template
    .replaceAll('{user}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
}

async function applyViolation(message, violation) {
  try {
    await message.delete();
  } catch (error) {
    console.error(`Không thể xóa tin nhắn vi phạm của ${message.author.tag}:`, error.message);
  }

  if (message.member?.kickable) {
    try {
      await message.member.kick(violation.reason.slice(0, 500));
    } catch (error) {
      console.error(`Không thể kick ${message.author.tag}:`, error.message);
    }
  }
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Đã đăng nhập Discord dưới tên ${readyClient.user.tag}`);
  if (!aiModerator) console.warn('Chưa cấu hình khóa AI; bot chỉ dùng bộ lọc cục bộ.');
  const removed = database.deleteInactive(Date.now() - inactivePeriodMs);
  if (removed) console.log(`Đã xóa cấu hình của ${removed} server không hoạt động.`);
  try {
    await registerCommands(readyClient.application.id);
  } catch (error) {
    console.error('Không thể đăng ký lệnh Discord:', error);
  }
  const cleanupTimer = setInterval(() => {
    const expired = database.deleteInactive(Date.now() - inactivePeriodMs);
    if (expired) console.log(`Đã xóa cấu hình của ${expired} server không hoạt động.`);
  }, 6 * 60 * 60 * 1000);
  cleanupTimer.unref();
});

client.on(Events.GuildMemberAdd, async (member) => {
  const settings = database.getGuild(member.guild.id);
  if (!settings) return;
  const channel = member.guild.channels.cache.get(settings.welcome_channel_id);
  if (!channel?.isTextBased()) return;

  try {
    const image = await createWelcomeCard(member, config);
    const attachment = new AttachmentBuilder(image, { name: 'welcome.png' });
    const embed = new EmbedBuilder()
      .setColor(0x7c3aed)
      .setDescription(renderText(config.welcomeText, member))
      .setImage('attachment://welcome.png')
      .setTimestamp();
    await channel.send({ embeds: [embed], files: [attachment] });
  } catch (error) {
    console.error('Không thể gửi thiệp chào mừng:', error);
    await channel.send({
      content: renderText(config.welcomeText, member),
      allowedMentions: { parse: [] },
    });
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  const settings = database.getGuild(member.guild.id);
  if (!settings) return;
  const channel = member.guild.channels.cache.get(settings.goodbye_channel_id);
  if (!channel?.isTextBased()) return;
  await channel.send({
    content: renderText(config.goodbyeText, member),
    allowedMentions: { parse: [] },
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!database.getGuild(message.guild.id)) return;
  database.touchActivity(message.guild.id);

  const violation = moderation.inspect(message);
  if (violation) {
    await applyViolation(message, violation);
    return;
  }
  aiModerator?.enqueue(message, (aiViolation) => applyViolation(message, aiViolation));
});

client.on(Events.GuildDelete, (guild) => {
  if (database.deleteGuild(guild.id)) {
    console.log(`Đã xóa cấu hình server ${guild.id} vì bot đã rời server.`);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'setup') return;
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({ content: 'Lệnh này chỉ dùng được trong server.', ephemeral: true });
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: 'Bạn cần quyền Manage Server để thiết lập bot.', ephemeral: true });
    return;
  }

  const welcomeChannel = interaction.options.getChannel('welcome_channel', true);
  const goodbyeChannel = interaction.options.getChannel('goodbye_channel', true);
  const reply = await interaction.reply({
    embeds: [termsEmbed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('guardian-setup-accept')
          .setLabel('Đồng ý và thiết lập')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('guardian-setup-decline')
          .setLabel('Từ chối')
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    ephemeral: true,
    fetchReply: true,
  });

  const collector = reply.createMessageComponentCollector({ time: 5 * 60 * 1000 });
  collector.on('collect', async (button) => {
    if (button.user.id !== interaction.user.id) {
      await button.reply({ content: 'Chỉ người chạy lệnh /setup mới có thể xác nhận.', ephemeral: true });
      return;
    }

    if (button.customId === 'guardian-setup-decline') {
      await button.update({ content: 'Bạn đã từ chối điều khoản; bot chưa lưu cấu hình.', embeds: [], components: [] });
      collector.stop();
      return;
    }

    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await button.update({ content: 'Bạn không còn quyền Manage Server; cấu hình không được lưu.', embeds: [], components: [] });
      collector.stop();
      return;
    }

    const botPermissions = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
    if (![welcomeChannel, goodbyeChannel].every((channel) => (
      channel.permissionsFor(client.user)?.has(botPermissions)
    ))) {
      await button.update({
        content: 'Bot cần quyền View Channel và Send Messages ở cả hai kênh đã chọn. Chưa lưu cấu hình.',
        embeds: [],
        components: [],
      });
      collector.stop();
      return;
    }

    const saved = database.saveGuild({
      guildId: interaction.guild.id,
      welcomeChannelId: welcomeChannel.id,
      goodbyeChannelId: goodbyeChannel.id,
    });
    if (!saved) {
      await button.update({
        content: `Bot đã đạt giới hạn ${config.maxConfiguredGuilds} server. Cấu hình không được lưu.`,
        embeds: [],
        components: [],
      });
      collector.stop();
      return;
    }

    await button.update({
      content: `Đã thiết lập Guardian cho **${interaction.guild.name}**. Chào mừng: ${welcomeChannel}; tạm biệt: ${goodbyeChannel}.`,
      embeds: [],
      components: [],
    });
    collector.stop();
  });

  collector.on('end', async (_collected, reason) => {
    if (reason === 'time') {
      await interaction.editReply({
        content: 'Hết thời gian xác nhận; cấu hình chưa được lưu.',
        embeds: [],
        components: [],
      });
    }
  });
});

client.on(Events.Error, (error) => console.error('Discord client error:', error));

client.login(config.discordToken);
