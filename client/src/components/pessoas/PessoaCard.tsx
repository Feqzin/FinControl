import type { Pessoa } from "@shared/schema";
import type { PessoaResumoConsolidado } from "@/hooks/usePessoas";
import { formatCurrencyBRL } from "@/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  Clock,
  Pencil,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";

type PessoaCardProps = {
  pessoa: Pessoa;
  resumo: PessoaResumoConsolidado;
  totalDividas: number;
  mobileMode: boolean;
  onAddDivida: (pessoa: Pessoa) => void;
  onOpenHistory: (pessoa: Pessoa) => void;
  onEdit: (pessoa: Pessoa) => void;
  onDelete: (pessoa: Pessoa) => void;
};

export function PessoaCard({
  pessoa,
  resumo,
  totalDividas,
  mobileMode,
  onAddDivida,
  onOpenHistory,
  onEdit,
  onDelete,
}: PessoaCardProps) {
  const isMeDeve = pessoa.tipo === "me_deve";
  const hasAtraso = resumo.alertas.comprasAtrasadas > 0 || resumo.dividas.comigo.vencidas > 0;
  const parcelasVencidasPessoa = resumo.alertas.parcelasVencidasPessoa ?? resumo.alertas.comprasAtrasadas;
  const dividasPendentesValor = (resumo.dividas.comigo.pendente ?? 0) + (resumo.dividas.euDevo.pendente ?? 0);
  const comprasPendentesValor = resumo.comprasVinculadas.pendentePessoa ?? 0;
  const servicosPendentesValor = resumo.servicosMesAtual.pendente ?? 0;
  const comprasVinculadas = resumo.comprasVinculadas.comprasComParcelasReais + resumo.comprasVinculadas.comprasEmFallbackLegado;

  if (mobileMode) {
    return (
      <div
        className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-all active:scale-[0.998]"
        data-testid={`card-pessoa-${pessoa.id}`}
      >
        <div className="space-y-2.5 px-3.5 py-3.5">
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10">
                <span className="text-sm font-semibold">
                  {pessoa.nome.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[17px] font-semibold leading-tight">{pessoa.nome}</p>
                {pessoa.telefone && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{pessoa.telefone}</p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <Badge variant={isMeDeve ? "default" : "destructive"} className="h-5 rounded-full px-2 py-0 text-[10px] font-medium shadow-sm">
                {isMeDeve ? "Me deve" : "Eu devo"}
              </Badge>
              <p className="text-[clamp(18px,5vw,22px)] font-semibold leading-[1.1] tracking-[-0.2px]">
                {formatCurrencyBRL(resumo.consolidadoPendente)}
              </p>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Dívidas {formatCurrencyBRL(dividasPendentesValor)} • Compras {formatCurrencyBRL(comprasPendentesValor)} • Serviços {formatCurrencyBRL(servicosPendentesValor)}
          </p>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-400">
              Saldo + {formatCurrencyBRL(resumo.saldoPessoa.saldoAtual)}
            </span>
            <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
              {totalDividas} dívida(s)
            </span>
          </div>

          {hasAtraso && (
            <div className="rounded-md border border-red-200/70 bg-red-50/70 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-red-500" />
                <span className="truncate">Pendência encontrada</span>
              </div>
            </div>
          )}

          <div className="h-px bg-border/60" />

          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-primary transition-colors hover:bg-muted/50"
              onClick={() => onOpenHistory(pessoa)}
              data-testid={`button-history-pessoa-${pessoa.id}`}
            >
              <Eye className="h-3.5 w-3.5" /> Ver detalhes
            </button>
            <button
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-border/60 bg-background px-3 text-xs font-medium text-primary transition-colors hover:bg-muted/50"
              onClick={() => onAddDivida(pessoa)}
              data-testid={`button-add-divida-pessoa-${pessoa.id}`}
            >
              <Plus className="h-3.5 w-3.5" /> Nova dívida
            </button>
            <div className="ml-auto flex items-center gap-1">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50"
                onClick={() => onEdit(pessoa)}
                data-testid={`button-edit-pessoa-${pessoa.id}`}
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
                onClick={() => onDelete(pessoa)}
                data-testid={`button-delete-pessoa-${pessoa.id}`}
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
      data-testid={`card-pessoa-${pessoa.id}`}
    >
      <CardContent className="flex h-full min-h-[210px] flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary ring-1 ring-primary/10">
              <span className="text-sm font-semibold">
                {pessoa.nome.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold leading-tight">{pessoa.nome}</p>
              {pessoa.telefone && (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{pessoa.telefone}</p>
              )}
            </div>
          </div>
          <div className="flex min-w-[132px] flex-col items-end justify-center gap-1.5 text-right">
            <Badge variant={isMeDeve ? "default" : "destructive"} className="h-6 px-2.5 text-[11px] shadow-sm">
              {isMeDeve ? "Me deve" : "Eu devo"}
            </Badge>
            <p className="text-[clamp(20px,2vw,24px)] font-semibold leading-[1.1] tracking-[-0.2px]">
              {formatCurrencyBRL(resumo.consolidadoPendente)}
            </p>
          </div>
        </div>

        <p className="text-[13px] text-muted-foreground">
          Dívidas {formatCurrencyBRL(dividasPendentesValor)} • Compras {formatCurrencyBRL(comprasPendentesValor)} • Serviços {formatCurrencyBRL(servicosPendentesValor)}
        </p>

        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700 dark:text-emerald-400">
            Saldo + {formatCurrencyBRL(resumo.saldoPessoa.saldoAtual)}
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
            {totalDividas} dívida(s)
          </span>
          {comprasVinculadas > 0 && (
            <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">
              Compras vinculadas {comprasVinculadas}
            </span>
          )}
        </div>

        {hasAtraso && (
          <div className="flex items-center gap-2 rounded-xl border border-red-300/40 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="truncate">
              {resumo.alertas.comprasAtrasadas} compra(s) atrasada(s) • {parcelasVencidasPessoa} parcela(s) vencida(s)
            </span>
          </div>
        )}

        <Separator className="opacity-70" />

        <div className="mt-auto grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full rounded-lg text-xs font-medium sm:min-w-[130px] sm:flex-1"
            onClick={() => onOpenHistory(pessoa)}
            data-testid={`button-history-pessoa-${pessoa.id}`}
          >
            <Eye className="mr-1 h-3.5 w-3.5" /> Ver detalhes
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full rounded-lg text-xs font-medium sm:min-w-[130px] sm:flex-1"
            onClick={() => onAddDivida(pessoa)}
            data-testid={`button-add-divida-pessoa-${pessoa.id}`}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Nova dívida
          </Button>
          <button
            className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 sm:min-w-[110px] sm:flex-1 sm:justify-start"
            onClick={() => onOpenHistory(pessoa)}
            data-testid={`button-history-secondary-pessoa-${pessoa.id}`}
          >
            <Clock className="h-3.5 w-3.5" /> Histórico
          </button>
          <div className="col-span-2 ml-auto flex items-center justify-end gap-1 sm:col-span-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => onEdit(pessoa)}
              data-testid={`button-edit-pessoa-${pessoa.id}`}
              title="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-red-500 hover:text-red-600"
              onClick={() => onDelete(pessoa)}
              data-testid={`button-delete-pessoa-${pessoa.id}`}
              title="Excluir"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
