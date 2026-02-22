// Utilidades
function detectSep(line) {
  const cands = [";", ",", "\t", "|"];
  const counts = cands.map((s) => [
    s,
    (line.match(new RegExp(`\\${s}`, "g")) || []).length,
  ]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] ? counts[0][0] : ";";
}

function parseText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const sep = detectSep(lines[0]);
  return lines.map((l) => {
    const parts = l.split(sep).map((s) => s?.trim() ?? "");
    return {
      codigo: parts[0] || "",
      nome: parts[1] || "",
      quantidade: parts[2] || "",
    };
  });
}

function normalize(rows, { dedup = true }) {
  if (!dedup) return rows.filter((r) => r.codigo && r.codigo.trim() !== "");

  const map = new Map();
  for (const r of rows) {
    const codigo = (r.codigo || "").replace(/\s+/g, "");
    if (!codigo) continue;

    if (!map.has(codigo)) {
      map.set(codigo, {
        codigo,
        nome: r.nome || "",
        quantidade: r.quantidade || "",
      });
    }
  }
  return [...map.values()];
}

// Função para expandir códigos com mil de referência
function expandWithMilRef(rows) {
  const expanded = [];

  for (const row of rows) {
    const quantidade = parseInt(row.quantidade) || 1;

    // Se quantidade > 0, criar múltiplos códigos com sufixo
    if (quantidade > 0) {
      for (let i = 1; i <= quantidade; i++) {
        const suffix = String(i).padStart(4, "0"); // 0001, 0002, etc
        expanded.push({
          codigo: row.codigo + suffix,
          nome: row.nome,
          quantidade: `${i}/${quantidade}`,
        });
      }
    } else {
      // Se não tem quantidade, adiciona apenas o código original
      expanded.push(row);
    }
  }

  return expanded;
}

