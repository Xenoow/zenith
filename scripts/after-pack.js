/**
 * Hook electron-builder afterPack :
 * injecte l'icône personnalisée dans Zenith.exe après le packaging.
 */
const path = require('path');

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return;

  const { rcedit } = await import('rcedit');

  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');

  console.log(`  • afterPack: injection de l'icône dans ${path.basename(exePath)}…`);

  await rcedit(exePath, {
    icon: icoPath,
    'version-string': {
      FileDescription: 'Zenith — Planifiez vos journées',
      ProductName:     'Zenith',
      CompanyName:     'Xenoow',
    },
    'file-version':    context.packager.appInfo.version,
    'product-version': context.packager.appInfo.version,
  });

  console.log('  • afterPack: icône injectée ✓');
};
