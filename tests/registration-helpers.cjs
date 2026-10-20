// Follow the visible service and review controls in suites that exercise other
// portal features. The dedicated registration suite covers every intermediate
// panel, validation boundary, back action and retained File identity.
exports.selectService = async (page, value) => {
    if (!(await page.locator('#reg-jenis-utama').isVisible())) await page.locator('[data-registration-step="service"]').click();
    await page.selectOption('#reg-jenis-utama',value);
    if (value && await page.locator('#registration-service-next').isEnabled()) await page.locator('#registration-service-next').click();
};
exports.reviewRequest = async page => page.locator('[data-registration-step="review"]').click();
exports.showFiles = async page => page.locator('[data-registration-step="files"]').click();
