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
        className="h-10 justify-start rounded-xl border-border/70 bg-background text-sm font-medium shadow-none"
        variant="outline"
        onClick={onGoPessoas}
      >
        <Users className="mr-2 h-4 w-4" /> Devedores
      </Button>
      <Button
        className="h-10 justify-start rounded-xl border-border/70 bg-background text-sm font-medium shadow-none"
        variant="outline"
        onClick={onGoCartoes}
      >
        <CreditCard className="mr-2 h-4 w-4" /> Cartões
      </Button>
      <Button
        className="h-10 justify-start rounded-xl border-border/70 bg-background text-sm font-medium shadow-none"
        variant="outline"
        onClick={onGoServicos}
      >
        <Repeat className="mr-2 h-4 w-4" /> Serviços
      </Button>
      <Button
        className="h-10 justify-start rounded-xl border-border/70 bg-background text-sm font-medium shadow-none"
        variant="outline"
        onClick={onGoPerfil}
      >
        <UserCircle className="mr-2 h-4 w-4" /> Perfil
      </Button>
    </div>
  );
}
