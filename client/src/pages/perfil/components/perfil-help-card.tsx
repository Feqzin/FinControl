import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TourRestartButton } from "@/components/onboarding-tour";
import { HelpCircle } from "lucide-react";

type PerfilHelpCardProps = {
  isVisible: boolean;
};

export function PerfilHelpCard({ isVisible }: PerfilHelpCardProps) {
  return (
    <Card className={isVisible ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <HelpCircle className="w-4 h-4" /> Ajuda e Tutorial
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Precisa de uma ajuda para entender como o sistema funciona?
        </p>
        <TourRestartButton />
      </CardContent>
    </Card>
  );
}
