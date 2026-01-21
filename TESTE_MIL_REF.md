# 🧪 TESTE: Mil de Referência

## Como testar a funcionalidade:

### 1️⃣ Preparar dados de teste

Cole isso no campo de texto:

```
MESA001;Mesa Escritório;3
CADEIRA05;Cadeira Gamer;5
ARMARIO10;Armário 2 Portas;2
```

### 2️⃣ Teste SEM mil de referência

1. **Deixe o botão "Mil de Ref: OFF"** (cinza)
2. Clique em **"Gerar QR Codes"**

**Resultado esperado:** 3 QR codes

- MESA001
- CADEIRA05
- ARMARIO10

---

### 3️⃣ Teste COM mil de referência

1. **Clique no botão "Mil de Ref: OFF"**
   - O botão deve ficar **AZUL** e mudar para **"Mil de Ref: ON"**
2. Clique em **"Gerar QR Codes"**

**Resultado esperado:** 10 QR codes (3 + 5 + 2)

**MESA001:**

- `MESA0010001` - Mesa Escritório (1/3)
- `MESA0010002` - Mesa Escritório (2/3)
- `MESA0010003` - Mesa Escritório (3/3)

**CADEIRA05:**

- `CADEIRA050001` - Cadeira Gamer (1/5)
- `CADEIRA050002` - Cadeira Gamer (2/5)
- `CADEIRA050003` - Cadeira Gamer (3/5)
- `CADEIRA050004` - Cadeira Gamer (4/5)
- `CADEIRA050005` - Cadeira Gamer (5/5)

**ARMARIO10:**

- `ARMARIO100001` - Armário 2 Portas (1/2)
- `ARMARIO100002` - Armário 2 Portas (2/2)

---

### 4️⃣ Verificar os QR Codes

Use um leitor de QR Code no celular e escaneie os códigos gerados.

**Deve ler:**

- ✅ `MESA0010001`
- ✅ `MESA0010002`
- ✅ `MESA0010003`
- etc...

---

## ✅ Checklist de Teste

- [ ] Botão "Mil de Ref: OFF" aparece (cinza)
- [ ] Ao clicar, fica AZUL e muda para "Mil de Ref: ON"
- [ ] Sem mil de ref: gera 3 códigos
- [ ] Com mil de ref: gera 10 códigos (expandidos)
- [ ] Códigos têm sufixo 0001, 0002, etc
- [ ] Quantidade mostra 1/3, 2/3, etc
- [ ] QR codes escaneiam corretamente

---

## 🐛 Se não funcionar:

1. **Limpe o cache:** Ctrl + Shift + R
2. **Verifique o Console (F12):** Procure erros em vermelho
3. **Teste com dados simples:**
   ```
   ABC123;Teste;2
   ```
   Com mil de ref deve gerar: `ABC1230001` e `ABC1230002`

---

**Agora teste e me diga o resultado!** 🚀
