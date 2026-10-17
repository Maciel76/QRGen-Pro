"use strict";
const $ = (id) => document.getElementById(id);
const state = { type: "qr", view: "cards", rows: [], options: null, validCount: 0, dirty: false };
const formatHints = {
  CODE128: "Aceita letras, números e símbolos ASCII.",
  EAN13: "Exige 13 dígitos e um dígito verificador válido. Zeros iniciais são preservados.",
  CODE39: "Use letras MAIÚSCULAS, números, espaço e os símbolos - . $ / + %.",
};
const importState = { workbook: null, fileName: "", token: 0 };
const spreadsheetExtensions = new Set("xlsx xls xlsm xlsb xltx xltm xlt xlw ods ots fods numbers csv tsv txt xml html htm dif slk sylk dbf wk1 wk2 wk3 wk4 wks 123 wq1 wq2 wb1 wb2 wb3 qpw xlr et uos prn rtf eth".split(" "));
const columnAliases = {
  codigo: new Set(["codigo", "cod", "code", "id", "sku", "referencia", "ref", "ean", "gtin", "barcode", "codigodebarras", "codigobarras", "codigoproduto", "codigodoproduto", "codproduto", "coditem", "codigoitem"]),
  nome: new Set(["nome", "name", "produto", "product", "descricao", "description", "nomeproduto", "nomedoproduto", "descricaoproduto", "descricaodoproduto", "item"]),
  quantidade: new Set(["quantidade", "quantity", "qtd", "qtde", "qt", "qty", "estoque", "saldo", "quant", "quantidadeestoque", "qtdestoque"]),
};
function detectSep(line) {
  const counts = new Map([[";", 0], [",", 0], ["\t", 0], ["|", 0]]);
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (quoted && line[i + 1] === '"') i++;
      else quoted = !quoted;
    } else if (!quoted && counts.has(line[i])) counts.set(line[i], counts.get(line[i]) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0][0];
}
function cleanHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function rowsToProducts(data) {
  const rows = data.map((row) => Array.from(row, (value) => String(value ?? "").trim()))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  // Find the fields by name, ignoring case, accents, punctuation and column order.
  const identify = (row) => Object.fromEntries(Object.entries(columnAliases).map(([field, aliases]) => [field, row.findIndex((value) => aliases.has(cleanHeader(value)))]));
  let headerRow = -1;
  let columns;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const candidate = identify(rows[i]);
    const matches = Object.values(candidate).filter((index) => index >= 0).length;
    if (matches >= 2 || (i === 0 && (candidate.codigo >= 0 || (matches === 1 && rows[i].filter(Boolean).length === 1)))) {
      headerRow = i;
      columns = candidate;
      break;
    }
  }
  if (headerRow === -1) {
    // Ignore leading empty padding, preserving empty fields between code, name and quantity.
    const occupied = [...new Set(rows.flatMap((row) => row.flatMap((value, index) => value ? [index] : [])))].sort((a, b) => a - b);
    const start = occupied[0] ?? 0;
    columns = { codigo: start, nome: start + 1, quantidade: start + 2 };
  }
  return rows.slice(headerRow + 1).map((row) => {
    const nome = row[columns.nome] || "";
    const quantidade = row[columns.quantidade] || "";
    // When no code column exists, use the available value without inventing an ID.
    const codigo = columns.codigo >= 0 ? (row[columns.codigo] || "") : (nome || quantidade);
    return { codigo, nome, quantidade };
  }).filter((row) => row.codigo);
}
function parseText(text) {
  let source = text.replace(/^\uFEFF/, "").trim();
  if (!source) return [];
  if (typeof Papa === "undefined") throw new Error("A biblioteca de CSV não foi carregada. Recarregue a página.");
  const separatorLine = source.match(/^sep=(.)\r?\n/i);
  if (separatorLine) source = source.slice(separatorLine[0].length);
  const result = Papa.parse(source, { delimiter: separatorLine?.[1] || detectSep(source.split(/\r?\n/)[0]), skipEmptyLines: "greedy" });
  if (result.errors.length) throw new Error("Não foi possível ler os dados: " + result.errors[0].message);
  return rowsToProducts(result.data);
}
function normalize(rows, { dedup = true } = {}) {
  const seen = new Set();
  return rows.filter((row) => {
    if (!row.codigo || (dedup && seen.has(row.codigo))) return false;
    seen.add(row.codigo);
    return true;
  });
}
function showStatus(message, type = "success") {
  $("status").textContent = message;
  $("status").className = `status ${type}`;
  $("status").hidden = false;
}
function saveToLocalStorage() {
  try {
    localStorage.setItem("qrPreferences", JSON.stringify({
      qrSize: $("qrSize").value, qrEcc: $("qrEcc").value,
      qrColor: $("qrColor").value, dedup: $("dedup").checked,
      inputData: $("input").value, codeType: state.type, barcodeFormat: $("barcodeFormat").value,
    }));
    localStorage.setItem("preferredView", state.view);
    localStorage.setItem("darkMode", document.body.classList.contains("dark-mode"));
  } catch { /* Geração continua disponível quando o armazenamento está bloqueado. */ }
}
function loadFromLocalStorage() {
  try {
    const p = JSON.parse(localStorage.getItem("qrPreferences")) || {};
    if (p.qrSize >= 64 && p.qrSize <= 256) $("qrSize").value = p.qrSize;
    if (["L", "M", "Q", "H"].includes(p.qrEcc)) $("qrEcc").value = p.qrEcc;
    if (/^#[0-9a-f]{6}$/i.test(p.qrColor)) $("qrColor").value = p.qrColor;
    if (typeof p.dedup === "boolean") $("dedup").checked = p.dedup;
    if (typeof p.inputData === "string") $("input").value = p.inputData;
    if (p.codeType === "barcode") state.type = "barcode";
    if (Object.hasOwn(formatHints, p.barcodeFormat)) $("barcodeFormat").value = p.barcodeFormat;
    const view = localStorage.getItem("preferredView");
    if (["cards", "table", "economic"].includes(view)) state.view = view;
    document.body.classList.toggle("dark-mode", localStorage.getItem("darkMode") === "true");
  } catch { /* Preferências inválidas não impedem a inicialização. */ }
}
function updateButtons() {
  $("clear-results").hidden = state.rows.length === 0;
  $("clear").disabled = !($("input").value || state.rows.length || $("csv").value || importState.fileName);
  $("print-btn").disabled = state.validCount === 0 || state.dirty;
  $("results-count").textContent = `${state.validCount} ${state.validCount === 1 ? "etiqueta" : "etiquetas"}`;
}
function markDirty() {
  state.dirty = true;
  if (state.rows.length) showStatus("Dados alterados. Gere novamente para atualizar as etiquetas e imprimir.", "warning");
  updateButtons();
  saveToLocalStorage();
}
function syncTypeUI() {
  const barcode = state.type === "barcode";
  document.querySelectorAll("[data-type]").forEach((button) => {
    const active = button.dataset.type === state.type;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active);
  });
  document.querySelector(".empty-illustration .sample-label.front use").setAttribute("href", barcode ? "#i-bars" : "#i-qr");
  $("barcode-options").hidden = !barcode;
  $("qr-options").hidden = barcode;
  $("size-label").textContent = barcode ? "Altura das barras" : "Tamanho do QR Code";
  $("generate-text").textContent = barcode ? "Gerar Código de Barras" : "Gerar QR Code";
  $("format-hint").textContent = formatHints[$("barcodeFormat").value];
  $("color-value").textContent = $("qrColor").value.toUpperCase();
  $("theme-toggle").setAttribute("aria-pressed", document.body.classList.contains("dark-mode"));
}
function barcodeError(code, format) {
  if (format === "EAN13") {
    if (!/^\d{13}$/.test(code)) return "EAN-13 exige exatamente 13 dígitos.";
    const sum = code.slice(0, 12).split("").reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0);
    if ((10 - sum % 10) % 10 !== Number(code[12])) return "Dígito verificador EAN-13 inválido.";
  }
  if (format === "CODE39" && !/^[0-9A-Z .\-$/+%]+$/.test(code)) return "Code 39: use letras maiúsculas, números ou símbolos permitidos.";
  if (format === "CODE128" && !/^[\x20-\x7e]+$/.test(code)) return "Code 128: use caracteres ASCII, sem acentos.";
  return "";
}
function createCode(box, row, opts) {
  if (opts.type === "barcode") {
    if (typeof JsBarcode === "undefined") throw new Error("Biblioteca de códigos de barras indisponível.");
    const message = barcodeError(row.codigo, opts.format);
    if (message) throw new Error(message);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    box.appendChild(svg);
    JsBarcode(svg, row.codigo, { format: opts.format, width: 2, height: opts.size, displayValue: true, fontSize: 14, font: "monospace", lineColor: opts.color, background: "#ffffff", margin: 12 });
    const width = Number(svg.getAttribute("width"));
    const height = Number(svg.getAttribute("height"));
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `Code ${opts.format}: ${row.codigo}`);
  } else {
    if (typeof QRCode === "undefined") throw new Error("Biblioteca de QR Code indisponível.");
    new QRCode(box, { text: row.codigo, width: opts.size, height: opts.size, correctLevel: QRCode.CorrectLevel[opts.ecc], colorDark: opts.color, colorLight: "#ffffff" });
    const img = box.querySelector("img");
    if (img) img.alt = `QR Code: ${row.codigo}`;
  }
}
function textElement(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}
function render() {
  const grid = document.querySelector(".qr-grid");
  const tbody = document.querySelector("#grid tbody");
  grid.replaceChildren();
  tbody.replaceChildren();
  $("grid").classList.toggle("without-quantity", !state.rows.some((row) => String(row.quantidade ?? "").trim()));
  const opts = state.options;
  const table = state.view === "table";
  const economic = state.view === "economic";
  grid.className = `qr-grid${economic ? " economic-mode" : ""}${opts?.type === "barcode" ? " barcode-grid" : ""}`;
  let valid = 0;
  const errors = [];
  for (const [index, row] of state.rows.entries()) {
    const box = document.createElement("div");
    box.className = "qrbox";
    const item = document.createElement(table ? "tr" : "article");
    if (table) {
      const info = document.createElement("td");
      info.append(textElement("strong", row.codigo));
      if (row.nome) info.append(textElement("small", row.nome));
      const codeCell = document.createElement("td");
      codeCell.className = "qr-container";
      codeCell.appendChild(box);
      item.append(info, textElement("td", row.quantidade || "", "quantity-column"), codeCell);
      tbody.appendChild(item);
    } else {
      item.className = "qr-card";
      const header = document.createElement("div");
      header.className = "qr-header";
      header.append(textElement("span", opts.type === "barcode" ? opts.format : "QR CODE", "qr-badge"), textElement("span", String(index + 1).padStart(2, "0")));
      const wrapper = document.createElement("div");
      wrapper.className = "qr-code-wrapper";
      wrapper.appendChild(box);
      const details = document.createElement("div");
      details.className = "qr-details";
      details.append(textElement("h3", row.codigo));
      if (row.nome) details.append(textElement("p", row.nome));
      if (!economic && String(row.quantidade ?? "").trim()) {
        details.append(textElement("span", `Qtd: ${row.quantidade}`, "quantity"));
      }
      item.append(header, wrapper, details);
      grid.appendChild(item);
    }
    try {
      createCode(box, row, { ...opts, size: economic ? 64 : opts.size });
      valid++;
    } catch (error) {
      box.replaceChildren(textElement("span", error.message, "error-text"));
      item.classList.add("invalid-label");
      errors.push(`${row.codigo}: ${error.message}`);
    }
  }
  state.validCount = valid;
  const hasRows = state.rows.length > 0;
  $("empty-state").hidden = hasRows;
  $("qr-grid-container").hidden = !hasRows || table;
  $("table-container").hidden = !hasRows || !table;
  updateButtons();
  return errors;
}
function generate() {
  try {
    if (!$("input").value.trim()) throw new Error("Adicione os produtos ou importe um arquivo CSV primeiro.");
    if (!$("qrSize").reportValidity()) return;
    const rows = normalize(parseText($("input").value), { dedup: $("dedup").checked });
    if (!rows.length) throw new Error("Nenhum produto com código foi encontrado.");
    if (rows.length > 1000) throw new Error("Gere até 1.000 etiquetas por lote para manter o navegador responsivo.");
    state.rows = rows;
    state.options = { type: state.type, format: $("barcodeFormat").value, size: Number($("qrSize").value), ecc: $("qrEcc").value, color: $("qrColor").value };
    state.dirty = false;
    const errors = render();
    if (errors.length) showStatus(`${state.validCount} etiquetas geradas; ${errors.length} inválidas. ${errors[0]}`, state.validCount ? "warning" : "error");
    else showStatus(`${state.validCount} ${state.validCount === 1 ? "etiqueta pronta" : "etiquetas prontas"} para imprimir.`);
    saveToLocalStorage();
  } catch (error) { showStatus(error.message, "error"); }
}
let tabAnimations = [];
function stopTabAnimations() {
  tabAnimations.forEach((animation) => animation.cancel());
  tabAnimations = [];
}
function animateTabChange(typeChanged = false, cards = null) {
  stopTabAnimations();
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const content = !$("empty-state").hidden ? $("empty-state")
    : state.view === "table" ? $("table-container") : $("qr-grid-container");
  if (!cards) {
    tabAnimations.push(content.animate([
      { opacity: 0, transform: "translateY(8px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 240, easing: "cubic-bezier(.2,.7,.3,1)" }));
  }
  if (typeChanged) {
    const options = state.type === "barcode" ? $("barcode-options") : $("qr-options");
    tabAnimations.push(options.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 }));
  }
  if (cards) {
    const timing = { duration: 720, easing: "cubic-bezier(.22,.65,.3,1)" };
    const frontColor = getComputedStyle(cards.incoming).backgroundColor;
    const backColor = getComputedStyle(cards.outgoing).backgroundColor;
    // The rear card swings around the stack and settles in front.
    tabAnimations.push(cards.incoming.animate([
      { offset: 0, transform: "translate3d(-17px,-9px,-12px) rotate(-14deg)", backgroundColor: backColor, boxShadow: "0 4px 10px #263d4c08" },
      { offset: .36, transform: "translate3d(-62px,-24px,32px) rotate(-30deg) rotateY(-24deg)", backgroundColor: frontColor, boxShadow: "10px 16px 24px #263d4c18" },
      { offset: .76, transform: "translate3d(22px,-4px,36px) rotate(13deg) rotateY(8deg)", backgroundColor: frontColor, boxShadow: "0 18px 26px #263d4c20" },
      { offset: 1, transform: "translate3d(16px,2px,8px) rotate(9deg)", backgroundColor: frontColor, boxShadow: "0 7px 12px #263d4c08" },
    ], timing));
    tabAnimations.push(cards.outgoing.animate([
      { offset: 0, transform: "translate3d(16px,2px,8px) rotate(9deg)", backgroundColor: frontColor },
      { offset: .36, transform: "translate3d(52px,7px,0) rotate(24deg) rotateY(26deg)", backgroundColor: frontColor },
      { offset: .78, transform: "translate3d(-20px,-12px,-18px) rotate(-18deg)", backgroundColor: backColor },
      { offset: 1, transform: "translate3d(-17px,-9px,-12px) rotate(-14deg)", backgroundColor: backColor },
    ], timing));
    for (const child of cards.outgoing.children) {
      tabAnimations.push(child.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 230, fill: "none" }));
    }
    for (const child of cards.incoming.children) {
      tabAnimations.push(child.animate([
        { opacity: 0, transform: "scale(.88)" },
        { opacity: 1, transform: "scale(1)" },
      ], { duration: 330, delay: 170, fill: "backwards", easing: "ease-out" }));
    }
    tabAnimations.push(document.querySelector(".sparkle").animate([
      { opacity: .4, transform: "scale(.7) rotate(0deg)" },
      { opacity: 1, transform: "scale(1.25) rotate(90deg)", offset: .6 },
      { opacity: 1, transform: "scale(1) rotate(180deg)" },
    ], timing));
  }
}
function setType(type) {
  if (state.type === type) return;
  stopTabAnimations();
  let cards = null;
  if (!$("empty-state").hidden && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    cards = {
      incoming: document.querySelector(".sample-label.back"),
      outgoing: document.querySelector(".sample-label.front"),
    };
    cards.incoming.classList.replace("back", "front");
    cards.outgoing.classList.replace("front", "back");
  }
  state.type = type;
  syncTypeUI();
  markDirty();
  if (state.rows.length) generate();
  animateTabChange(true, cards);
}
function resetImport() {
  document.querySelector(".file-upload-label strong").textContent = "Selecionar planilha";
  document.querySelector(".file-upload").removeAttribute("aria-busy");
  importState.token++;
  importState.workbook = null;
  importState.fileName = "";
  $("sheet-select").replaceChildren();
  $("sheet-picker").hidden = true;
  $("csv").value = "";
  $("file-name").textContent = "Nenhum arquivo selecionado";
}
function importProducts(rows) {
  if (!rows.length) throw new Error("Não há dados para gerar etiquetas nesta aba. Escolha outra aba ou verifique a planilha.");
  // Canonical headers prevent a product named “Produto” being mistaken for a header later.
  $("input").value = Papa.unparse([["codigo", "nome", "quantidade"], ...rows.map((row) => [row.codigo, row.nome, row.quantidade])], { delimiter: ";" });
  markDirty();
  generate();
}
function importSelectedSheet() {
  if (!importState.workbook) return;
  try {
    const sheet = importState.workbook.Sheets[$("sheet-select").value];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "", blankrows: false });
    importProducts(rowsToProducts(data));
  } catch (error) {
    markDirty();
    showStatus(error.message, "error");
  }
}
function decodeTableText(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("windows-1252").decode(bytes); }
}
async function handleSpreadsheetUpload(file) {
  if (!file) return;
  const extension = file.name.split(".").pop().toLowerCase();
  if (!spreadsheetExtensions.has(extension)) {
    showStatus("Formato não reconhecido. Selecione uma planilha Excel, OpenDocument, Numbers, CSV ou outro formato de tabela compatível.", "error");
    return;
  }
  if (file.size > 10 * 1024 * 1024) { showStatus("Importe arquivos de até 10 MB. Divida planilhas maiores em lotes.", "error"); return; }
  const token = ++importState.token;
  const label = document.querySelector(".file-upload-label strong");
  label.textContent = "Processando planilha…";
  document.querySelector(".file-upload").setAttribute("aria-busy", "true");
  try {
    const buffer = await file.arrayBuffer();
    if (token !== importState.token) return;
    if (!buffer.byteLength) throw new Error("O arquivo está vazio.");
    let workbook = null;
    let rows;
    if (["csv", "tsv", "txt"].includes(extension)) {
      rows = parseText(decodeTableText(buffer));
      if (!rows.length) throw new Error("A planilha não contém dados para gerar etiquetas.");
    } else {
      if (typeof XLSX === "undefined") throw new Error("A biblioteca de planilhas não foi carregada. Recarregue a página.");
      const textFormat = ["xml", "html", "htm", "dif", "slk", "sylk", "fods", "prn", "rtf", "eth"].includes(extension);
      workbook = XLSX.read(textFormat ? decodeTableText(buffer) : buffer, { type: extension === "dif" ? "binary" : (textFormat ? "string" : "array"), codepage: textFormat ? 65001 : undefined, raw: true, cellText: true, cellNF: true });
      if (!workbook.SheetNames.length) throw new Error("Nenhuma aba encontrada no arquivo.");
    }
    importState.workbook = workbook;
    importState.fileName = file.name;
    $("file-name").textContent = file.name;
    $("sheet-select").replaceChildren();
    $("sheet-picker").hidden = !workbook || workbook.SheetNames.length < 2;
    if (workbook) {
      for (const name of workbook.SheetNames) $("sheet-select").appendChild(new Option(name, name));
      const firstNonempty = workbook.SheetNames.find((name) => workbook.Sheets[name]["!ref"]);
      $("sheet-select").value = firstNonempty || workbook.SheetNames[0];
      importSelectedSheet();
    } else {
      importProducts(rows);
    }
  } catch (error) {
    if (token === importState.token) showStatus("Não foi possível importar: " + error.message, "error");
  } finally {
    if (token === importState.token) {
      label.textContent = "Selecionar planilha";
      document.querySelector(".file-upload").removeAttribute("aria-busy");
      // Allow choosing the same file again after an error or a file edit.
      $("csv").value = "";
      updateButtons();
    }
  }
}
function applySuffix(quantity) {
  try {
    const rows = parseText($("input").value);
    if (!rows.length) throw new Error("Adicione os produtos antes de aplicar um sufixo.");
    if (quantity && rows.some((r) => !/^\d+$/.test(r.quantidade) || !Number.isSafeInteger(Number(r.quantidade)))) throw new Error("Preencha quantidades inteiras e não negativas em todos os produtos.");
    const updated = rows.map((r) => [r.codigo + (quantity ? r.quantidade.padStart(4, "0") : "0001"), r.nome, r.quantidade]);
    $("input").value = Papa.unparse([["codigo", "nome", "quantidade"], ...updated], { delimiter: ";" });
    markDirty();
    showStatus(`Sufixo aplicado a ${rows.length} produtos. Gere novamente para atualizar as etiquetas.`);
  } catch (error) { showStatus(error.message, "error"); }
}
document.addEventListener("DOMContentLoaded", () => {
  loadFromLocalStorage();
  syncTypeUI();
  updateButtons();
  document.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => setType(button.dataset.type)));
  document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
    if (state.view === button.dataset.view) return;
    state.view = button.dataset.view;
    syncTypeUI();
    if (state.rows.length) {
      const dirty = state.dirty;
      render();
      if (dirty) markDirty();
    }
    saveToLocalStorage();
    animateTabChange();
  }));
  window.addEventListener("beforeprint", stopTabAnimations);
  $("generate").addEventListener("click", generate);
  $("input").addEventListener("input", markDirty);
  ["qrSize", "qrEcc", "qrColor", "dedup", "barcodeFormat"].forEach((id) => $(id).addEventListener("change", () => {
    syncTypeUI();
    markDirty();
    if (state.rows.length) generate();
  }));
  $("qrColor").addEventListener("input", () => { $("color-value").textContent = $("qrColor").value.toUpperCase(); markDirty(); });
  $("csv").addEventListener("change", (e) => handleSpreadsheetUpload(e.target.files[0]));
  $("sheet-select").addEventListener("change", importSelectedSheet);
  const upload = document.querySelector(".control-panel");
  ["dragenter", "dragover"].forEach((event) => upload.addEventListener(event, (e) => { e.preventDefault(); upload.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((event) => upload.addEventListener(event, (e) => { e.preventDefault(); upload.classList.remove("dragover"); }));
  upload.addEventListener("drop", (e) => handleSpreadsheetUpload(e.dataTransfer.files[0]));
  $("addMilRef").addEventListener("click", () => applySuffix(false));
  $("applyQuantity").addEventListener("click", () => applySuffix(true));
  $("clear").addEventListener("click", () => {
    resetImport();
    $("input").value = "";
    $("csv").value = "";
    $("file-name").textContent = "Nenhum arquivo selecionado";
    state.rows = [];
    state.dirty = false;
    render();
    $("status").hidden = true;
    saveToLocalStorage();
  });
  $("clear-results").addEventListener("click", () => $("clear").click());
  $("print-btn").addEventListener("click", () => { if (state.validCount && !state.dirty) window.print(); });
  $("theme-toggle").addEventListener("click", () => { document.body.classList.toggle("dark-mode"); syncTypeUI(); saveToLocalStorage(); });
  $("help-btn").addEventListener("click", () => $("help-dialog").showModal());
  $("close-help").addEventListener("click", () => $("help-dialog").close());
});
