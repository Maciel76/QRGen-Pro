"use strict";
const { randomUUID, createHash } = require("node:crypto");
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
function validCPF(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10 % 11) % 10;
    if (digit !== Number(cpf[length])) return false;
  }
  return true;
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
  let amountCents, email, cpf, requestId;
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (Buffer.byteLength(raw) > 2048) return reply(res, 413, { error: "Solicitação muito grande." });
    const body = JSON.parse(raw);
    amountCents = body?.amountCents;
    email = String(body?.email || "").trim();
    cpf = String(body?.cpf || "").replace(/[.\-\s]/g, "");
    requestId = String(body?.requestId || "");
  } catch { return reply(res, 400, { error: "Não foi possível ler o valor da contribuição." }); }
  if (!Number.isSafeInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return reply(res, 400, { error: "Escolha um valor entre R$ 1,00 e R$ 1.000,00." });
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply(res, 400, { error: "Informe seu e-mail para gerar o Pix." });
  if (!validCPF(cpf)) return reply(res, 400, { error: "Informe um CPF válido para gerar o Pix." });
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId)) return reply(res, 400, { error: "Recarregue a página e tente novamente." });
  // Reuse the same key on retries, binding it to the exact amount and payer.
  const digest = createHash("sha256").update(JSON.stringify([amountCents, email, cpf])).digest("hex").slice(0, 16);
  const idempotencyKey = `qrgen-${requestId}-${digest}`;
  const body = {
    transaction_amount: amountCents / 100,
    description: "Contribuição para o projeto QRGen Pro",
    payment_method_id: "pix",
    payer: { email, identification: { type: "CPF", number: cpf } },
    external_reference: `qrgen-${requestId}`,
  };
  try {
    const response = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      const reference = randomUUID();
      // Log only diagnostic codes, never credentials, payer details or provider messages.
      let code = "unknown";
      try {
        const error = await response.json();
        const value = String(error.cause?.[0]?.code || error.error || "unknown");
        if (/^[a-z0-9_-]{1,60}$/i.test(value)) code = value;
      } catch { /* The provider may return an empty response. */ }
      console.warn("donation_pix_error", { status: response.status, code, reference });
      const error = response.status === 401 || response.status === 403
        ? "O Mercado Pago não autorizou a cobrança. O responsável pelo projeto precisa verificar as credenciais e a habilitação do Pix."
        : "Não foi possível gerar o Pix no Mercado Pago. Confira seus dados e tente novamente.";
      return reply(res, 502, { error, reference });
    }
    const payment = await response.json();
    const pixCode = payment.point_of_interaction?.transaction_data?.qr_code;
    if (payment.payment_method_id !== "pix" || payment.currency_id !== "BRL" || Math.round(Number(payment.transaction_amount) * 100) !== amountCents || typeof pixCode !== "string" || !pixCode.startsWith("000201")) {
      return reply(res, 502, { error: "O Mercado Pago não retornou um código Pix válido. Tente novamente mais tarde." });
    }
    if (!["pending", "in_process"].includes(payment.status)) return reply(res, 409, { error: "Esta cobrança não está disponível para pagamento. Gere um novo Pix." });
    const expiresAt = payment.date_of_expiration;
    if (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) return reply(res, 409, { error: "O Pix expirou. Gere um novo código." });
    return reply(res, 200, { pixCode, amountCents, expiresAt });
  } catch {
    return reply(res, 502, { error: "O Mercado Pago demorou para responder. Tente novamente em instantes." });
  }
};
