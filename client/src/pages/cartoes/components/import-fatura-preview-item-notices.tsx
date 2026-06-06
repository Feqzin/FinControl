type ImportFaturaPreviewItemNoticesProps = {
  validationIssues?: string[];
  duplicateNotice?: string | null;
  showAliasesLoadingNotice: boolean;
};

export function ImportFaturaPreviewItemNotices({
  validationIssues,
  duplicateNotice,
  showAliasesLoadingNotice,
}: ImportFaturaPreviewItemNoticesProps) {
  return (
    <>
      {validationIssues && validationIssues.length > 0 ? (
        <p className="text-xs text-red-600 mt-0.5">
          {validationIssues.join(" · ")}
        </p>
      ) : null}
      {duplicateNotice ? (
        <p className="text-xs text-amber-600 mt-0.5">
          {duplicateNotice}
        </p>
      ) : null}
      {showAliasesLoadingNotice ? (
        <p className="text-[11px] text-sky-700">
          Carregando equivalências salvas...
        </p>
      ) : null}
    </>
  );
}
