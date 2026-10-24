# Doações do QRGen Pro

O convite aparece após gerar etiquetas, uma vez por sessão, sem bloquear o gerador e sem sair na impressão.

## Configuração segura na Vercel

Abra **projeto > Settings > Environment Variables** e adicione:

| Nome | Valor | Ambiente |
| --- | --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token de produção da sua aplicação Mercado Pago | Production |
| `APP_URL` | `https://gerador-qrcode-inventario.vercel.app` | Production |

O Access Token deve ser tratado como segredo no painel. Não use prefixos públicos como `NEXT_PUBLIC_` ou `VITE_`. A geração do Pix usa somente o Access Token no servidor; não usa Public Key, Client ID ou Client Secret. A conta Mercado Pago precisa estar habilitada para receber Pix.

Depois de salvar as variáveis, faça um **Redeploy**. Variáveis novas são aplicadas aos próximos deployments. Para Preview, configure variáveis separadas e, de preferência, credenciais de teste. Não coloque credenciais em `donation-config.js`, no HTML ou no Git. `.gitignore` e `.vercelignore` excluem arquivos `.env`.

O arquivo `.env.example` contém apenas os nomes e valores de exemplo. Nenhuma credencial real foi gravada no projeto.

## Como funciona o recebimento pela API

- A função `api/donations.js` usa `process.env.MERCADO_PAGO_ACCESS_TOKEN` exclusivamente no servidor.
- `GET /api/donations` informa se existe configuração. Não expõe credenciais e não garante que a conta esteja habilitada no provedor.
- O visitante informa o valor (R$ 1 a R$ 1.000), e-mail e CPF. Esses dados são enviados ao Mercado Pago para emitir a cobrança, sem gravação em banco de dados ou logs do projeto.
- `POST /api/donations` valida o valor e o CPF, fixa `payment_method_id: pix` e chama `/v1/payments` no Mercado Pago.
- A página exibe o **código Pix retornado pelo provedor** (`point_of_interaction.transaction_data.qr_code`) e o Pix Copia e Cola. Não é um QR de URL de checkout.
- O usuário paga pelo aplicativo do banco. A geração da cobrança não debita nenhum valor automaticamente.
- Retentativas com os mesmos dados usam a mesma chave de idempotência. Ao alterar os dados, uma nova chave é criada. A página informa a validade e oculta o Pix após expirar.

A confirmação automática de recebimento ainda não está implementada. Verifique o pagamento no Mercado Pago. Não considere a geração do QR como confirmação de pagamento.

Falhas do provedor recebem uma referência exibida no atributo `data-reference` da mensagem na página. O servidor registra apenas referência, status HTTP e código de erro, sem credenciais nem dados do doador. Para investigar uma falha na Vercel, procure `donation_pix_error` nos logs da função e confira se o Access Token é válido e se a conta está habilitada para Pix.

As funções funcionam na Vercel. Live Preview e abertura direta de HTML não executam o backend; nesses ambientes, o recebimento por API não aparece. Para desenvolvimento, use Vercel CLI (`vercel dev`) com as variáveis de Development.

## Alternativa: QR estático

Para receber sem API, preencha somente dados públicos em `donation-config.js`:

- `paymentUrl`: link de pagamento HTTPS do Mercado Pago.
- `pixCode`: conteúdo completo do Pix Copia e Cola, com checksum válido.

Quando ambos estão preenchidos, o Pix tem preferência no QR Code. Quando existe uma opção estática válida, ela tem preferência sobre o formulário da API. Sem dados estáticos nem Access Token no servidor, a página mostra que o recebimento está sendo preparado.

## Validação

Os testes usam respostas simuladas e não enviam pagamentos. Antes de divulgar, abra o checkout e confira o destinatário e o valor. O endereço da página será `https://gerador-qrcode-inventario.vercel.app/doar.html` após publicar os arquivos.

Referências: [Mercado Pago — Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-configuration/integrate-pix) e [Vercel — variáveis de ambiente](https://vercel.com/docs/environment-variables).
