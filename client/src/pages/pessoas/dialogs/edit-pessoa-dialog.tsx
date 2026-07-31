import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import type { Pessoa } from "@shared/schema";

type PessoaKind = Pessoa["tipo"];

type EditPessoaDialogProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  editForm: {
    nome: string;
    tipo: PessoaKind;
    telefone: string;
    observacao: string;
    listaNegra: boolean;
    listaNegraMotivo: string;
  };
  onEditFormChange: (value: {
    nome: string;
    tipo: PessoaKind;
    telefone: string;
    observacao: string;
    listaNegra: boolean;
    listaNegraMotivo: string;
  }) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
};

export function EditPessoaDialog({
  open,
  onOpenChange,
  editForm,
  onEditFormChange,
  onSubmit,
  isPending,
}: EditPessoaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar pessoa</DialogTitle>
          <DialogDescription className="sr-only">
            Edite os dados cadastrados da pessoa selecionada.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              data-testid="input-edit-pessoa-nome"
              value={editForm.nome}
              onChange={(e) => onEditFormChange({ ...editForm, nome: e.target.value })}
              placeholder="Nome da pessoa"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={editForm.tipo} onValueChange={(v) => onEditFormChange({ ...editForm, tipo: v as PessoaKind })}>
              <SelectTrigger data-testid="select-edit-pessoa-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me_deve">Me deve</SelectItem>
                <SelectItem value="eu_devo">Eu devo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Telefone (opcional)</Label>
            <Input
              data-testid="input-edit-pessoa-telefone"
              value={editForm.telefone}
              onChange={(e) => onEditFormChange({ ...editForm, telefone: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label>Observacao</Label>
            <Textarea
              data-testid="input-edit-pessoa-obs"
              value={editForm.observacao}
              onChange={(e) => onEditFormChange({ ...editForm, observacao: e.target.value })}
              placeholder="Notas sobre essa pessoa"
            />
          </div>
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="edit-pessoa-lista-negra" className="cursor-pointer text-red-700 dark:text-red-300">
                  Lista negra de mau pagador
                </Label>
                <p className="text-xs text-muted-foreground">
                  Identifica esta pessoa com um alerta visível na listagem.
                </p>
              </div>
              <Switch
                id="edit-pessoa-lista-negra"
                checked={editForm.listaNegra}
                onCheckedChange={(checked) => onEditFormChange({
                  ...editForm,
                  listaNegra: checked,
                  listaNegraMotivo: checked ? editForm.listaNegraMotivo : "",
                })}
                data-testid="switch-edit-pessoa-lista-negra"
              />
            </div>
            {editForm.listaNegra && (
              <div className="mt-3 space-y-2">
                <Label>Motivo (opcional)</Label>
                <Textarea
                  value={editForm.listaNegraMotivo}
                  onChange={(event) => onEditFormChange({
                    ...editForm,
                    listaNegraMotivo: event.target.value,
                  })}
                  placeholder="Ex.: atrasos recorrentes ou acordo não cumprido"
                  data-testid="input-edit-pessoa-lista-negra-motivo"
                />
              </div>
            )}
          </div>
          <Button type="submit" className="w-full" data-testid="button-save-edit-pessoa" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
