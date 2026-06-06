import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type PerfilTabValue = "conta" | "planos" | "backup" | "ajuda";

type PerfilTabsNavProps = {
  value: PerfilTabValue;
  onValueChange: (value: PerfilTabValue) => void;
};

export function PerfilTabsNav({ value, onValueChange }: PerfilTabsNavProps) {
  return (
    <Tabs value={value} onValueChange={(nextValue) => onValueChange(nextValue as PerfilTabValue)}>
      <TabsList className="mobile-tabs-scroll w-full justify-start bg-muted/30">
        <TabsTrigger value="planos" data-testid="tab-perfil-planos">Planos</TabsTrigger>
        <TabsTrigger value="backup" data-testid="tab-perfil-backup">Backup</TabsTrigger>
        <TabsTrigger value="conta" data-testid="tab-perfil-conta">Conta</TabsTrigger>
        <TabsTrigger value="ajuda" data-testid="tab-perfil-ajuda">Ajuda</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
