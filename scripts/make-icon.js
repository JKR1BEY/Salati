const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');

async function main() {
  const iconSvg = fs.readFileSync(path.join(assets, 'icon.svg'));
  const traySvg = fs.readFileSync(path.join(assets, 'tray.svg'));

  await sharp(iconSvg).resize(512, 512).png().toFile(path.join(assets, 'icon.png'));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((size) => sharp(iconSvg).resize(size, size).png().toBuffer())
  );
  const { default: pngToIco } = await import('png-to-ico');
  const ico = await pngToIco(buffers);
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico);

  await sharp(traySvg).resize(32, 32).png().toFile(path.join(assets, 'tray.png'));
  await sharp(traySvg).resize(64, 64).png().toFile(path.join(assets, 'tray@2x.png'));

  console.log('تم إنشاء الأيقونات بنجاح.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
