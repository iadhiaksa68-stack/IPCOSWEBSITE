const { mkdirSync, rmSync, readFileSync, writeFileSync, copyFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { gzipSync, brotliCompressSync } = require('node:zlib');
const path = require('node:path');
const { transformSync } = require('esbuild');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'public');
const allowed = require('./assets.cjs');
const read = name => { if (!allowed.includes(name)) throw Error('Asset is not allowlisted: '+name); return readFileSync(path.join(root,name),'utf8'); };
let html = read('index.html');
const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map(match=>match[1]);
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(match=>match[1]);
if (!scripts.length || !styles.length) throw Error('Missing entry assets.');
rmSync(output,{recursive:true,force:true}); mkdirSync(output);
const hash = content => createHash('sha256').update(content).digest('hex').slice(0,16);
const measure = code => ({raw:Buffer.byteLength(code),gzip:gzipSync(code).length,brotli:brotliCompressSync(code).length});
// HTML handlers and deferred scripts share globals. Preserve their names and
// execution order; do not tree-shake or wrap the portal in a module/IIFE.
const options = {target:'es2022',charset:'utf8',minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,treeShaking:false,legalComments:'eof'};
const manifest = {}, lazy = ['sop.js','admin-export.js'];
for (const name of lazy) {
    const code = transformSync(read(name),{...options,loader:'js'}).code;
    const emitted = name.replace('.js','-'+hash(code)+'.js'); manifest[name]=emitted;
    writeFileSync(path.join(output,emitted),code);
}
let source = scripts.map(read).join('\n;\n');
for (const [name,emitted] of Object.entries(manifest)) {
    source = source.replaceAll("'"+name+"'","'"+emitted+"'").replaceAll('"'+name+'"','"'+emitted+'"');
}
const js = transformSync(source,{...options,loader:'js'}).code;
const cssSource = styles.map(read).join('\n');
const css = transformSync(cssSource,{loader:'css',target:'es2022',minify:true,legalComments:'eof'}).code;
const jsName='portal-'+hash(js)+'.js', cssName='portal-'+hash(css)+'.css';
writeFileSync(path.join(output,jsName),js); writeFileSync(path.join(output,cssName),css);
let firstScript = true, firstStyle = true;
html = html.replace(/<script src="([^"]+)" defer><\/script>/g,()=>{if (!firstScript) return ''; firstScript=false; return `<script src="${jsName}" defer></script>`;});
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g,()=>{if (!firstStyle) return ''; firstStyle=false; return `<link rel="stylesheet" href="${cssName}">`;});
writeFileSync(path.join(output,'index.html'),html);
for (const name of allowed) {
    if (name==='index.html' || scripts.includes(name) || styles.includes(name) || lazy.includes(name)) continue;
    const target=path.join(output,name); mkdirSync(path.dirname(target),{recursive:true}); copyFileSync(path.join(root,name),target);
}
const report = {initialRequests:{before:scripts.length+styles.length,after:2},js:{before:measure(source),after:measure(js)},css:{before:measure(cssSource),after:measure(css)},manifest:{...manifest,js:jsName,css:cssName}};
mkdirSync(path.join(root,'test-results'),{recursive:true});
writeFileSync(path.join(root,'test-results/build-report.json'),JSON.stringify(report,null,2));
console.log(`PASS Production assets: ${report.initialRequests.before} → 2 local CSS/JS requests. JS ${report.js.before.raw} → ${report.js.after.raw} bytes; CSS ${report.css.before.raw} → ${report.css.after.raw} bytes. Tests/backend/source maps are excluded.`);