function renderTable(rows, opts) {
  const tbody = document.querySelector("#grid tbody");
  tbody.innerHTML = "";

  for (const r of rows) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td class="codigo">${r.codigo}</td>
            <td class="nome">${r.nome}</td>
            <td class="qt">${r.quantidade}</td>
            <td class="qr-container"><div class="qrbox"></div></td>
        `;
    tbody.appendChild(tr);

    // Gerar QR Code
    const box = tr.querySelector(".qrbox");
    try {
      // Validar se o código não está vazio
      if (!r.codigo || r.codigo.trim() === "") {
        throw new Error("Código vazio");
      }

      new QRCode(box, {
        text: r.codigo,
        width: opts.size,
        height: opts.size,
        correctLevel: QRCode.CorrectLevel[opts.ecc],
        colorDark: opts.color || "#000000",
        margin: 2,
      });
    } catch (error) {
      console.error("Erro ao gerar QR Code para", r.codigo, error);
      box.innerHTML = `<span class="error">Erro no QR</span>`;
    }
  }

  // Mostrar/ocultar tabela e estado vazio
  const tableContainer = document.getElementById("table-container");
  const emptyState = document.getElementById("empty-state");
  const qrGridContainer = document.getElementById("qr-grid-container");

  if (rows.length > 0) {
    tableContainer.style.display = "block";
    qrGridContainer.style.display = "none";
    emptyState.style.display = "none";
    updateResultsCount(rows.length);
  } else {
    tableContainer.style.display = "none";
    emptyState.style.display = "block";
  }
}

function showStatus(message, type = "success") {
  const statusEl = document.getElementById("status");
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
  statusEl.style.display = "block";

  // Auto-ocultar após 5 segundos
  setTimeout(() => {
    statusEl.style.display = "none";
  }, 5000);
}

function loadFromLocalStorage() {
  try {
    const preferences = JSON.parse(localStorage.getItem("qrPreferences")) || {};

    if (preferences.qrSize) {
      document.getElementById("qrSize").value = preferences.qrSize;
    }

    if (preferences.qrEcc) {
      document.getElementById("qrEcc").value = preferences.qrEcc;
    }

    if (preferences.dedup !== undefined) {
      document.getElementById("dedup").checked = preferences.dedup;
    }

    if (preferences.addMilRef !== undefined) {
      const milRefBtn = document.getElementById("addMilRef");
      if (milRefBtn) {
        milRefBtn.setAttribute("data-active", preferences.addMilRef);
        const textSpan = document.getElementById("milRefText");
        if (textSpan) {
          textSpan.textContent = preferences.addMilRef
            ? "Mil de Ref: ON"
            : "Mil de Ref: OFF";
        }
        if (preferences.addMilRef) {
          milRefBtn.style.background =
            "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)";
          milRefBtn.style.color = "white";
          milRefBtn.style.boxShadow = "0 4px 12px rgba(59, 130, 246, 0.5)";
        }
      }
    }

    if (preferences.inputData) {
      document.getElementById("input").value = preferences.inputData;
    }

    if (preferences.qrColor) {
      document.getElementById("qrColor").value = preferences.qrColor;
    }

    // Carregar tema
    if (localStorage.getItem("darkMode") === "true") {
      document.body.classList.add("dark-mode");
      document.querySelector(".theme-toggle i").className = "fas fa-sun";
    }
  } catch (error) {
    console.error("Erro ao carregar preferências:", error);
  }
}

function saveToLocalStorage() {
  const preferences = {
    qrSize: parseInt(document.getElementById("qrSize").value, 10) || 120,
    qrEcc: document.getElementById("qrEcc").value || "M",
    dedup: document.getElementById("dedup").checked,
    addMilRef:
      document.getElementById("addMilRef").getAttribute("data-active") ===
      "true",
    inputData: document.getElementById("input").value,
    qrColor: document.getElementById("qrColor").value || "#000000",
  };

  try {
    localStorage.setItem("qrPreferences", JSON.stringify(preferences));
    localStorage.setItem(
      "darkMode",
      document.body.classList.contains("dark-mode"),
    );
  } catch (error) {
    console.error("Erro ao salvar preferências:", error);
  }
}

// Processar upload de CSV
function handleCsvUpload(file) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      if (results.errors.length > 0) {
        showStatus(
          "Erro ao processar CSV: " + results.errors[0].message,
          "error",
        );
        return;
      }

      const rows = results.data
        .map((row) => {
          // Tentar encontrar colunas por nome (case insensitive)
          let codigo = "",
            nome = "",
            quantidade = "";
          const keys = Object.keys(row);

          // Procurar por coluna de código
          const codKey = keys.find(
            (key) =>
              key.toLowerCase().includes("cod") ||
              key.toLowerCase().includes("code") ||
              key.toLowerCase().includes("id"),
          );
          codigo = codKey ? row[codKey] : "";

          // Procurar por coluna de nome
          const nomeKey = keys.find(
            (key) =>
              key.toLowerCase().includes("nome") ||
              key.toLowerCase().includes("name") ||
              key.toLowerCase().includes("prod") ||
              key.toLowerCase().includes("desc"),
          );
          nome = nomeKey ? row[nomeKey] : "";

          // Procurar por coluna de quantidade
          const qtKey = keys.find(
            (key) =>
              key.toLowerCase().includes("qt") ||
              key.toLowerCase().includes("quant") ||
              key.toLowerCase().includes("qtd") ||
              key.toLowerCase().includes("quantity"),
          );
          quantidade = qtKey ? row[qtKey] : "";

          // Se não encontrou pelos nomes, usar as primeiras colunas
          if (!codigo && keys.length > 0) codigo = row[keys[0]] || "";
          if (!nome && keys.length > 1) nome = row[keys[1]] || "";
          if (!quantidade && keys.length > 2) quantidade = row[keys[2]] || "";

          return {
            codigo: (codigo || "").toString().trim(),
            nome: (nome || "").toString().trim(),
            quantidade: (quantidade || "").toString().trim(),
          };
        })
        .filter((row) => row.codigo !== ""); // Filtrar linhas sem código

      // Atualizar textarea com os dados
      const textData = rows
        .map((r) => `${r.codigo};${r.nome};${r.quantidade}`)
        .join("\n");
      document.getElementById("input").value = textData;

      showStatus(`CSV processado com ${rows.length} linhas válidas`, "success");

      // Gerar automaticamente os QR Codes
      if (rows.length > 0) {
        const size =
          parseInt(document.getElementById("qrSize").value, 10) || 120;
        const ecc = document.getElementById("qrEcc").value || "M";
        const dedup = document.getElementById("dedup").checked;
        const addMilRef =
          document.getElementById("addMilRef").getAttribute("data-active") ===
          "true";
        const color = document.getElementById("qrColor").value || "#000000";

        let processedRows = rows;

        // Aplicar Mil de Referência se estiver ativado
        if (addMilRef) {
          processedRows = processedRows.map(row => ({
            ...row,
            codigo: row.codigo + "0001"  // Adiciona sempre "0001" ao código
          }));
        }

        const normalizedRows = normalize(processedRows, { dedup });

        // Verificar qual visualização está ativa
        const activeView = document.querySelector(".view-toggle button.active")
          .dataset.view;

        if (activeView === "cards") {
          renderQRCards(normalizedRows, { size, ecc, color });
        } else {
          renderTable(normalizedRows, { size, ecc, color });
        }
      }
      
      // Atualizar estado dos botões
      updateClearButton();
      updatePrintButton();
    },
    error: function (error) {
      showStatus("Erro ao ler arquivo: " + error.message, "error");
    },
  });
}

// Nova função para renderizar os QR Codes em cards
function renderQRCards(rows, opts) {
  const qrGrid = document.querySelector(".qr-grid");
  qrGrid.innerHTML = "";
  
  // Remover classe de modo econômico se existir
  qrGrid.classList.remove("economic-mode");

  for (const r of rows) {
    const card = document.createElement("div");
    card.className = "qr-card";
    card.innerHTML = `
            <div class="qr-header">
                <div class="qr-badge">Item</div>
            </div>
            <div class="qr-content">
                <div class="qr-code-wrapper"><div class="qrbox"></div></div>
                <div class="qr-details">
                    <h3>${r.codigo}</h3>
                    <p>${r.nome}</p>
                    <span class="quantity">Qtd: ${r.quantidade}</span>
                </div>
            </div>
        `;
    qrGrid.appendChild(card);

    // Gerar QR Code
    const box = card.querySelector(".qrbox");
    try {
      if (!r.codigo || r.codigo.trim() === "") {
        throw new Error("Código vazio");
      }

      new QRCode(box, {
        text: r.codigo,
        width: opts.size,
        height: opts.size,
        correctLevel: QRCode.CorrectLevel[opts.ecc],
        colorDark: opts.color || "#000000",
        margin: 2,
      });
    } catch (error) {
      console.error("Erro ao gerar QR Code para", r.codigo, error);
      box.innerHTML = `<span class="error">Erro no QR</span>`;
    }
  }

  // Mostrar/ocultar grid e estado vazio
  const qrGridContainer = document.getElementById("qr-grid-container");
  const tableContainer = document.getElementById("table-container");
  const emptyState = document.getElementById("empty-state");

  if (rows.length > 0) {
    qrGridContainer.style.display = "block";
    tableContainer.style.display = "none";
    emptyState.style.display = "none";
    updateResultsCount(rows.length);
  } else {
    qrGridContainer.style.display = "none";
    emptyState.style.display = "block";
  }
}

// Função para renderizar QR Codes em modo econômico
function renderQREconomic(rows, opts) {
  const qrGrid = document.querySelector(".qr-grid");
  qrGrid.innerHTML = "";
  
  // Adicionar classe de modo econômico
  qrGrid.classList.add("economic-mode");

  for (const r of rows) {
    // Truncar nome a 15 caracteres
    const nomeShort = r.nome.length > 15 ? r.nome.substring(0, 15) + "…" : r.nome;
    
    const item = document.createElement("div");
    item.className = "eco-item";
    item.innerHTML = `
      <div class="eco-qr"><div class="qrbox"></div></div>
      <div class="eco-label">${r.codigo}</div>
      <div class="eco-name">${nomeShort}</div>
    `;
    qrGrid.appendChild(item);

    // Gerar QR Code compacto para modo econômico
    const box = item.querySelector(".qrbox");
    try {
      if (!r.codigo || r.codigo.trim() === "") {
        throw new Error("Código vazio");
      }

      new QRCode(box, {
        text: r.codigo,
        width: 64,
        height: 64,
        correctLevel: QRCode.CorrectLevel[opts.ecc],
        colorDark: opts.color || "#000000",
        margin: 0,
      });
    } catch (error) {
      console.error("Erro ao gerar QR Code para", r.codigo, error);
      box.innerHTML = `<span class="error">Erro</span>`;
    }
  }

  // Mostrar/ocultar grid e estado vazio
  const qrGridContainer = document.getElementById("qr-grid-container");
  const tableContainer = document.getElementById("table-container");
  const emptyState = document.getElementById("empty-state");

  if (rows.length > 0) {
    qrGridContainer.style.display = "block";
    tableContainer.style.display = "none";
    emptyState.style.display = "none";
    updateResultsCount(rows.length);
  } else {
    qrGridContainer.style.display = "none";
    emptyState.style.display = "block";
  }
}

function updateResultsCount(count) {
  document.getElementById("results-count").textContent = `${count} ${
    count === 1 ? "item" : "itens"
  }`;
}

// Adicionar toggle de visualização
function setupViewToggle() {
  const toggleButtons = document.querySelectorAll(".view-toggle .view-btn, .view-toggle .btn-economic");
  toggleButtons.forEach((button) => {
    button.addEventListener("click", function () {
      // Remover classe active de todos os botões
      toggleButtons.forEach((btn) => btn.classList.remove("active"));
      // Adicionar classe active ao botão clicado
      this.classList.add("active");

      // Alternar entre as visualizações
      const viewType = this.dataset.view;
      localStorage.setItem("preferredView", viewType);

      // Recarregar a visualização atual se já houver dados
      const text = document.getElementById("input").value;
      if (text.trim()) {
        const size =
          parseInt(document.getElementById("qrSize").value, 10) || 120;
        const ecc = document.getElementById("qrEcc").value || "M";
        const dedup = document.getElementById("dedup").checked;
        const addMilRef =
          document.getElementById("addMilRef").getAttribute("data-active") ===
          "true";
        const color = document.getElementById("qrColor").value || "#000000";

        let rows = parseText(text);

        // Aplicar Mil de Referência se estiver ativado
        if (addMilRef) {
          rows = rows.map(row => ({
            ...row,
            codigo: row.codigo + "0001"  // Adiciona sempre "0001" ao código
          }));
        }

        rows = normalize(rows, { dedup });

        if (viewType === "cards") {
          renderQRCards(rows, { size, ecc, color });
        } else if (viewType === "economic") {
          renderQREconomic(rows, { size, ecc, color });
        } else {
          renderTable(rows, { size, ecc, color });
        }
      }
    });
  });

  // Carregar visualização preferida
  const preferredView = localStorage.getItem("preferredView") || "cards";
  const preferredBtn = document.querySelector(`.view-toggle [data-view="${preferredView}"]`);
  if (preferredBtn) {
    preferredBtn.classList.add("active");
  }
}

// Configurar tema claro/escuro
function setupThemeToggle() {
  const themeToggle = document.querySelector(".theme-toggle");
  themeToggle.addEventListener("click", function () {
    document.body.classList.toggle("dark-mode");
    const icon = this.querySelector("i");
    if (document.body.classList.contains("dark-mode")) {
      icon.className = "fas fa-sun";
    } else {
      icon.className = "fas fa-moon";
    }
    saveToLocalStorage();
  });
}

// Configurar botão toggle de Mil de Referência
function setupMilRefToggle() {
  const milRefBtn = document.getElementById("addMilRef");

  if (!milRefBtn) {
    console.error("Botão addMilRef não encontrado!");
    return;
  }

  milRefBtn.addEventListener("click", function () {
    const textArea = document.getElementById("input");
    const text = textArea.value.trim();

    if (!text) {
      showStatus(
        "Por favor, insira alguns dados primeiro antes de aplicar Mil de Referência",
        "error",
      );
      return;
    }

    try {
      // Parsear os dados
      const rows = parseText(text);

      // Adicionar sufixo "0001" a todos os códigos
      const updatedLines = [];

      for (const row of rows) {
        const newCodigo = row.codigo + "0001";  // Adiciona sempre "0001" ao código
        updatedLines.push(`${newCodigo};${row.nome};${row.quantidade}`);
      }

      // Atualizar o campo de texto
      textArea.value = updatedLines.join("\n");

      // Feedback visual
      this.style.background = "linear-gradient(135deg, #10b981 0%, #059669 100%)";
      this.style.color = "white";
      this.style.boxShadow = "0 4px 12px rgba(16, 185, 129, 0.5)";

      const textSpan = document.getElementById("milRefText");
      if (textSpan) {
        textSpan.textContent = "✓ Aplicado!";
      }

      showStatus(
        `Sufixo "0001" adicionado a ${updatedLines.length} códigos`,
        "success",
      );

      // Resetar visual após 2 segundos
      setTimeout(() => {
        this.style.background = "";
        this.style.color = "";
        this.style.boxShadow = "";
        if (textSpan) {
          textSpan.textContent = "Aplicar Mil de Ref";
        }
      }, 2000);

      saveToLocalStorage();
    } catch (error) {
      showStatus("Erro ao processar dados: " + error.message, "error");
      console.error(error);
    }
  });
}

// Configurar botão Aplica Quantidade
function setupApplyQuantity() {
  const applyQtyBtn = document.getElementById("applyQuantity");

  if (!applyQtyBtn) {
    console.error("Botão applyQuantity não encontrado!");
    return;
  }

  applyQtyBtn.addEventListener("click", function () {
    const textArea = document.getElementById("input");
    const text = textArea.value.trim();

    if (!text) {
      showStatus(
        "Por favor, insira alguns dados primeiro antes de aplicar quantidade",
        "error",
      );
      return;
    }

    try {
      // Parsear os dados
      const rows = parseText(text);

      // Adicionar sufixo da quantidade a cada código
      const updatedLines = [];

      for (const row of rows) {
        const quantidade = parseInt(row.quantidade) || 0;
        const suffix = String(quantidade).padStart(4, "0");
        const newCodigo = row.codigo + suffix;
        updatedLines.push(`${newCodigo};${row.nome};${row.quantidade}`);
      }

      // Atualizar o campo de texto
      textArea.value = updatedLines.join("\n");

      // Feedback visual
      applyQtyBtn.style.background = "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)";
      applyQtyBtn.style.color = "white";
      applyQtyBtn.style.boxShadow = "0 4px 12px rgba(245, 158, 11, 0.5)";

      const textSpan = document.getElementById("applyQuantityText");
      if (textSpan) {
        textSpan.textContent = "✓ Aplicado!";
      }

      showStatus(
        `Quantidade aplicada a ${updatedLines.length} códigos`,
        "success",
      );

      // Resetar visual após 2 segundos
      setTimeout(() => {
        applyQtyBtn.style.background = "";
        applyQtyBtn.style.color = "";
        applyQtyBtn.style.boxShadow = "";
        if (textSpan) {
          textSpan.textContent = "Aplica Quantidade";
        }
      }, 2000);

      saveToLocalStorage();
    } catch (error) {
      showStatus("Erro ao processar dados: " + error.message, "error");
      console.error(error);
    }
  });
}

// Modificar o evento DOMContentLoaded
document.addEventListener("DOMContentLoaded", function () {
  // Carregar preferências salvas
  loadFromLocalStorage();

  // Configurar toggle de visualização
  setupViewToggle();

  // Configurar toggle de tema
  setupThemeToggle();

  // Configurar toggle de Mil de Referência
  setupMilRefToggle();

  // Configurar botão Aplica Quantidade
  setupApplyQuantity();

  // Inicializar estado dos botões
  updateClearButton();
  updatePrintButton();

  // Botão Gerar
  document.getElementById("generate").addEventListener("click", function () {
    const text = document.getElementById("input").value;
    const size = parseInt(document.getElementById("qrSize").value, 10) || 120;
    const ecc = document.getElementById("qrEcc").value || "M";
    const dedup = document.getElementById("dedup").checked;
    const addMilRef =
      document.getElementById("addMilRef").getAttribute("data-active") ===
      "true";
    const color = document.getElementById("qrColor").value || "#000000";

    if (!text.trim()) {
      showStatus("Por favor, insira alguns dados primeiro", "error");
      return;
    }

    try {
      let rows = parseText(text);

      // Aplicar Mil de Referência se estiver ativado
      if (addMilRef) {
        rows = rows.map(row => ({
          ...row,
          codigo: row.codigo + "0001"  // Adiciona sempre "0001" ao código
        }));
      }

      // Normalizar os dados (deduplicar se necessário)
      rows = normalize(rows, { dedup });

      // Verificar qual visualização está ativa
      const activeView = document.querySelector(".view-toggle button.active")
        .dataset.view;

      if (activeView === "cards") {
        renderQRCards(rows, { size, ecc, color });
      } else if (activeView === "economic") {
        renderQREconomic(rows, { size, ecc, color });
      } else {
        renderTable(rows, { size, ecc, color });
      }

      showStatus(`Gerados ${rows.length} QR Codes`, "success");

      // Atualizar estado dos botões
      updateClearButton();
      updatePrintButton();

      // Salvar preferências
      saveToLocalStorage();
    } catch (error) {
      showStatus("Erro ao processar dados: " + error.message, "error");
      console.error(error);
    }
  });

  // Botão Imprimir
  document.getElementById("print-btn").addEventListener("click", function () {
    window.print();
  });

  // Função para verificar se há conteúdo para limpar
  function hasContentToClear() {
    const text = document.getElementById("input").value.trim();
    const hasTableRows = document.querySelectorAll("#grid tbody tr").length > 0;
    const hasCards = document.querySelectorAll(".qr-card").length > 0;
    const hasEcoItems = document.querySelectorAll(".eco-item").length > 0;
    const hasFileName = document.getElementById("file-name").textContent !== "Nenhum arquivo selecionado";
    
    return text || hasTableRows || hasCards || hasEcoItems || hasFileName;
  }

  // Função para atualizar estado do botão Limpar
  function updateClearButton() {
    const clearBtn = document.getElementById("clear");
    const hasContent = hasContentToClear();
    clearBtn.disabled = !hasContent;
  }

  // Função para atualizar estado do botão Imprimir
  function updatePrintButton() {
    const printBtn = document.getElementById("print-btn");
    const hasQRCodes = document.querySelectorAll("#grid tbody tr").length > 0 ||
                       document.querySelectorAll(".qr-card").length > 0 ||
                       document.querySelectorAll(".eco-item").length > 0;

    printBtn.disabled = !hasQRCodes;
  }

  // Botão Limpar
  document.getElementById("clear").addEventListener("click", function () {
    document.getElementById("input").value = "";
    document.getElementById("table-container").style.display = "none";
    document.getElementById("qr-grid-container").style.display = "none";
    document.getElementById("empty-state").style.display = "block";
    document.getElementById("file-name").textContent = "Nenhum arquivo selecionado";
    document.getElementById("status").style.display = "none";
    document.getElementById("csv").value = "";
    updateResultsCount(0);

    // Limpar localStorage
    localStorage.removeItem("qrPreferences");
    
    // Atualizar estado dos botões
    updateClearButton();
    updatePrintButton();
  });

  // Upload de arquivo CSV
  document.getElementById("csv").addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById("file-name").textContent = file.name;

    if (file.type !== "text/csv" && !file.name.toLowerCase().endsWith(".csv")) {
      showStatus("Por favor, selecione um arquivo CSV válido", "error");
      return;
    }

    handleCsvUpload(file);
  });

  // Salvar preferências quando alteradas
  document
    .getElementById("qrSize")
    .addEventListener("change", saveToLocalStorage);
  document
    .getElementById("qrEcc")
    .addEventListener("change", saveToLocalStorage);
  document
    .getElementById("dedup")
    .addEventListener("change", saveToLocalStorage);
  document
    .getElementById("qrColor")
    .addEventListener("change", saveToLocalStorage);
  document
    .getElementById("input")
    .addEventListener("input", function() {
      saveToLocalStorage();
      updateClearButton();
      updatePrintButton();
    });

  // Botão de ajuda
  document.querySelector(".btn-help").addEventListener("click", function () {
    alert(
      "Para usar o QRGen Pro:\n\n1. Cole os dados no formato: código;nome;quantidade (um por linha)\n2. Ou faça upload de um arquivo CSV\n3. Ajuste as opções conforme necessário\n4. Clique em 'Gerar QR Codes'\n5. Use os botões de visualização para alternar entre cards e tabela",
    );
  });
});
