# FinControl (Debt-Control)

Aplicativo full-stack para controle financeiro pessoal.

## Requisitos
- Node.js 20+ (recomendado: LTS)
- PostgreSQL

## Setup local
1. Instale dependencias:
   ```bash
   npm install
   ```
2. Crie seu arquivo de ambiente:
   - Copie `.env.example` para `.env`
   - Ajuste os valores
3. Aplique as migrations SQL:
   ```bash
   npm run db:migrate
   ```
4. Rode o projeto:
   ```bash
   npm run dev
   ```

## Testes
```bash
npm run test
```
Esse comando executa:
- recalculo de parcelas
- politica de seed demo
- resiliencia de startup (fallback de porta em desenvolvimento)

## Variaveis de ambiente
Defina no arquivo `.env` na raiz:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/debt_control
SESSION_SECRET=troque-por-um-segredo-forte
PORT=5000
ENABLE_DEMO_SEED=false
# DEMO_SEED_USERNAME=dev_demo_local
# DEMO_SEED_PASSWORD=TroquePorSenhaForte!123
```

- `DATABASE_URL`: conexao com seu banco PostgreSQL
- `SESSION_SECRET`: segredo da sessao (use valor forte e com 16+ caracteres)
- `PORT`: porta HTTP da aplicacao (padrao `5000`)
- `ENABLE_DEMO_SEED`: habilita seed demo somente em desenvolvimento
- `DEMO_SEED_USERNAME`: username do usuario demo (obrigatorio quando `ENABLE_DEMO_SEED=true`)
- `DEMO_SEED_PASSWORD`: senha forte do usuario demo (obrigatorio quando `ENABLE_DEMO_SEED=true`)

## Migrations
- Execute `npm run db:migrate` sempre que houver novos arquivos em `migrations/`.
- A tabela `schema_migrations` registra as migrations aplicadas e valida checksum para evitar alteracao retroativa de migration antiga.
- A migration `0001_integrity_constraints_indexes.sql` faz normalizacao e remove registros orfaos antes de criar FKs/indices. Em base legada, valide backup antes de executar.

## Troubleshooting
### 1) `Variavel obrigatoria ausente: DATABASE_URL`
- Verifique se o arquivo `.env` existe na raiz
- Verifique se `DATABASE_URL` esta preenchida

### 2) `SESSION_SECRET ainda esta com valor de exemplo`
- Troque `SESSION_SECRET` por um valor real

### 3) `EADDRINUSE` (porta em uso)
- Em desenvolvimento, o servidor tenta fallback automatico de porta/host quando possivel.
- Se preferir fixar porta, altere `PORT` no `.env` (ex.: `PORT=5001`)
- Ou finalize o processo que esta usando a porta

No Windows (cmd), para identificar quem esta usando:
```bat
netstat -ano | findstr :5000
tasklist /FI "PID eq <PID>"
```

### 4) Erro de configuracao de seed demo
- `ENABLE_DEMO_SEED=true` so funciona fora de producao
- Defina `DEMO_SEED_USERNAME` e `DEMO_SEED_PASSWORD`
- Evite username `demo` e use senha com 12+ caracteres, letras, numeros e simbolos
