import { useState, useEffect } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  X, 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  DollarSign, 
  FileText, 
  Eye, 
  CheckCircle2,
  HelpCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    title: "Bem-vindo ao FinControl!",
    description: "Seu controle financeiro pessoal completo. Vamos fazer um tour rápido para você conhecer tudo.",
    icon: LayoutDashboard,
  },
  {
    title: "Painel Principal",
    description: "O painel resume tudo: saldo do mês, renda, cartões, patrimônio e muito mais. Passe o mouse sobre os cards para ver o detalhamento.",
    icon: LayoutDashboard,
  },
  {
    title: "Pessoas e Dívidas",
    description: "Cadastre pessoas (amigos, família) e registre quem te deve ou quem você deve. Controle parcelas e vencimentos.",
    icon: Users,
  },
  {
    title: "Cartões de Crédito",
    description: "Gerencie seus cartões. Registre compras parceladas e o sistema calcula automaticamente o compromisso mensal.",
    icon: CreditCard,
  },
  {
    title: "Renda e Patrimônio",
    description: "Cadastre suas fontes de renda (salário, freelance) e seu patrimônio (contas, poupança, investimentos).",
    icon: DollarSign,
  },
  {
    title: "Relatórios em PDF",
    description: "Na tela de Relatórios, filtre por período e exporte um PDF completo da sua situação financeira.",
    icon: FileText,
  },
  {
    title: "Ocultar Valores",
    description: "Use o ícone de olho no topo para ocultar todos os valores. Útil quando estiver em lugares públicos.",
    icon: Eye,
  },
  {
    title: "Tudo pronto!",
    description: "Você já sabe o essencial. Explore as outras telas: Simulador, Metas, Previsão e muito mais. Bom controle financeiro!",
    icon: CheckCircle2,
  },
];

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const done = localStorage.getItem("fincontrol_tour_done");
      if (!done) {
        setOpen(true);
      }
    } catch (e) {
      console.error("Error reading localStorage", e);
    }
  }, []);

  const close = () => {
    try {
      localStorage.setItem("fincontrol_tour_done", "1");
    } catch (e) {
      console.error("Error writing to localStorage", e);
    }
    setOpen(false);
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      close();
    }
  };

  const prev = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  if (!open) return null;

  const currentStep = steps[step];
  const Icon = currentStep.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-300">
      <div 
        className="bg-card border rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4 space-y-6 relative transition-all duration-200"
        data-testid="onboarding-tour-card"
      >
        <Button 
          variant="ghost" 
          size="icon" 
          className="absolute right-4 top-4" 
          onClick={close}
          data-testid="button-close-tour"
        >
          <X className="w-4 h-4" />
        </Button>

        <div className="flex flex-col items-center text-center space-y-4 pt-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <Icon className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">{currentStep.title}</h2>
            <p className="text-muted-foreground leading-relaxed">
              {currentStep.description}
            </p>
          </div>
        </div>

        <div className="flex flex-col space-y-4">
          <div className="flex justify-center gap-1.5">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i <= step ? "bg-primary w-6" : "bg-muted w-1.5"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center justify-between">
            <Button 
              variant="ghost" 
              onClick={close}
              className="text-muted-foreground"
              data-testid="button-skip-tour"
            >
              Pular tutorial
            </Button>
            <div className="flex gap-2">
              {step > 0 && (
                <Button 
                  variant="outline" 
                  onClick={prev}
                  data-testid="button-prev-step"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
                </Button>
              )}
              <Button 
                onClick={next}
                data-testid="button-next-step"
                className="min-w-[100px]"
              >
                {step === steps.length - 1 ? "Começar!" : (
                  <>Próximo <ChevronRight className="w-4 h-4 ml-1" /></>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TourRestartButton() {
  const restart = () => {
    try {
      localStorage.removeItem("fincontrol_tour_done");
      window.location.reload();
    } catch (e) {
      console.error("Error clearing localStorage", e);
    }
  };

  return (
    <Button 
      variant="outline" 
      onClick={restart}
      className="w-full"
      data-testid="button-restart-tour"
    >
      <HelpCircle className="w-4 h-4 mr-2" /> Refazer tutorial
    </Button>
  );
}
