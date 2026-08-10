import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileImage, FileText, ScanText, ShieldCheck, X } from "lucide-react";
import type { MeiActivity } from "@shared/das-mei";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { extractCnpjDasTextFromImage } from "@/pages/dividas/cnpj-das-ocr";
import {
  parseCnpjDasImportText,
  type DasImportedItem,
  type DasImportResult,
} from "@/pages/dividas/cnpj-das-import.utils";

const EXAMPLE_TEXT = `04/2024: R$ 106,25
05/2024: R$ 105,69
06/2024: R$ 105,04

Total de 2024: R$ 316,98`;

type ImportForm = {
  cnpj: string;
  nome: string;
  atividade: MeiActivity;
  dataCalculo: string;
};

type Props = {
  form: ImportForm;
  onFormChange: (patch: Partial<ImportForm>) => void;
  onApply: (items: DasImportedItem[]) => Promise<void>;
  applying: boolean;
  proofFile: File | null;
  onProofFileChange: (file: File | null) => void;
};

const MAX_PROOF_SIZE = 3 * 1024 * 1024;

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMonth(value: string): string {
  return `${value.slice(5, 7)}/${value.slice(0, 4)}`;
}

function recalculateSummary(items: DasImportedItem[]) {
  const yearlyTotals = items.reduce<Record<string, number>>((result, item) => {
    const year = item.competencia.slice(0, 4);
    result[year] = Math.round(((result[year] ?? 0) + item.total + Number.EPSILON) * 100) / 100;
    return result;
  }, {});
  const total = Math.round((items.reduce((sum, item) => sum + item.total, 0) + Number.EPSILON) * 100) / 100;
  return { yearlyTotals, total };
}

