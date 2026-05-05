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
    <div className="flex justify-center pt-1">
      <Button
        variant="outline"
        className="h-9 rounded-xl px-4"
        onClick={onLoadMore}
        data-testid="button-load-more-pessoas"
      >
        Carregar mais pessoas
      </Button>
    </div>
  );
}
