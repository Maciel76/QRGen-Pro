const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/donations.js');
function request(method, body, headers = {}) {
  return { method, body, headers: { origin: 'https://gerador-qrcode-inventario.vercel.app', 'content-type': 'application/json', ...headers } };
}
async function call(req) {
  let text;
  const headers = {};
  const res = { statusCode: 200, setHeader(name, value) { headers[name] = value; }, end(value) { text = value; } };
  await handler(req, res);
  return { status: res.statusCode, body: JSON.parse(text), headers, text };
}
test('Donation API validates requests and keeps credentials only on the server', async () => {
  const saved = { token: process.env.MERCADO_PAGO_ACCESS_TOKEN, app: process.env.APP_URL, preview: process.env.VERCEL_URL, env: process.env.VERCEL_ENV, fetch: global.fetch };
  try {
    delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_ENV;
    process.env.APP_URL = 'https://gerador-qrcode-inventario.vercel.app';
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error('Should not call the payment API'); };
    assert.equal((await call(request('GET'))).body.enabled, false);
    assert.equal((await call(request('POST', { amountCents: 500 }))).status, 503);
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'server-only-test-secret';
    const status = await call(request('GET'));
    assert.deepEqual(status.body, { enabled: true, minCents: 100, maxCents: 100000 });
    assert.ok(!status.text.includes('server-only-test-secret'));
    assert.equal(status.headers['Cache-Control'], 'no-store');
    assert.equal((await call(request('DELETE'))).status, 405);
    assert.equal((await call(request('POST', {}, { origin: 'https://attacker.example' }))).status, 403);
    assert.equal((await call(request('POST', {}, { origin: undefined }))).status, 403);
    assert.equal((await call(request('POST', {}, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await call(request('POST', '{'))).status, 400);
    assert.equal((await call(request('POST', 'x'.repeat(2049)))).status, 413);
    for (const amountCents of [0, -100, 99, 100001, 100.5, '500', null]) {
      assert.equal((await call(request('POST', { amountCents }))).status, 400);
    }
    assert.equal(calls, 0);
    let payload;
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.mercadopago.com/checkout/preferences');
      assert.equal(options.headers.Authorization, 'Bearer server-only-test-secret');
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => ({ init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=test', private_field: 'not-for-client' }) };
    };
    const success = await call(request('POST', { amountCents: 1234, currency: 'USD', title: 'tampered', return_url: 'https://attacker.example' }));
    assert.equal(success.status, 200);
    assert.equal(success.body.amountCents, 1234);
    assert.equal(payload.items[0].unit_price, 12.34);
    assert.equal(payload.items[0].currency_id, 'BRL');
    assert.equal(payload.items[0].title, 'Contribuição para o projeto QRGen Pro');
    assert.equal(payload.back_urls.success, 'https://gerador-qrcode-inventario.vercel.app/doar.html?retorno=sucesso');
    assert.ok(!success.text.includes('server-only-test-secret'));
    assert.ok(!success.text.includes('not-for-client'));
    global.fetch = async () => ({ ok: false, json: async () => ({ secret: 'do-not-expose' }) });
    const failure = await call(request('POST', { amountCents: 500 }));
    assert.equal(failure.status, 502);
    assert.ok(!failure.text.includes('do-not-expose'));
    global.fetch = async () => ({ ok: true, json: async () => ({ init_point: 'https://attacker.example' }) });
    assert.equal((await call(request('POST', { amountCents: 500 }))).status, 502);
    global.fetch = async () => { throw new Error('server-only-test-secret'); };
    assert.ok(!(await call(request('POST', { amountCents: 500 }))).text.includes('server-only-test-secret'));
    process.env.APP_URL = 'invalid';
    assert.equal((await call(request('POST', { amountCents: 500 }))).status, 503);
  } finally {
    for (const [name, value] of [['MERCADO_PAGO_ACCESS_TOKEN', saved.token], ['APP_URL', saved.app], ['VERCEL_URL', saved.preview], ['VERCEL_ENV', saved.env]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    global.fetch = saved.fetch;
  }
});
