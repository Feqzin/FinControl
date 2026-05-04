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
    <div className="flex justify-center">
      <Button
        variant="outline"
        onClick={onLoadMore}
        data-testid="button-load-more-pessoas"
      >
        Carregar mais pessoas
      </Button>
    </div>
  );
}
