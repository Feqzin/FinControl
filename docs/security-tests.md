# Security Tests (DB local)

Este guia sobe um Postgres local isolado para rodar testes de seguranca (incluindo IDOR) sem `skip`.

## 1) Preparar ambiente de teste

1. Copie o exemplo:
   - `cp .env.test.example .env.test`
2. Revise os valores de `.env.test` (porta padrao `54329`).

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
