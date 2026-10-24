"use strict";
(() => {
  const notice = document.getElementById("donation-notice");
  if (!notice) return;
  let shown = false;
  let timer;
  try { shown = sessionStorage.getItem("qrgenDonationNoticeShown") === "true"; } catch { /* Convite funciona sem armazenamento. */ }
  function dismiss() {
    clearTimeout(timer);
    timer = null;
    notice.hidden = true;
  }
  document.addEventListener("qrgen:generated", (event) => {
    if (shown || timer || event.detail.count < 1) return;
    timer = setTimeout(() => {
      timer = null;
      if (document.getElementById("print-btn").disabled) return;
      shown = true;
      try { sessionStorage.setItem("qrgenDonationNoticeShown", "true"); } catch { /* Exibir uma vez nesta página. */ }
      notice.hidden = false;
    }, 700);
  });
  document.addEventListener("qrgen:cleared", dismiss);
  document.getElementById("donation-dismiss").addEventListener("click", dismiss);
  document.getElementById("donation-close").addEventListener("click", dismiss);
})();
