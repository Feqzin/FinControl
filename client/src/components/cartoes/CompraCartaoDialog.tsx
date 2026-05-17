import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

type PessoaOption = {
  id: string;
  nome: string;
};

type ReembolsoModo = "total" | "metade" | "valor_custom" | "percentual_custom";

type NovaCompraForm = {
  descricao: string;
  valorTotal: string;
  parcelas: string;
  dataCompra: string;
  pessoaId: string;
  reembolsoModo: ReembolsoModo;
  reembolsoValorTotal: string;
  reembolsoPercentual: string;
};

type EditCompraForm = {
  descricao: string;
  valorTotal: string;
  parcelas: string;
  pessoaId: string;
  statusPessoa: string;
  reembolsoModo: ReembolsoModo;
  reembolsoValorTotal: string;
  reembolsoPercentual: string;
};

function parseMoneyLikeValue(rawValue: string): number {
  const normalized = rawValue.replace(/\./g, "").replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function resolveReembolsoPreview(form: {
  valorTotal: string;
  reembolsoModo: ReembolsoModo;
  reembolsoValorTotal: string;
  reembolsoPercentual: string;
}): { valorCompra: number; reembolsoPessoa: number; partePropria: number } {
  const valorCompra = clampNonNegative(parseMoneyLikeValue(form.valorTotal));
  const percentual = clampNonNegative(parseMoneyLikeValue(form.reembolsoPercentual));
  const valorCustom = clampNonNegative(parseMoneyLikeValue(form.reembolsoValorTotal));

  let reembolsoPessoa = valorCompra;
  if (form.reembolsoModo === "metade") {
    reembolsoPessoa = valorCompra / 2;
  } else if (form.reembolsoModo === "valor_custom") {
    reembolsoPessoa = valorCustom;
  } else if (form.reembolsoModo === "percentual_custom") {
    reembolsoPessoa = (valorCompra * percentual) / 100;
  }

  if (reembolsoPessoa > valorCompra) {
    reembolsoPessoa = valorCompra;
  }

  return {
    valorCompra,
    reembolsoPessoa,
    partePropria: Math.max(0, valorCompra - reembolsoPessoa),
  };
}

type ReembolsoPessoaSectionProps = {
  form: {
    valorTotal: string;
    reembolsoModo: ReembolsoModo;
    reembolsoValorTotal: string;
    reembolsoPercentual: string;
  };
  setForm: (next: {
    valorTotal: string;
    reembolsoModo: ReembolsoModo;
    reembolsoValorTotal: string;
    reembolsoPercentual: string;
  }) => void;
  formatCurrency: (value: number) => string;
};

function ReembolsoPessoaSection({ form, setForm, formatCurrency }: ReembolsoPessoaSectionProps) {
  const preview = resolveReembolsoPreview(form);
  const valorCustomInformado = clampNonNegative(parseMoneyLikeValue(form.reembolsoValorTotal));
  const valorCustomExcede = form.reembolsoModo === "valor_custom" && valorCustomInformado > preview.valorCompra;
  const percentualExcede = form.reembolsoModo === "percentual_custom"
    && parseMoneyLikeValue(form.reembolsoPercentual) > 100;

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <div className="space-y-1">
        <Label>Quanto essa pessoa deve pagar?</Label>
        <p className="text-xs text-muted-foreground">
          O valor da compra no cartão continua o mesmo. Este campo controla apenas quanto a pessoa vinculada deve te reembolsar.
        </p>
      </div>

      <Select
        value={form.reembolsoModo}
        onValueChange={(value) => {
          const nextMode = value as ReembolsoModo;
          setForm({
            ...form,
            reembolsoModo: nextMode,
            reembolsoValorTotal: nextMode === "valor_custom" ? form.reembolsoValorTotal : "",
            reembolsoPercentual: nextMode === "percentual_custom" ? form.reembolsoPercentual : "",
          });
        }}
      >
        <SelectTrigger data-testid="select-compra-reembolso-modo">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="total">Valor total da compra</SelectItem>
          <SelectItem value="metade">Metade da compra</SelectItem>
          <SelectItem value="valor_custom">Valor personalizado</SelectItem>
          <SelectItem value="percentual_custom">Porcentagem personalizada</SelectItem>
        </SelectContent>
      </Select>

      {form.reembolsoModo === "valor_custom" ? (
        <div className="space-y-1.5">
          <Label htmlFor="input-reembolso-valor-custom">Valor a cobrar</Label>
          <Input
            id="input-reembolso-valor-custom"
            data-testid="input-reembolso-valor-custom"
            type="number"
            min="0"
            max={preview.valorCompra > 0 ? preview.valorCompra : undefined}
            step="0.01"
            value={form.reembolsoValorTotal}
            onChange={(event) => setForm({ ...form, reembolsoValorTotal: event.target.value })}
          />
          {valorCustomExcede ? (
            <p className="text-xs text-red-600">O valor não pode ultrapassar o total da compra.</p>
          ) : null}
        </div>
      ) : null}

      {form.reembolsoModo === "percentual_custom" ? (
        <div className="space-y-1.5">
          <Label htmlFor="input-reembolso-percentual-custom">Porcentagem</Label>
          <Input
            id="input-reembolso-percentual-custom"
            data-testid="input-reembolso-percentual-custom"
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.reembolsoPercentual}
            onChange={(event) => setForm({ ...form, reembolsoPercentual: event.target.value })}
          />
          {percentualExcede ? (
            <p className="text-xs text-red-600">A porcentagem deve ficar entre 0 e 100.</p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1 rounded bg-background/70 p-2 text-sm">
        <p className="text-muted-foreground">Compra no cartão: <span className="font-semibold text-foreground">{formatCurrency(preview.valorCompra)}</span></p>
        <p className="text-muted-foreground">Pessoa deve reembolsar: <span className="font-semibold text-foreground">{formatCurrency(preview.reembolsoPessoa)}</span></p>
        <p className="text-muted-foreground">Sua parte estimada: <span className="font-semibold text-foreground">{formatCurrency(preview.partePropria)}</span></p>
      </div>
      {(form.reembolsoModo === "valor_custom" || form.reembolsoModo === "percentual_custom") ? (
        <Badge variant="secondary" className="text-xs">Reembolso personalizado</Badge>
      ) : null}
    </div>
  );
}

type NovaCompraCartaoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: NovaCompraForm;
  setForm: (next: NovaCompraForm) => void;
  pessoas: PessoaOption[];
  formatCurrency: (value: number) => string;
  onSubmit: () => void;
  isPending: boolean;
};

export function NovaCompraCartaoDialog({
  open,
  onOpenChange,
  form,
  setForm,
  pessoas,
  formatCurrency,
  onSubmit,
  isPending,
}: NovaCompraCartaoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Compra Parcelada</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              data-testid="input-compra-descricao"
              value={form.descricao}
              onChange={(event) => setForm({ ...form, descricao: event.target.value })}
              placeholder="O que comprou?"
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor total</Label>
              <Input
                data-testid="input-compra-valor"
                type="number"
                step="0.01"
                value={form.valorTotal}
                onChange={(event) => setForm({ ...form, valorTotal: event.target.value })}
                placeholder="0,00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Parcelas</Label>
              <Input
                data-testid="input-compra-parcelas"
                type="number"
                min="1"
                max="48"
                value={form.parcelas}
                onChange={(event) => setForm({ ...form, parcelas: event.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data da compra</Label>
            <Input
              data-testid="input-compra-data"
              type="date"
              value={form.dataCompra}
              onChange={(event) => setForm({ ...form, dataCompra: event.target.value })}
              required
            />
          </div>
          {pessoas.length > 0 ? (
            <div className="space-y-2">
              <Label>Vincular a uma pessoa (opcional)</Label>
              <Select
                value={form.pessoaId || "__none__"}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    pessoaId: value === "__none__" ? "" : value,
                    reembolsoModo: value === "__none__" ? "total" : (form.reembolsoModo || "total"),
                    reembolsoValorTotal: value === "__none__" ? "" : form.reembolsoValorTotal,
                    reembolsoPercentual: value === "__none__" ? "" : form.reembolsoPercentual,
                  })
                }
              >
                <SelectTrigger data-testid="select-compra-pessoa">
                  <SelectValue placeholder="Nenhuma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma (compra própria)</SelectItem>
                  {pessoas.map((pessoa) => (
                    <SelectItem key={pessoa.id} value={pessoa.id}>
                      {pessoa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {form.pessoaId ? (
            <ReembolsoPessoaSection
              form={{
                valorTotal: form.valorTotal,
                reembolsoModo: form.reembolsoModo,
                reembolsoValorTotal: form.reembolsoValorTotal,
                reembolsoPercentual: form.reembolsoPercentual,
              }}
              setForm={(next) =>
                setForm({
                  ...form,
                  reembolsoModo: next.reembolsoModo,
                  reembolsoValorTotal: next.reembolsoValorTotal,
                  reembolsoPercentual: next.reembolsoPercentual,
                })
              }
              formatCurrency={formatCurrency}
            />
          ) : null}
          {form.valorTotal && form.parcelas ? (
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-sm">
                <span className="text-muted-foreground">Parcela: </span>
                <span className="font-semibold">
                  {formatCurrency(parseFloat(form.valorTotal) / parseInt(form.parcelas || "1", 10))}
                </span>
                <span className="text-muted-foreground"> x {form.parcelas}x</span>
              </p>
            </div>
          ) : null}
          <Button type="submit" className="w-full" data-testid="button-save-compra" disabled={isPending}>
            {isPending ? "Salvando..." : "Registrar compra"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type EditarCompraCartaoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: EditCompraForm;
  setForm: (next: EditCompraForm) => void;
  pessoas: PessoaOption[];
  formatCurrency: (value: number) => string;
  onSubmit: () => void;
  isPending: boolean;
};

export function EditarCompraCartaoDialog({
  open,
  onOpenChange,
  form,
  setForm,
  pessoas,
  formatCurrency,
  onSubmit,
  isPending,
}: EditarCompraCartaoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar Compra</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              data-testid="input-edit-compra-descricao"
              value={form.descricao}
              onChange={(event) => setForm({ ...form, descricao: event.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Valor total</Label>
              <Input
                data-testid="input-edit-compra-valor"
                type="number"
                step="0.01"
                value={form.valorTotal}
                onChange={(event) => setForm({ ...form, valorTotal: event.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Número de parcelas</Label>
              <Input
                data-testid="input-edit-compra-parcelas"
                type="number"
                min="1"
                max="48"
                value={form.parcelas}
                onChange={(event) => setForm({ ...form, parcelas: event.target.value })}
                required
              />
            </div>
          </div>
          {form.valorTotal && form.parcelas ? (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <span className="text-muted-foreground">Nova parcela: </span>
              <span className="font-semibold">
                {formatCurrency(parseFloat(form.valorTotal) / parseInt(form.parcelas || "1", 10))}
              </span>
              <span className="text-muted-foreground"> x {form.parcelas}x</span>
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Pessoa vinculada (opcional)</Label>
            <Select
              value={form.pessoaId || "__none__"}
              onValueChange={(value) =>
                setForm({
                  ...form,
                  pessoaId: value === "__none__" ? "" : value,
                  statusPessoa: value === "__none__" ? "" : form.statusPessoa || "pendente",
                  reembolsoModo: value === "__none__" ? "total" : (form.reembolsoModo || "total"),
                  reembolsoValorTotal: value === "__none__" ? "" : form.reembolsoValorTotal,
                  reembolsoPercentual: value === "__none__" ? "" : form.reembolsoPercentual,
                })
              }
            >
              <SelectTrigger data-testid="select-edit-compra-pessoa">
                <SelectValue placeholder="Nenhuma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma (compra própria)</SelectItem>
                {pessoas.map((pessoa) => (
                  <SelectItem key={pessoa.id} value={pessoa.id}>
                    {pessoa.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.pessoaId ? (
            <ReembolsoPessoaSection
              form={{
                valorTotal: form.valorTotal,
                reembolsoModo: form.reembolsoModo,
                reembolsoValorTotal: form.reembolsoValorTotal,
                reembolsoPercentual: form.reembolsoPercentual,
              }}
              setForm={(next) =>
                setForm({
                  ...form,
                  reembolsoModo: next.reembolsoModo,
                  reembolsoValorTotal: next.reembolsoValorTotal,
                  reembolsoPercentual: next.reembolsoPercentual,
                })
              }
              formatCurrency={formatCurrency}
            />
          ) : null}
          {form.pessoaId ? (
            <div className="space-y-2">
              <Label>Status do reembolso</Label>
              <Select value={form.statusPessoa || "pendente"} onValueChange={(value) => setForm({ ...form, statusPessoa: value })}>
                <SelectTrigger data-testid="select-edit-compra-status-pessoa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Aguardando reembolso</SelectItem>
                  <SelectItem value="pago">Reembolsado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <Button type="submit" className="w-full" data-testid="button-save-edit-compra" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar alterações"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
