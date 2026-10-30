// Run against a local static server: QUIZVIEW_URL=http://localhost:8000 node tests/browser.cjs
const { chromium } = require('playwright');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
    const browser = await chromium.launch({headless: true, ...(process.env.HTTPS_PROXY && !process.env.QUIZVIEW_ASSETS ? {proxy: {server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost'}} : {}), ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox']} : {})});
    const page = await browser.newPage({reducedMotion: 'reduce', ignoreHTTPSErrors: true});
    if (process.env.QUIZVIEW_ASSETS) {
        await page.route('https://**/*', async route => {
            const url = new URL(route.request().url());
            let asset;
            if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/npm/katex@0.16.22/dist/')) {
                asset = path.join(process.env.QUIZVIEW_ASSETS, 'katex/dist', url.pathname.split('/dist/')[1]);
            } else if (url.hostname === 'cdnjs.cloudflare.com' && url.pathname.startsWith('/ajax/libs/pdf.js/3.11.174/')) {
                asset = path.join(process.env.QUIZVIEW_ASSETS, 'pdfjs-dist/build', path.basename(url.pathname));
            }
            if (asset) await route.fulfill({path: asset});
            else await route.abort();
        });
    }
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = process.env.QUIZVIEW_URL || 'http://localhost:8000';
    for (const [path, selector] of [['test-parser.html', '#results'], ['test-e2e.html', '#testOutput'], ['tests/rich-content.html', '#results']]) {
        await page.goto(`${base}/${path}`);
        await page.waitForFunction(sel => /(?:Failed|failed)/.test(document.querySelector(sel).textContent), selector);
        const output = await page.locator(selector).innerText();
        assert.match(output, /0 [Ff]ailed/, output);
        console.log(path, output.split('\n').filter(line => /[Pp]assed/.test(line)).join(' '));
    }
    const question = 'Evaluate $\\frac{1}{2}$, then inspect this code:\n```cpp\n  int x = 1;\n\n  cout << "' + 'long code '.repeat(30) + '";\n```\nWhat is $x^2$?';
    const explanation = 'The answer is $\\sqrt{1}=1$.\n$$\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$$\n' + 'A long explanation remains readable. '.repeat(120).trim();
    for (const width of [360, 390, 430, 1280]) {
        await page.setViewportSize({width, height: 844});
        await page.goto(base);
        await page.click('#sampleQuizBtn');
        await page.click('#headerEditorBtn');
        const card = page.locator('.editor-card').first();
        await card.locator('.q-text-input').fill(question);
        await card.locator('.q-exp-input').fill(explanation);
        await card.locator('.opt-text-input').nth(0).fill('$x=1$');
        await card.locator('.opt-text-input').nth(1).fill('```cpp\n  return 2;\n```');
        await page.click('#saveEditorBtn');
        assert.equal(await page.locator('#questionText .rich-code-viewport').textContent(), '  int x = 1;\n\n  cout << "' + 'long code '.repeat(30) + '";');
        assert.equal(await page.locator('#questionText .katex').count(), 2);
        await page.locator('.option-btn[data-key="B"]').click();
        assert.equal(await page.locator('#explanationBox').isVisible(), false);
        await page.locator('.option-btn[data-key="A"]').click();
        await page.waitForTimeout(100);
        const layout = await page.evaluate(() => ({
            width: innerWidth, pageWidth: document.documentElement.scrollWidth,
            top: document.querySelector('#explanationBox').getBoundingClientRect().top,
            headerBottom: document.querySelector('header').getBoundingClientRect().bottom,
            dark: getComputedStyle(document.documentElement).colorScheme
        }));
        assert.equal(layout.pageWidth, layout.width, `No page overflow at ${width}: ${JSON.stringify(layout)}`);
        assert(layout.top >= layout.headerBottom && layout.top < 250, `Explanation visible at ${width}: ${JSON.stringify(layout)}`);
        assert.equal(layout.dark, 'dark');
        if (process.env.QUIZVIEW_SCREENSHOTS) await page.screenshot({path: path.join(process.env.QUIZVIEW_SCREENSHOTS, `explanation-${width}.png`)});
        await page.click('#backToQuestionBtn');
        if (process.env.QUIZVIEW_SCREENSHOTS) await page.screenshot({path: path.join(process.env.QUIZVIEW_SCREENSHOTS, `question-${width}.png`)});
        assert.equal(await page.evaluate(() => document.activeElement.id), 'questionText');
        await page.click('#headerEditorBtn');
        await page.keyboard.press('Escape');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'headerEditorBtn');
        await page.reload();
        await page.click('#resumeQuizBtn');
        await page.click('#headerEditorBtn');
        assert.equal(await page.locator('.q-text-input').first().inputValue(), question);
        assert.equal(await page.locator('.q-exp-input').first().inputValue(), explanation);
        await page.keyboard.press('Escape');
        await page.locator('.q-nav-pill').last().click();
        await page.click('#nextQuestionBtn');
        assert(await page.locator('#resultsView').isVisible());
        assert(await page.locator('.review-q-title .katex').count() >= 2);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
        console.log(`PASS ${width}px: author/save/reload/answer/explanation/results, rich rendering, containment, focus, dark theme`);
    }
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(base);
    await page.click('#sampleQuizBtn');
    await page.click('#nextQuestionBtn');
    await page.locator('.option-btn[data-key="B"]').click();
    await page.waitForTimeout(1000);
    assert(await page.locator('#explanationBox').isVisible());
    const shortTop = await page.locator('#explanationBox').evaluate(el => el.getBoundingClientRect().top);
    assert(shortTop >= 65 && shortTop < 650, `Short explanation visible with smooth scrolling: ${shortTop}`);
    console.log('PASS normal quiz: short explanation with normal-motion scrolling');
    // Worker imports cannot use Playwright's page-level asset routing. Exercise PDF.js's supported fallback.
    if (process.env.QUIZVIEW_ASSETS) await page.addInitScript(() => { window.Worker = undefined; });
    await page.goto(base);
    page.on('dialog', async dialog => { console.log('PDF dialog:', dialog.message()); await dialog.dismiss(); });
    await page.locator('#pdfFileInput').setInputFiles(path.join(__dirname, '../sample-quiz.pdf'));
    await page.waitForSelector('#quizView.active', {timeout: 15000});
    assert(await page.locator('.option-btn').count() >= 2);
    console.log('PASS sample PDF upload and extraction');
    await page.click('#headerUploadBtn');
    const downloadPromise = page.waitForEvent('download');
    await page.click('#downloadSamplePdfBtn');
    const download = await downloadPromise;
    await page.locator('#pdfFileInput').setInputFiles({name: 'generated.pdf', mimeType: 'application/pdf', buffer: require('node:fs').readFileSync(await download.path())});
    await page.waitForSelector('#quizView.active');
    assert.equal(await page.locator('.q-nav-pill').count(), 3);
    console.log('PASS generated sample PDF download and re-import');
    assert.deepEqual(errors, []);
    await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
