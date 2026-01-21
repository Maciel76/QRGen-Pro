// Vue.js Application
const { createApp, ref, onMounted, nextTick, computed } = Vue;

const app = createApp({
  setup() {
    // Reactive data
    const inputData = ref('');
    const qrSize = ref(120);
    const qrEcc = ref('M');
    const dedup = ref(true);
    const qrColor = ref('#000000');
    const fileName = ref('Nenhum arquivo selecionado');
    const viewMode = ref('cards'); // 'cards' or 'table'
    const qrData = ref([]);
    const statusMessage = ref('');
    const statusType = ref('success'); // 'success' or 'error'
    const darkMode = ref(false);
    
    // Refs for QR code containers
    const qrRefs = ref([]);
    const tableQrRefs = ref([]);
    
    // Computed properties
    const resultsCount = computed(() => {
      return `${qrData.value.length} ${qrData.value.length === 1 ? 'item' : 'itens'}`;
    });
    
    // Utility functions
    const detectSep = (line) => {
      const cands = [";", ",", "\t", "|"];
      const counts = cands.map((s) => [
        s,
        (line.match(new RegExp(`\\${s}`, "g")) || []).length,
      ]);
      counts.sort((a, b) => b[1] - a[1]);
      return counts[0][1] ? counts[0][0] : ";";
    };

    const parseText = (text) => {
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
    };

    const normalize = (rows, { dedup = true }) => {
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
    };

    // Methods
    const setQRRef = (el, index) => {
      if (el) {
        qrRefs.value[index] = el;
      }
    };

    const setTableQRRef = (el, index) => {
      if (el) {
        tableQrRefs.value[index] = el;
      }
    };

    const generateQRs = () => {
      if (!inputData.value.trim()) {
        showStatus('Por favor, insira alguns dados primeiro', 'error');
        return;
      }

      try {
        const rows = normalize(parseText(inputData.value), { dedup: dedup.value });
        qrData.value = rows;

        // Generate QR codes after DOM updates
        nextTick(() => {
          generateQRCodes();
        });

        showStatus(`Gerados ${rows.length} QR Codes`, 'success');
        saveToLocalStorage();
      } catch (error) {
        showStatus('Erro ao processar dados: ' + error.message, 'error');
        console.error(error);
      }
    };

    const generateQRCodes = () => {
      // Generate QR codes for cards view
      qrRefs.value.forEach((el, index) => {
        if (el && qrData.value[index]) {
          // Clear previous QR code
          el.innerHTML = '';
          
          try {
            new QRCode(el, {
              text: qrData.value[index].codigo,
              width: qrSize.value,
              height: qrSize.value,
              correctLevel: QRCode.CorrectLevel[qrEcc.value],
              colorDark: qrColor.value || "#000000",
              margin: 2,
            });
          } catch (error) {
            console.error("Erro ao gerar QR Code para", qrData.value[index].codigo, error);
            el.innerHTML = `<span class="error">Erro no QR</span>`;
          }
        }
      });

      // Generate QR codes for table view
      tableQrRefs.value.forEach((el, index) => {
        if (el && qrData.value[index]) {
          // Clear previous QR code
          el.innerHTML = '';
          
          try {
            new QRCode(el, {
              text: qrData.value[index].codigo,
              width: qrSize.value,
              height: qrSize.value,
              correctLevel: QRCode.CorrectLevel[qrEcc.value],
              colorDark: qrColor.value || "#000000",
              margin: 2,
            });
          } catch (error) {
            console.error("Erro ao gerar QR Code para", qrData.value[index].codigo, error);
            el.innerHTML = `<span class="error">Erro no QR</span>`;
          }
        }
      });
    };

    const handleFileUpload = (event) => {
      const file = event.target.files[0];
      if (!file) return;

      fileName.value = file.name;

      if (file.type !== "text/csv" && !file.name.toLowerCase().endsWith(".csv")) {
        showStatus("Por favor, selecione um arquivo CSV válido", "error");
        return;
      }

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          if (results.errors.length > 0) {
            showStatus(
              "Erro ao processar CSV: " + results.errors[0].message,
              "error"
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
                  key.toLowerCase().includes("id")
              );
              codigo = codKey ? row[codKey] : "";

              // Procurar por coluna de nome
              const nomeKey = keys.find(
                (key) =>
                  key.toLowerCase().includes("nome") ||
                  key.toLowerCase().includes("name") ||
                  key.toLowerCase().includes("prod") ||
                  key.toLowerCase().includes("desc")
              );
              nome = nomeKey ? row[nomeKey] : "";

              // Procurar por coluna de quantidade
              const qtKey = keys.find(
                (key) =>
                  key.toLowerCase().includes("qt") ||
                  key.toLowerCase().includes("quant") ||
                  key.toLowerCase().includes("qtd") ||
                  key.toLowerCase().includes("quantity")
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
          inputData.value = textData;

          showStatus(`CSV processado com ${rows.length} linhas válidas`, "success");

          // Gerar automaticamente os QR Codes
          if (rows.length > 0) {
            qrData.value = normalize(rows, { dedup: dedup.value });
            
            // Generate QR codes after DOM updates
            nextTick(() => {
              generateQRCodes();
            });
          }
        },
        error: function (error) {
          showStatus("Erro ao ler arquivo: " + error.message, "error");
        },
      });
    };

    const showStatus = (message, type = 'success') => {
      statusMessage.value = message;
      statusType.value = type;

      // Auto-ocultar após 5 segundos
      setTimeout(() => {
        if (statusMessage.value === message) {
          statusMessage.value = '';
        }
      }, 5000);
    };

    const toggleTheme = () => {
      darkMode.value = !darkMode.value;
      if (darkMode.value) {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
      saveToLocalStorage();
    };

    const setViewMode = (mode) => {
      viewMode.value = mode;
      localStorage.setItem("preferredView", mode);
      
      // Regenerate QR codes for new view
      if (qrData.value.length > 0) {
        nextTick(() => {
          generateQRCodes();
        });
      }
    };

    const printQRs = () => {
      if (qrData.value.length === 0) {
        showStatus("Nada para imprimir. Gere os QR Codes primeiro.", "error");
        return;
      }
      window.print();
    };

    const clearAll = () => {
      inputData.value = "";
      qrData.value = [];
      fileName.value = "Nenhum arquivo selecionado";
      statusMessage.value = "";
      localStorage.removeItem("qrPreferences");
    };

    const exportData = () => {
      if (!inputData.value.trim()) {
        showStatus("Nenhum dado para exportar", "error");
        return;
      }

      const blob = new Blob([inputData.value], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "qrcodes_data.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      showStatus("Dados exportados com sucesso", "success");
    };

    const showHelp = () => {
      alert(
        "Para usar o QRGen Pro:\n\n1. Cole os dados no formato: código;nome;quantidade (um por linha)\n2. Ou faça upload de um arquivo CSV\n3. Ajuste as opções conforme necessário\n4. Clique em 'Gerar QR Codes'\n5. Use os botões de visualização para alternar entre cards e tabela"
      );
    };

    const saveToLocalStorage = () => {
      const preferences = {
        qrSize: qrSize.value,
        qrEcc: qrEcc.value,
        dedup: dedup.value,
        inputData: inputData.value,
        qrColor: qrColor.value,
        darkMode: darkMode.value,
        viewMode: viewMode.value
      };

      try {
        localStorage.setItem("qrPreferences", JSON.stringify(preferences));
      } catch (error) {
        console.error("Erro ao salvar preferências:", error);
      }
    };

    const loadFromLocalStorage = () => {
      try {
        const preferences = JSON.parse(localStorage.getItem("qrPreferences")) || {};

        if (preferences.qrSize !== undefined) {
          qrSize.value = preferences.qrSize;
        }

        if (preferences.qrEcc) {
          qrEcc.value = preferences.qrEcc;
        }

        if (preferences.dedup !== undefined) {
          dedup.value = preferences.dedup;
        }

        if (preferences.inputData) {
          inputData.value = preferences.inputData;
        }

        if (preferences.qrColor) {
          qrColor.value = preferences.qrColor;
        }

        if (preferences.darkMode !== undefined) {
          darkMode.value = preferences.darkMode;
          if (darkMode.value) {
            document.body.classList.add('dark-mode');
          }
        }

        if (preferences.viewMode) {
          viewMode.value = preferences.viewMode;
        }
      } catch (error) {
        console.error("Erro ao carregar preferências:", error);
      }
    };

    // Lifecycle hooks
    onMounted(() => {
      loadFromLocalStorage();

      // Load saved view mode
      const savedViewMode = localStorage.getItem("preferredView");
      if (savedViewMode) {
        viewMode.value = savedViewMode;
      }

      // Detect PWA mode and add appropriate class
      detectPWAMode();
    });

    // Watch for changes and save to localStorage
    watch([inputData, qrSize, qrEcc, dedup, qrColor, darkMode], () => {
      saveToLocalStorage();
    }, { deep: true });

    // Function to detect if running as PWA
    const detectPWAMode = () => {
      // Check if running in standalone mode (PWA)
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

      if (isIOS && window.navigator.standalone === true) {
        document.body.classList.add('display-standalone');
      } else if (isStandalone) {
        document.body.classList.add('display-standalone');
      }

      // Also listen for changes in display mode
      window.matchMedia('(display-mode: standalone)').addListener(function() {
        if (window.matchMedia('(display-mode: standalone)').matches) {
          document.body.classList.add('display-standalone');
        } else {
          document.body.classList.remove('display-standalone');
        }
      });
    };

    return {
      inputData,
      qrSize,
      qrEcc,
      dedup,
      qrColor,
      fileName,
      viewMode,
      qrData,
      statusMessage,
      statusType,
      darkMode,
      resultsCount,
      setQRRef,
      setTableQRRef,
      generateQRs,
      handleFileUpload,
      toggleTheme,
      setViewMode,
      printQRs,
      clearAll,
      exportData,
      showHelp
    };
  }
});

app.mount('#app');