const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
let html = fs.readFileSync(path.join(root, 'shell.html'), 'utf8');
const safeScript = s => s.replace(/<\/script/gi, '<\\/script');
html = html.replace('/* STYLES */', () => fs.readFileSync(path.join(root, 'styles.css'), 'utf8'))
 .replace('/* CORE */', () => safeScript(fs.readFileSync(path.join(root, 'core.js'), 'utf8')))
 .replace('/* APP */', () => safeScript(fs.readFileSync(path.join(root, 'clipboard.js'), 'utf8')+'\n'+fs.readFileSync(path.join(root, 'app.js'), 'utf8')));
if (fs.existsSync(path.join(root, 'table.js'))) html = html.replace('</body>', '<script>' + safeScript(fs.readFileSync(path.join(root, 'table.js'), 'utf8')) + '</script></body>');
html = html.replace('</body>', '<script>' + safeScript(fs.readFileSync(path.join(root, 'responsive.js'), 'utf8')) + '</script></body>');
fs.writeFileSync(path.join(root, 'Gamma價位工作台.html'), html);
console.log('Built standalone app:', Buffer.byteLength(html), 'bytes');
if (process.argv.includes('--site')) {
  // Publish only the standalone app, never the repository or local user files.
  const site = path.join(root, '_site');
  fs.mkdirSync(site, { recursive: true });
  const unexpected = fs.readdirSync(site).filter(name => !['index.html', '.nojekyll'].includes(name));
  if (unexpected.length) throw new Error('Unexpected files in _site; refusing to publish: ' + unexpected.join(', '));
  fs.writeFileSync(path.join(site, 'index.html'), html);
  fs.writeFileSync(path.join(site, '.nojekyll'), '');
  console.log('Built website: _site/index.html');
}
