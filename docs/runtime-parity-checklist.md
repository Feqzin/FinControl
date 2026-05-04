# Runtime Parity Checklist

## Purpose
Freeze runtime contract before heavy refactor work.
This document maps local vs production runtime, route parity, and service divergence.

## Runtime matrix

- Local dev runtime (npm run dev): `server/index.ts`
- Local build runtime (npm run build -> npm start): `server/index.ts` bundled to `dist/index.cjs`
- Production runtime (Vercel): `api/index.ts` -> exports `serverless/app.js`

### Verified files
- `package.json` script `dev`: `tsx server/index.ts`
- `package.json` script `build`: `script/build.ts` bundles `server/index.ts`
- `api/index.ts`: imports and exports `../serverless/app.js`

### Quick diagnostic command
- Run route parity check: `npm run check:routes-parity`

## Route inventory

### Routes from server stack
Source files:
- `server/routes.ts`
- `server/routes/core-domain.routes.ts`
- `server/routes/financial-domain.routes.ts`

Routes:
- GET `/api/backups/cloud`
- POST `/api/backups/cloud`
- GET `/api/cartoes`
- POST `/api/cartoes`
- DELETE `/api/cartoes/:cartaoId/faturas/:mes`
- DELETE `/api/cartoes/:id`
- PATCH `/api/cartoes/:id`
- DELETE `/api/cartoes/compras/:compraId`
- DELETE `/api/cartoes/faturas/:mes`
- GET `/api/compras-cartao`
- POST `/api/compras-cartao`
- DELETE `/api/compras-cartao/:id`
- PATCH `/api/compras-cartao/:id`
- GET `/api/compras-cartao/cartao/:cartaoId`
- GET `/api/compras-cartao/pessoa/:pessoaId`
- GET `/api/dividas`
- POST `/api/dividas`
- DELETE `/api/dividas/:id`
- PATCH `/api/dividas/:id`
- POST `/api/dividas/:id/recalcular`
- POST `/api/dividas/parcelado`
- GET `/api/dividas/pessoa/:pessoaId`
- GET `/api/financial/insights`
- GET `/api/financial/score`
- GET `/api/financial/summary`
- POST `/api/importar-texto`
- POST `/api/imports/:id/rollback`
- POST `/api/imports/confirm`
- GET `/api/imports/logs`
- POST `/api/imports/preview`
- GET `/api/metas`
- POST `/api/metas`
- DELETE `/api/metas/:id`
- PATCH `/api/metas/:id`
- GET `/api/pagamentos/:sourceType/:sourceId/comprovante`
- POST `/api/pagamentos/:sourceType/:sourceId/comprovante`
- PATCH `/api/pagamentos/:sourceType/:sourceId/observacao`
- GET `/api/parcelas`
- GET `/api/parcelas-compra/:compraId`
- PATCH `/api/parcelas-compra/:id`
- POST `/api/parcelas-compra/bulk`
- DELETE `/api/parcelas/:id`
- PATCH `/api/parcelas/:id`
- POST `/api/parcelas/antecipar`
- GET `/api/parcelas/divida/:dividaId`
- GET `/api/patrimonios`
- POST `/api/patrimonios`
- DELETE `/api/patrimonios/:id`
- PATCH `/api/patrimonios/:id`
- GET `/api/pessoas`
- POST `/api/pessoas`
- DELETE `/api/pessoas/:id`
- PATCH `/api/pessoas/:id`
- GET `/api/pessoas/:pessoaId/timeline-pagamentos`
- GET `/api/rendas`
- POST `/api/rendas`
- DELETE `/api/rendas/:id`
- PATCH `/api/rendas/:id`
- GET `/api/servico-pagamentos`
- POST `/api/servico-pagamentos`
- DELETE `/api/servico-pagamentos/:id`
- GET `/api/servico-pessoas`
- POST `/api/servico-pessoas`
- DELETE `/api/servico-pessoas/:id`
- PATCH `/api/servico-pessoas/:id`
- GET `/api/servicos`
- POST `/api/servicos`
- DELETE `/api/servicos/:id`
- PATCH `/api/servicos/:id`

### Routes from serverless stack
Source files:
- `serverless/routes.ts`
- `serverless/routes/core-domain.routes.ts`
- `serverless/routes/financial-domain.routes.ts`
- `serverless/routes/debug-db-ping.route.ts`

