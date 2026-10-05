const { chromium: playwright } = require('playwright-core');
const fs = require('node:fs');
let activeBrowser;
function remember(browser) { activeBrowser = browser; return browser; }
exports.chromium = { async launch() {
    if (process.env.IPCOS_TEST_BROWSER) return playwright.launch({ executablePath: process.env.IPCOS_TEST_BROWSER, headless: true }).then(remember);
    const local = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (process.platform === 'darwin' && fs.existsSync(local)) return playwright.launch({ executablePath: local, headless: true }).then(remember);
    if (process.platform === 'linux') {
        const { default: chromium } = await import('@sparticuz/chromium');
        // Build machines have no GPU. These tests use ordinary HTML/2D canvas,
        // so avoid a shared SwiftShader process that can stop frame updates.
        chromium.setGraphicsMode = false;
        // Multiple role tabs need separate renderers; the Lambda single-process
        // optimization can freeze animation frames when opening a second page.
        const args = ['--disable-gpu', ...chromium.args.filter(arg => !['--single-process', '--in-process-gpu'].includes(arg) && !arg.startsWith('--headless='))];
        return playwright.launch({ args, executablePath: await chromium.executablePath(), headless: true }).then(remember);
    }
    throw new Error('Set IPCOS_TEST_BROWSER to a local Chrome/Chromium executable.');
}};
exports.reportFailure = async error => {
    console.error(error);
    for (const [index, page] of (activeBrowser?.contexts().flatMap(context => context.pages()) || []).entries()) {
        try {
            console.error('TEST PAGE STATE', index, await page.evaluate(() => ({
                role: typeof currentUser === 'undefined' ? '' : currentUser.role,
                loginBusy: typeof loginBusy === 'undefined' ? null : loginBusy,
                welcomeDisplay: document.getElementById('welcome-modal')?.style.display,
                adminError: document.getElementById('error-msg-admin')?.textContent,
                studentError: document.getElementById('error-msg-mhs')?.textContent,
                visibleTab: document.querySelector('.tab-content.active')?.id,
                documentState: document.readyState,
                visibility: document.visibilityState
            })));
            await page.screenshot({path:`test-results/failure-${index}.png`,timeout:3000});
        } catch (diagnosticError) { console.error('Could not capture test page:', diagnosticError.message); }
    }
    await activeBrowser?.close();
    process.exitCode = 1;
};
