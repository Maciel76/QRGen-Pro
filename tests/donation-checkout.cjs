const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const browser = await chromium.launch({ channel: process.env.TEST_BROWSER || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const root = path.resolve(__dirname, '..');
  let enabled = true;
  let fail = false;
  const posted = [];
  await context.route('https://qrgen.test/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === '/api/donations') {
      if (req.method() === 'GET') return route.fulfill({ status: 200, json: { enabled } });
      posted.push(req.postDataJSON());
      return route.fulfill(fail
        ? { status: 502, json: { error: 'Serviço indisponível. Tente novamente.' } }
        : { status: 200, json: { checkoutUrl: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=fixture', amountCents: req.postDataJSON().amountCents } });
    }
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
    try {
      return route.fulfill({ status: 200, contentType: types[path.extname(pathname)] || 'application/octet-stream', body: await fs.readFile(path.join(root, pathname.slice(1))) });
    } catch { return route.fulfill({ status: 404, body: 'Not found' }); }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('https://qrgen.test/doar.html');
  await page.locator('#donation-checkout-form').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#donation-pending').isVisible(), false);
  await page.locator('[data-amount="10"]').click();
  assert.equal(await page.locator('#donation-amount').inputValue(), '10');
  await page.locator('#donation-checkout-submit').click();
  await page.locator('#donation-payment-content').waitFor({ state: 'visible' });
  assert.deepEqual(posted[0], { amountCents: 1000 });
  assert.equal(await page.locator('#donation-qr canvas').count(), 1);
  assert.match(await page.locator('#donation-pay-link').getAttribute('href'), /^https:\/\/www.mercadopago.com.br\//);
  await page.screenshot({ path: path.join(os.tmpdir(), 'qrgen-donation-checkout.png'), fullPage: true });
  await page.locator('#donation-amount').fill('12,34');
  assert.equal(await page.locator('#donation-payment-content').isVisible(), false);
  await page.locator('#donation-checkout-submit').click();
  await page.locator('#donation-payment-content').waitFor({ state: 'visible' });
  assert.deepEqual(posted[1], { amountCents: 1234 });
  await page.locator('#donation-amount').fill('0');
  await page.locator('#donation-checkout-submit').click();
  assert.match(await page.locator('#donation-feedback').innerText(), /Informe um valor/);
  assert.equal(posted.length, 2);
  fail = true;
  await page.locator('#donation-amount').fill('5');
  await page.locator('#donation-checkout-submit').click();
  await page.waitForFunction(() => document.getElementById('donation-feedback').textContent.includes('Serviço indisponível'));
  assert.equal(await page.locator('#donation-checkout-submit').isEnabled(), true);
  assert.equal(await page.locator('#donation-payment-content').isVisible(), false);
  for (const width of [390, 768, 1366]) {
    await page.setViewportSize({ width, height: 948 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  enabled = false;
  await page.reload();
  assert.equal(await page.locator('#donation-pending').isVisible(), true);
  assert.equal(await page.locator('#donation-checkout-form').isVisible(), false);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: formulário detecta configuração, valores em centavos, QR do checkout, invalidação do valor antigo, erros, modo não configurado e celular. Nenhum pagamento real enviado.');
})().catch((error) => { console.error(error); process.exit(1); });
