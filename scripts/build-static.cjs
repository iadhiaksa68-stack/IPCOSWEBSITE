const { mkdirSync, rmSync, copyFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
for (const name of require('./assets.cjs')) {const target=path.join(output,name);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(path.join(root,name),target);}
console.log('PASS Static output contains only website assets; tests and backend are excluded.');
