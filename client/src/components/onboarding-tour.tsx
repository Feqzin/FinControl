import { useState, useEffect, useCallback, useRef } from "react";
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
  HelpCircle,
  TrendingUp,
  Bell,
  Settings2,
  Moon,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Placement = "top" | "bottom" | "left" | "right" | "center";

interface TourStep {
  id: string;
  type: "spotlight" | "modal";
  target?: string;
  preferredPlacement?: Placement;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const PADDING = 10;
const TOOLTIP_W = 340;
const TOOLTIP_H = 220;

const steps: TourStep[] = [
  {
    id: "welcome",
    type: "modal",
    title: "Bem-vindo ao FinControl!",
    description:
      "Seu assistente de controle financeiro pessoal. Em menos de 2 minutos você vai conhecer tudo que o app oferece.",
    icon: Sparkles,
    badge: "Novo por aqui?",
  },
  {
    id: "nav",
    type: "spotlight",
    target: "[data-testid='nav-dashboard']",
    preferredPlacement: "right",
    title: "Navegação lateral",
    description:
      "O menu lateral dá acesso a todas as seções: Painel, Pessoas, Dívidas, Cartões, Renda, Patrimônio, Metas, Previsão e muito mais.",
    icon: LayoutDashboard,
  },
  {
    id: "score",
    type: "spotlight",
    target: "[data-testid='score-financeiro']",
    preferredPlacement: "bottom",
    title: "Score Financeiro",
    description:
      "Seu Score é calculado automaticamente com base em dívidas, cartões, renda e patrimônio. Quanto maior, melhor sua saúde financeira.",
    icon: TrendingUp,
    badge: "Score 2.0",
  },
  {
    id: "alertas",
    type: "spotlight",
    target: "[data-testid='alertas-section']",
    preferredPlacement: "top",
    title: "Alertas e Insights",
    description:
      "Aqui aparecem alertas de vencimentos próximos, saldo negativo e dicas personalizadas para melhorar sua situação financeira.",
    icon: Bell,
  },
  {
    id: "eye",
    type: "spotlight",
    target: "[data-testid='button-toggle-visibility']",
    preferredPlacement: "bottom",
    title: "Ocultar Valores",
    description:
      "Toque no ícone de olho para mascarar todos os valores monetários. Ideal quando estiver usando o app em lugares públicos.",
    icon: Eye,
  },
  {
    id: "personalizar",
    type: "spotlight",
    target: "[data-testid='button-personalizar']",
    preferredPlacement: "right",
    title: "Personalizar o App",
    description:
      "Escolha quais telas aparecem no menu e quais cards ficam visíveis no painel. Deixe o FinControl do seu jeito.",
    icon: Settings2,
  },
  {
    id: "tema",
    type: "spotlight",
    target: "[data-testid='button-theme-toggle']",
    preferredPlacement: "right",
    title: "Tema Claro / Escuro",
    description:
      "Alterne entre o tema claro e escuro com um clique. Sua preferência é salva automaticamente.",
    icon: Moon,
  },
  {
    id: "done",
    type: "modal",
    title: "Tudo pronto!",
    description:
      "Agora é só explorar! Registre suas rendas, dívidas, cartões e patrimônio. O FinControl cuida dos cálculos por você.",
    icon: CheckCircle2,
    badge: "Vamos lá!",
  },
];

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTooltipPosition(
  rect: SpotlightRect,
  preferred: Placement
): { top: number; left: number; arrow: Placement } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceBelow = vh - (rect.top + rect.height + PADDING);
  const spaceAbove = rect.top - PADDING;
  const spaceRight = vw - (rect.left + rect.width + PADDING);
  const spaceLeft = rect.left - PADDING;

  const candidates: Placement[] = [preferred, "bottom", "top", "right", "left"];
  const unique = candidates.filter((v, i, a) => a.indexOf(v) === i);

