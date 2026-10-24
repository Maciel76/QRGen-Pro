const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/donations.js');
const pixFixture = require('./pix-fixture.cjs');
const payer = { email: 'donor@example.com', cpf: '52998224725', requestId: '12345678-1234-4234-8234-123456789abc' };
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
test('Pix API validates payer and value, reuses retry key and does not expose private data', async () => {
  const names = ['MERCADO_PAGO_ACCESS_TOKEN', 'APP_URL', 'VERCEL_URL', 'VERCEL_ENV'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const savedFetch = global.fetch;
  const savedWarn = console.warn;
  try {
    for (const name of names) delete process.env[name];
    process.env.APP_URL = 'https://gerador-qrcode-inventario.vercel.app';
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error('Unexpected API call'); };
    assert.equal((await call(request('GET'))).body.enabled, false);
    assert.equal((await call(request('POST', { amountCents: 500 }))).status, 503);
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'server-only-test-secret';
    const status = await call(request('GET'));
    assert.equal(status.body.enabled, true);
    assert.ok(!status.text.includes('server-only-test-secret'));
    assert.equal(status.headers['Cache-Control'], 'no-store');
    assert.equal((await call(request('DELETE'))).status, 405);
    assert.equal((await call(request('POST', {}, { origin: 'https://attacker.example' }))).status, 403);
    assert.equal((await call(request('POST', {}, { origin: undefined }))).status, 403);
    assert.equal((await call(request('POST', {}, { 'content-type': 'text/plain' }))).status, 415);
    assert.equal((await call(request('POST', '{'))).status, 400);
    assert.equal((await call(request('POST', 'x'.repeat(2049)))).status, 413);
    for (const amountCents of [0, -100, 99, 100001, 100.5, '500', null]) assert.equal((await call(request('POST', { ...payer, amountCents }))).status, 400);
    for (const invalid of [{ email: 'invalid' }, { cpf: '11111111111' }, { cpf: '52998224726' }, { requestId: 'invalid' }]) assert.equal((await call(request('POST', { ...payer, amountCents: 500, ...invalid }))).status, 400);
    assert.equal(calls, 0);
    const keys = [];
    let payload;
    const pixCode = pixFixture('12.34');
    let responseBody = { payment_method_id: 'pix', currency_id: 'BRL', transaction_amount: 12.34, status: 'pending', date_of_expiration: new Date(Date.now() + 3600000).toISOString(), point_of_interaction: { transaction_data: { qr_code: pixCode } }, payer: { email: payer.email }, private_field: 'do-not-expose' };
    global.fetch = async (url, options) => {
      assert.equal(url, 'https://api.mercadopago.com/v1/payments');
      assert.equal(options.headers.Authorization, 'Bearer server-only-test-secret');
      keys.push(options.headers['X-Idempotency-Key']);
      payload = JSON.parse(options.body);
      return { ok: true, json: async () => responseBody };
    };
    const body = { ...payer, amountCents: 1234, payment_method_id: 'tampered' };
    const success = await call(request('POST', body));
    assert.equal(success.status, 200);
    assert.equal(success.body.pixCode, pixCode);
    assert.equal(success.body.checkoutUrl, undefined);
    assert.equal(payload.payment_method_id, 'pix');
    assert.equal(payload.transaction_amount, 12.34);
    assert.equal(payload.payer.identification.number, payer.cpf);
    for (const value of [payer.cpf, payer.email, 'server-only-test-secret', 'do-not-expose']) assert.ok(!success.text.includes(value));
    await call(request('POST', body));
    assert.equal(keys[0], keys[1]);
    await call(request('POST', { ...body, amountCents: 1235 }));
    assert.notEqual(keys[1], keys[2]);
    responseBody = { ...responseBody, status: 'approved' };
    assert.equal((await call(request('POST', body))).status, 409);
    responseBody = { ...responseBody, status: 'pending', date_of_expiration: '2020-01-01T00:00:00Z' };
    assert.equal((await call(request('POST', body))).status, 409);
    responseBody.point_of_interaction.transaction_data.qr_code = 'https://example.com';
    assert.equal((await call(request('POST', body))).status, 502);
    const logs = [];
    console.warn = (...args) => logs.push(JSON.stringify(args));
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: 'invalid_token', message: 'server-only-test-secret', payer }) });
    const failed = await call(request('POST', body));
    assert.equal(failed.status, 502);
    assert.match(failed.body.error, /não autorizou/);
    assert.ok(failed.body.reference);
    for (const value of [payer.cpf, payer.email, 'server-only-test-secret']) {
      assert.ok(!failed.text.includes(value));
      assert.ok(!logs.join('').includes(value));
    }
  } finally {
    for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
    global.fetch = savedFetch;
    console.warn = savedWarn;
  }
});
