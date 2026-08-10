import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Building2, Calculator, CheckCircle2, ExternalLink, FileText, RefreshCw } from "lucide-react";
import type { DasMeiCalculation, MeiActivity } from "@shared/das-mei";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { CnpjDasImportPanel } from "@/pages/dividas/components/cnpj-das-import-panel";
import { CnpjDasPaymentGuidance } from "@/pages/dividas/components/cnpj-das-payment-guidance";
import type { DasImportedItem } from "@/pages/dividas/cnpj-das-import.utils";
import {
  listCnpjDas,
  previewCnpjDas,
  recalculateCnpjDas,
  saveCnpjDas,
  type CnpjDasCompanyView,
  type CnpjDasOverride,
} from "@/services/api/cnpj-das";
import { uploadTimelinePagamentoComprovante } from "@/services/api/pessoas";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const today = new Date().toISOString().slice(0, 10);
const currentMonth = today.slice(0, 7);
const MAX_PROOF_SIZE = 3 * 1024 * 1024;

function formatCurrency(value: number | string): string {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string): string {
  return value.split("-").reverse().join("/");
}

function formatMonth(value: string): string {
  const [year, month] = value.slice(0, 7).split("-");
  return `${month}/${year}`;
}

function formatCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
}

export function CnpjDasDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [tab, setTab] = useState("calcular");
  const [form, setForm] = useState({
    cnpj: "",
    nome: "",
    atividade: "comercio" as MeiActivity,
    competenciaInicial: `${new Date().getFullYear()}-01`,
    competenciaFinal: currentMonth,
    dataCalculo: today,
  });
  const [overrides, setOverrides] = useState<Record<string, CnpjDasOverride>>({});
  const [preview, setPreview] = useState<DasMeiCalculation[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [companies, setCompanies] = useState<CnpjDasCompanyView[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [dirtyAdjustments, setDirtyAdjustments] = useState(false);
  const [importedMonths, setImportedMonths] = useState<Set<string> | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);

  const totals = useMemo(() => preview.reduce((result, item) => {
    if (!selected.has(item.competencia.slice(0, 7))) return result;
    result.principal += item.principal;
    result.fine += item.fineAmount;
    result.interest += item.interestAmount;
    result.total += item.total;
    return result;
  }, { principal: 0, fine: 0, interest: 0, total: 0 }), [preview, selected]);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    try {
      setCompanies(await listCnpjDas());
    } catch (error) {
      toast({
        title: "Não foi possível carregar os CNPJs",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoadingCompanies(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadCompanies();
  }, [open]);

  const runPreview = async () => {
    setLoading(true);
    try {
      const result = await previewCnpjDas({
        atividade: form.atividade,
        competenciaInicial: form.competenciaInicial,
        competenciaFinal: form.competenciaFinal,
        dataCalculo: form.dataCalculo,
        overrides,
      });
      const visibleResult = importedMonths
        ? result.filter((item) => importedMonths.has(item.competencia.slice(0, 7)))
        : result;
      setPreview(visibleResult);
      setSelected(new Set(visibleResult.map((item) => item.competencia.slice(0, 7))));
      setDirtyAdjustments(false);
    } catch (error) {
      toast({
        title: "Não foi possível calcular o DAS",
        description: error instanceof Error ? error.message : "Confira os dados informados.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyImportedItems = async (items: DasImportedItem[]) => {
    if (form.cnpj.replace(/\D/g, "").length !== 14 || form.nome.trim().length < 2) {
      toast({
        title: "Informe o CNPJ e o nome do negócio",
        description: "Esses dados identificam a empresa dona dos DAS importados.",
        variant: "destructive",
      });
      return;
    }
    if (items.length === 0) return;

    const months = new Set(items.map((item) => item.competencia));
    const nextOverrides = items.reduce<Record<string, CnpjDasOverride>>((result, item) => {
      result[item.competencia] = {
        ...overrides[item.competencia],
        officialTotal: item.total,
      };
      return result;
    }, { ...overrides });
    const nextForm = {
      ...form,
      competenciaInicial: items[0].competencia,
      competenciaFinal: items[items.length - 1].competencia,
    };

    setLoading(true);
    try {
      const result = await previewCnpjDas({
        atividade: nextForm.atividade,
        competenciaInicial: nextForm.competenciaInicial,
        competenciaFinal: nextForm.competenciaFinal,
        dataCalculo: nextForm.dataCalculo,
        overrides: nextOverrides,
      });
      const importedPreview = result.filter((item) => months.has(item.competencia.slice(0, 7)));
      setForm(nextForm);
      setOverrides(nextOverrides);
      setImportedMonths(months);
      setPreview(importedPreview);
      setSelected(new Set(importedPreview.map((item) => item.competencia.slice(0, 7))));
      setDirtyAdjustments(false);
      setTab("calcular");
      toast({
        title: "Valores oficiais aplicados",
        description: `${importedPreview.length} competência(s) prontas para sua revisão final.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível preparar a importação",
        description: error instanceof Error ? error.message : "Revise os meses e valores.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateOverride = (month: string, patch: CnpjDasOverride) => {
    setOverrides((current) => ({ ...current, [month]: { ...current[month], ...patch } }));
    setDirtyAdjustments(true);
  };

  const handleSave = async () => {
    if (dirtyAdjustments) {
      toast({ title: "Recalcule os ajustes antes de salvar", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const result = await saveCnpjDas({
        ...form,
        overrides,
        competenciasSelecionadas: Array.from(selected),
      });
      let proofUploadFailed = false;
      if (proofFile && result.importacao) {
        try {
          await uploadTimelinePagamentoComprovante({
            sourceType: "cnpj_das_importacao",
            sourceId: result.importacao.id,
            file: proofFile,
          });
          setProofFile(null);
        } catch {
          proofUploadFailed = true;
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/dividas"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] }),
      ]);
      await loadCompanies();
      setTab("acompanhar");
      toast({
        title: proofUploadFailed ? "DAS salvo; PDF pendente" : "DAS incluído nas dívidas a pagar",
        description: proofUploadFailed
          ? "As dívidas foram salvas, mas o PDF não foi anexado. Você pode tentar novamente em Acompanhar CNPJs."
          : result.skippedPaid > 0
            ? `${result.skippedPaid} competência(s) já paga(s) foram preservadas.`
            : proofFile
              ? "As competências e o comprovante foram vinculados ao CNPJ."
              : "As competências selecionadas foram vinculadas ao CNPJ.",
        variant: proofUploadFailed ? "destructive" : "default",
      });
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRecalculateCompany = async (companyId: string) => {
    setLoadingCompanies(true);
    try {
      const result = await recalculateCnpjDas(companyId, today);
      await queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      await loadCompanies();
      toast({
        title: "Valores atualizados",
        description: `${result.updated} DAS aberto(s) recalculado(s) até hoje.`,
      });
    } catch (error) {
      toast({
        title: "Não foi possível atualizar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoadingCompanies(false);
    }
  };

  const handleUploadExistingProof = async (importId: string, file: File | null) => {
    if (!file) return;
    if ((file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) || file.size > MAX_PROOF_SIZE) {
      toast({
        title: "Comprovante inválido",
        description: "Selecione um PDF de até 3 MB.",
        variant: "destructive",
      });
      return;
    }
    setLoadingCompanies(true);
    try {
      await uploadTimelinePagamentoComprovante({
        sourceType: "cnpj_das_importacao",
        sourceId: importId,
        file,
      });
      await loadCompanies();
      toast({ title: "Comprovante anexado", description: "O PDF ficou vinculado ao lote de competências." });
    } catch (error) {
      toast({
        title: "Não foi possível anexar o PDF",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoadingCompanies(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-6xl flex-col overflow-hidden p-0 sm:w-full">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-5 w-5 text-primary" /> DAS do MEI por CNPJ
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Calcule, importe valores oficiais por texto ou imagem e leve o total para suas dívidas a pagar.
          </p>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-6 mt-4 grid w-[calc(100%-3rem)] grid-cols-3 sm:w-[640px]">
            <TabsTrigger value="calcular">Calcular e cadastrar</TabsTrigger>
            <TabsTrigger value="importar">Importar imagem/texto</TabsTrigger>
            <TabsTrigger value="acompanhar">Acompanhar CNPJs</TabsTrigger>
          </TabsList>

          <TabsContent value="calcular" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <Alert className="my-4 border-amber-500/30 bg-amber-500/5">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle>Estimativa para planejamento</AlertTitle>
              <AlertDescription>
                O cálculo usa a multa legal e a Selic oficial do Banco Central. Antes de pagar, confirme o valor final no PGMEI, que é a fonte oficial da guia.
              </AlertDescription>
            </Alert>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="das-cnpj">CNPJ</Label>
                <Input id="das-cnpj" value={form.cnpj} onChange={(event) => setForm({ ...form, cnpj: event.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="das-name">Nome do negócio</Label>
                <Input id="das-name" value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Ex.: Minha empresa MEI" />
              </div>
              <div className="space-y-2">
                <Label>Atividade tributada</Label>
                <Select value={form.atividade} onValueChange={(value) => setForm({ ...form, atividade: value as MeiActivity })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comercio">Comércio / indústria</SelectItem>
                    <SelectItem value="servico">Serviços</SelectItem>
                    <SelectItem value="comercio_servico">Comércio e serviços</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="das-start">Da competência</Label>
                <Input id="das-start" type="month" value={form.competenciaInicial} onChange={(event) => setForm({ ...form, competenciaInicial: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="das-end">Até a competência</Label>
                <Input id="das-end" type="month" value={form.competenciaFinal} onChange={(event) => setForm({ ...form, competenciaFinal: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="das-date">Data prevista para pagar</Label>
                <Input id="das-date" type="date" value={form.dataCalculo} onChange={(event) => setForm({ ...form, dataCalculo: event.target.value })} />
              </div>
              <div className="flex items-end md:col-span-2">
                <Button onClick={runPreview} disabled={loading} className="w-full md:w-auto">
                  <Calculator className="mr-2 h-4 w-4" /> {loading ? "Calculando..." : preview.length ? "Recalcular" : "Calcular DAS"}
                </Button>
              </div>
            </div>

            {preview.length > 0 && (
              <div className="mt-6 space-y-4">
                {importedMonths && (
                  <Alert className="border-emerald-500/30 bg-emerald-500/5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <AlertTitle>Totais oficiais importados</AlertTitle>
                    <AlertDescription>
                      Os valores abaixo serão gravados exatamente como revisados. Ao usar “Recalcular hoje” no acompanhamento, o sistema volta a atualizar multa e juros pela regra automática.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Principal</p><p className="font-semibold">{formatCurrency(totals.principal)}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Multa</p><p className="font-semibold text-amber-600">{formatCurrency(totals.fine)}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Juros</p><p className="font-semibold text-orange-600">{formatCurrency(totals.interest)}</p></div>
                  <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3"><p className="text-xs text-muted-foreground">Total estimado</p><p className="font-semibold text-red-600">{formatCurrency(totals.total)}</p></div>
                </div>

                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"><Checkbox checked={selected.size === preview.length} onCheckedChange={(checked) => setSelected(checked ? new Set(preview.map((item) => item.competencia.slice(0, 7))) : new Set())} /></TableHead>
                        <TableHead>Competência</TableHead>
                        <TableHead>Vencimento</TableHead>
                        <TableHead>Principal</TableHead>
                        <TableHead>Multa</TableHead>
                        <TableHead>Juros</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Benefício INSS</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((item) => {
                        const month = item.competencia.slice(0, 7);
                        return (
                          <TableRow key={month} data-state={selected.has(month) ? "selected" : undefined}>
                            <TableCell><Checkbox checked={selected.has(month)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current); if (checked) next.add(month); else next.delete(month); return next; })} /></TableCell>
                            <TableCell className="font-medium">{formatMonth(month)}</TableCell>
                            <TableCell><Input className="min-w-36" type="date" value={overrides[month]?.dueDate ?? item.dueDate} onChange={(event) => updateOverride(month, { dueDate: event.target.value })} /></TableCell>
                            <TableCell><Input className="min-w-28" type="number" min="0" step="0.01" value={overrides[month]?.principal ?? item.principal} onChange={(event) => updateOverride(month, { principal: Number(event.target.value) })} /></TableCell>
                            <TableCell className="text-amber-600">{formatCurrency(item.fineAmount)}</TableCell>
                            <TableCell className="text-orange-600">{formatCurrency(item.interestAmount)}</TableCell>
                            <TableCell className="font-semibold">
                              <div className="flex min-w-28 flex-col gap-1">
                                <span>{formatCurrency(item.total)}</span>
                                {item.officialTotalManual && <Badge variant="outline" className="w-fit border-emerald-500/30 text-emerald-700">Oficial importado</Badge>}
                              </div>
                            </TableCell>
                            <TableCell><Checkbox checked={overrides[month]?.beneficioInss ?? item.beneficioInss} onCheckedChange={(checked) => updateOverride(month, { beneficioInss: checked === true })} /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>{selected.size} competência(s) selecionada(s). Ajustes de principal e vencimento existem para exceções do PGMEI.</p>
                    {proofFile && <p className="flex items-center gap-1 text-emerald-700"><FileText className="h-4 w-4" />PDF opcional selecionado: {proofFile.name}</p>}
                  </div>
                  <div className="flex gap-2">
                    {dirtyAdjustments && <Button variant="outline" onClick={runPreview} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Recalcular ajustes</Button>}
                    <Button onClick={handleSave} disabled={saving || selected.size === 0 || dirtyAdjustments}>{saving ? "Salvando..." : "Incluir em dívidas a pagar"}</Button>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="importar" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <CnpjDasImportPanel
              form={{
                cnpj: form.cnpj,
                nome: form.nome,
                atividade: form.atividade,
                dataCalculo: form.dataCalculo,
              }}
              onFormChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
              onApply={handleApplyImportedItems}
              applying={loading}
              proofFile={proofFile}
              onProofFileChange={setProofFile}
            />
          </TabsContent>

          <TabsContent value="acompanhar" className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
            <div className="my-4 flex items-center justify-between">
              <div><h3 className="font-semibold">CNPJs cadastrados</h3><p className="text-sm text-muted-foreground">Os valores pagos não são reabertos ao recalcular.</p></div>
              <Button variant="outline" size="sm" onClick={loadCompanies} disabled={loadingCompanies}><RefreshCw className="mr-2 h-4 w-4" />Atualizar lista</Button>
            </div>
            {companies.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center text-muted-foreground">Nenhum CNPJ com DAS cadastrado.</div>
            ) : (
              <div className="space-y-4">
                {companies.map((company) => {
                  const openObligations = company.obligations.filter((item) => item.debtStatus !== "pago" && !item.debtDeletedAt);
                  const companyTotal = openObligations.reduce((sum, item) => sum + Number(item.total), 0);
                  const additions = openObligations.reduce((sum, item) => sum + Number(item.multaValor) + Number(item.jurosValor), 0);
                  return (
                    <div key={company.id} className="rounded-xl border p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{company.nome}</h4><Badge variant="outline">MEI</Badge></div>
                          <p className="text-sm text-muted-foreground">{formatCnpj(company.cnpj)} · {openObligations.length} DAS aberto(s)</p>
                        </div>
                        <div className="flex items-center gap-3 sm:text-right">
                          <div><p className="text-xs text-muted-foreground">Total atualizado</p><p className="font-semibold text-red-600">{formatCurrency(companyTotal)}</p></div>
                          <Button variant="outline" size="sm" onClick={() => handleRecalculateCompany(company.id)} disabled={loadingCompanies}><RefreshCw className="mr-2 h-4 w-4" />Recalcular hoje</Button>
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Valor original aberto</p><p className="font-medium">{formatCurrency(openObligations.reduce((sum, item) => sum + Number(item.principal), 0))}</p></div>
                        <div className="rounded-lg bg-amber-500/5 p-3"><p className="text-xs text-muted-foreground">Multas + juros</p><p className="font-medium text-amber-700">+ {formatCurrency(additions)}</p></div>
                        <div className="rounded-lg bg-primary/5 p-3"><p className="text-xs text-muted-foreground">Leitura simples</p><p className="text-sm">A dívida cresceu {formatCurrency(additions)} desde os valores originais.</p></div>
                      </div>
                      <CnpjDasPaymentGuidance obligations={company.obligations} />
                      {company.imports.length > 0 && (
                        <div className="mt-4 rounded-lg border bg-muted/20 p-3">
                          <p className="mb-2 text-sm font-medium">Lotes cadastrados e comprovantes</p>
                          <div className="space-y-2">
                            {company.imports.map((item) => (
                              <div key={item.id} className="flex flex-col gap-2 rounded-md bg-background px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="font-medium">{formatMonth(item.competenciaInicial)} a {formatMonth(item.competenciaFinal)}</p>
                                  <p className="text-xs text-muted-foreground">{item.quantidadeCompetencias} competência(s) · {formatCurrency(item.total)} · cadastrado em {formatDate(item.dataCalculo)}</p>
                                </div>
                                {item.comprovanteNome ? (
                                  <a
                                    href={`/api/pagamentos/cnpj_das_importacao/${item.id}/comprovante`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
                                  >
                                    <FileText className="h-4 w-4" />Abrir PDF<ExternalLink className="h-3 w-3" />
                                  </a>
                                ) : (
                                  <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 font-medium hover:bg-muted">
                                    <FileText className="h-4 w-4" />Anexar PDF
                                    <Input
                                      type="file"
                                      accept="application/pdf,.pdf"
                                      className="hidden"
                                      disabled={loadingCompanies}
                                      onChange={(event) => {
                                        void handleUploadExistingProof(item.id, event.target.files?.[0] ?? null);
                                        event.target.value = "";
                                      }}
                                    />
                                  </Label>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-4 space-y-2">
                        {company.obligations.map((item) => {
                          const first = item.history[0];
                          const last = item.history[item.history.length - 1];
                          const growth = first && last ? Number(last.total) - Number(first.total) : 0;
                          return (
                            <div key={item.id} className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex items-center gap-2">
                                {item.debtStatus === "pago" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
                                <span className="font-medium">{formatMonth(item.competencia)}</span>
                                <Badge variant={item.debtStatus === "pago" ? "secondary" : "outline"}>{item.debtStatus === "pago" ? "Pago" : "Em aberto"}</Badge>
                                {item.totalOficialManual && <Badge variant="outline" className="border-emerald-500/30 text-emerald-700">Valor oficial</Badge>}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                                <span>Venc. {formatDate(item.dataVencimento)}</span>
                                <span>Atualizado {formatDate(item.dataCalculo)}</span>
                                <span className="font-medium text-foreground">{formatCurrency(item.total)}</span>
                                {growth > 0 && <span className="text-amber-700">+{formatCurrency(growth)} desde o 1º cálculo</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
