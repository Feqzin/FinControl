import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut } from "lucide-react";

type PerfilLogoutCardProps = {
  isVisible: boolean;
  onLogout: () => void;
};

export function PerfilLogoutCard({ isVisible, onLogout }: PerfilLogoutCardProps) {
  return (
    <Card className={isVisible ? "fintech-surface" : "hidden"}>
      <CardContent className="p-4">
        <Button
          variant="destructive"
          onClick={onLogout}
          className="w-full"
          data-testid="button-logout-profile"
        >
          <LogOut className="w-4 h-4 mr-2" /> Sair da conta
        </Button>
      </CardContent>
    </Card>
  );
}
