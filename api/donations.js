"use strict";
const { randomUUID } = require("node:crypto");
const MIN_CENTS = 100;
const MAX_CENTS = 100000;
const DEFAULT_APP_URL = "https://gerador-qrcode-inventario.vercel.app";

function appOrigin() {
  const url = new URL(process.env.APP_URL || DEFAULT_APP_URL);
  if (url.protocol !== "https:") throw new Error("Invalid app URL");
  return url.origin;
}
function allowedOrigin(origin, configuredOrigin) {
  if (origin === configuredOrigin) return true;
  if (process.env.VERCEL_ENV === "development") {
    try {
      const local = new URL(origin);
      if (["http:", "https:"].includes(local.protocol) && ["localhost", "127.0.0.1"].includes(local.hostname)) return true;
    } catch { return false; }
  }
  // Preview deployments have their own origin, supplied by Vercel itself.
  const previewHost = process.env.VERCEL_URL;
  if (previewHost && origin === `https://${previewHost}`) return true;
  return false;
}
function isCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "mercadopago.com.br" || url.hostname.endsWith(".mercadopago.com.br"));
  } catch { return false; }
}
function reply(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(data));
}
module.exports = async function donations(req, res) {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN?.trim();
  if (req.method === "GET") {
    // This endpoint never returns the token, Public Key or Client Secret.
    return reply(res, 200, { enabled: Boolean(token), minCents: MIN_CENTS, maxCents: MAX_CENTS });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return reply(res, 405, { error: "Método não permitido." });
  }
  let origin;
  try { origin = appOrigin(); }
  catch { return reply(res, 503, { error: "As contribuições estão temporariamente indisponíveis." }); }
  if (!allowedOrigin(req.headers.origin, origin)) return reply(res, 403, { error: "Origem não autorizada." });
  if (String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase() !== "application/json") {
    return reply(res, 415, { error: "Envie o valor no formato JSON." });
  }
  if (!token) return reply(res, 503, { error: "O recebimento ainda não está configurado." });
  let amountCents;
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(raw) > 2048) return reply(res, 413, { error: "Solicitação muito grande." });
    const body = JSON.parse(raw);
    amountCents = body?.amountCents;
  } catch { return reply(res, 400, { error: "Não foi possível ler o valor da contribuição." }); }
  if (!Number.isSafeInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return reply(res, 400, { error: "Escolha um valor entre R$ 1,00 e R$ 1.000,00." });
  }
  // Only the server controls the currency, product, return address and final amount.
  const body = {
    items: [{ id: "qrgen-contribution", title: "Contribuição para o projeto QRGen Pro", quantity: 1, currency_id: "BRL", unit_price: amountCents / 100 }],
    back_urls: {
      success: `${origin}/doar.html?retorno=sucesso`,
      pending: `${origin}/doar.html?retorno=pendente`,
      failure: `${origin}/doar.html?retorno=falha`,
    },
    external_reference: `qrgen-${randomUUID()}`,
  };
  try {
    const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return reply(res, 502, { error: "Não foi possível abrir o pagamento no Mercado Pago. Tente novamente mais tarde." });
    const preference = await response.json();
    if (!isCheckoutUrl(preference.init_point)) return reply(res, 502, { error: "O endereço de pagamento não está disponível. Tente novamente mais tarde." });
    return reply(res, 200, { checkoutUrl: preference.init_point, amountCents });
  } catch {
    return reply(res, 502, { error: "O Mercado Pago demorou para responder. Tente novamente em instantes." });
  }
};
