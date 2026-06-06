export function PerfilPlanBenefitsCard() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="fintech-surface-subtle p-3">
        <p className="text-sm font-semibold mb-2">Plano Free</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          <li>Dashboard financeiro básico</li>
          <li>Pessoas até 20</li>
          <li>Cartões até 4</li>
          <li>Serviços até 10</li>
          <li>Export/import local JSON</li>
          <li>Saldo por pessoa e abatimentos</li>
        </ul>
      </div>
      <div className="fintech-surface-subtle border-primary/25 bg-primary/5 p-3">
        <p className="text-sm font-semibold mb-2">Plano Premium</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          <li>Backup na nuvem</li>
          <li>Restauração na nuvem</li>
          <li>Pessoas ilimitadas</li>
          <li>Cartões ilimitados</li>
          <li>Serviços ilimitados</li>
          <li>Relatórios avançados</li>
          <li>Previsão financeira</li>
          <li>Importação inteligente</li>
          <li>Automações futuras</li>
        </ul>
      </div>
    </div>
  );
}
