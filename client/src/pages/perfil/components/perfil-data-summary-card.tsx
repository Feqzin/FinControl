import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Database } from "lucide-react";

type PerfilDataSummaryCardProps = {
  isVisible: boolean;
  pessoasCount: number;
  dividasCount: number;
  cartoesCount: number;
  servicosCount: number;
  metasCount: number;
  comprasCount: number;
  movimentacoesSaldoCount: number;
  totalReceberFormatted: string;
  totalPagarFormatted: string;
};

export function PerfilDataSummaryCard({
  isVisible,
  pessoasCount,
  dividasCount,
  cartoesCount,
  servicosCount,
  metasCount,
  comprasCount,
  movimentacoesSaldoCount,
  totalReceberFormatted,
  totalPagarFormatted,
}: PerfilDataSummaryCardProps) {
  return (
    <Card className={isVisible ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Database className="w-4 h-4" /> Resumo dos dados
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Pessoas", value: pessoasCount },
            { label: "Dividas", value: dividasCount },
            { label: "Cartoes", value: cartoesCount },
            { label: "Servicos", value: servicosCount },
            { label: "Metas", value: metasCount },
            { label: "Compras", value: comprasCount },
            { label: "Mov. saldo", value: movimentacoesSaldoCount },
          ].map(({ label, value }) => (
            <div key={label} className="fintech-stat-card text-center">
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="fintech-surface-subtle border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="text-xs text-muted-foreground">A receber</p>
            <p className="font-bold text-emerald-600">{totalReceberFormatted}</p>
          </div>
          <div className="fintech-surface-subtle border-red-500/20 bg-red-500/5 p-3">
            <p className="text-xs text-muted-foreground">A pagar</p>
            <p className="font-bold text-red-600">{totalPagarFormatted}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
