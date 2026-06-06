# Security Tests (DB local)

Este guia sobe um Postgres local isolado para rodar testes de seguranca (incluindo IDOR) sem `skip`.

## 1) Preparar ambiente de teste

1. Copie o exemplo base:
   - `cp .env.example .env.test`
2. Ajuste no minimo as variaveis abaixo em `.env.test`:

```env
NODE_ENV=test
SESSION_SECRET=fincontrol_test_session_secret
TEST_DATABASE_URL=postgresql://fincontrol_test:fincontrol_test@127.0.0.1:54329/debt_control_test
# Opcional legado:
# DATABASE_URL_TEST=postgresql://fincontrol_test:fincontrol_test@127.0.0.1:54329/debt_control_test
TEST_DB_HOST=127.0.0.1
TEST_DB_PORT=54329
TEST_DB_USER=fincontrol_test
TEST_DB_PASSWORD=fincontrol_test
TEST_DB_NAME=debt_control_test
```

> Importante: nao use credenciais reais ou URL de producao em `.env.test`.

## 2) Subir Postgres de teste (Docker)

```bash
npm run test:db:up
```

Servico criado:
- container: `fincontrol-postgres-test`
- banco: `debt_control_test`
- porta: `54329`

## 3) Rodar testes de seguranca com banco real

```bash
npm run test:security:db
```

O script:
1. carrega `.env.test` (se existir);
2. exige `TEST_DATABASE_URL` ou `DATABASE_URL_TEST`;
3. valida host seguro (localhost/127.0.0.1/::1/postgres-test/postgres);
4. valida nome de banco com `test` (evita uso acidental de producao);
5. reseta `schema public` (somente no banco de teste validado);
6. aplica `npm run db:push` para criar schema base completo;
7. aplica `npm run db:migrate` para compatibilidade historica;
8. valida tabelas essenciais (`users`, `pessoas`, `dividas`, `cartoes`, `compras_cartao`, `parcelas_compra`);
9. executa `npm run test:security`.

## 4) Encerrar banco de teste

```bash
npm run test:db:down
```

## Garantia contra uso acidental de producao

- O helper de testes (`server/tests/test-db-availability.ts`) so considera:
  - `TEST_DATABASE_URL`
  - `DATABASE_URL_TEST`
- O runner `test:security:db` sobrescreve `DATABASE_URL` apenas com a URL de teste.
- Se a URL nao for local/isolada, o script aborta antes de migrar ou testar.
