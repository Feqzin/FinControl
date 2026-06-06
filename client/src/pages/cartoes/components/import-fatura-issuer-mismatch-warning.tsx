type ImportFaturaIssuerMismatchWarningProps = {
  warning?: string;
  requiresAcknowledgement?: boolean;
  acknowledged?: boolean;
  onAcknowledgedChange?: (value: boolean) => void;
};

export function ImportFaturaIssuerMismatchWarning({
  warning,
  requiresAcknowledgement = false,
  acknowledged = false,
  onAcknowledgedChange,
}: ImportFaturaIssuerMismatchWarningProps) {
  if (!warning) {
    return null;
  }

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
      <p>{warning}</p>
      {requiresAcknowledgement ? (
        <label className="mt-1 inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="h-3.5 w-3.5"
            checked={acknowledged}
            onChange={(event) => onAcknowledgedChange?.(event.target.checked)}
          />
          <span>Estou ciente e quero importar neste cartão mesmo assim.</span>
        </label>
      ) : null}
    </div>
  );
}
