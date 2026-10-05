const { chromium: playwright } = require('playwright-core');
const fs = require('node:fs');
exports.chromium = { async launch() {
    if (process.env.IPCOS_TEST_BROWSER) return playwright.launch({ executablePath: process.env.IPCOS_TEST_BROWSER, headless: true });
    const local = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (process.platform === 'darwin' && fs.existsSync(local)) return playwright.launch({ executablePath: local, headless: true });
    if (process.platform === 'linux') {
        const { default: chromium } = await import('@sparticuz/chromium');
        // Multiple role tabs need separate renderers; the Lambda single-process
        // optimization can freeze animation frames when opening a second page.
        const args = chromium.args.filter(arg => arg !== '--single-process' && !arg.startsWith('--headless='));
        return playwright.launch({ args, executablePath: await chromium.executablePath(), headless: true });
    }
    throw new Error('Set IPCOS_TEST_BROWSER to a local Chrome/Chromium executable.');
}};
