// Charge les polices une seule fois (effet de bord au require). On bundle
// les fichiers .ttf dans le repo au lieu de compter sur des polices systeme :
// Render n'a pas forcement les memes polices qu'en local, ce qui casserait
// le rendu silencieusement (police de repli moche).
const path = require('path');
const { GlobalFonts } = require('@napi-rs/canvas');

const FONTS_DIR = path.join(__dirname, '..', '..', 'assets', 'fonts');

GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Poppins-Regular.ttf'), 'Poppins');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Poppins-Medium.ttf'), 'Poppins Medium');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Poppins-SemiBold.ttf'), 'Poppins SemiBold');
GlobalFonts.registerFromPath(path.join(FONTS_DIR, 'Poppins-Bold.ttf'), 'Poppins Bold');
