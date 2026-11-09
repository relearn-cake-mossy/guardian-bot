const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

async function createWelcomeCard(member, config) {
  const width = 1000;
  const height = 360;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');

  if (fs.existsSync(config.welcomeBackgroundPath)) {
    const background = await loadImage(path.resolve(config.welcomeBackgroundPath));
    context.drawImage(background, 0, 0, width, height);
  } else {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#172554');
    gradient.addColorStop(1, '#7c3aed');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  context.fillStyle = 'rgba(0, 0, 0, 0.38)';
  context.fillRect(0, 0, width, height);

  const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
  context.save();
  context.beginPath();
  context.arc(190, 180, 108, 0, Math.PI * 2);
  context.closePath();
  context.clip();
  context.drawImage(avatar, 82, 72, 216, 216);
  context.restore();

  context.strokeStyle = '#ffffff';
  context.lineWidth = 8;
  context.beginPath();
  context.arc(190, 180, 108, 0, Math.PI * 2);
  context.stroke();

  context.textAlign = 'left';
  context.fillStyle = '#ffffff';
  context.font = 'bold 42px sans-serif';
  context.fillText('CHÀO MỪNG!', 360, 145, 580);
  context.font = 'bold 34px sans-serif';
  context.fillText(member.displayName || member.user.username, 360, 205, 580);
  context.font = '24px sans-serif';
  context.fillText(`Thành viên thứ ${member.guild.memberCount}`, 360, 252, 580);

  return canvas.toBuffer('image/png');
}

module.exports = { createWelcomeCard };
