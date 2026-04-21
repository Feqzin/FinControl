# Padrao Minimo de Arquitetura (Backend)

Este documento define o padrao incremental adotado para manter compatibilidade enquanto o backend e reorganizado.

## Camadas

1. `routes`
2. `validators`
3. `controllers`
4. `services`
5. `repositories/storage`

## Responsabilidade por camada

### `routes`
- Declarar endpoint e middleware de autenticacao.
- Encaminhar para handler de controller.
- Nao conter regra de negocio.

### `validators`
- Concentrar validacao/sanitizacao de payload e query.
- Reutilizar schemas entre endpoints do mesmo dominio.
- Evitar validacao inline em `routes.ts`.

### `controllers`
- Extrair `userId`/params.
- Validar entrada com schema.
- Chamar service e traduzir retorno para HTTP.
- Acionar auditoria de negocio.

### `services`
- Orquestrar fluxo de negocio.
- Definir pontos transacionais.
- Reutilizar funcoes de dominio compartilhadas.

### `repositories/storage`
- Isolar acesso a dados.
- Evitar SQL/acesso direto no controller.
- Permitir uso transacional com repositório de contexto.

## Modulos padronizados nesta fase

- Dividas
- Parcelas
- Cartoes
- Compras de cartao
- Financial summary/score/insights
- Pessoas
- Servicos
- Servico-pessoas
- Servico-pagamentos
- Metas
- Rendas
- Patrimonios

Todos os endpoints desses modulos seguem o fluxo:

`route -> validator -> controller -> service -> repository/storage`

## Diretrizes para proximas fases

1. Extrair o endpoint legado `/api/importar-texto` para `controller/service` mantendo compatibilidade.
2. Substituir `req.user as any` por tipo de usuario autenticado.
3. Consolidar respostas de erro por dominio (400/404/409) com helpers comuns.
4. Padronizar testes de controller para os modulos nao financeiros.
