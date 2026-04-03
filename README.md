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
3. Rode o projeto:
   ```bash
   npm run dev
   ```

## Variaveis de ambiente
Defina no arquivo `.env` na raiz:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/debt_control
SESSION_SECRET=troque-por-um-segredo-forte
PORT=5000
```

- `DATABASE_URL`: conexao com seu banco PostgreSQL
- `SESSION_SECRET`: segredo da sessao (use valor forte e com 16+ caracteres)
- `PORT`: porta HTTP da aplicacao (padrao `5000`)

## Troubleshooting
### 1) `Variavel obrigatoria ausente: DATABASE_URL`
- Verifique se o arquivo `.env` existe na raiz
- Verifique se `DATABASE_URL` esta preenchida

### 2) `SESSION_SECRET ainda esta com valor de exemplo`
- Troque `SESSION_SECRET` por um valor real

### 3) `EADDRINUSE` (porta em uso)
- Altere `PORT` no `.env` (ex.: `PORT=5001`)
- Ou finalize o processo que esta usando a porta

No Windows (cmd), para identificar quem esta usando:
```bat
netstat -ano | findstr :5000
tasklist /FI "PID eq <PID>"
```

