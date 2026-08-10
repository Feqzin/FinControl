# DAS do MEI por CNPJ

O módulo de DAS/CNPJ cria uma estimativa para planejamento financeiro e vincula cada competência selecionada a uma dívida pessoal do tipo `pagar`.

## Regra de cálculo

- **Principal:** valor anual do DAS MEI conforme atividade (comércio, serviços ou ambos). O principal pode ser substituído manualmente quando o PGMEI apresentar uma exceção.
- **Vencimento:** dia 20 do mês seguinte à competência, movido para o próximo dia útil bancário. Prorrogações nacionais conhecidas são tratadas; exceções locais podem ser informadas manualmente.
- **Multa:** 0,33% do principal por dia de atraso, limitada a 20%.
- **Juros:** soma simples das taxas Selic mensais desde o mês seguinte ao vencimento até o mês anterior ao pagamento, acrescida de 1% no mês do pagamento.
- **Data futura:** quando a data escolhida precede o vencimento, o sistema mantém o vencimento oficial e não aplica encargos antecipados.

Cada recálculo gera um registro histórico. Competências já marcadas como pagas não são reabertas.

## Fontes oficiais

- Lei nº 9.430/1996, art. 61: https://www.planalto.gov.br/ccivil_03/leis/l9430compilada.htm
- Receita Federal — cálculo dos juros de mora: https://www.gov.br/receitafederal/pt-br/assuntos/orientacao-tributaria/pagamentos-e-parcelamentos/pagamento-em-atraso/como-calcular-juros-de-mora-acrescimos-legais
- Banco Central — série Selic mensal 4390: https://dadosabertos.bcb.gov.br/dataset/4390-taxa-de-juros---selic-acumulada-no-mes
- Portal do Empreendedor — valores do MEI: https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/perguntas-frequentes/pagamento-da-contribuicao-mensal-carne-mensal/qual-o-valor-das-contribuicoes

## Limites e segurança

O valor é uma estimativa. A guia emitida no PGMEI continua sendo a referência oficial para pagamento. O sistema mostra esse aviso na interface e permite ajustar principal e vencimento antes de cadastrar a dívida.
