import type { ReactNode } from "react";

type ImportFaturaPreviewItemServiceInfoProps = {
  children: ReactNode;
  serviceInfoLabel: string;
  serviceConfidenceLabel: string;
  sharedServiceNotice?: string | null;
  createSuggestionName?: string | null;
  createSuggestionDetailsLabel?: string | null;
  serviceSuggestionWarning?: string | null;
  selectLinkedServiceWarning?: string | null;
};

export function ImportFaturaPreviewItemServiceInfo({
  children,
  serviceInfoLabel,
  serviceConfidenceLabel,
  sharedServiceNotice,
  createSuggestionName,
  createSuggestionDetailsLabel,
  serviceSuggestionWarning,
  selectLinkedServiceWarning,
}: ImportFaturaPreviewItemServiceInfoProps) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-indigo-800">{serviceInfoLabel}</p>
        <span className="text-[11px] text-indigo-700">{serviceConfidenceLabel}</span>
      </div>

      {children}

      {sharedServiceNotice ? (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-2 py-2">
          <p className="text-xs text-blue-800">{sharedServiceNotice}</p>
        </div>
      ) : null}

      {createSuggestionName && createSuggestionDetailsLabel ? (
        <p className="text-xs text-indigo-900">
          Sugestão: criar serviço <strong>{createSuggestionName}</strong>{" "}
          {createSuggestionDetailsLabel}
        </p>
      ) : null}

      {serviceSuggestionWarning ? (
        <p className="text-xs text-amber-700">{serviceSuggestionWarning}</p>
      ) : null}

      {selectLinkedServiceWarning ? (
        <p className="text-xs text-amber-700">{selectLinkedServiceWarning}</p>
      ) : null}
    </>
  );
}
