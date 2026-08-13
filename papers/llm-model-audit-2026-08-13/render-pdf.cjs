// render-pdf.cjs — canonical CDP PDF renderer for QNFO papers
// Usage: node render-pdf.cjs <input.html> <output.pdf>
const { existsSync, statSync } = require('fs');
const { resolve } = require('path');
const puppeteer = require('C:/Users/LENOVO/node_modules/puppeteer-core');

const chromeExe = 'C:/Users/LENOVO/.cache/puppeteer/chrome/chrome-win64/chrome.exe';

async function main() {
  const [,, htmlName, pdfName] = process.argv;
  if (!htmlName || !pdfName) {
    console.error('Usage: node render-pdf.cjs <input.html> <output.pdf>');
    process.exit(2);
  }
  const htmlFile = resolve(htmlName);
  const pdfFile = resolve(pdfName);
  if (!existsSync(htmlFile)) {
    console.error('HTML not found:', htmlFile);
    process.exit(2);
  }

  const browser = await puppeteer.launch({
    executablePath: chromeExe,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    const fileUrl = 'file:///' + htmlFile.replace(/\\/g, '/');
    await page.goto(fileUrl, { waitUntil: 'load', timeout: 120000 });
    await new Promise(r => setTimeout(r, 2500));

    // If MathJax exists, wait for it
    try {
      await page.evaluate(() => {
        if (typeof window.MathJax !== 'undefined' && window.MathJax.startup && window.MathJax.startup.promise) {
          return window.MathJax.startup.promise;
        }
        return Promise.resolve();
      });
      console.log('MathJax render done (if present)');
    } catch (e) {
      console.log('MathJax note:', e.message.substring(0, 120));
    }

    const mathCount = await page.evaluate(() =>
      document.querySelectorAll('mjx-container, .MathJax, mjx-assistive-mml').length
    );
    console.log('Rendered math elements:', mathCount);

    await page.pdf({
      path: pdfFile,
      format: 'A4',
      printBackground: true,
      margin: { top: '2cm', bottom: '2cm', left: '2cm', right: '2cm' }
    });

    const size = statSync(pdfFile).size;
    console.log(`PDF: ${(size/1024).toFixed(1)} KB`);
    console.log(size >= 102400 ? 'SIZE-GATE: PASS (>=100KB)' : 'SIZE-GATE: FAIL (<100KB)');
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
