# Problemas conhecidos

Atualizado em: 2026-07-30

## Resumo

| ID | Prioridade | Status | Área | Problema |
| --- | --- | --- | --- | --- |
| DC-001 | P1 | Corrigido localmente | Cartões / pagamento de fatura | Pagamento do saldo restante era oferecido para um valor composto apenas por serviços projetados. |
| DC-002 | P2 | Mapeado | API / rotas | A verificação de paridade aponta divergências entre `server` e `serverless`. |

## DC-001 — Saldo restante rejeitado como fatura quitada

### Evidência observada

- Cartão: Nubank Mastercard.
- Competência: julho de 2026.
- Status exibido: `Vencida parcialmente paga`.
- Valor original: `R$ 1.194,67`.
- Valor já pago: `R$ 1.110,70`.
- Saldo restante exibido: `R$ 83,97`.
- Ação: `Pagar saldo restante`, com valor `83,97`.
- Resultado: `Erro ao registrar pagamento — Esta fatura já está quitada.`

### Causa confirmada

O snapshot geral da fatura inclui serviços projetados no cartão, enquanto o endpoint de pagamento aceita e aloca somente parcelas reais de compras. Depois que as parcelas somando `R$ 1.110,70` eram quitadas, a tela ainda oferecia os `R$ 83,97` projetados como saldo pagável. Para o backend, entretanto, a parte alocável da fatura já estava quitada.

### Correção aplicada

- O campo `Fatura atual` mostra somente o saldo pagável de compras e parcelas.
- Serviços projetados continuam compondo a previsão financeira e o limite comprometido, mas aparecem em um aviso separado.
- O diálogo e a ação de pagamento agora usam um snapshot formado somente pelas parcelas aceitas pelo backend.
- Quando existem serviços projetados, o diálogo informa o valor e orienta o registro pela área de Serviços.
- A mesma regra foi aplicada nas telas de Cartões e Dashboard.

### Cobertura de regressão

O teste reproduz os valores observados: fatura geral de `R$ 1.194,67`, parcelas pagas de `R$ 1.110,70` e serviço projetado de `R$ 83,97`. Ele valida que o total geral preserva a projeção, mas o saldo do diálogo de pagamento fica zerado e alinhado ao backend.

### Validação local

- O fluxo completo foi reproduzido no PostgreSQL de teste e validado visualmente nas telas de Cartões, Dashboard e Serviços.
- O pagamento das parcelas reais foi aceito sem o erro `Esta fatura já está quitada`.
- Após a quitação, a tela de Cartões mostra `Fatura atual R$ 0,00` e `Serviços previstos: R$ 83,97` separadamente.
- Após a quitação, o Dashboard oferece `Ver pagamentos`; quando há somente serviços projetados, oferece `Ver serviços`.
- Os testes unitários do frontend, a tipagem, o build de produção, a verificação de codificação e o `git diff --check` foram concluídos com sucesso.

## DC-002 — Divergência entre rotas server e serverless

O comando `npm run check:routes-parity` termina com sucesso, mas lista rotas presentes apenas no runtime serverless. Avaliar as divergências gradualmente, priorizando rotas financeiras e de autenticação.
