import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type PessoaOption = {
  id: string;
  nome: string;
};

type NovaCompraForm = {
  descricao: string;
  valorTotal: string;
  parcelas: string;
  dataCompra: string;
  pessoaId: string;
};

type EditCompraForm = {
  descricao: string;
  valorTotal: string;
  parcelas: string;
  pessoaId: string;
  statusPessoa: string;
};

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
                onValueChange={(value) => setForm({ ...form, pessoaId: value === "__none__" ? "" : value })}
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

