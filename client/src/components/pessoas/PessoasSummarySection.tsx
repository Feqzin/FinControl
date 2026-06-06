import { Button } from "@/components/ui/button";

type PessoasSummarySectionProps = {
  hasMorePessoas: boolean;
  onLoadMore: () => void;
};

export function PessoasSummarySection({
  hasMorePessoas,
  onLoadMore,
}: PessoasSummarySectionProps) {
  if (!hasMorePessoas) {
    return null;
  }

  return (
    <div className="flex justify-center pt-2">
      <Button
        variant="outline"
        className="h-10 rounded-2xl border-border/70 bg-background/95 px-4 shadow-sm"
        onClick={onLoadMore}
        data-testid="button-load-more-pessoas"
      >
        Carregar mais pessoas
      </Button>
    </div>
  );
}
