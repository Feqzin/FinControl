# Release Candidate 1 Checklist (FinControl SaaS)

Este documento define o gate operacional para RC1 em Vercel + Supabase.
Escopo: validacao de deploy, seguranca, fluxos criticos e rollback.

## 1. Pre-deploy (obrigatorio)

1. Confirmar branch de release limpa:
   - `git status` sem alteracoes locais
   - branch alvo `main` atualizada
2. Confirmar migrations aplicadas no banco alvo:
   - `npm run db:migrate`
   - validar `schema_migrations` com todos os arquivos esperados
3. Confirmar variaveis de ambiente na Vercel:
   - `DATABASE_URL`
   - `DATABASE_SSL_REJECT_UNAUTHORIZED`
   - `SESSION_SECRET` (forte, >= 32 chars)
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_STORAGE_BUCKET`
   - `CLOUD_BACKUP_BUCKET` (quando separado)
   - `MERCADO_PAGO_ACCESS_TOKEN`
   - `MERCADO_PAGO_WEBHOOK_SECRET`
   - `APP_BASE_URL`
   - `SESSION_COOKIE_NAME`
   - `SESSION_COOKIE_SAME_SITE`
   - `SESSION_COOKIE_SECURE=true`
   - `SESSION_COOKIE_DOMAIN` (se aplicavel)
   - `RATE_LIMIT_IMPORT_MAX`
   - `RATE_LIMIT_UPLOAD_MAX`
   - `RATE_LIMIT_BACKUP_MAX`
   - `RATE_LIMIT_BILLING_MAX`
   - `RATE_LIMIT_WEBHOOK_MAX`
   - `DEBUG_DB_CHECK_ENABLED=false`
   - `DEBUG_DB_CHECK_TOKEN` vazio/ausente por padrao
4. Confirmar Mercado Pago no modo correto:
   - ambiente de teste para RC1
   - webhook apontando para URL correta
5. Confirmar buckets Supabase Storage:
   - bucket de comprovantes privado
   - bucket de backup cloud privado
6. Confirmar fallback local desativado em producao:
   - `ALLOW_LOCAL_FILESYSTEM_STORAGE_FALLBACK` ausente ou `false`

## 2. Pos-deploy tecnico (smoke test)

1. `GET /api/auth/me` sem login deve retornar `401`.
2. Fazer login real de usuario de teste.
3. Abrir Dashboard e validar carregamento sem erro.
4. Abrir Cartoes e validar cards, compras e parcelas.
5. Testar importacao de fatura Nubank (PDF textual) ate preview.
6. Testar comprovante:
   - anexar
   - visualizar
   - excluir
7. Abrir Servicos e validar criacao/edicao basica.
8. Testar backup/cloud (se premium habilitado no usuario de teste):
   - criar backup
   - listar
   - download
   - restore em ambiente controlado
9. Testar billing (ambiente teste):
   - checkout
   - cancelamento
   - status

## 3. Seguranca pos-deploy

1. `GET /api/debug/db-ping` sem token deve retornar `404`.
2. `/api/importar-texto` deve responder protegido:
   - sem auth: `401/403`
   - sem premium: bloqueio premium
   - premium autenticado: `410` (legado descontinuado)
3. Upload de arquivo invalido deve ser bloqueado com erro amigavel.
4. Webhook Mercado Pago sem assinatura valida deve ser bloqueado (`401/403`).
5. Ownership/IDOR:
   - usuario A nao acessa dados do usuario B (pessoas, cartoes, compras, parcelas, backups, comprovantes).

## 4. Checklist manual de negocio

1. Criar pessoa.
2. Criar divida.
3. Criar cartao.
4. Criar compra.
5. Pagar e desfazer pagamento de parcela.
6. Importar fatura (preview -> confirmar).
7. Executar rollback de importacao.
8. Criar servico por importacao (acao `create_new`) e validar vinculo `compraCartaoId`.
9. Vincular servico existente por importacao (acao `link_existing`).
10. Validar regra de servico compartilhado:
    - cobranca no cartao nao marca mes como pago automaticamente.

## 5. Plano de rollback de release

1. Reverter deploy na Vercel para o deploy estavel anterior.
2. Se migration ja aplicada:
   - evitar rollback destrutivo de schema sem plano SQL dedicado
   - priorizar rollback de aplicacao (codigo) primeiro
3. Pausar feature sensivel quando necessario:
   - desabilitar acesso operacional via permissao/plano em ambiente de emergencia
   - restringir uso de endpoints sensiveis por controle operacional temporario
4. Logs a monitorar:
   - Vercel Runtime Logs (status 5xx e latencia)
   - Supabase Postgres logs (erros 42P01/42703, timeout, conexao)
   - Supabase Storage logs (401/403/404 upload/download)
   - eventos webhook Mercado Pago (assinatura invalida, flood, retries)

## 6. Gate de aprovacao RC1

A release so pode ser aprovada se:

1. `npm run check` ok.
2. `npm run build` ok.
3. `npm run test:security` ok.
4. `npm run test:frontend-unit` ok.
5. `npm run test:security:db` ok (com Docker ativo).
6. Smoke test pos-deploy concluido sem bloqueador.
7. Itens de seguranca pos-deploy concluido sem falha critica.

## 7. Evidencias recomendadas

1. URL do deploy RC1 na Vercel.
2. Captura de tela dos testes manuais chave.
3. Logs dos comandos de validacao.
4. Registro de aprovacao final (Go/No-Go).
