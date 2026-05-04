import type { Pessoa } from "@shared/schema";
import type { PessoaResumoConsolidado } from "@/hooks/usePessoas";
import { PessoaCard } from "@/components/pessoas/PessoaCard";

type PessoasGridProps = {
  pessoas: Pessoa[];
  mobileMode: boolean;
  getPessoaResumoConsolidado: (pessoaId: string) => PessoaResumoConsolidado;
  getPessoaStats: (pessoaId: string) => { total: number };
  onAddDivida: (pessoa: Pessoa) => void;
  onOpenHistory: (pessoa: Pessoa) => void;
  onEdit: (pessoa: Pessoa) => void;
  onDelete: (pessoa: Pessoa) => void;
};

export function PessoasGrid({
  pessoas,
  mobileMode,
  getPessoaResumoConsolidado,
  getPessoaStats,
  onAddDivida,
  onOpenHistory,
  onEdit,
  onDelete,
}: PessoasGridProps) {
  if (mobileMode) {
    return (
      <div className="space-y-2.5">
        {pessoas.map((pessoa) => (
          <PessoaCard
            key={pessoa.id}
            pessoa={pessoa}
            resumo={getPessoaResumoConsolidado(pessoa.id)}
            totalDividas={getPessoaStats(pessoa.id).total}
            mobileMode
            onAddDivida={onAddDivida}
            onOpenHistory={onOpenHistory}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {pessoas.map((pessoa) => (
        <PessoaCard
          key={pessoa.id}
          pessoa={pessoa}
          resumo={getPessoaResumoConsolidado(pessoa.id)}
          totalDividas={getPessoaStats(pessoa.id).total}
          mobileMode={false}
          onAddDivida={onAddDivida}
          onOpenHistory={onOpenHistory}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
