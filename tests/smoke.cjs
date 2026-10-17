const { chromium } = require('playwright');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const fillProducts = async (ean = false) => {
    await page.locator('#input').fill(ean
      ? '7891234567895;Camiseta básica;10\n5901234123457;Tênis casual;5\n4006381333931;Mochila urbana;8'
      : 'PROD001;Camiseta básica;10\nPROD002;Tênis casual;5\nPROD003;Mochila urbana;8');
    await page.locator('#generate').click();
  };
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.screenshot({ path: path.join(os.tmpdir(), 'qrgen-desktop.png'), fullPage: true });
  await fillProducts();
  assert.equal(await page.locator('.qr-card').count(), 3);
  assert.equal(await page.locator('.qrbox canvas').count(), 3);
  assert.equal(await page.locator('#print-btn').isEnabled(), true);
  await page.locator('.type-switch [data-type="barcode"]').click();
  assert.equal(await page.locator('.qrbox svg').count(), 3);
  await page.locator('#barcodeFormat').selectOption('EAN13');
  assert.equal(await page.locator('#print-btn').isDisabled(), true);
  assert.match(await page.locator('#status').innerText(), /inválidas/);
  await fillProducts(true);
  assert.equal(await page.locator('.qrbox svg').count(), 3);
  assert.equal(await page.locator('#print-btn').isEnabled(), true);
  await page.locator('#input').fill('7891234567890;Dígito inválido;1\n7891234567895;Válido;2');
  assert.equal(await page.locator('#print-btn').isDisabled(), true);
  await page.locator('#generate').click();
  assert.equal(await page.locator('.invalid-label').count(), 1);
  assert.equal(await page.locator('#results-count').innerText(), '1 etiqueta');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.invalid-label').isVisible(), false);
  assert.equal(await page.locator('.topbar').isVisible(), false);
  await page.emulateMedia({ media: 'screen' });
  await page.locator('#barcodeFormat').selectOption('CODE128');
  await page.locator('#input').fill('00123;Produto;2\n00123;Duplicado;9\nABC;Outro;1');
  await page.locator('#generate').click();
  assert.equal(await page.locator('.qr-card').count(), 2);
  assert.equal(await page.locator('.qr-details h3').first().innerText(), '00123');
  await page.locator('[data-view="table"]').click();
  assert.equal(await page.locator('#grid tbody tr').count(), 2);
  assert.equal(await page.locator('#grid tbody svg').count(), 2);
  await page.locator('[data-view="economic"]').click();
  assert.equal(await page.locator('.economic-mode .qrbox svg').count(), 2);
  await page.locator('#clear').click();
  assert.equal(await page.locator('#print-btn').isDisabled(), true);
  assert.equal(await page.locator('.qrbox').count(), 0);
  // Import without a header and preserve initial zeros, including quoted fields.
  await page.locator('#csv').setInputFiles({ name: 'produtos.csv', mimeType: 'text/csv', buffer: Buffer.from('00123;"Produto; especial";2\n00456;Segundo;4') });
  await page.waitForFunction(() => document.querySelector('#results-count').textContent === '2 etiquetas');
  assert.equal(await page.locator('.qr-details h3').first().innerText(), '00123');
  assert.equal(await page.locator('.qr-details p').first().innerText(), 'Produto; especial');
  await page.locator('#addMilRef').click();
  assert.match(await page.locator('#input').inputValue(), /^001230001;/m);
  assert.equal(await page.locator('#print-btn').isDisabled(), true);
  await page.locator('#generate').click();
  await page.locator('#applyQuantity').click();
  assert.match(await page.locator('#input').inputValue(), /^0012300010002;/m);
  await page.locator('#barcodeFormat').selectOption('CODE39');
  await page.locator('#input').fill('abc;Inválido;1\nABC-123;Válido;2');
  await page.locator('#generate').click();
  assert.equal(await page.locator('.invalid-label').count(), 1);
  // User data is text, never executable markup.
  await page.locator('#input').fill('ABC;<img src=x onerror="window.injected=true">;2');
  await page.locator('#generate').click();
  assert.equal(await page.evaluate(() => window.injected), undefined);
  assert.equal(await page.locator('.qr-details img').count(), 0);
  await page.locator('.type-switch [data-type="qr"]').click();
  await fillProducts();
  await page.locator('[data-view="cards"]').click();
  await page.screenshot({ path: path.join(os.tmpdir(), 'qrgen-results.png'), fullPage: true });
  await page.pdf({ path: path.join(os.tmpdir(), 'qrgen-print.pdf'), preferCSSPageSize: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(os.tmpdir(), 'qrgen-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  // Both suffix actions are visible and behave identically in QR and barcode modes.
  for (const type of ['qr', 'barcode']) {
    await page.locator(`.type-switch [data-type="${type}"]`).click();
    if (type === 'barcode') await page.locator('#barcodeFormat').selectOption('CODE128');
    await page.locator('#input').fill('ABC123;Produto;3');
    await page.locator('#generate').click();
    assert.equal(await page.locator('#addMilRef').isVisible(), true);
    assert.equal(await page.locator('#applyQuantity').isVisible(), true);
    await page.locator('#addMilRef').click();
    assert.match(await page.locator('#input').inputValue(), /^ABC1230001;/m);
    assert.equal(await page.locator('#print-btn').isDisabled(), true);
    await page.locator('#generate').click();
    assert.equal(await page.locator('.qr-details h3').innerText(), 'ABC1230001');
    await page.locator('#applyQuantity').click();
    assert.match(await page.locator('#input').inputValue(), /^ABC12300010003;/m);
    await page.locator('#generate').click();
    assert.equal(await page.locator('.qr-details h3').innerText(), 'ABC12300010003');
    assert.equal(await page.locator('#print-btn').isEnabled(), true);
    await page.locator('#input').fill('ABC;Produto;');
    await page.locator('#applyQuantity').click();
    assert.equal(await page.locator('#input').inputValue(), 'ABC;Produto;');
    assert.match(await page.locator('#status').innerText(), /quantidades inteiras/);
  }
  await page.locator('.type-switch [data-type="qr"]').click();
  assert.equal(await page.locator('#example-btn, #empty-example, #preview-description').count(), 0);
  assert.equal(await page.locator('footer #help-btn').count(), 1);
  // Import common spreadsheet formats through the real file picker.
  await page.locator('#clear').click();
  for (const bookType of ['xlsx', 'xls', 'xlsb', 'xlsm', 'ods', 'fods', 'xml', 'dif', 'sylk', 'dbf', 'html']) {
    const bytes = await page.evaluate((bookType) => {
      const wb = XLSX.utils.book_new();
      const sheet = XLSX.utils.aoa_to_sheet([
        bookType === 'dbf' ? ['Quantidade', 'Nome', 'Codigo', 'Ignorar'] : ['Quantidade', 'Descrição do produto', 'Código de barras', 'Ignorar'],
        [2, 'Café especial', '00123', 'Outro'],
        [4, 'Segundo', '00456', 'Campo'],
      ]);
      XLSX.utils.book_append_sheet(wb, sheet, 'Produtos');
      return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType })));
    }, bookType);
    await page.locator('#csv').setInputFiles({ name: `produtos.${bookType}`, mimeType: 'application/octet-stream', buffer: Buffer.from(bytes) });
    await page.waitForFunction(() => !document.querySelector('.file-upload').hasAttribute('aria-busy'));
    console.log(bookType, await page.locator('#status').innerText());
    assert.equal(await page.locator('#results-count').innerText(), '2 etiquetas', bookType);
    assert.equal(await page.locator('.qr-details h3').first().innerText(), '00123', bookType);
    assert.equal(await page.locator('.qr-details p').first().innerText(), 'Café especial', bookType);
    assert.match(await page.locator('.quantity').first().innerText(), /2/, bookType);
  }
  // Optional columns: code only, code/name, name/quantity and quantity only.
  const cases = [
    ['Código\n00001\n00002', '00001', ''],
    ['Código;Nome\n00001;Café\n00002;Chá', '00001', 'Café'],
    ['Nome;Quantidade\nCafé;2\nChá;3', 'Café', 'Café'],
    ['Quantidade\n2\n3', '2', ''],
    ['00001\n00002', '00001', ''],
    ['00001;Café\n00002;Chá', '00001', 'Café'],
    ['00001;;2\n00002;;3', '00001', ''],
  ];
  for (const [source, expectedCode, expectedName] of cases) {
    await page.locator('#csv').setInputFiles({ name: 'opcionais.csv', mimeType: 'text/csv', buffer: Buffer.from(source) });
    await page.waitForFunction(() => !document.querySelector('.file-upload').hasAttribute('aria-busy'));
    assert.equal(await page.locator('.qr-card').count(), 2, source);
    assert.equal(await page.locator('.qr-details h3').first().innerText(), expectedCode, source);
    if (expectedName) assert.equal(await page.locator('.qr-details p').first().innerText(), expectedName, source);
    else assert.equal(await page.locator('.qr-details p').count(), 0, source);
  }
  // UTF-16 tab-delimited text and legacy Windows-1252 CSV.
  for (const [name, buffer] of [
    ['unicode.tsv', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Código\tNome\n00001\tCafé', 'utf16le')])],
    ['legado.csv', Buffer.from('codigo;nome\n00001;Café', 'latin1')],
  ]) {
    await page.locator('#csv').setInputFiles({ name, mimeType: 'text/plain', buffer });
    await page.waitForFunction(() => !document.querySelector('.file-upload').hasAttribute('aria-busy'));
    assert.equal(await page.locator('.qr-details h3').first().innerText(), '00001');
    assert.equal(await page.locator('.qr-details p').first().innerText(), 'Café');
  }
  // Multiple sheets, blank first sheet, formatted numeric codes, and selection changes.
  const multi = await page.evaluate(() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Vazia');
    const ws = XLSX.utils.aoa_to_sheet([['codigo', 'nome'], [123, 'Produto formatado']]);
    ws.A2.z = '000000';
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Nome'], ['Só o nome']]), 'Nomes');
    return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
  });
  await page.locator('#csv').setInputFiles({ name: 'abas.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from(multi) });
  await page.waitForFunction(() => document.querySelector('#file-name').textContent === 'abas.xlsx' && !document.querySelector('.file-upload').hasAttribute('aria-busy'));
  assert.equal(await page.locator('#sheet-picker').isVisible(), true);
  assert.equal(await page.locator('#sheet-select').inputValue(), 'Estoque');
  assert.equal(await page.locator('.qr-details h3').first().innerText(), '000123');
  await page.locator('#sheet-select').selectOption('Nomes');
  assert.equal(await page.locator('.qr-details h3').first().innerText(), 'Só o nome');
  await page.locator('#sheet-select').selectOption('Vazia');
  assert.equal(await page.locator('#print-btn').isDisabled(), true);
  assert.match(await page.locator('#status').innerText(), /Não há dados/);
  await page.locator('#clear').click();
  assert.equal(await page.locator('#sheet-picker').isVisible(), false);
  await page.locator('#csv').setInputFiles({ name: 'vazio.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from([]) });
  await page.waitForFunction(() => !document.querySelector('.file-upload').hasAttribute('aria-busy'));
  assert.match(await page.locator('#status').innerText(), /vazio/);
  assert.equal(await page.locator('#print-btn').isDisabled(), true);
  assert.equal(await page.locator('#page-title').count(), 0);
  await fillProducts();
  await page.screenshot({ path: path.join(os.tmpdir(), 'qrgen-import-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1080, height: 948 });
  await page.screenshot({ path: path.join(os.tmpdir(), 'qrgen-import-desktop.png'), fullPage: true });
  await page.locator('#theme-toggle').click();
  await page.reload();
  assert.equal(await page.locator('body').evaluate((el) => el.classList.contains('dark-mode')), true);
  await page.locator('#help-btn').click();
  assert.equal(await page.locator('#help-dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#help-dialog').isVisible(), false);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: QR, Code 128, EAN-13, Code 39, validation, CSV, Excel, OpenDocument, legacy tables, optional columns, encodings, sheets, duplicates, suffixes, views, print, mobile, persistence and safe rendering.');
})().catch((error) => { console.error(error); process.exit(1); });

