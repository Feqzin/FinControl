import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { Pessoa } from "@shared/schema";
import type { PessoaOrphanLinksGroup } from "@/services/api/pessoas";
import { formatCurrencyBRL } from "@/utils/formatters";

type OrphanFormValue = {
  nome: string;
  pessoaIdExistente: string;
};

type OrphanRecoveryDialogProps = {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  visibleOrphanGroups: PessoaOrphanLinksGroup[];
  pessoasAtivasParaVinculo: Pessoa[];
  getOrphanForm: (orphanGroupKey: string, nomeSugerido: string) => OrphanFormValue;
  onSetOrphanFormValue: (
    orphanGroupKey: string,
    nomeSugerido: string,
    patch: Partial<OrphanFormValue>,
  ) => void;
  onIgnoreGroup: (orphanGroupKey: string) => void;
  onRecoverAsNewPessoa: (orphanGroupKey: string, nomeSugerido: string) => void;
  onRecoverToExistingPessoa: (orphanGroupKey: string, nomeSugerido: string) => void;
  isRecoverPending: boolean;
};

export function OrphanRecoveryDialog({
  open,
  onOpenChange,
  visibleOrphanGroups,
  pessoasAtivasParaVinculo,
  getOrphanForm,
  onSetOrphanFormValue,
  onIgnoreGroup,
  onRecoverAsNewPessoa,
  onRecoverToExistingPessoa,
  isRecoverPending,
}: OrphanRecoveryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revisar vínculos órfãos</DialogTitle>
          <DialogDescription className="sr-only">
            Revise vínculos órfãos encontrados e escolha como recuperar ou ignorar cada grupo.
          </DialogDescription>
        </DialogHeader>
        {visibleOrphanGroups.length === 0 ? (
          <div className="rounded-md border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
            Nenhum vínculo órfão pendente para revisão.
          </div>
        ) : (
          <div className="space-y-3">
            {visibleOrphanGroups.map((group) => {
              const form = getOrphanForm(group.orphanGroupKey, group.nomeSugerido);
              return (
                <div key={group.orphanGroupKey} className="rounded-lg border border-border/70 bg-background/95 p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{group.nomeSugerido}</p>
                      <p className="text-xs text-muted-foreground">
                        {group.dividasCount} dívida(s) · {group.linkedComprasCount} compra(s) · {group.linkedServicosCount} serviço(s)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        A receber: {formatCurrencyBRL(group.totalAReceber)} · A pagar: {formatCurrencyBRL(group.totalAPagar)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onIgnoreGroup(group.orphanGroupKey)}
                    >
                      Ignorar
                    </Button>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Nome para restaurar</Label>
                      <Input
                        value={form.nome}
                        onChange={(event) => onSetOrphanFormValue(group.orphanGroupKey, group.nomeSugerido, { nome: event.target.value })}
                        placeholder="Nome da pessoa"
                        data-testid={`input-orphan-name-${group.orphanGroupKey}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Vincular a pessoa existente</Label>
                      <Select
                        value={form.pessoaIdExistente || undefined}
                        onValueChange={(value) => onSetOrphanFormValue(group.orphanGroupKey, group.nomeSugerido, { pessoaIdExistente: value })}
                      >
                        <SelectTrigger data-testid={`select-orphan-person-${group.orphanGroupKey}`}>
                          <SelectValue placeholder="Selecione uma pessoa" />
                        </SelectTrigger>
                        <SelectContent>
                          {pessoasAtivasParaVinculo.map((pessoa) => (
                            <SelectItem key={pessoa.id} value={pessoa.id}>
                              {pessoa.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {group.exemplos.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Exemplo: {group.exemplos[0].descricao?.trim() || `Dívida ${group.exemplos[0].dividaId.slice(0, 8)}`}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onRecoverAsNewPessoa(group.orphanGroupKey, group.nomeSugerido)}
                      disabled={isRecoverPending}
                      data-testid={`button-recover-orphan-new-${group.orphanGroupKey}`}
                    >
                      Restaurar como pessoa
                    </Button>
                    <Button
                      type="button"
                      onClick={() => onRecoverToExistingPessoa(group.orphanGroupKey, group.nomeSugerido)}
                      disabled={isRecoverPending}
                      data-testid={`button-recover-orphan-existing-${group.orphanGroupKey}`}
                    >
                      Vincular a pessoa existente
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
