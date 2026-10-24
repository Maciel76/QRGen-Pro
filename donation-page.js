"use strict";
let donationExpiryTimer;
let activePixExpiresAt = 0;
function isDonationPaymentUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      (url.hostname === "mpago.la" || url.hostname === "mercadopago.com.br" || url.hostname.endsWith(".mercadopago.com.br"));
  } catch { return false; }
}
function isDonationPixCode(value) {
  if (!value.startsWith("000201") || !/6304[0-9A-F]{4}$/i.test(value)) return false;
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value.slice(0, -4))) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
  }
  return crc.toString(16).padStart(4, "0").toUpperCase() === value.slice(-4).toUpperCase();
}
function renderDonationPage(config) {
  clearTimeout(donationExpiryTimer);
  activePixExpiresAt = 0;
  document.getElementById("donation-expiry").hidden = true;
  const pending = document.getElementById("donation-pending");
  const content = document.getElementById("donation-payment-content");
  const feedback = document.getElementById("donation-feedback");
  const box = document.getElementById("donation-qr");
  const paymentUrl = String(config?.paymentUrl || "").trim();
  const pixCode = String(config?.pixCode || "").trim();
  pending.hidden = false;
  content.hidden = true;
  feedback.textContent = "";
  box.replaceChildren();
  document.getElementById("donation-pix").hidden = true;
  const link = document.getElementById("donation-pay-link");
  link.hidden = true;
  link.removeAttribute("href");
  document.getElementById("donation-pix-code").value = "";
  const pix = isDonationPixCode(pixCode);
  const payment = isDonationPaymentUrl(paymentUrl);
  if (!pix && !payment) return;
  try {
    new QRCode(box, { text: pix ? pixCode : paymentUrl, width: 224, height: 224, correctLevel: QRCode.CorrectLevel.M, colorDark: "#161326", colorLight: "#ffffff" });
    const image = box.querySelector("img");
    if (image) image.alt = pix ? "QR Code Pix para doação" : "QR Code do link de contribuição no Mercado Pago";
    document.getElementById("donation-instructions").textContent = pix
      ? "Escaneie com o aplicativo do seu banco ou use o Pix Copia e Cola."
      : "Escaneie para abrir o pagamento no Mercado Pago ou use o botão abaixo.";
    if (pix) {
      document.getElementById("donation-pix").hidden = false;
      document.getElementById("donation-pix-code").value = pixCode;
    }
    if (payment) {
      link.href = paymentUrl;
      link.hidden = false;
    }
    pending.hidden = true;
    content.hidden = false;
    const expiration = Date.parse(config?.expiresAt);
    if (pix && Number.isFinite(expiration)) {
      activePixExpiresAt = expiration;
      const expiry = document.getElementById("donation-expiry");
      expiry.hidden = false;
      expiry.textContent = "Válido até " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(expiration);
      donationExpiryTimer = setTimeout(() => {
        content.hidden = true;
        feedback.textContent = "O Pix expirou. Gere um novo código para contribuir.";
        document.dispatchEvent(new Event("qrgen:pix-expired"));
      }, Math.max(0, Math.min(expiration - Date.now(), 2147483647)));
    }
  } catch {
    box.replaceChildren();
    feedback.textContent = "Não foi possível exibir o QR Code. Tente novamente mais tarde.";
  }
}
document.addEventListener("DOMContentLoaded", () => {
  try { document.body.classList.toggle("dark-mode", localStorage.getItem("darkMode") === "true"); } catch { /* Tema claro disponível. */ }
  renderDonationPage(window.QRGEN_DONATION_CONFIG);
  setupDonationCheckout();
  document.getElementById("donation-copy").addEventListener("click", async () => {
    const field = document.getElementById("donation-pix-code");
    if (!isDonationPixCode(field.value) || (activePixExpiresAt && activePixExpiresAt <= Date.now())) return;
    const feedback = document.getElementById("donation-feedback");
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(field.value);
      else {
        field.focus();
        field.select();
        if (!document.execCommand("copy")) throw new Error("Clipboard indisponível");
      }
      feedback.textContent = "Código Pix copiado. Cole no aplicativo do seu banco.";
    } catch {
      field.focus();
      field.select();
      feedback.textContent = "Selecione e copie o código acima para colar no aplicativo do seu banco.";
    }
  });
});

