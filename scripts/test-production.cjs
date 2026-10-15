// Exercise the artifact Vercel publishes, including hashed lazy modules.
// Existing fixtures block external requests and never touch the academic database.
const { createServer } = require('node:http');
const { readFileSync, readdirSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'public');
const files = new Set();
function collect(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = prefix + entry.name;
        if (entry.isDirectory()) collect(path.join(directory, entry.name), name + '/');
        else if (entry.isFile()) files.add(name);
    }
}
collect(output);
const types = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.wasm':'application/wasm', '.txt':'text/plain' };
const server = createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!files.has(name)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type':types[path.extname(name)] || 'application/octet-stream' });
    res.end(readFileSync(path.join(output, name)));
});
async function run(suite) {
    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [`tests/${suite}.cjs`], { cwd:root, stdio:'inherit' });
        const timeout = setTimeout(() => child.kill('SIGKILL'), 180000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', (code, signal) => { clearTimeout(timeout); code === 0 ? resolve() : reject(Error(`Production ${suite} failed (${signal || code})`)); });
    });
}
(async () => {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8766, '127.0.0.1', resolve); });
    for (const suite of ['transactions', 'language-layout', 'sop', 'review-tools', 'academic-international', 'accessibility', 'portal-polish', 'admin-ui', 'student-ui', 'registration-ui']) await run(suite);
    console.log('PASS Ten browser suites verified the minified production artifact.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.close());
