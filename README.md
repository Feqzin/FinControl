# FinControl (Debt-Control)

Sistema full-stack para controle financeiro pessoal, com backend Node.js/Express, frontend React e persistencia em PostgreSQL.

## Tecnologias
- Node.js
- TypeScript
- Express
- React + Vite
- Drizzle ORM
- PostgreSQL

## Requisitos
- Node.js 20+ (recomendado LTS)
- npm 10+
- PostgreSQL 14+

## Inicio rapido (manual)
1. Instale dependencias:
   ```bash
   npm install
   ```
2. Crie o arquivo de ambiente:
   ```bash
   cp .env.example .env
   ```
   No Windows CMD:
   ```bat
   copy .env.example .env
   ```
3. Ajuste as variaveis no `.env` (principalmente `DATABASE_URL` e `SESSION_SECRET`).
   Observacao: o projeto bloqueia startup se placeholders inseguros forem mantidos.
4. Execute migrations:
   ```bash
   npm run db:migrate
   ```
5. Inicie a aplicacao:
   ```bash
   npm run dev
   ```

## Setup automatizado
- Windows PowerShell:
  ```powershell
  npm run setup:windows
  ```
- Windows PowerShell com migrations:
  ```powershell
  npm run setup:windows -- -Migrate
  ```
- Linux/macOS:
  ```bash
  npm run setup:unix
  ```
- Linux/macOS com migrations:
  ```bash
  npm run setup:unix -- --migrate
  ```
- Cross-platform (apos `npm install`):
  ```bash
  npm run setup
  ```
- Cross-platform com migrations:
  ```bash
  npm run setup:migrate
  ```

## Variaveis de ambiente
Arquivo base: `.env.example`

```env
DATABASE_URL=postgres://<db_user>:<db_password>@<db_host>:5432/<db_name>
# Opcional (TLS Postgres). Padrao seguro em producao: true.
# Em Vercel + Supabase Pooler, pode ser necessario false.
# DATABASE_SSL_REJECT_UNAUTHORIZED=false
SESSION_SECRET=troque-por-um-segredo-forte
PORT=5000
ENABLE_DEMO_SEED=false
# DEMO_SEED_USERNAME=dev_demo_local
# DEMO_SEED_PASSWORD=TroquePorSenhaForte!123
# PAYMENT_PROOF_STORAGE_DIR=./uploads/comprovantes
# PAYMENT_PROOF_MAX_BYTES=5242880
```

- `DATABASE_URL`: string de conexao PostgreSQL.
- `DATABASE_SSL_REJECT_UNAUTHORIZED` (opcional): controla `rejectUnauthorized` do TLS do Postgres.
  - Padrao recomendado em producao: `true`.
  - Em alguns ambientes Vercel + Supabase Pooler pode ser necessario `false`.
  - Nao exponha `DATABASE_URL` em logs, respostas de API ou UI.
- `SESSION_SECRET`: segredo da sessao (minimo 16 caracteres).
- `PORT`: porta HTTP local (padrao `5000`).
- `ENABLE_DEMO_SEED`: habilita seed demo em desenvolvimento.
- `DEMO_SEED_USERNAME`: usuario demo quando seed estiver ativa.
- `DEMO_SEED_PASSWORD`: senha demo quando seed estiver ativa.
- `PAYMENT_PROOF_STORAGE_DIR` (opcional): diretorio local para comprovantes de pagamento.
- `PAYMENT_PROOF_MAX_BYTES` (opcional): tamanho maximo de upload em bytes (padrao `5242880`, 5 MB).

## Scripts principais
- `npm run dev`: inicia ambiente de desenvolvimento.
- `npm run build`: gera build de producao em `dist/`.
- `npm run start`: executa build de producao.
- `npm run db:migrate`: aplica SQL de `migrations/`.
- `npm run check:encoding`: detecta texto corrompido (mojibake/caractere `U+FFFD`) em frontend/backend.
- `npm run test`: executa suite de testes.
- `npm run audit:ops`: auditoria operacional (segredos/artefatos/distribuicao).
- `npm run audit:ops:strict`: auditoria operacional em modo estrito.
- `npm run package:source`: gera zip source-only em `artifacts/`.

## Padrao de encoding
- O repositorio usa UTF-8 (ver `.editorconfig`).
- Antes de commit/release, rode:
  ```bash
  npm run check:encoding
  ```
