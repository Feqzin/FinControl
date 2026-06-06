type ImportFaturaPreviewItemSummaryProps = {
  descricao: string;
  statusLabel: string;
  statusClassName: string;
  showReviewBadge: boolean;
  showTaxaBadge: boolean;
  showServiceBadge: boolean;
  valorParcelaLabel: string;
  totalLabel: string;
  parcelaLabel: string;
  parcelasRestantesLabel?: string | null;
  dataCompraLabel: string;
  vencimentoLabel?: string | null;
  confidenceLabel?: string | null;
  confidenceClassName?: string;
  showDuplicateForceWarning: boolean;
};

export function ImportFaturaPreviewItemSummary({
  descricao,
  statusLabel,
  statusClassName,
  showReviewBadge,
  showTaxaBadge,
  showServiceBadge,
  valorParcelaLabel,
  totalLabel,
  parcelaLabel,
  parcelasRestantesLabel,
  dataCompraLabel,
  vencimentoLabel,
  confidenceLabel,
  confidenceClassName,
  showDuplicateForceWarning,
}: ImportFaturaPreviewItemSummaryProps) {
  return (
    <>
      <div className="flex items-center gap-1 flex-wrap">
        <p className="font-medium truncate">{descricao}</p>
        <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded ${statusClassName}`}>
          {statusLabel}
        </span>
        {showReviewBadge ? (
          <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-700">
            Revisar
          </span>
        ) : null}
        {showTaxaBadge ? (
          <span className="inline-flex items-center text-xs px-1 py-0.5 rounded bg-blue-500/10 text-blue-600 flex-shrink-0">
            Taxa
          </span>
        ) : null}
        {showServiceBadge ? (
          <span className="inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-700">
            Possível serviço
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
        <span className="font-semibold text-foreground">{valorParcelaLabel}</span>
        <span>{totalLabel}</span>
        <span className="flex items-center gap-0.5">
          {parcelaLabel}
          {parcelasRestantesLabel ? <span className="text-amber-600">{parcelasRestantesLabel}</span> : null}
        </span>
        <span>{dataCompraLabel}</span>
        {vencimentoLabel ? <span className="text-emerald-600">{vencimentoLabel}</span> : null}
        {confidenceLabel ? (
          <span className={confidenceClassName}>
            {confidenceLabel}
          </span>
        ) : null}
        {showDuplicateForceWarning ? (
          <span className="text-orange-700">Marque "Forçar" para importar esta duplicata exata</span>
        ) : null}
      </div>
    </>
  );
}
