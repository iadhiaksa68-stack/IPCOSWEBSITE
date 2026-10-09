const { createServer } = require('node:http');
const { readFileSync, mkdirSync } = require('node:fs');
const { spawn } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = require('./assets.cjs');
const suites = ['transactions', 'regressions', 'workflow', 'private-documents', 'services', 'journey', 'journey-cloud', 'language-layout', 'sop', 'experience', 'next', 'review-tools', 'review-enhancements'];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.mjs':'text/javascript', '.wasm':'application/wasm', '.txt':'text/plain' };
// Whitelisted files and mocked API routes make these tests independent of live data.
const server = createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
    if (!assets.includes(name)) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)] || 'application/octet-stream' });
    res.end(readFileSync(path.join(root, name)));
});
async function run(file, args = []) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [...args, file], { cwd: root, stdio: 'inherit' });
        const timeout = setTimeout(() => { child.kill('SIGKILL'); }, 180000);
        child.once('error', error => { clearTimeout(timeout); reject(error); });
        child.once('exit', (code, signal) => { clearTimeout(timeout); code === 0 ? resolve() : reject(new Error(`${file} failed (${signal || code})`)); });
    });
}
(async () => {
    for (const file of assets.filter(name => name.endsWith('.js'))) await run(file, ['--check']);
    await run('tests/release-gate.cjs', ['--test']);
    await run('tests/document-checks.cjs', ['--test']);
    await run('tests/backend-journey.cjs', ['--test']);
    await run('tests/backend-sop.cjs', ['--test']);
    await run('tests/backend-next.cjs', ['--test']);
    await run('tests/backend-review.cjs', ['--test']);
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await run('tests/backend-transactions.cjs');
    await run('tests/backups.cjs');
    mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8766, '127.0.0.1', resolve); });
    for (const suite of suites) await run(`tests/${suite}.cjs`);
    console.log(`PASS All ${suites.length} release suites completed. Deployment may proceed.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => server.close());
