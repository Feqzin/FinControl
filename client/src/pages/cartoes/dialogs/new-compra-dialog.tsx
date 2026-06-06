import type { Dispatch, SetStateAction } from "react";
import { NovaCompraCartaoDialog } from "@/components/cartoes/CompraCartaoDialog";

type NovaCompraFormState = {
  descricao: string;
  valorTotal: string;
  parcelas: string;
  dataCompra: string;
  pessoaId: string;
  reembolsoModo: "total" | "metade" | "valor_custom" | "percentual_custom";
  reembolsoValorTotal: string;
  reembolsoPercentual: string;
};

type PessoaOption = {
  id: string;
  nome: string;
};

type NewCompraDialogProps = {
  openCompra: boolean;
  setOpenCompra: Dispatch<SetStateAction<boolean>>;
  compraForm: NovaCompraFormState;
  setCompraForm: Dispatch<SetStateAction<NovaCompraFormState>>;
  pessoas: PessoaOption[];
  formatCurrency: (value: number) => string;
  onCreateCompra: () => void;
  createCompraPending: boolean;
};

export function NewCompraDialog({
  openCompra,
  setOpenCompra,
  compraForm,
  setCompraForm,
  pessoas,
  formatCurrency,
  onCreateCompra,
  createCompraPending,
}: NewCompraDialogProps) {
  return (
    <NovaCompraCartaoDialog
      open={openCompra}
      onOpenChange={setOpenCompra}
      form={compraForm}
      setForm={setCompraForm}
      pessoas={pessoas}
      formatCurrency={formatCurrency}
      onSubmit={onCreateCompra}
      isPending={createCompraPending}
    />
  );
}