Routes:
- GET `/api/backups/cloud`
- POST `/api/backups/cloud`
- GET `/api/backups/cloud/:id/download`
- POST `/api/backups/cloud/:id/restore`
- POST `/api/billing/mercadopago/cancel`
- POST `/api/billing/mercadopago/checkout`
- POST `/api/billing/mercadopago/webhook`
- GET `/api/billing/status`
- POST `/api/billing/trial/start`
- GET `/api/cartoes`
- POST `/api/cartoes`
- DELETE `/api/cartoes/:cartaoId/faturas/:mes`
- DELETE `/api/cartoes/:id`
- PATCH `/api/cartoes/:id`
- DELETE `/api/cartoes/compras/:compraId`
- DELETE `/api/cartoes/faturas/:mes`
- GET `/api/cartoes/resumo`
- GET `/api/compras-cartao`
- POST `/api/compras-cartao`
- DELETE `/api/compras-cartao/:id`
- PATCH `/api/compras-cartao/:id`
- GET `/api/compras-cartao/cartao/:cartaoId`
- GET `/api/compras-cartao/pessoa/:pessoaId`
- GET `/api/debug/db-check`
- GET `/api/debug/db-connectivity`
- GET `/api/debug/db-ping`
- GET `/api/dividas`
- POST `/api/dividas`
- DELETE `/api/dividas/:id`
- PATCH `/api/dividas/:id`
- POST `/api/dividas/:id/recalcular`
- POST `/api/dividas/parcelado`
- GET `/api/dividas/pessoa/:pessoaId`
- GET `/api/financial/insights`
- GET `/api/financial/score`
- GET `/api/financial/summary`
- POST `/api/import`
- POST `/api/importar-texto`
- POST `/api/imports/:id/rollback`
- POST `/api/imports/confirm`
- GET `/api/imports/logs`
- POST `/api/imports/preview`
- GET `/api/metas`
- POST `/api/metas`
- DELETE `/api/metas/:id`
- PATCH `/api/metas/:id`
- GET `/api/pagamentos/:sourceType/:sourceId/comprovante`
- POST `/api/pagamentos/:sourceType/:sourceId/comprovante`
- PATCH `/api/pagamentos/:sourceType/:sourceId/observacao`
- GET `/api/parcelas`
- GET `/api/parcelas-compra`
- GET `/api/parcelas-compra/:compraId`
- PATCH `/api/parcelas-compra/:id`
- POST `/api/parcelas-compra/bulk`
- DELETE `/api/parcelas/:id`
- PATCH `/api/parcelas/:id`
- POST `/api/parcelas/antecipar`
- GET `/api/parcelas/divida/:dividaId`
- GET `/api/patrimonios`
- POST `/api/patrimonios`
- DELETE `/api/patrimonios/:id`
- PATCH `/api/patrimonios/:id`
- GET `/api/pessoas`
- POST `/api/pessoas`
- DELETE `/api/pessoas/:id`
- PATCH `/api/pessoas/:id`
- POST `/api/pessoas/:pessoaId/dividas/:dividaId/abater-saldo`
- POST `/api/pessoas/:pessoaId/parcelas/:parcelaId/abater-saldo`
- GET `/api/pessoas/:pessoaId/resumo`
- GET `/api/pessoas/:pessoaId/saldo-movimentacoes`
- POST `/api/pessoas/:pessoaId/saldo-movimentacoes`
- POST `/api/pessoas/:pessoaId/servicos/:servicoPessoaId/abater-saldo`
- GET `/api/pessoas/:pessoaId/timeline-pagamentos`
- GET `/api/pessoas/saldo-movimentacoes`
- GET `/api/rendas`
- POST `/api/rendas`
- DELETE `/api/rendas/:id`
- PATCH `/api/rendas/:id`
- GET `/api/servico-pagamentos`
- POST `/api/servico-pagamentos`
- DELETE `/api/servico-pagamentos/:id`
- GET `/api/servico-pessoas`
- POST `/api/servico-pessoas`
- DELETE `/api/servico-pessoas/:id`
- PATCH `/api/servico-pessoas/:id`
- GET `/api/servicos`
- POST `/api/servicos`
- DELETE `/api/servicos/:id`
- PATCH `/api/servicos/:id`
- GET `/api/subscription/usage`

## Route parity delta

### Exists only in serverless
- GET `/api/backups/cloud/:id/download`
- POST `/api/backups/cloud/:id/restore`
- POST `/api/billing/mercadopago/cancel`
- POST `/api/billing/mercadopago/checkout`
- POST `/api/billing/mercadopago/webhook`
- GET `/api/billing/status`
- POST `/api/billing/trial/start`
- GET `/api/cartoes/resumo`
- GET `/api/debug/db-check`
- GET `/api/debug/db-connectivity`
- GET `/api/debug/db-ping`
- POST `/api/import`
- GET `/api/parcelas-compra`
- POST `/api/pessoas/:pessoaId/dividas/:dividaId/abater-saldo`
- POST `/api/pessoas/:pessoaId/parcelas/:parcelaId/abater-saldo`
- GET `/api/pessoas/:pessoaId/resumo`
- GET `/api/pessoas/:pessoaId/saldo-movimentacoes`
- POST `/api/pessoas/:pessoaId/servicos/:servicoPessoaId/abater-saldo`
- GET `/api/pessoas/saldo-movimentacoes`
- GET `/api/subscription/usage`

### Exists only in server
- No route path unique to server (current server route set is subset of serverless paths).

## Service duplication and divergence

Comparison target:
- `server/services/*`
- `serverless/services/*`

### Service file counts
- Shared service filenames: 24
- Only in `server/services`: 0
- Only in `serverless/services`: 4

Only in serverless:
- `backup-import-persistence.service.ts`
- `backup-import-transform.service.ts`
- `billing.service.ts`
- `subscription.service.ts`

### Shared services with strongest divergence
- `pessoas.service.ts`: server 17 lines vs serverless 867 lines
- `cloud-backups.service.ts`: server 197 vs serverless 370
- `financial-card-analytics.ts`: server 175 vs serverless 272
- `servicos.service.ts`: server 74 vs serverless 118
- `parcelas.service.ts`: server 96 vs serverless 123
- `financial.service.ts`: server 593 vs serverless 618

## Runtime contract recommendation

- Official production source of truth: `serverless/*`
- Any domain behavior or route change must be implemented in `serverless` first.
- `server/*` should be treated as local compatibility runtime and explicitly mirrored only when needed.

## Pre-change checklist (must pass before merge)

1. Implement change in `serverless` first.
2. Mirror in `server` only if local runtime still depends on same behavior.
3. Validate local runtime (`npm run dev`) on changed routes.
4. Validate type safety (`npm run check`).
5. Validate production build (`npm run build`).
6. Validate route parity:
   - local equivalent route responds
   - serverless equivalent route responds
7. If route exists only in serverless, document local expectation and test against Vercel runtime.
8. If financial domain touched, confirm no fallback in frontend is silently masking parity issues.

## Operational note

Current project contains a nested folder `Debt-Control/` with its own `.git` metadata.
This is a risk for accidental edits/commits in the wrong tree and should be handled before larger refactors.
