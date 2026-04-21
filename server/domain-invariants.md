# Invariantes do Dominio Financeiro

## 1) Dividas x Parcelas

- Quando uma `divida` possui `parcelas`, a fonte da verdade operacional e o conjunto de parcelas.
- O estado do pai deve ser derivado dos filhos apos qualquer mutacao relevante.
- Campos agregados da `divida` devem refletir o cronograma atual:
  - `totalParcelas` = quantidade de parcelas existentes.
  - `valorTotal` = soma dos valores das parcelas.
  - `valor` = valor de referencia da proxima parcela pendente (ou primeira, se todas quitadas).
  - `dataVencimento` = proximo vencimento pendente (ou ultimo vencimento conhecido).
  - `status` persistido (retrocompativel) = `pago` quando todas parcelas estao pagas; caso contrario `pendente`.
- `dataPagamento` e `formaPagamento` da `divida` so ficam preenchidos quando todas parcelas estao quitadas.

## 2) Compras Cartao x Parcelas Compra

- Quando uma `compra_cartao` possui `parcelas_compra`, a fonte da verdade operacional e o conjunto de parcelas de compra.
- Campos agregados da compra pai devem refletir os filhos:
  - `parcelas` = quantidade de parcelas de compra.
  - `valorTotal` = soma dos valores das parcelas de compra.
  - `valorParcela` = valor da proxima parcela pendente (ou primeira/ultima referencia valida).
  - `parcelaAtual` = numero da proxima parcela pendente; se todas quitadas, ultima parcela.
- `statusPessoa` no pai e derivado de `statusPessoa` dos filhos com mapeamento retrocompativel:
  - `pago` quando todos estao pagos.
  - `cancelado` quando todos estao cancelados.
  - nos demais casos, `pendente`.

## 3) Padrao de Status

- Dominio canonico interno: `pendente`, `parcial`, `pago`, `vencido`, `cancelado`.
- Persistencia atual (retrocompativel):
  - `dividas.status`: mantido em `pendente`/`pago` para nao quebrar telas existentes.
  - estados canonicos (`parcial`/`vencido`) sao derivados em regra de dominio, sem forcar contrato legado.

## 4) Regras de Sincronizacao

- Toda mutacao em filha que impacte pagamento, valor, vencimento ou exclusao deve acionar recomputacao do pai.
- Mutacoes em pai com filhos existentes devem ser reconciliadas para evitar inconsistencias.
- Recomputacao deve ser centralizada e reutilizada; nao duplicar regra em controllers.

## 5) Mapa de Mutacoes Criticas e Recomputacao

- `ParcelasService.update`:
  - altera status, valor pago, data de pagamento e forma de pagamento da parcela.
  - obrigatorio: `recomputeDebtAggregate(...)`.
- `ParcelasService.antecipar`:
  - marca parcelas pendentes como pagas em lote.
  - obrigatorio: `recomputeDebtAggregate(...)`.
- `ParcelasService.delete`:
  - exclusao de parcela da divida.
  - obrigatorio: `recomputeDebtAggregate(...)`.
- `DividasService.createParcelado`:
  - cria pai e filhas.
  - obrigatorio: `recomputeDebtAggregate(...)` apos criar parcelas.
- `DividasService.recalcular`:
  - exclui parcelas pendentes, recria cronograma e ajusta agregado.
  - obrigatorio: `recomputeDebtAggregate(...)`.
- `DividasService.update`:
  - edicao da divida pai com possivel conflito com cronograma.
  - obrigatorio: reconciliar via `recomputeDebtAggregate(...)`.
- `ParcelasService.updateParcelaCompra`:
  - altera status, data de pagamento e valor de parcela de compra.
  - obrigatorio: `recomputeCardPurchaseAggregate(...)`.
- `ParcelasService.replaceParcelasCompraBulk`:
  - exclusao/recriacao em lote do cronograma de compra.
  - obrigatorio: `recomputeCardPurchaseAggregate(...)`.
- `ComprasCartaoService.create`:
  - cria compra pai e materializa `parcelas_compra`.
  - obrigatorio: `recomputeCardPurchaseAggregate(...)`.
- `ComprasCartaoService.update`:
  - edicao da compra pai.
  - obrigatorio: materializar cronograma ausente (legado) e depois `recomputeCardPurchaseAggregate(...)`.

## 6) Timeline de Pagamentos (Pessoa)

- A timeline exibe eventos financeiros reais do historico:
  - `pagamento_realizado`: quando o registro esta pago e possui `dataPagamento`.
  - `pagamento_vencido`: quando o registro esta em aberto e `dataVencimento` e anterior a data atual.
  - `pagamento_pendente`: quando o registro esta em aberto e ainda nao venceu.
- Regra de fonte da verdade:
  - `divida` com parcelas: timeline deriva dos filhos (`parcelas`) para evitar duplicidade.
  - `divida` sem parcelas: timeline deriva do registro pai (`dividas`).
- Regra para parcela vencida posteriormente quitada:
  - a timeline reflete o estado atual do dominio (evento passa a `pagamento_realizado`).
  - nao existe dupla trilha (vencido + pago) enquanto nao houver historico de transicoes persistido.