- Esse check bloqueia recorrencia de textos corrompidos (palavras acentuadas quebradas, caracteres invalidos e texto em Unicode decomposto).
- No editor/IDE, mantenha o arquivo salvo como `UTF-8` (sem fallback para ANSI/Windows-1252).
- Evite copiar/colar texto de fontes que mudam encoding; ao notar texto estranho, regrave o arquivo em UTF-8 e execute o check.

## Higiene de repositorio
Arquivos e pastas sensiveis/gerados estao fora de versionamento:
- `.env` e `.env.*` (exceto `.env.example`)
- `node_modules/`
- `dist/`
- `artifacts/`, `diagnostics/`, `attached_assets/`
- `.local/`, `.agents/`, `.config/`

Isso evita vazamento de segredo e problemas de portabilidade entre ambientes.

## Distribuicao segura do codigo
Fluxo recomendado para compartilhar pacote fonte:
1. Execute auditoria operacional:
   ```bash
   npm run audit:ops
   ```
2. (Opcional/CI) execute gate estrito:
   ```bash
   npm run audit:ops:strict
   ```
3. Gere pacote source-only:
   ```bash
   npm run package:source
   ```
4. Compartilhe apenas o zip gerado em `artifacts/` por esse script.

O script de pacote copia apenas arquivos rastreados pelo git e bloqueia rastreamento indevido de:
- `.env`/`.env.*` (exceto `.env.example`)
- `.git`, `node_modules`, `dist`
- `artifacts`, `diagnostics`, `attached_assets`
- arquivos compactados internos (`.zip`, `.tar`, `.tgz`)
- certificados/chaves (`.pem`, `.key`, `.p12`, `.pfx`, `.crt`, `.kdbx`)

Protecao adicional:
- `.gitattributes` usa `export-ignore` para impedir vazamento desses arquivos em `git archive`.
- Evite compartilhar zip manual da pasta de trabalho; use somente `npm run package:source`.

## Estrutura resumida
- `client/`: frontend React.
- `server/`: API e regras de negocio.
- `migrations/`: migrations SQL.
- `script/`: automacoes de build, setup e manutencao.
- `shared/`: contratos/entidades compartilhadas.

## Comprovantes de pagamento
- Upload aceito: `PDF`, `JPG/JPEG` e `PNG`.
- Tamanho maximo padrao: `5 MB`.
- Armazenamento local padrao: `uploads/comprovantes/` (na raiz do projeto).
- Os arquivos ficam vinculados ao registro financeiro (`parcela` ou `divida`) e sao servidos por endpoint autenticado com escopo por `userId`.

## Troubleshooting
### `Variavel obrigatoria ausente: DATABASE_URL`
- Garanta que `.env` existe na raiz.
- Garanta que `DATABASE_URL` esta preenchida.

### `Login/Cadastro retorna 500 em producao`
- Verifique conexao SSL do banco (Postgres/Supabase Pooler).
- Se estiver usando Supabase Pooler na Vercel e houver falha de handshake/certificado, teste:
  - `DATABASE_SSL_REJECT_UNAUTHORIZED=false`
- Mantenha a resposta ao usuario generica e registre apenas diagnostico tecnico no servidor.
- Nunca imprima `DATABASE_URL` completa em logs ou mensagens de erro.

### `SESSION_SECRET ainda esta com valor de exemplo`
- Defina um valor proprio com pelo menos 16 caracteres.

### `EADDRINUSE` ou porta em uso
- Ajuste `PORT` no `.env` (exemplo `PORT=5001`).
- Ou finalize o processo que esta usando a porta atual.

No Windows CMD:
```bat
netstat -ano | findstr :5000
tasklist /FI "PID eq <PID>"
```

## Deploy
Checklist minimo:
1. Configurar variaveis de ambiente de producao.
2. Rodar `npm run build`.
3. Rodar migrations no banco de producao.
4. Iniciar com `npm run start`.

## Checklist operacional de deploy seguro
1. `npm run audit:ops` sem erros.
2. Confirmar que `.env` de producao nao usa placeholders.
3. Confirmar `SESSION_SECRET` forte (>=32 caracteres em producao).
4. Confirmar `ENABLE_DEMO_SEED=false` em producao.
5. Validar configuracao SSL do Postgres:
   - padrao: `DATABASE_SSL_REJECT_UNAUTHORIZED=true`
   - fallback para Vercel + Supabase Pooler quando necessario: `false`
6. Rodar `npm run check`, `npm run test` e `npm run build`.
7. Garantir que pacote/artefato nao inclui `.env`, `.git`, `node_modules`, `dist`, `diagnostics`.
8. Publicar somente build e configuracoes necessarias ao runtime.
