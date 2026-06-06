import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

type NewPessoaDialogProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  pessoaForm: { nome: string; tipo: PessoaKind; telefone: string; observacao: string };
  onPessoaFormChange: (value: { nome: string; tipo: PessoaKind; telefone: string; observacao: string }) => void;
  duplicatePessoa: { nome: string } | null | undefined;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isPending: boolean;
};

export function NewPessoaDialog({
  open,
  onOpenChange,
  pessoaForm,
  onPessoaFormChange,
  duplicatePessoa,
  onSubmit,
  isPending,
}: NewPessoaDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova Pessoa</DialogTitle>
          <DialogDescription className="sr-only">
            Cadastre uma nova pessoa informando nome, identificação e tipo de relação financeira.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input
              data-testid="input-pessoa-nome"
              value={pessoaForm.nome}
              onChange={(e) => onPessoaFormChange({ ...pessoaForm, nome: e.target.value })}
              placeholder="Nome da pessoa"
              required
            />
            {duplicatePessoa && (
              <p className="text-xs text-amber-600 dark:text-amber-400" data-testid="warning-duplicate-pessoa">
                Atenção: já existe uma pessoa com nome similar: <strong>{duplicatePessoa.nome}</strong>
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={pessoaForm.tipo} onValueChange={(v) => onPessoaFormChange({ ...pessoaForm, tipo: v as PessoaKind })}>
              <SelectTrigger data-testid="select-pessoa-tipo"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="me_deve">Me deve</SelectItem>
                <SelectItem value="eu_devo">Eu devo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Telefone (opcional)</Label>
            <Input
              data-testid="input-pessoa-telefone"
              value={pessoaForm.telefone}
              onChange={(e) => onPessoaFormChange({ ...pessoaForm, telefone: e.target.value })}
              placeholder="(00) 00000-0000"
            />
          </div>
          <div className="space-y-2">
            <Label>Observacao</Label>
            <Textarea
              data-testid="input-pessoa-obs"
              value={pessoaForm.observacao}
              onChange={(e) => onPessoaFormChange({ ...pessoaForm, observacao: e.target.value })}
              placeholder="Notas sobre essa pessoa"
            />
          </div>
          <Button type="submit" className="w-full" data-testid="button-save-pessoa" disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
