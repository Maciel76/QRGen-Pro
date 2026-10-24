# Doações do QRGen Pro

O convite aparece após gerar etiquetas, uma vez por sessão, sem bloquear o gerador e sem sair na impressão.

## Configuração segura na Vercel

Abra **projeto > Settings > Environment Variables** e adicione:

| Nome | Valor | Ambiente |
| --- | --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token de produção da sua aplicação Mercado Pago | Production |
| `APP_URL` | `https://gerador-qrcode-inventario.vercel.app` | Production |

O Access Token deve ser tratado como segredo no painel. Não use prefixos públicos como `NEXT_PUBLIC_` ou `VITE_`. Esta integração não precisa de Public Key, Client ID ou Client Secret: o navegador abre o checkout hospedado pelo Mercado Pago.

Depois de salvar as variáveis, faça um **Redeploy**. Variáveis novas são aplicadas aos próximos deployments. Para Preview, configure variáveis separadas e, de preferência, credenciais de teste. Não coloque credenciais em `donation-config.js`, no HTML ou no Git. `.gitignore` e `.vercelignore` excluem arquivos `.env`.

O arquivo `.env.example` contém apenas os nomes e valores de exemplo. Nenhuma credencial real foi gravada no projeto.

## Como funciona o recebimento pela API

- A função `api/donations.js` usa `process.env.MERCADO_PAGO_ACCESS_TOKEN` exclusivamente no servidor.
- O navegador consulta `GET /api/donations` para saber se o recebimento está habilitado. A resposta não contém credenciais.
- O visitante escolhe o valor e envia `POST /api/donations` com o valor em centavos.
- O servidor valida o valor (R$ 1 a R$ 1.000), fixa a moeda em BRL e cria uma preferência no Mercado Pago.
- A página mostra um QR Code do **link do checkout** e o botão para abrir o Mercado Pago. Não é um QR Pix direto; os meios disponíveis aparecem no checkout.
- O visitante conclui o pagamento no Mercado Pago. Criar o link não efetua uma cobrança automaticamente.

O sistema não confirma pagamentos por parâmetro de URL. Os retornos de sucesso, pendente ou falha só levam de volta à página. Não há confirmação automática por webhook nesta versão.

As funções funcionam na Vercel. Live Preview e abertura direta de HTML não executam o backend; nesses ambientes, o recebimento por API não aparece. Para desenvolvimento com as funções, use Vercel CLI (`vercel dev`) com as variáveis de Development.

## Alternativa: QR estático

Para receber sem API, preencha somente dados públicos em `donation-config.js`:

- `paymentUrl`: link de pagamento HTTPS do Mercado Pago.
- `pixCode`: conteúdo completo do Pix Copia e Cola, com checksum válido.

Quando ambos estão preenchidos, o Pix tem preferência no QR Code. Quando existe uma opção estática válida, ela tem preferência sobre o formulário da API. Sem dados estáticos nem Access Token no servidor, a página mostra que o recebimento está sendo preparado.

## Validação

Os testes usam respostas simuladas e não enviam pagamentos. Antes de divulgar, abra o checkout e confira o destinatário e o valor. O endereço da página será `https://gerador-qrcode-inventario.vercel.app/doar.html` após publicar os arquivos.

Referências: [Mercado Pago — preferência de pagamento](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/create-payment-preference) e [Vercel — variáveis de ambiente](https://vercel.com/docs/environment-variables).
