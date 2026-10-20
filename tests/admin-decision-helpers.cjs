const assert = require('node:assert/strict');

// Previewing a decision must not save file reviews or change academic status.
// Callers confirm explicitly after checking this separate review step.
async function previewAdminDecision(page, calls, expectedText = '') {
    const mutations = () => calls.filter(call => ['save_document_review', 'update'].includes(call.action)).length;
    const before = mutations();
    await page.click('#btn-case-submit');
    await page.waitForSelector('#admin-decision-summary', {state: 'visible'});
    await page.waitForFunction(() => !isPreparingReviewDecision && !isPreparingCorrection && !activeUpdateIds.size);
    assert.equal(mutations(), before, 'Opening the decision summary does not save reviews or send a decision');
    const summary = page.locator('#admin-decision-summary');
    if (expectedText) assert((await summary.textContent()).includes(expectedText), 'The summary contains the decision being confirmed');
    return summary;
}

module.exports = {previewAdminDecision};
