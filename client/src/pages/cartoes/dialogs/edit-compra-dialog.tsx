import { lazy, Suspense } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { CompraCartao } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { EditarCompraCartaoDialog } from "@/components/cartoes/CompraCartaoDialog";
import type { IconPickerSelectMeta } from "@/components/icon-picker";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

type EditCompraFormState = {
  descricao: string;
  valorTotal: string;
  parcelas: string;
  pessoaId: string;
  statusPessoa: string;
  reembolsoModo: "total" | "metade" | "valor_custom" | "percentual_custom";
  reembolsoValorTotal: string;
  reembolsoPercentual: string;
};

type PessoaOption = {
  id: string;
  nome: string;
};

type EditCompraDialogProps = {
  editingCompra: CompraCartao | null;
  setEditingCompra: Dispatch<SetStateAction<CompraCartao | null>>;
  editCompraForm: EditCompraFormState;
  setEditCompraForm: Dispatch<SetStateAction<EditCompraFormState>>;
  pessoas: PessoaOption[];
  formatCurrency: (value: number) => string;
  editCompraIconPreviewId: string | null;
  editCompraIconPreviewLabel: string;
  editCompraIconPreviewHint: string;
  applyEditCompraIconRule: boolean;
  setApplyEditCompraIconRule: Dispatch<SetStateAction<boolean>>;
  setEditCompraIconDirty: Dispatch<SetStateAction<boolean>>;
  setEditCompraIcone: Dispatch<SetStateAction<string | null>>;
  setEditCompraIconPersistableId: Dispatch<SetStateAction<string | null | undefined>>;
  setEditCompraSelectedIcon: Dispatch<SetStateAction<IconPickerSelectMeta | null>>;
  onUpdateCompra: () => void;
  updateCompraPending: boolean;
};

export function EditCompraDialog({
  editingCompra,
  setEditingCompra,
  editCompraForm,
  setEditCompraForm,
  pessoas,
  formatCurrency,
  editCompraIconPreviewId,
  editCompraIconPreviewLabel,
  editCompraIconPreviewHint,
  applyEditCompraIconRule,
  setApplyEditCompraIconRule,
  setEditCompraIconDirty,
  setEditCompraIcone,
  setEditCompraIconPersistableId,
  setEditCompraSelectedIcon,
  onUpdateCompra,
  updateCompraPending,
}: EditCompraDialogProps) {
  return (
    <EditarCompraCartaoDialog
      open={!!editingCompra}
      onOpenChange={(open) => {
        if (!open) {
          setEditingCompra(null);
          setEditCompraIcone(null);
          setEditCompraIconDirty(false);
          setEditCompraIconPersistableId(undefined);
          setEditCompraSelectedIcon(null);
          setApplyEditCompraIconRule(false);
        }
      }}
      form={editCompraForm}
      setForm={setEditCompraForm}
      pessoas={pessoas}
      formatCurrency={formatCurrency}
      iconPreviewId={editCompraIconPreviewId}
      iconPreviewLabel={editCompraIconPreviewLabel}
      iconPreviewHint={editCompraIconPreviewHint}
      applyIconToSimilarPurchases={applyEditCompraIconRule}
      onApplyIconToSimilarPurchasesChange={setApplyEditCompraIconRule}
      iconPicker={(
        <Suspense fallback={<Skeleton className="h-14 w-full sm:w-44" />}>
          <IconPicker
            value={editCompraIconPreviewId}
            name={editCompraForm.descricao}
            autoApplySuggestion={false}
            onChange={(nextIconId) => {
              setEditCompraIconDirty(true);
              setEditCompraIcone(nextIconId);
              setEditCompraIconPersistableId(undefined);
              setEditCompraSelectedIcon((current) => (
                current?.displayValue === nextIconId ? current : null
              ));
            }}
            onSelectMeta={(meta: IconPickerSelectMeta) => {
              setEditCompraIconDirty(true);
              setEditCompraIcone(meta.displayValue);
              setEditCompraIconPersistableId(meta.persistableIconId ?? null);
              setEditCompraSelectedIcon(meta);
            }}
            size="md"
          />
        </Suspense>
      )}
      onSubmit={onUpdateCompra}
      isPending={updateCompraPending}
    />
  );
}