  for (const p of unique) {
    if (p === "bottom" && spaceBelow >= TOOLTIP_H) {
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - TOOLTIP_W / 2),
        vw - TOOLTIP_W - 8
      );
      return { top: rect.top + rect.height + PADDING + 8, left, arrow: "top" };
    }
    if (p === "top" && spaceAbove >= TOOLTIP_H) {
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - TOOLTIP_W / 2),
        vw - TOOLTIP_W - 8
      );
      return { top: rect.top - TOOLTIP_H - PADDING - 8, left, arrow: "bottom" };
    }
    if (p === "right" && spaceRight >= TOOLTIP_W + 16) {
      const top = Math.min(
        Math.max(8, rect.top + rect.height / 2 - TOOLTIP_H / 2),
        vh - TOOLTIP_H - 8
      );
      return { top, left: rect.left + rect.width + PADDING + 8, arrow: "left" };
    }
    if (p === "left" && spaceLeft >= TOOLTIP_W + 16) {
      const top = Math.min(
        Math.max(8, rect.top + rect.height / 2 - TOOLTIP_H / 2),
        vh - TOOLTIP_H - 8
      );
      return { top, left: rect.left - TOOLTIP_W - PADDING - 8, arrow: "right" };
    }
  }

  return {
    top: vh / 2 - TOOLTIP_H / 2,
    left: vw / 2 - TOOLTIP_W / 2,
    arrow: "center",
  };
}

