import type { Divida } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrencyBRL } from "@/utils/formatters";

type PayDividaDialogProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  payingDivida: Divida | null;
  formaPagamento: string;
  onFormaPagamentoChange: (value: string) => void;
  onConfirm: () => void;
  isPending: boolean;
};

export function PayDividaDialog({
  open,
  onOpenChange,
  payingDivida,
  formaPagamento,
  onFormaPagamentoChange,
  onConfirm,
  isPending,
}: PayDividaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar pagamento</DialogTitle>
          <DialogDescription className="sr-only">
            Confirme o pagamento da dívida selecionada e escolha a forma de pagamento utilizada.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {payingDivida && (
            <div className="p-4 rounded-md bg-muted/50">
              <p className="text-sm text-muted-foreground">Valor</p>
              <p className="text-lg font-bold">{formatCurrencyBRL(Number(payingDivida.valor))}</p>
              {payingDivida.descricao && (
                <p className="text-sm text-muted-foreground mt-1">{payingDivida.descricao}</p>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Forma de pagamento</Label>
            <Select value={formaPagamento} onValueChange={onFormaPagamentoChange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="dinheiro">Dinheiro</SelectItem>
                <SelectItem value="cartao">Cartao</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
                <SelectItem value="boleto">Boleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="w-full"
            data-testid="button-confirm-pay-history"
            onClick={onConfirm}
            disabled={isPending}
          >
            {isPending ? "Processando..." : "Confirmar pagamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
