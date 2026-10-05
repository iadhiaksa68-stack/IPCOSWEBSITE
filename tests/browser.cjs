const { chromium: playwright } = require('playwright-core');
const fs = require('node:fs');
exports.chromium = { async launch() {
    if (process.env.IPCOS_TEST_BROWSER) return playwright.launch({ executablePath: process.env.IPCOS_TEST_BROWSER, headless: true });
    const local = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (process.platform === 'darwin' && fs.existsSync(local)) return playwright.launch({ executablePath: local, headless: true });
    if (process.platform === 'linux') {
        const chromium = require('@sparticuz/chromium');
        return playwright.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
    }
    throw new Error('Set IPCOS_TEST_BROWSER to a local Chrome/Chromium executable.');
}};