export function OnboardingTour() {
  const [stepIdx, setStepIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; arrow: Placement } | null>(null);
  const [visible, setVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const done = localStorage.getItem("fincontrol_tour_done");
      if (!done) setOpen(true);
    } catch {}
  }, []);

  const currentStep = steps[stepIdx];

  const measureTarget = useCallback(() => {
    if (!currentStep || currentStep.type !== "spotlight" || !currentStep.target) {
      setSpotlightRect(null);
      setTooltipPos(null);
      return;
    }
    const el = document.querySelector(currentStep.target) as HTMLElement | null;
    if (!el) {
      setSpotlightRect(null);
      setTooltipPos(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const rect: SpotlightRect = {
      top: r.top - PADDING,
      left: r.left - PADDING,
      width: r.width + PADDING * 2,
      height: r.height + PADDING * 2,
    };
    setSpotlightRect(rect);
    setTooltipPos(
      getTooltipPosition(rect, currentStep.preferredPlacement ?? "bottom")
    );
  }, [currentStep]);

  useEffect(() => {
    if (!open) return;
    setVisible(false);
    const timer = setTimeout(() => {
      measureTarget();
      setVisible(true);
    }, 80);
    return () => clearTimeout(timer);
  }, [open, stepIdx, measureTarget]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measureTarget();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, measureTarget]);

  const close = () => {
    setVisible(false);
    setTimeout(() => {
      try {
        localStorage.setItem("fincontrol_tour_done", "1");
      } catch {}
      setOpen(false);
    }, 200);
  };

  const next = () => {
    if (stepIdx < steps.length - 1) {
      setVisible(false);
      setTimeout(() => setStepIdx((s) => s + 1), 150);
    } else {
      close();
    }
  };

  const prev = () => {
    if (stepIdx > 0) {
      setVisible(false);
      setTimeout(() => setStepIdx((s) => s - 1), 150);
    }
  };

  const goTo = (i: number) => {
    if (i === stepIdx) return;
    setVisible(false);
    setTimeout(() => setStepIdx(i), 150);
  };

  if (!open) return null;

  const Icon = currentStep.icon;
  const isModal = currentStep.type === "modal" || !spotlightRect;
  const isLast = stepIdx === steps.length - 1;

  const arrowEl = (placement: Placement) => {
    if (placement === "center") return null;
    const base = "absolute w-3 h-3 bg-card border rotate-45";
    const map: Record<string, string> = {
      top: "-top-1.5 left-1/2 -translate-x-1/2 border-b-0 border-r-0",
      bottom: "-bottom-1.5 left-1/2 -translate-x-1/2 border-t-0 border-l-0",
      left: "top-1/2 -translate-y-1/2 -left-1.5 border-r-0 border-b-0",
      right: "top-1/2 -translate-y-1/2 -right-1.5 border-l-0 border-t-0",
    };
    return <div className={`${base} ${map[placement] ?? ""}`} />;
  };

  return (
    <>
      <style>{`
        @keyframes tour-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(var(--primary-rgb, 99 102 241) / 0.5); }
          50% { box-shadow: 0 0 0 8px rgba(var(--primary-rgb, 99 102 241) / 0); }
        }
        .tour-spotlight-ring {
          animation: tour-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <div
        className="fixed inset-0 z-[200]"
        style={{ pointerEvents: "all" }}
        data-testid="onboarding-tour-overlay"
      >
        {isModal ? (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            style={{ opacity: visible ? 1 : 0, transition: "opacity 0.2s ease" }}>
            <TourCard
              step={currentStep}
              stepIdx={stepIdx}
              total={steps.length}
              isLast={isLast}
              onNext={next}
              onPrev={prev}
              onClose={close}
              onGoTo={goTo}
              visible={visible}
              isModal
            />
          </div>
        ) : (
          <>
            <div
              className="fixed inset-0 bg-black/65"
              style={{
                opacity: visible ? 1 : 0,
                transition: "opacity 0.25s ease",
              }}
            />

            {spotlightRect && (
              <>
                <div
                  className="fixed rounded-xl tour-spotlight-ring"
                  style={{
                    top: spotlightRect.top,
                    left: spotlightRect.left,
                    width: spotlightRect.width,
                    height: spotlightRect.height,
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.65)",
                    border: "2px solid hsl(var(--primary))",
                    pointerEvents: "none",
                    opacity: visible ? 1 : 0,
                    transition: "opacity 0.25s ease, top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease",
                    zIndex: 201,
                  }}
                />

                <div
                  className="fixed rounded-xl"
                  style={{
                    top: spotlightRect.top - 2,
                    left: spotlightRect.left - 2,
                    width: spotlightRect.width + 4,
                    height: spotlightRect.height + 4,
                    background: "transparent",
                    pointerEvents: "none",
                    zIndex: 202,
                    opacity: visible ? 1 : 0,
                    transition: "opacity 0.25s ease",
                  }}
                />
              </>
            )}

            {tooltipPos && (
              <div
                style={{
                  position: "fixed",
                  top: tooltipPos.top,
                  left: tooltipPos.left,
                  width: TOOLTIP_W,
                  zIndex: 203,
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(6px)",
                  transition: "opacity 0.25s ease, transform 0.25s ease",
                }}
              >
                <div className="relative bg-card border rounded-2xl shadow-2xl overflow-visible">
                  {arrowEl(tooltipPos.arrow)}
                  <TourCard
                    step={currentStep}
                    stepIdx={stepIdx}
                    total={steps.length}
                    isLast={isLast}
                    onNext={next}
                    onPrev={prev}
                    onClose={close}
                    onGoTo={goTo}
                    visible={visible}
                    isModal={false}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

interface TourCardProps {
  step: TourStep;
  stepIdx: number;
  total: number;
  isLast: boolean;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onGoTo: (i: number) => void;
  visible: boolean;
  isModal: boolean;
}

function TourCard({
  step,
  stepIdx,
  total,
  isLast,
  onNext,
  onPrev,
  onClose,
  onGoTo,
  visible,
  isModal,
}: TourCardProps) {
  const Icon = step.icon;

  const inner = (
    <div className="p-5 space-y-4" data-testid="onboarding-tour-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            {step.badge && (
              <Badge variant="secondary" className="mb-1 text-xs font-medium">
                {step.badge}
              </Badge>
            )}
            <h3 className="font-bold text-base leading-tight">{step.title}</h3>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0 -mt-1 -mr-1 w-7 h-7"
          onClick={onClose}
          data-testid="button-close-tour"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">
        {step.description}
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-center gap-1.5">
          {Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => onGoTo(i)}
              className={`rounded-full transition-all duration-300 cursor-pointer focus:outline-none ${
                i === stepIdx
                  ? "w-5 h-1.5 bg-primary"
                  : i < stepIdx
                  ? "w-1.5 h-1.5 bg-primary/40"
                  : "w-1.5 h-1.5 bg-muted-foreground/20"
              }`}
              aria-label={`Ir para passo ${i + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-muted-foreground text-xs h-8"
            data-testid="button-skip-tour"
          >
            Pular tutorial
          </Button>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground tabular-nums">
              {stepIdx + 1}/{total}
            </span>
            {stepIdx > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={onPrev}
                className="h-8 px-2.5 text-xs"
                data-testid="button-prev-step"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              size="sm"
              onClick={onNext}
              className="h-8 px-3 text-xs min-w-[80px]"
              data-testid="button-next-step"
            >
              {isLast ? (
                "Começar!"
              ) : (
                <>
                  Próximo <ChevronRight className="w-3.5 h-3.5 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div
        className="bg-card border rounded-2xl shadow-2xl w-full"
        style={{
          maxWidth: TOOLTIP_W + 20,
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.97)",
          transition: "opacity 0.25s ease, transform 0.25s ease",
        }}
        data-testid="onboarding-tour-card"
      >
        {inner}
      </div>
    );
  }

  return inner;
}

export function TourRestartButton() {
  const [, forceRender] = useState(0);

  const restart = () => {
    try {
      localStorage.removeItem("fincontrol_tour_done");
    } catch {}
    forceRender((n) => n + 1);
    window.location.reload();
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
