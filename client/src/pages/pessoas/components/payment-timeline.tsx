import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatCurrencyBRL, formatIsoDateToBR } from "@/utils/formatters";
import type { PagamentoTimelineEvent, PagamentoTimelineSourceType } from "@/services/api/pessoas";
import { FileText, Upload } from "lucide-react";
import {
  buildTimelineLayout,
  findSelectedTimelineEvent,
  formatBytes,
  getTimelineEventKey,
  getTimelineStatusVisual,
  toTimelineDateLabel,
} from "../payment-timeline.utils";

const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const AXIS_Y = 128;
const TOP_LABEL_Y = 8;
const BOTTOM_LABEL_Y = 188;

type TimelineActionPayload = {
  sourceType: PagamentoTimelineSourceType;
  sourceId: string;
};

type PaymentTimelineProps = {
  events: PagamentoTimelineEvent[];
  isLoading: boolean;
  isSavingObservacao: boolean;
  isUploadingComprovante: boolean;
  onSaveObservacao: (payload: TimelineActionPayload & { observacaoPagamento: string | null }) => Promise<void>;
  onUploadComprovante: (payload: TimelineActionPayload & { file: File }) => Promise<void>;
};

export function PaymentTimeline({
  events,
  isLoading,
  isSavingObservacao,
  isUploadingComprovante,
  onSaveObservacao,
  onUploadComprovante,
}: PaymentTimelineProps) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<PagamentoTimelineEvent | null>(null);
  const [observacaoDraft, setObservacaoDraft] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const selectedKey = useMemo(
    () => (selected ? getTimelineEventKey(selected) : null),
    [selected],
  );

  const layout = useMemo(() => buildTimelineLayout(events), [events]);

  useEffect(() => {
    const synced = findSelectedTimelineEvent(events, selectedKey);
    if (!synced) return;
    setSelected(synced);
    setObservacaoDraft(synced.observacaoPagamento ?? "");
  }, [events, selectedKey]);

  const openDetails = (event: PagamentoTimelineEvent) => {
    setSelected(event);
    setObservacaoDraft(event.observacaoPagamento ?? "");
    setUploadFile(null);
  };

  const saveObservacao = async () => {
    if (!selected) return;
    const normalized = observacaoDraft.trim();
    await onSaveObservacao({
      sourceType: selected.sourceType,
      sourceId: selected.sourceId,
      observacaoPagamento: normalized.length > 0 ? normalized : null,
    });
    toast({ title: "Observacao atualizada" });
  };

  const uploadComprovante = async () => {
    if (!selected || !uploadFile) return;

    if (!ALLOWED_MIME_TYPES.has(uploadFile.type)) {
      toast({
        title: "Arquivo invalido",
        description: "Use apenas PDF, JPG, JPEG ou PNG.",
        variant: "destructive",
      });
      return;
    }

    if (uploadFile.size > MAX_UPLOAD_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: "O tamanho maximo permitido e 5 MB.",
        variant: "destructive",
      });
      return;
    }

    await onUploadComprovante({
      sourceType: selected.sourceType,
      sourceId: selected.sourceId,
      file: uploadFile,
    });
    setUploadFile(null);
    toast({ title: "Comprovante anexado" });
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Linha do tempo de pagamentos
        </h3>
        <Badge variant="outline">{events.length} evento(s)</Badge>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          Sem eventos ainda. A timeline mostra o historico financeiro das dividas.
        </div>
      ) : (
        <div className="overflow-x-auto pb-2" data-testid="timeline-scroll-container">
          <div
            className="relative h-64 min-w-full"
            style={{ width: `${layout.width}px` }}
            data-testid="timeline-canvas"
          >
            <div className="absolute left-12 right-12 h-0.5 bg-border" style={{ top: `${AXIS_Y}px` }} />

            {layout.items.map((item, index) => {
              const visual = getTimelineStatusVisual(item.event.status);
              const isTop = index % 2 === 0;
              const labelY = isTop ? TOP_LABEL_Y : BOTTOM_LABEL_Y;
              const connectorTop = isTop ? 52 : AXIS_Y;
              const connectorHeight = isTop ? AXIS_Y - connectorTop : BOTTOM_LABEL_Y - AXIS_Y;
              return (
                <div key={item.key} className="absolute top-0 -translate-x-1/2" style={{ left: `${item.x}px` }}>
                  <button
                    type="button"
                    className="absolute -translate-x-1/2 -translate-y-1/2 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 rounded-full"
                    style={{ left: "50%", top: `${AXIS_Y}px` }}
                    onClick={() => openDetails(item.event)}
                    data-testid={`timeline-point-${item.event.id}`}
                    aria-label={`${visual.label} em ${formatIsoDateToBR(item.event.dataEvento)}`}
                  >
                    <span
                      className={`mx-auto block h-4 w-4 rounded-full border-2 border-background shadow ${visual.dotClassName}`}
                    />
                  </button>

                  <div
                    className="absolute left-1/2 -translate-x-1/2 border-l border-dashed border-muted-foreground/40"
                    style={{ top: `${connectorTop}px`, height: `${connectorHeight}px` }}
                    data-testid={`timeline-connector-${item.event.id}`}
                  />

                  <button
                    type="button"
                    className="absolute left-1/2 -translate-x-1/2 w-28 rounded px-1 py-0.5 text-center text-[11px] leading-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
                    style={{ top: `${labelY}px` }}
                    onClick={() => openDetails(item.event)}
                    data-testid={`timeline-label-${item.event.id}`}
                  >
                    <span className={`block font-semibold ${visual.textClassName}`}>
                      {formatIsoDateToBR(item.event.dataEvento)}
                    </span>
                    <span className="mt-1 block text-muted-foreground">{visual.label}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Detalhe do evento</DialogTitle>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/40 p-3 space-y-1">
                <p className="text-sm font-medium">{selected.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {toTimelineDateLabel(selected)}: {formatIsoDateToBR(selected.dataEvento)}
                </p>
                <p className="text-sm font-semibold">{formatCurrencyBRL(Number(selected.valor))}</p>
                <p className="text-xs text-muted-foreground">
                  Status:{" "}
                  <span className={getTimelineStatusVisual(selected.status).textClassName}>
                    {getTimelineStatusVisual(selected.status).label}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeline-observacao">Observacao</Label>
                <Textarea
                  id="timeline-observacao"
                  value={observacaoDraft}
                  onChange={(event) => setObservacaoDraft(event.target.value)}
                  placeholder="Adicione uma observacao sobre este pagamento..."
                  data-testid="timeline-observacao-input"
                />
                {!selected.observacaoPagamento && observacaoDraft.trim().length === 0 && (
                  <p className="text-xs text-muted-foreground">Sem observacao cadastrada.</p>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={saveObservacao}
                  disabled={isSavingObservacao}
                  data-testid="timeline-observacao-save"
                >
                  {isSavingObservacao ? "Salvando..." : "Salvar observacao"}
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeline-comprovante">Comprovante</Label>
                {selected.comprovante ? (
                  <div className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{selected.comprovante.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {selected.comprovante.mimeType} - {formatBytes(selected.comprovante.tamanho)}
                        </p>
                      </div>
                      <a
                        href={selected.comprovante.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary text-xs hover:underline"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Abrir
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum comprovante anexado.</p>
                )}

                <Input
                  id="timeline-comprovante"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                  data-testid="timeline-comprovante-input"
                />

                <Button
                  type="button"
                  onClick={uploadComprovante}
                  disabled={!uploadFile || isUploadingComprovante}
                  data-testid="timeline-comprovante-upload"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploadingComprovante ? "Enviando..." : "Anexar comprovante"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

