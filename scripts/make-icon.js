const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..');
const assets = path.join(root, 'assets');
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function main() {
  const logo = path.join(assets, 'logo.png');

  await sharp(logo)
    .resize(512, 512, { fit: 'contain', background: transparent })
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, 'icon.png'));

  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const buffers = await Promise.all(
    sizes.map((size) =>
      sharp(logo)
        .resize(size, size, { fit: 'contain', background: transparent })
        .png()
        .toBuffer()
    )
  );
  const { default: pngToIco } = await import('png-to-ico');
  const ico = await pngToIco(buffers);
  fs.writeFileSync(path.join(assets, 'icon.ico'), ico);

  await sharp(logo)
    .resize(32, 32, { fit: 'contain', background: transparent })
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, 'tray.png'));

  await sharp(logo)
    .resize(64, 64, { fit: 'contain', background: transparent })
    .png({ compressionLevel: 9 })
    .toFile(path.join(assets, 'tray@2x.png'));

  console.log('تم إنشاء الأيقونات بنجاح.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
