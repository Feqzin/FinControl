import type { Dispatch, SetStateAction } from "react";
import type { Cartao } from "@shared/schema";
import { CartaoFormDialog as BaseCartaoFormDialog } from "@/components/cartoes/CartaoFormDialog";
import { CardIconPickerField } from "@/pages/cartoes/components/card-icon-picker-field";
import type { EntityIconSuggestionResult } from "@/lib/entity-icon-suggestion";

type CardFormState = {
  nome: string;
  limite: string;
  melhorDiaCompra: string;
  diaVencimento: string;
};

type CartaoCreateEditDialogsProps = {
  openCard: boolean;
  setOpenCard: Dispatch<SetStateAction<boolean>>;
  cardForm: CardFormState;
  setCardForm: Dispatch<SetStateAction<CardFormState>>;
  newCardPreviewIconId: string | null;
  setNewCardIcone: Dispatch<SetStateAction<string | null>>;
  setNewCardIconPersistableId: Dispatch<SetStateAction<string | null>>;
  setNewCardIconManualSelection: Dispatch<SetStateAction<boolean>>;
  newCardIconManualSelection: boolean;
  newCardStrongIconSuggestion: EntityIconSuggestionResult;
  showNewCardMediumSuggestion: boolean;
  onCreateCard: () => void;
  createCardPending: boolean;
  editingCard: Cartao | null;
  setEditingCard: Dispatch<SetStateAction<Cartao | null>>;
  editCardForm: CardFormState;
  setEditCardForm: Dispatch<SetStateAction<CardFormState>>;
  editCardPreviewIconId: string | null;
  setEditCardIcone: Dispatch<SetStateAction<string | null>>;
  setEditCardIconPersistableId: Dispatch<SetStateAction<string | null>>;
  setEditCardIconManualSelection: Dispatch<SetStateAction<boolean>>;
  editCardIconManualSelection: boolean;
  editCardStrongIconSuggestion: EntityIconSuggestionResult;
  showEditCardMediumSuggestion: boolean;
  onUpdateCard: () => void;
  updateCardPending: boolean;
};

export function CartaoCreateEditDialogs({
  openCard,
  setOpenCard,
  cardForm,
  setCardForm,
  newCardPreviewIconId,
  setNewCardIcone,
  setNewCardIconPersistableId,
  setNewCardIconManualSelection,
  newCardIconManualSelection,
  newCardStrongIconSuggestion,
  showNewCardMediumSuggestion,
  onCreateCard,
  createCardPending,
  editingCard,
  setEditingCard,
  editCardForm,
  setEditCardForm,
  editCardPreviewIconId,
  setEditCardIcone,
  setEditCardIconPersistableId,
  setEditCardIconManualSelection,
  editCardIconManualSelection,
  editCardStrongIconSuggestion,
  showEditCardMediumSuggestion,
  onUpdateCard,
  updateCardPending,
}: CartaoCreateEditDialogsProps) {
  return (
    <>
      <BaseCartaoFormDialog
        open={openCard}
        onOpenChange={(open) => {
          setOpenCard(open);
          if (!open) {
            setNewCardIcone(null);
            setNewCardIconPersistableId(null);
            setNewCardIconManualSelection(false);
          }
        }}
        title="Novo Cartao"
        form={cardForm}
        setForm={setCardForm}
        iconPicker={(
          <CardIconPickerField
            name={cardForm.nome}
            value={newCardPreviewIconId}
            onChange={(nextIconId) => {
              setNewCardIcone(nextIconId);
              if (nextIconId === null) {
                setNewCardIconPersistableId(null);
                setNewCardIconManualSelection(false);
              }
            }}
            onSelectMeta={(meta) => {
              if (meta.source === "reset") {
                setNewCardIcone(null);
                setNewCardIconPersistableId(null);
                setNewCardIconManualSelection(false);
                return;
              }

              setNewCardIcone(meta.displayValue);
              setNewCardIconPersistableId(meta.persistableIconId ?? null);
              setNewCardIconManualSelection(true);
            }}
            manualSelection={newCardIconManualSelection}
            autoAppliedByKeyword={newCardStrongIconSuggestion.shouldAutoApply}
            showMediumSuggestion={showNewCardMediumSuggestion}
            mediumSuggestionLabel={newCardStrongIconSuggestion.label ?? "Biblioteca"}
            onUseMediumSuggestion={() => {
              setNewCardIcone(newCardStrongIconSuggestion.displayIconId);
              setNewCardIconPersistableId(newCardStrongIconSuggestion.persistableIconId);
              setNewCardIconManualSelection(true);
            }}
          />
        )}
        onSubmit={onCreateCard}
        isPending={createCardPending}
        pendingLabel="Salvando..."
        submitLabel="Salvar"
        testIds={{
          nome: "input-cartao-nome",
          limite: "input-cartao-limite",
          melhorDiaCompra: "input-cartao-melhordia",
          diaVencimento: "input-cartao-vencimento",
          submit: "button-save-cartao",
        }}
      />

      <BaseCartaoFormDialog
        open={!!editingCard}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCard(null);
            setEditCardIcone(null);
            setEditCardIconPersistableId(null);
            setEditCardIconManualSelection(false);
          }
        }}
        title="Editar Cartao"
        form={editCardForm}
        setForm={setEditCardForm}
        iconPicker={(
          <CardIconPickerField
            name={editCardForm.nome}
            value={editCardPreviewIconId}
            onChange={(nextIconId) => {
              setEditCardIcone(nextIconId);
              if (nextIconId === null) {
                setEditCardIconPersistableId(null);
                setEditCardIconManualSelection(false);
              }
            }}
            onSelectMeta={(meta) => {
              if (meta.source === "reset") {
                setEditCardIcone(null);
                setEditCardIconPersistableId(null);
                setEditCardIconManualSelection(false);
                return;
              }

              setEditCardIcone(meta.displayValue);
              setEditCardIconPersistableId(meta.persistableIconId ?? null);
              setEditCardIconManualSelection(true);
            }}
            manualSelection={editCardIconManualSelection}
            autoAppliedByKeyword={editCardStrongIconSuggestion.shouldAutoApply}
            showMediumSuggestion={showEditCardMediumSuggestion}
            mediumSuggestionLabel={editCardStrongIconSuggestion.label ?? "Biblioteca"}
            onUseMediumSuggestion={() => {
              setEditCardIcone(editCardStrongIconSuggestion.displayIconId);
              setEditCardIconPersistableId(editCardStrongIconSuggestion.persistableIconId);
              setEditCardIconManualSelection(true);
            }}
          />
        )}
        onSubmit={onUpdateCard}
        isPending={updateCardPending}
        pendingLabel="Salvando..."
        submitLabel="Salvar alteracoes"
        testIds={{
          nome: "input-edit-cartao-nome",
          limite: "input-edit-cartao-limite",
          melhorDiaCompra: "input-edit-cartao-melhordia",
          diaVencimento: "input-edit-cartao-vencimento",
          submit: "button-save-edit-cartao",
        }}
      />
    </>
  );
}
