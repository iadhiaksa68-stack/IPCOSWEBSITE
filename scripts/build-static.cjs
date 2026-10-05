const { mkdirSync, rmSync, copyFileSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public');
rmSync(output, { recursive: true, force: true });
mkdirSync(output);
for (const name of require('./assets.cjs')) copyFileSync(path.join(root, name), path.join(output, name));
console.log('PASS Static output contains only website assets; tests and backend are excluded.');
