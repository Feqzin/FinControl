type ImportFaturaPreviewItemReconcileInfoProps = {
  title: string;
  showRecognizedBadge: boolean;
  recognizedBadgeLabel: string;
  firstInfoPrefix: string;
  firstInfoValue: string;
  secondInfoPrefix: string;
  secondInfoValue: string;
  thirdInfoText: string;
  recommendationText: string;
  keepExistingNameText: string;
  keepAliasNameText: string;
};

export function ImportFaturaPreviewItemReconcileInfo({
  title,
  showRecognizedBadge,
  recognizedBadgeLabel,
  firstInfoPrefix,
  firstInfoValue,
  secondInfoPrefix,
  secondInfoValue,
  thirdInfoText,
  recommendationText,
  keepExistingNameText,
  keepAliasNameText,
}: ImportFaturaPreviewItemReconcileInfoProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-medium text-sky-800">{title}</p>
        {showRecognizedBadge ? (
          <span className="inline-flex items-center rounded bg-sky-200 px-2 py-0.5 text-[11px] font-medium text-sky-900">
            {recognizedBadgeLabel}
          </span>
        ) : null}
      </div>

      <div className="rounded border border-sky-300 bg-sky-100/70 px-2 py-1">
        <p className="text-[11px] text-sky-900">
          {firstInfoPrefix} <strong>{firstInfoValue}</strong>
        </p>
        <p className="text-[11px] text-sky-900">
          {secondInfoPrefix} <strong>{secondInfoValue}</strong>
        </p>
        <p className="text-[11px] text-sky-900">{thirdInfoText}</p>
      </div>

      <p className="text-xs text-sky-900">{recommendationText}</p>
      <p className="text-[11px] text-sky-700">
        O nome <strong>{keepExistingNameText}</strong> será mantido por padrão.{" "}
        <strong>{keepAliasNameText}</strong> ficará salvo apenas como apelido para próximas
        faturas.
      </p>
    </>
  );
}