async function setupDonationCheckout() {
  if (!document.getElementById("donation-payment-content").hidden) return;
  if (!["https:", "http:"].includes(location.protocol)) return;
  const form = document.getElementById("donation-checkout-form");
  const field = document.getElementById("donation-amount");
  const emailField = document.getElementById("donation-email");
  const cpfField = document.getElementById("donation-cpf");
  let requestId = crypto.randomUUID();
  const submit = document.getElementById("donation-checkout-submit");
  const feedback = document.getElementById("donation-feedback");
  try {
    const response = await fetch("/api/donations", { cache: "no-store" });
    if (!response.ok || !(await response.json()).enabled) return;
    document.getElementById("donation-pending").hidden = true;
    form.hidden = false;
  } catch { return; }
  document.addEventListener("qrgen:pix-expired", () => { requestId = crypto.randomUUID(); });
  function invalidateCheckout() {
    requestId = crypto.randomUUID();
    clearTimeout(donationExpiryTimer);
    activePixExpiresAt = 0;
    document.getElementById("donation-payment-content").hidden = true;
    document.getElementById("donation-pay-link").removeAttribute("href");
    feedback.textContent = "";
    form.querySelectorAll("[data-amount]").forEach((button) => {
      button.setAttribute("aria-pressed", field.value.replace(",", ".") === button.dataset.amount);
    });
  }
  field.addEventListener("input", invalidateCheckout);
  emailField.addEventListener("input", invalidateCheckout);
  cpfField.addEventListener("input", invalidateCheckout);
  form.querySelectorAll("[data-amount]").forEach((button) => button.addEventListener("click", () => {
    field.value = button.dataset.amount;
    invalidateCheckout();
  }));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    const value = field.value.trim().replace(",", ".");
    const amountCents = Math.round(Number(value) * 100);
    if (!/^\d+(?:\.\d{1,2})?$/.test(value) || !Number.isSafeInteger(amountCents) || amountCents < 100 || amountCents > 100000) {
      feedback.textContent = "Informe um valor entre R$ 1,00 e R$ 1.000,00.";
      field.focus();
      return;
    }
    submit.disabled = true;
    field.disabled = true;
    emailField.disabled = true;
    cpfField.disabled = true;
    form.querySelectorAll("[data-amount]").forEach((button) => { button.disabled = true; });
    submit.textContent = "Preparando contribuição…";
    feedback.textContent = "";
    try {
      const response = await fetch("/api/donations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCents, email: emailField.value.trim(), cpf: cpfField.value, requestId }), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) requestId = crypto.randomUUID();
        const error = new Error(result.error || "Não foi possível preparar sua contribuição.");
        error.reference = result.reference;
        throw error;
      }
      if (!isDonationPixCode(result.pixCode)) throw new Error("O Mercado Pago não retornou um Pix válido. Tente novamente.");
      renderDonationPage({ pixCode: result.pixCode, expiresAt: result.expiresAt });
      feedback.textContent = "Pix gerado. Escaneie com o aplicativo do seu banco ou copie o código. Confirme o destinatário antes de pagar.";
    } catch (error) {
      if (error.reference) feedback.dataset.reference = error.reference;
      feedback.textContent = error.name === "TimeoutError" ? "A solicitação demorou. Tente novamente em instantes." : error.message;
    } finally {
      submit.disabled = false;
      field.disabled = false;
      emailField.disabled = false;
      cpfField.disabled = false;
      form.querySelectorAll("[data-amount]").forEach((button) => { button.disabled = false; });
      submit.textContent = "Gerar Pix de contribuição";
    }
  });
}
