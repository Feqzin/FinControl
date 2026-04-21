import { differenceInDays, format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export function DateBadge({ dateStr }: { dateStr: string }) {
  const d = parseISO(dateStr);
  const diff = differenceInDays(d, new Date());
  const bg = diff < 0 ? "bg-red-500" : diff === 0 ? "bg-red-500" : diff <= 3 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className={`flex flex-col items-center justify-center w-11 h-12 rounded-xl ${bg} text-white flex-shrink-0 shadow-sm`}>
      <span className="text-base font-bold leading-none">{format(d, "dd")}</span>
      <span className="text-[9px] uppercase font-semibold mt-0.5 opacity-90 tracking-wide">
        {format(d, "MMM", { locale: ptBR })}
      </span>
    </div>
  );
}

export function urgencyLabel(dateStr: string): { text: string; cls: string } {
  const diff = differenceInDays(parseISO(dateStr), new Date());
  if (diff < 0) return { text: `Venceu há ${Math.abs(diff)}d`, cls: "text-red-600 font-medium" };
  if (diff === 0) return { text: "Vence Hoje", cls: "text-red-600 font-semibold" };
  if (diff === 1) return { text: "Vence amanhã", cls: "text-amber-600 font-medium" };
  return { text: `Vence em ${diff} dias`, cls: "text-muted-foreground" };
}