export function CnpjDasImportPanel({
  form,
  onFormChange,
  onApply,
  applying,
  proofFile,
  onProofFileChange,
}: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [result, setResult] = useState<DasImportResult | null>(null);
  const [items, setItems] = useState<DasImportedItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [readingImage, setReadingImage] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [sourceName, setSourceName] = useState<string | null>(null);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.competencia)),
    [items, selected],
  );
  const summary = useMemo(() => recalculateSummary(selectedItems), [selectedItems]);

  const analyzeText = (value = text) => {
    const parsed = parseCnpjDasImportText(value);
    setResult(parsed);
    setItems(parsed.items);
    setSelected(new Set(parsed.items.map((item) => item.competencia)));
    if (parsed.items.length === 0) {
      toast({
        title: "Nenhuma competência encontrada",
        description: "Use linhas como 04/2024: R$ 106,25 ou envie um print legível do PGMEI.",
        variant: "destructive",
      });
    }
  };

  const handleImage = async (file: File | null) => {
    if (!file) return;
    setReadingImage(true);
    setOcrProgress(0);
    setSourceName(file.name);
    try {
      const recognizedText = await extractCnpjDasTextFromImage(file, setOcrProgress);
      setText(recognizedText);
      analyzeText(recognizedText);
      toast({
        title: "Imagem lida",
        description: "Revise os meses e valores reconhecidos antes de aplicar.",
      });
    } catch (error) {
      toast({
        title: "Não foi possível ler a imagem",
        description: error instanceof Error ? error.message : "Tente uma imagem mais nítida.",
        variant: "destructive",
      });
    } finally {
      setReadingImage(false);
      setOcrProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateItemTotal = (competencia: string, value: number) => {
    setItems((current) => current.map((item) => item.competencia === competencia
      ? { ...item, total: Number.isFinite(value) ? value : 0 }
      : item));
  };

  const handleProofFile = (file: File | null) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Comprovante inválido", description: "Selecione somente um arquivo PDF.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_PROOF_SIZE) {
      toast({ title: "PDF muito grande", description: "O comprovante deve ter no máximo 3 MB.", variant: "destructive" });
      return;
    }
    onProofFileChange(file);
  };

  return (
    <div className="space-y-5 py-4" data-testid="cnpj-das-import-panel">
      <Alert className="border-blue-500/20 bg-blue-500/5">
        <ShieldCheck className="h-4 w-4 text-blue-600" />
        <AlertDescription>
          A imagem é lida no seu navegador e não é enviada ao servidor. O OCR pode errar números: a revisão antes do cadastro é obrigatória.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="das-import-cnpj">CNPJ</Label>
          <Input id="das-import-cnpj" value={form.cnpj} onChange={(event) => onFormChange({ cnpj: event.target.value })} placeholder="00.000.000/0000-00" />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="das-import-name">Nome do negócio</Label>
          <Input id="das-import-name" value={form.nome} onChange={(event) => onFormChange({ nome: event.target.value })} placeholder="Ex.: Minha empresa MEI" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="das-import-date">Data dos valores</Label>
          <Input id="das-import-date" type="date" value={form.dataCalculo} onChange={(event) => onFormChange({ dataCalculo: event.target.value })} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Atividade tributada</Label>
          <Select value={form.atividade} onValueChange={(value) => onFormChange({ atividade: value as MeiActivity })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="comercio">Comércio / indústria</SelectItem>
              <SelectItem value="servico">Serviços</SelectItem>
              <SelectItem value="comercio_servico">Comércio e serviços</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2">
          <Label htmlFor="das-import-text">Texto reconhecido ou colado</Label>
          <Textarea
            id="das-import-text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={EXAMPLE_TEXT}
            className="min-h-52 font-mono text-sm"
            data-testid="textarea-cnpj-das-import"
          />
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-xl border border-dashed p-4">
          <div>
            <FileImage className="mb-3 h-8 w-8 text-primary" />
            <p className="font-medium">Ler print do PGMEI</p>
            <p className="mt-1 text-sm text-muted-foreground">PNG, JPG ou WEBP, até 12 MB. Prefira o print original sem cortes nas linhas.</p>
            {sourceName && <p className="mt-2 truncate text-xs text-muted-foreground">{sourceName}</p>}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,image/webp"
            className="hidden"
            onChange={(event) => void handleImage(event.target.files?.[0] ?? null)}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={readingImage}>
            <ScanText className="mr-2 h-4 w-4" /> {readingImage ? "Lendo imagem..." : "Selecionar imagem"}
          </Button>
          {readingImage && <div className="space-y-1"><Progress value={ocrProgress} /><p className="text-center text-xs text-muted-foreground">{ocrProgress}%</p></div>}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" onClick={() => analyzeText()} disabled={!text.trim() || readingImage}>
          <ScanText className="mr-2 h-4 w-4" /> Analisar texto
        </Button>
        <Button type="button" variant="outline" onClick={() => { setText(EXAMPLE_TEXT); setResult(null); setItems([]); setSelected(new Set()); }}>
          Ver exemplo
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="font-medium">Comprovante do lote em PDF <span className="font-normal text-muted-foreground">(opcional)</span></p>
            <p className="text-sm text-muted-foreground">Fica vinculado uma única vez a todas as competências deste cadastro. Limite de 3 MB.</p>
            {proofFile && <p className="mt-1 truncate text-sm font-medium text-emerald-700">{proofFile.name}</p>}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <input
            ref={proofInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(event) => {
              handleProofFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
          <Button type="button" variant="outline" onClick={() => proofInputRef.current?.click()}>
            <FileText className="mr-2 h-4 w-4" /> {proofFile ? "Trocar PDF" : "Selecionar PDF"}
          </Button>
          {proofFile && (
            <Button type="button" variant="ghost" size="icon" onClick={() => onProofFileChange(null)} aria-label="Remover comprovante PDF">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {result && (
        <div className="space-y-4">
          {result.warnings.length > 0 && (
            <Alert className="border-amber-500/30 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{selectedItems.length} competência(s) pronta(s)</p>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {Object.entries(summary.yearlyTotals).map(([year, total]) => <span key={year}>{year}: {formatCurrency(total)}</span>)}
              </div>
            </div>
            <div className="sm:text-right"><p className="text-xs text-muted-foreground">Total selecionado</p><p className="text-xl font-bold text-red-600">{formatCurrency(summary.total)}</p></div>
          </div>

          {items.length > 0 && (
            <div className="max-h-[42vh] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"><Checkbox checked={selected.size === items.length} onCheckedChange={(checked) => setSelected(checked ? new Set(items.map((item) => item.competencia)) : new Set())} /></TableHead>
                    <TableHead>Competência</TableHead>
                    <TableHead>Total oficial do PGMEI</TableHead>
                    <TableHead>Origem reconhecida</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.competencia} data-state={selected.has(item.competencia) ? "selected" : undefined}>
                      <TableCell><Checkbox checked={selected.has(item.competencia)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(item.competencia); else next.delete(item.competencia); return next; })} /></TableCell>
                      <TableCell className="font-medium">{formatMonth(item.competencia)}</TableCell>
                      <TableCell><Input className="min-w-32" type="number" min="0.01" step="0.01" value={item.total} onChange={(event) => updateItemTotal(item.competencia, Number(event.target.value))} /></TableCell>
                      <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={item.sourceLine}>{item.sourceLine}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">Ao continuar, o sistema compara os totais com o cálculo automático e mostra a prévia final.</p>
            <Button
              type="button"
              onClick={() => onApply(selectedItems)}
              disabled={applying || selectedItems.length === 0 || selectedItems.some((item) => item.total <= 0)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" /> {applying ? "Preparando prévia..." : "Usar valores no cadastro"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
