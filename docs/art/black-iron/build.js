// node build.js [--only=a,b] [--out=file.html]
// Inlines core.js + every modules/*.js (or only the listed ones) into template.html.
const fs = require('fs');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const order = ['world', 'underside', 'belts', 'assembler', 'splitter', 'launch'];
let mods = fs.readdirSync(__dirname + '/modules').filter(f => f.endsWith('.js')).map(f => f.replace('.js', ''));
if (args.only) { const keep = args.only.split(','); mods = mods.filter(m => keep.includes(m)); }
mods.sort((a, b) => (order.indexOf(a) + 99) % 99 - (order.indexOf(b) + 99) % 99);
const tpl = fs.readFileSync(__dirname + '/template.html', 'utf8');
const core = fs.readFileSync(__dirname + '/core.js', 'utf8');
const scripts = mods.map(m => '<script>\n/* ---- module: ' + m + ' ---- */\n' + fs.readFileSync(__dirname + '/modules/' + m + '.js', 'utf8') + '\n</script>').join('\n');
const out = args.out || 'out.html';
fs.writeFileSync(__dirname + '/' + out, tpl.replace('/*@@CORE@@*/', () => core).replace('/*@@MODULES@@*/', () => scripts));
console.log('wrote', out, 'modules:', mods.join(', ') || '(none, fallbacks only)');
