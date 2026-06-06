import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Shield } from "lucide-react";

type PerfilAccountStatusCardProps = {
  isVisible: boolean;
  premiumAtivoNaUi: boolean;
};

export function PerfilAccountStatusCard({
  isVisible,
  premiumAtivoNaUi,
}: PerfilAccountStatusCardProps) {
  return (
    <Card className={isVisible ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-4 h-4" /> Status da conta
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Dados isolados — apenas voce acessa sua conta</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Senha protegida com criptografia segura</span>
          </div>
          <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            <span>Sessao segura com cookie httpOnly</span>
          </div>
          <div className="fintech-surface-subtle flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
            <div>
              <p className="text-sm font-medium">Plano atual</p>
              <p className="text-xs text-muted-foreground">
                {premiumAtivoNaUi
                  ? "Recursos premium liberados para sua conta."
                  : "Plano free ativo. Recursos premium aparecem bloqueados."}
              </p>
            </div>
            <Badge variant={premiumAtivoNaUi ? "default" : "secondary"}>
              {premiumAtivoNaUi ? "Premium" : "Free"}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
