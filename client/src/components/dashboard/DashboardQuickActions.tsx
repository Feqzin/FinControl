import { Button } from "@/components/ui/button";
import { CreditCard, Repeat, UserCircle, Users } from "lucide-react";

type DashboardQuickActionsProps = {
  onGoPessoas: () => void;
  onGoCartoes: () => void;
  onGoServicos: () => void;
  onGoPerfil: () => void;
};

export function DashboardQuickActions({
  onGoPessoas,
  onGoCartoes,
  onGoServicos,
  onGoPerfil,
}: DashboardQuickActionsProps) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      <Button
        className="group h-auto justify-start rounded-2xl border-border/70 bg-background/95 px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/15 hover:bg-accent/20 hover:shadow-md"
        variant="outline"
        onClick={onGoPessoas}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-black/5 bg-muted/55 shadow-sm transition-colors duration-200 group-hover:bg-background">
            <Users className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold tracking-[-0.01em]">Devedores</span>
        </span>
      </Button>
      <Button
        className="group h-auto justify-start rounded-2xl border-border/70 bg-background/95 px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/15 hover:bg-accent/20 hover:shadow-md"
        variant="outline"
        onClick={onGoCartoes}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-black/5 bg-muted/55 shadow-sm transition-colors duration-200 group-hover:bg-background">
            <CreditCard className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold tracking-[-0.01em]">Cartões</span>
        </span>
      </Button>
      <Button
        className="group h-auto justify-start rounded-2xl border-border/70 bg-background/95 px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/15 hover:bg-accent/20 hover:shadow-md"
        variant="outline"
        onClick={onGoServicos}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-black/5 bg-muted/55 shadow-sm transition-colors duration-200 group-hover:bg-background">
            <Repeat className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold tracking-[-0.01em]">Serviços</span>
        </span>
      </Button>
      <Button
        className="group h-auto justify-start rounded-2xl border-border/70 bg-background/95 px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/15 hover:bg-accent/20 hover:shadow-md"
        variant="outline"
        onClick={onGoPerfil}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-black/5 bg-muted/55 shadow-sm transition-colors duration-200 group-hover:bg-background">
            <UserCircle className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold tracking-[-0.01em]">Perfil</span>
        </span>
      </Button>
    </div>
  );
}
