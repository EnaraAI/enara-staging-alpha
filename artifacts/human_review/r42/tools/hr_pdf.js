const { chromium } = require('playwright');
(async () => {
  const dir = process.argv[2]; const names = process.argv.slice(3);
  const b = await chromium.launch(); const p = await b.newPage();
  for (const n of names) {
    await p.goto('file://' + dir + '/.' + n + '.html', { waitUntil: 'load' });
    await p.pdf({ path: dir + '/' + n + '.pdf', format: 'A4', margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' }, printBackground: true,
      displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: '<div style="font-size:8px;width:100%;text-align:center;color:#666">' + n + ' · page <span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
    console.log('pdf', n);
  }
  await b.close();
})();
