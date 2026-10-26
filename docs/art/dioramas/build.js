// node build.js [only-id]  -> out.html (all styles in styles/ in order, or just one)
const fs = require('fs');
const order = ['cogiron', 'cogaether', 'cogpit', 'cogworks', 'neon', 'wild', 'sample'];
const only = process.argv[2];
const files = fs.readdirSync('styles').filter(f => f.endsWith('.js')).map(f => f.replace('.js',''))
  .filter(id => only ? id === only : id !== 'sample').sort((a,b)=>order.indexOf(a)-order.indexOf(b));
const tpl = fs.readFileSync('template.html','utf8');
const scripts = files.map(id => '<script>\n' + fs.readFileSync('styles/'+id+'.js','utf8') + '\n</script>').join('\n');
const out = only ? 'out-'+only+'.html' : 'out.html';
fs.writeFileSync(out, tpl.replace('/*@@STYLES@@*/', scripts));
console.log('wrote', out, files);
