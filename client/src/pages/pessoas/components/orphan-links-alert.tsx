import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

type OrphanLinksAlertProps = {
  onReview: () => void;
};

export function OrphanLinksAlert({ onReview }: OrphanLinksAlertProps) {
  return (
    <div className="rounded-xl border border-amber-300/80 bg-amber-50/70 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Encontramos vínculos sem pessoa cadastrada.
            Revise para restaurar os relacionamentos das dívidas e vínculos antigos.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="border-amber-400/70 bg-white/80 text-amber-900 hover:bg-white dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-100"
          onClick={onReview}
          data-testid="button-review-orphan-links"
        >
          Revisar vínculos
        </Button>
      </div>
    </div>
  );
}
