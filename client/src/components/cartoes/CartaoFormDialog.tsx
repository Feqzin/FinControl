import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CartaoFormState = {
  nome: string;
  limite: string;
  melhorDiaCompra: string;
  diaVencimento: string;
};

type CartaoFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  form: CartaoFormState;
  setForm: (next: CartaoFormState) => void;
  iconPicker?: ReactNode;
  onSubmit: () => void;
  isPending: boolean;
  pendingLabel: string;
  submitLabel: string;
  testIds: {
    nome: string;
    limite: string;
    melhorDiaCompra: string;
    diaVencimento: string;
    submit: string;
  };
};

export function CartaoFormDialog({
  open,
  onOpenChange,
  title,
  form,
  setForm,
  iconPicker,
  onSubmit,
  isPending,
  pendingLabel,
  submitLabel,
  testIds,
}: CartaoFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="space-y-4"
        >
          {iconPicker ? (
            <div className="space-y-2">
              <Label>Ícone</Label>
              {iconPicker}
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>Nome do cartão</Label>
            <Input
              data-testid={testIds.nome}
              value={form.nome}
              onChange={(event) => setForm({ ...form, nome: event.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Limite total</Label>
            <Input
              data-testid={testIds.limite}
              type="number"
              step="0.01"
              value={form.limite}
              onChange={(event) => setForm({ ...form, limite: event.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Melhor dia de compra</Label>
              <Input
                data-testid={testIds.melhorDiaCompra}
                type="number"
                min="1"
                max="31"
                value={form.melhorDiaCompra}
                onChange={(event) => setForm({ ...form, melhorDiaCompra: event.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Dia de vencimento</Label>
              <Input
                data-testid={testIds.diaVencimento}
                type="number"
                min="1"
                max="31"
                value={form.diaVencimento}
                onChange={(event) => setForm({ ...form, diaVencimento: event.target.value })}
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full touch-feedback" data-testid={testIds.submit} disabled={isPending}>
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

