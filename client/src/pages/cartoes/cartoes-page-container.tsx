import { useState, lazy, Suspense, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePremiumAccess } from "@/hooks/use-premium-access";
import { useLocation } from "wouter";
import {
  Plus, Trash2, Upload, ChevronRight, RefreshCw,
} from "lucide-react";
import { useUIPreferences } from "@/context/ui-preferences";
import { queryClient } from "@/lib/queryClient";
import type { Cartao, CompraCartao, ParcelaCompra, Servico } from "@shared/schema";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  detectItauInvoiceText,
  detectMercadoPagoInvoiceText,
  buildIgnoredDetails,
  countIgnoredRows,
  detectNubankInvoiceText,
  detectRecurringServiceCandidate,
  findVencimentoFatura,
  parseCsv,
  parseOfx,
  parsePdf,
  type ParseResult,
  type ParsedItem,
} from "@/pages/cartoes/import-parser";
import { extractPdfTextVariantsFromPdfBuffer, isExtractedPdfTextUsable } from "@/pages/cartoes/import-pdf-utils";
import { buildCompraAliasDraft } from "@/pages/cartoes/import-existing-purchase-match";
import { ImportFaturaDialog } from "@/pages/cartoes/components/import-fatura-dialog";
import { formatImportCardOptionLabel, suggestImportCardByText } from "@/pages/cartoes/import-card-matching";
import { useCartoes } from "@/hooks/useCartoes";
import { CartoesPageHeader } from "@/components/cartoes/CartoesPageHeader";
import { CartoesSummarySection } from "@/components/cartoes/CartoesSummarySection";
import { CartoesFilterBar } from "@/components/cartoes/CartoesFilterBar";
import { CartoesGrid } from "@/components/cartoes/CartoesGrid";
import { CartoesEmptyState } from "@/components/cartoes/CartoesEmptyState";
import { CartoesDialogs } from "@/components/cartoes/CartoesDialogs";
import { CartoesInsights, type CartaoInsightItem } from "@/components/cartoes/CartoesInsights";
import { CartaoFormDialog } from "@/components/cartoes/CartaoFormDialog";
import { EditarCompraCartaoDialog, NovaCompraCartaoDialog } from "@/components/cartoes/CompraCartaoDialog";
import { CartoesMobileTabs } from "@/components/cartoes/CartoesMobileTabs";
import { CartoesComprasGrid } from "@/components/cartoes/CartoesComprasGrid";
import { ParcelasTab } from "@/components/cartoes/ParcelasTab";
import {
  deleteFaturaCartaoMes,
  deleteFaturasMes,
  deleteCompraCartaoComEscopo,
  createCompraAlias,
  fetchCompraAliases,
  fetchImportLogs,
  type ImportConfirmResponse,
  type ImportLogEntry,
  deleteParcelaComprovante,
  getParcelaComprovanteDownloadUrl,
  previewImportCompras,
  reconcileImportedPurchase,
  type ParcelaComprovanteResumo,
  type DeleteCompraScope,
  type DeleteCompraResponse,
  type DeleteFaturaResponse,
  uploadParcelaComprovante,
} from "@/services/api/cartoes";
import { isParcelaComprometendoLimite } from "@/lib/card-limit-usage";
import {
  buildPlanLimitFriendlyMessage,
  parsePlanLimitError,
} from "@/lib/subscription-plan-limit";
import {
  buildPremiumFeatureFriendlyMessage,
  parsePremiumFeatureError,
} from "@/lib/subscription-premium-feature";
import {
  formatCartaoCurrency,
  getDaysUntilInvoice,
  getNextInvoiceDate,
  isParcelaVencida,
} from "@/pages/cartoes/cartoes.utils";

const IconPicker = lazy(() =>
  import("@/components/icon-picker").then((mod) => ({ default: mod.IconPicker })),
);

const DELETE_MODAL_TIMEOUT_MS = 20_000;
const IS_DEV = import.meta.env.DEV;
const IMPORT_FILE_MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB
const IMPORT_ALLOWED_EXTENSIONS = new Set(["csv", "ofx", "qfx", "txt", "pdf"]);
const IMPORT_PDF_DEBUG_MAX_LINES = 80;
const IMPORT_PDF_DEBUG_MAX_LINE_CHARS = 220;

const IMPORT_ALLOWED_MIME_BY_EXTENSION: Record<string, string[]> = {
  csv: ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain"],
  txt: ["text/plain"],
  ofx: ["application/ofx", "application/x-ofx", "application/octet-stream", "text/plain"],
  qfx: ["application/ofx", "application/x-ofx", "application/octet-stream", "text/plain"],
  pdf: ["application/pdf"],
};

type CartoesTab = "resumo" | "fatura" | "compras";
type CanonicalImportStatus = "novo" | "duplicata_exata" | "possivel_duplicata" | "invalido";

function normalizeImportDebugText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isImportPdfDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("debugImportPdf") === "1";
  } catch {
    return false;
  }
}

function clampImportDebugLine(line: string): string {
  if (line.length <= IMPORT_PDF_DEBUG_MAX_LINE_CHARS) return line;
  return `${line.slice(0, IMPORT_PDF_DEBUG_MAX_LINE_CHARS)}…`;
}

function toIndexedImportDebugLines(lines: string[]): string[] {
  const limited = lines.slice(0, IMPORT_PDF_DEBUG_MAX_LINES);
  const indexed = limited.map((line, index) => `${index + 1}. ${clampImportDebugLine(line)}`);
  if (lines.length > IMPORT_PDF_DEBUG_MAX_LINES) {
    indexed.push(`... +${lines.length - IMPORT_PDF_DEBUG_MAX_LINES} linha(s) ocultas`);
  }
  return indexed;
}

function extractItauDebugSectionLines(text: string): string[] {
  const lines = text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return [];

  const startIndex = lines.findIndex((line) => {
    const normalized = normalizeImportDebugText(line);
    return normalized.includes("LANCAMENTOS: COMPRAS E SAQUES")
      || normalized.includes("LANCAMENTOS COMPRAS E SAQUES");
  });

  if (startIndex < 0) {
    return lines.slice(0, 120);
  }

  const endIndex = lines.findIndex((line, index) => {
    if (index <= startIndex) return false;
    const normalized = normalizeImportDebugText(line);
    return normalized.startsWith("LANCAMENTOS NO CARTAO")
      || normalized.startsWith("TOTAL DOS LANCAMENTOS ATUAIS")
      || normalized.startsWith("COMPRAS PARCELADAS - PROXIMAS FATURAS")
      || normalized.startsWith("COMPRAS PARCELADAS PROXIMAS FATURAS")
      || normalized.startsWith("LIMITES DE CREDITO")
      || normalized.startsWith("ENCARGOS COBRADOS NESTA FATURA");
  });

  const finalEnd = endIndex > startIndex ? endIndex : Math.min(lines.length, startIndex + 180);
  return lines.slice(startIndex, finalEnd);
}

function logItauImportDebugSnapshot(debugData: {
  fileName: string;
  plainText: string;
  positionalText: string;
  mergedSignalText: string;
}): void {
  if (typeof console === "undefined") return;

  const plainSectionLines = extractItauDebugSectionLines(debugData.plainText);
  const positionalSectionLines = extractItauDebugSectionLines(debugData.positionalText);
  const mergedSectionLines = extractItauDebugSectionLines(debugData.mergedSignalText);

  console.groupCollapsed("[import-itau][debug] snapshot");
  console.info("file", debugData.fileName);
  console.info("plain.section.lines", toIndexedImportDebugLines(plainSectionLines));
  console.info("positional.section.lines", toIndexedImportDebugLines(positionalSectionLines));
  console.info("merged.section.lines", toIndexedImportDebugLines(mergedSectionLines));
  console.groupEnd();
}

function normalizeCartoesTab(value: string | null | undefined): CartoesTab {
  if (value === "fatura" || value === "compras" || value === "resumo") {
    return value;
  }
  if (value === "parcelas") {
    return "compras";
  }
  if (value === "limite") {
    return "resumo";
  }
  return "resumo";
}

function isImportItemStructurallyInvalid(item: ParsedItem): boolean {
  if (!item.descricao?.trim()) return true;
  if (!Number.isFinite(item.valor) || item.valor <= 0) return true;
  if (!Number.isFinite(item.valorParcela) || item.valorParcela <= 0) return true;
  if (!Number.isInteger(item.parcelas) || item.parcelas < 1 || item.parcelas > 360) return true;
  if (!Number.isInteger(item.parcelaAtual) || item.parcelaAtual < 1 || item.parcelaAtual > item.parcelas) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.dataCompra)) return true;
  return false;
}

function getImportItemEffectiveStatus(item: ParsedItem): CanonicalImportStatus {
  const hasDuplicate = Boolean(item.duplicateId || item.duplicata);
  if (isImportItemStructurallyInvalid(item)) return "invalido";

  if (item.status === "duplicata_exata" || item.status === "possivel_duplicata" || item.status === "novo") {
    return item.status;
  }
  if (item.status === "invalido") {
    return hasDuplicate ? "possivel_duplicata" : "novo";
  }
  return hasDuplicate ? "possivel_duplicata" : "novo";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
      });
  });
}

function tryParseApiErrorMessage(rawMessage: string): string | null {
  const marker = ":";
  const firstColon = rawMessage.indexOf(marker);
  if (firstColon <= 0) return null;
  const maybeJson = rawMessage.slice(firstColon + 1).trim();
  if (!maybeJson.startsWith("{")) return null;

  try {
    const parsed = JSON.parse(maybeJson) as { message?: unknown; error?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }
    if (typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error.trim();
    }
    return null;
  } catch {
    return null;
  }
}

function formatImportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getImportFileExtension(fileName: string): string {
  const normalized = fileName.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0 || dotIndex === normalized.length - 1) return "";
  return normalized.slice(dotIndex + 1);
}

function isImportMimeAllowed(extension: string, mimeType: string): boolean {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (!normalizedMime) return true;
  const allowed = IMPORT_ALLOWED_MIME_BY_EXTENSION[extension];
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(normalizedMime);
}

function isNubankCardLikeName(cardName: string): boolean {
  const normalized = cardName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  if (normalized.includes("NUBANK")) return true;
  return /\bNU\b/.test(normalized) && /\b(MASTERCARD|CREDITO|CARTAO)\b/.test(normalized);
}

function isItauCardLikeName(cardName: string): boolean {
  const normalized = cardName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  return normalized.includes("ITAU") || normalized.includes("ITAUCARD");
}

function isMercadoPagoCardLikeName(cardName: string): boolean {
  const normalized = cardName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return false;
  return normalized.includes("MERCADO PAGO") || normalized.includes("MERCADOPAGO") || normalized.includes("CARTAO MP");
}

function extractCardLast4FromName(cardName: string): string | null {
  const explicitFinal = cardName.match(/(?:final|ending)\s*(\d{4})/i);
  if (explicitFinal?.[1]) return explicitFinal[1];

  const masked = cardName.match(/\*{2,}\s*(\d{4})/);
  if (masked?.[1]) return masked[1];

  const allLast4 = cardName.match(/\b(\d{4})\b/g);
  if (allLast4 && allLast4.length > 0) {
    return allLast4[allLast4.length - 1] ?? null;
  }

  return null;
}

function listToHumanReadable(values: string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} e ${values[1]}`;
  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}

function normalizeServiceText(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findMatchingServiceForImportItem(item: ParsedItem, servicos: Servico[]): Servico | null {
  const provider = normalizeServiceText(item.recurringServiceCandidate?.matchedProvider);
  const descricao = normalizeServiceText(item.descricao);
  if (!provider && !descricao) return null;

  const expectedValue = Number(item.valorParcela) || 0;
  let best: { servico: Servico; score: number } | null = null;

  for (const servico of servicos) {
    const nome = normalizeServiceText(servico.nome);
    if (!nome) continue;

    const valueDiff = Math.abs((Number(servico.valorMensal) || 0) - expectedValue);
    const providerMatch = provider.length > 0 && (nome.includes(provider) || provider.includes(nome));
    const descricaoMatch = descricao.length > 0 && (nome.includes(descricao) || descricao.includes(nome));

    let score = 0;
    if (providerMatch) score += 4;
    if (descricaoMatch) score += 2;
    if (valueDiff <= 0.05) score += 2;
    else if (valueDiff <= 3) score += 1;

    if (score < 3) continue;
    if (!best || score > best.score) {
      best = { servico, score };
    }
  }

  return best?.servico ?? null;
}

function applyServiceSuggestionMetadata(items: ParsedItem[], servicos: Servico[]): ParsedItem[] {
  return items.map((item) => {
    const candidate = item.recurringServiceCandidate ?? detectRecurringServiceCandidate(item.descricao);
    if (!candidate.isServiceCandidate) {
      return {
        ...item,
        recurringServiceCandidate: candidate,
        serviceSuggestionAction: item.serviceSuggestionAction ?? "ignore",
        linkedServiceId: null,
        replaceExistingServiceLink: false,
        serviceSuggestionWarning: null,
      };
    }

    const matchedService = findMatchingServiceForImportItem(item, servicos);
    const hasPotentialDuplicate = Boolean(matchedService);
    const action = item.serviceSuggestionAction ?? (matchedService ? "link_existing" : "ignore");
    const linkedServiceId = action === "link_existing"
      ? (item.linkedServiceId ?? matchedService?.id ?? null)
      : null;

    return {
      ...item,
      recurringServiceCandidate: candidate,
      serviceSuggestionAction: action,
      linkedServiceId,
      replaceExistingServiceLink: action === "link_existing" ? item.replaceExistingServiceLink === true : false,
      serviceSuggestionWarning: hasPotentialDuplicate
        ? `Serviço parecido encontrado: ${matchedService?.nome}. Prefira vincular ao existente para evitar duplicidade.`
        : null,
    };
  });
}

function mergePreviewItemsWithLocalSignals(previewItems: ParsedItem[], parsedItems: ParsedItem[], servicos: Servico[]): ParsedItem[] {
  const parsedById = new Map(parsedItems.map((item) => [item.id, item]));
  const merged = previewItems.map((item) => {
    const local = parsedById.get(item.id);
    if (!local) return item;

    return {
      ...item,
      recurringServiceCandidate: local.recurringServiceCandidate ?? item.recurringServiceCandidate,
      serviceSuggestionAction: local.serviceSuggestionAction ?? item.serviceSuggestionAction ?? "ignore",
      linkedServiceId: local.linkedServiceId ?? item.linkedServiceId ?? null,
      replaceExistingServiceLink: local.replaceExistingServiceLink ?? item.replaceExistingServiceLink ?? false,
      createServiceSuggestion: local.createServiceSuggestion ?? item.createServiceSuggestion ?? null,
      serviceSuggestionWarning: local.serviceSuggestionWarning ?? item.serviceSuggestionWarning ?? null,
      cardLast4: local.cardLast4 ?? item.cardLast4 ?? null,
      invoiceIssuerDetected: local.invoiceIssuerDetected ?? item.invoiceIssuerDetected,
      parserUsed: local.parserUsed ?? item.parserUsed,
      duplicata: local.duplicata ?? item.duplicata,
    };
  });

  return applyServiceSuggestionMetadata(merged, servicos);
}

export default function CartoesPage() {
  const { toast } = useToast();
  const premiumAccess = usePremiumAccess();
  const { prefs } = useUIPreferences();
  const [location, setLocation] = useLocation();
  const smartImportLiberado = premiumAccess.hasFeature("smartImport");

  const [openCard, setOpenCard] = useState(false);
  const [openCompra, setOpenCompra] = useState(false);
  const [selectedCartao, setSelectedCartao] = useState<string>("");
  const [cardForm, setCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [compraForm, setCompraForm] = useState({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });

  const [editingCard, setEditingCard] = useState<Cartao | null>(null);
  const [editCardForm, setEditCardForm] = useState({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
  const [editCardIcone, setEditCardIcone] = useState<string | null>(null);
  const [newCardIcone, setNewCardIcone] = useState<string | null>(null);

  const [editingCompra, setEditingCompra] = useState<CompraCartao | null>(null);
  const [editCompraForm, setEditCompraForm] = useState({ descricao: "", valorTotal: "", parcelas: "", pessoaId: "", statusPessoa: "" });

  const [viewingCompra, setViewingCompra] = useState<CompraCartao | null>(null);
  const [editingParcelaId, setEditingParcelaId] = useState<string | null>(null);
  const [editingParcelaValor, setEditingParcelaValor] = useState("");
  const [editingParcelaData, setEditingParcelaData] = useState("");
  const [payingParcelaId, setPayingParcelaId] = useState<string | null>(null);
  const [payParcelaData, setPayParcelaData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [abaterSaldoParcelaId, setAbaterSaldoParcelaId] = useState<string | null>(null);
  const [abaterSaldoParcelaForm, setAbaterSaldoParcelaForm] = useState({
    valor: "",
    data: format(new Date(), "yyyy-MM-dd"),
    observacao: "",
  });

  const [openImport, setOpenImport] = useState(false);
  const [importCartaoId, setImportCartaoId] = useState<string>("");
  const [importCartaoHint, setImportCartaoHint] = useState("");
  const [importTexto, setImportTexto] = useState("");
  const [importItems, setImportItems] = useState<ParsedItem[]>([]);
  const [importTab, setImportTab] = useState<"texto" | "arquivo">("texto");
  const [importLoading, setImportLoading] = useState(false);
  const [importVencimento, setImportVencimento] = useState("");
  const [importEditingId, setImportEditingId] = useState<string | null>(null);
  const [importPreviewLogId, setImportPreviewLogId] = useState<string | null>(null);
  const [importSourceType, setImportSourceType] = useState<"texto" | "csv" | "ofx" | "qfx" | "pdf" | "manual">("manual");
  const [importSourceName, setImportSourceName] = useState("");
  const [importIssuerMismatchWarning, setImportIssuerMismatchWarning] = useState("");
  const [importIssuerMismatchMustAcknowledge, setImportIssuerMismatchMustAcknowledge] = useState(false);
  const [importIssuerMismatchAcknowledged, setImportIssuerMismatchAcknowledged] = useState(false);
  const [lastImportLogId, setLastImportLogId] = useState<string | null>(null);
  const [importConfirmResult, setImportConfirmResult] = useState<ImportConfirmResponse | null>(null);
  const [historyRollbackLogId, setHistoryRollbackLogId] = useState<string | null>(null);
  const [isReconcilingImport, setIsReconcilingImport] = useState(false);
  const [rememberingCompraAliasByItemId, setRememberingCompraAliasByItemId] = useState<Record<string, boolean>>({});
  const [savedCompraAliasByItemId, setSavedCompraAliasByItemId] = useState<Record<string, boolean>>({});
  const [comprasCartaoFocadoId, setComprasCartaoFocadoId] = useState<string | null>(null);
  const [cartoesTab, setCartoesTab] = useState<CartoesTab>(() => {
    if (typeof window === "undefined") return "resumo";
    const params = new URLSearchParams(window.location.search);
    return normalizeCartoesTab(params.get("tab"));
  });
  const [compraSearch, setCompraSearch] = useState("");
  const [importEditForm, setImportEditForm] = useState({
    descricao: "", valor: "", dataCompra: "", parcelas: "", parcelaAtual: "", vencimentoFatura: "",
  });
  const [openDeleteFaturaDialog, setOpenDeleteFaturaDialog] = useState(false);
  const [deleteFaturaScope, setDeleteFaturaScope] = useState<"cartao" | "todos">("cartao");
  const [deleteFaturaMes, setDeleteFaturaMes] = useState(format(new Date(), "yyyy-MM"));
  const [deleteFaturaCartaoId, setDeleteFaturaCartaoId] = useState("");
  const [deleteFaturaImpact, setDeleteFaturaImpact] = useState<DeleteFaturaResponse | null>(null);
  const [deleteFaturaImpactLoading, setDeleteFaturaImpactLoading] = useState(false);
  const [deleteFaturaImpactError, setDeleteFaturaImpactError] = useState<string | null>(null);

  const [openDeleteCompraDialog, setOpenDeleteCompraDialog] = useState(false);
  const [deleteCompraTarget, setDeleteCompraTarget] = useState<CompraCartao | null>(null);
  const [deleteCompraScope, setDeleteCompraScope] = useState<DeleteCompraScope>("all_parcelas");
  const [deleteCompraImpact, setDeleteCompraImpact] = useState<DeleteCompraResponse | null>(null);
  const [deleteCompraImpactLoading, setDeleteCompraImpactLoading] = useState(false);
  const [deleteCompraImpactError, setDeleteCompraImpactError] = useState<string | null>(null);
  const [deleteCompraSubmitting, setDeleteCompraSubmitting] = useState(false);
  const [parcelaSubmittingId, setParcelaSubmittingId] = useState<string | null>(null);
  const [comprovanteUploadParcelaId, setComprovanteUploadParcelaId] = useState<string | null>(null);
  const [comprovanteDeleteParcelaId, setComprovanteDeleteParcelaId] = useState<string | null>(null);
  const [parcelaComprovantesById, setParcelaComprovantesById] = useState<Record<string, ParcelaComprovanteResumo | null>>({});

  const {
    cartoes,
    compras,
    servicos,
    servicoPessoas,
    pessoas,
    pessoaSaldoMovimentacoes,
    parcelasCompraByUser,
    parcelasCompraData,
    isParcelasCompraLoading,
    isParcelasCompraError,
    parcelasCompraError,
    refetchParcelas,
    isLoading,
    getCardCompras,
    getCardTotal,
    getCardUsedLimit,
    getCardAvailableLimit,
    totalFaturas,
    totalAguardandoReembolso,
    createCardMutation,
    updateCardMutation,
    deleteCardMutation,
    createCompraMutation,
    updateCompraMutation,
    deleteCompraMutation,
    deleteFaturaCartaoMutation,
    deleteFaturasMesMutation,
    marcarReembolsoMutation,
    payParcelaMutation,
    payParcelaPessoaMutation,
    editParcelaMutation,
    abaterSaldoParcelaMutation,
    batchImportMutation,
    rollbackImportMutation,
  } = useCartoes(viewingCompra?.id);

  const {
    data: importLogs = [],
    isLoading: isImportLogsLoading,
  } = useQuery<ImportLogEntry[]>({
    queryKey: ["/api/imports/logs", "modal", 20],
    queryFn: () => fetchImportLogs(20),
    enabled: smartImportLiberado && openImport,
    staleTime: 30_000,
  });
  const {
    data: compraAliases = [],
    isLoading: isCompraAliasesLoading,
  } = useQuery({
    queryKey: ["/api/compra-aliases", "import", importCartaoId || "all"],
    queryFn: fetchCompraAliases,
    enabled: smartImportLiberado && openImport && importItems.length > 0,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const compraId = params.get("compraId");
    const cartaoId = params.get("cartaoId");
    if (!compraId && !cartaoId) return;

    if (cartaoId) {
      setSelectedCartao(cartaoId);
      const cardElement = document.querySelector(`[data-testid="card-cartao-${cartaoId}"]`) as HTMLElement | null;
      cardElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    if (!compraId) {
      params.delete("cartaoId");
      params.delete("origem");
      const nextPath = params.toString().length > 0 ? `/cartoes?${params.toString()}` : "/cartoes";
      if (location !== nextPath) {
        setLocation(nextPath);
      }
      return;
    }

    const compra = compras.find((item) => item.id === compraId);
    if (!compra) return;

    setViewingCompra(compra);
    if (cartaoId) {
      const cardElement = document.querySelector(`[data-testid="card-cartao-${cartaoId}"]`) as HTMLElement | null;
      cardElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    params.delete("compraId");
    params.delete("cartaoId");
    params.delete("origem");
    const nextPath = params.toString().length > 0 ? `/cartoes?${params.toString()}` : "/cartoes";
    if (location !== nextPath) {
      setLocation(nextPath);
    }
  }, [compras, location, setLocation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rawTab = params.get("tab");
    const normalizedTab = normalizeCartoesTab(rawTab);
    if (rawTab !== null && normalizedTab !== rawTab) {
      params.set("tab", normalizedTab);
      const nextPath = params.toString().length > 0 ? `/cartoes?${params.toString()}` : "/cartoes";
      if (location !== nextPath) {
        setLocation(nextPath);
      }
      setCartoesTab(normalizedTab);
    }
  }, [location, setLocation]);

  useEffect(() => {
    if (!openDeleteFaturaDialog) return;
    if (deleteFaturaScope === "cartao") {
      const fallbackCartaoId = selectedCartao || cartoes[0]?.id || "";
      if (!deleteFaturaCartaoId && fallbackCartaoId) {
        setDeleteFaturaCartaoId(fallbackCartaoId);
      }
    }
  }, [openDeleteFaturaDialog, deleteFaturaScope, deleteFaturaCartaoId, selectedCartao, cartoes]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!openDeleteFaturaDialog) return;
      if (!deleteFaturaMes) return;
      if (deleteFaturaScope === "cartao" && !deleteFaturaCartaoId) return;

      setDeleteFaturaImpactLoading(true);
      setDeleteFaturaImpactError(null);
      try {
        logDev("delete-fatura:preview:start", {
          scope: deleteFaturaScope,
          mes: deleteFaturaMes,
          cartaoId: deleteFaturaScope === "cartao" ? deleteFaturaCartaoId : undefined,
        });
        const response = await withTimeout(
          deleteFaturaScope === "cartao"
            ? deleteFaturaCartaoMes(deleteFaturaCartaoId, deleteFaturaMes, { dryRun: true })
            : deleteFaturasMes(deleteFaturaMes, { dryRun: true }),
          DELETE_MODAL_TIMEOUT_MS,
          "Tempo limite ao calcular impacto. Tente novamente.",
        );
        if (active) {
          setDeleteFaturaImpact(response);
          setDeleteFaturaImpactError(null);
        }
        logDev("delete-fatura:preview:success", {
          comprasRemovidas: response.impact.comprasRemovidas,
          parcelasRemovidas: response.impact.parcelasRemovidas,
          valorTotalRemovido: response.impact.valorTotalRemovido,
        });
      } catch (error) {
        if (active) {
          setDeleteFaturaImpact(null);
          const message = getErrorMessage(error);
          setDeleteFaturaImpactError(message);
          toast({
            title: "Erro ao calcular impacto",
            description: message,
            variant: "destructive",
          });
        }
        logDev("delete-fatura:preview:error", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (active) {
          setDeleteFaturaImpactLoading(false);
        }
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [
    openDeleteFaturaDialog,
    deleteFaturaScope,
    deleteFaturaMes,
    deleteFaturaCartaoId,
  ]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!openDeleteCompraDialog || !deleteCompraTarget) return;
      try {
        await loadDeleteCompraImpact(deleteCompraTarget, deleteCompraScope, { isActive: () => active });
      } catch {
        // Erro ja tratado dentro do calculo de impacto.
      }
      if (!active) {
        return;
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [
    openDeleteCompraDialog,
    deleteCompraTarget,
    deleteCompraScope,
  ]);
  useEffect(() => {
    const validIds = new Set(importItems.map((item) => item.id));
    setRememberingCompraAliasByItemId((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [itemId, isSaving] of Object.entries(current)) {
        if (validIds.has(itemId)) {
          next[itemId] = isSaving;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setSavedCompraAliasByItemId((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const [itemId, isSaved] of Object.entries(current)) {
        if (validIds.has(itemId)) {
          next[itemId] = isSaved;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [importItems]);
  const getErrorMessage = (error: unknown) => {
    const planLimitError = parsePlanLimitError(error);
    if (planLimitError) {
      return buildPlanLimitFriendlyMessage(planLimitError);
    }
    const premiumFeatureError = parsePremiumFeatureError(error);
    if (premiumFeatureError) {
      return buildPremiumFeatureFriendlyMessage(premiumFeatureError);
    }
    if (error instanceof Error) {
      return tryParseApiErrorMessage(error.message) ?? error.message;
    }
    return "Erro inesperado";
  };

  const logDev = (event: string, payload?: Record<string, unknown>) => {
    if (!IS_DEV) return;
    console.info("[cartoes][dev]", event, payload ?? {});
  };

  const showSmartImportPremiumToast = () => {
    toast({
      title: "Importação inteligente é Premium",
      description:
        "Faça upgrade para Premium para usar preview, confirmação e rollback de importação de faturas/extratos.",
    });
  };

  const openImportDialog = () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }
    if (cartoes.length === 0) {
      toast({
        title: "Cadastre um cartao antes de importar",
        description: "A importacao de fatura precisa de um cartao de destino.",
        variant: "destructive",
      });
      return;
    }
    setImportCartaoId("");
    setImportCartaoHint("");
    setOpenImport(true);
  };

  const getPessoaSaldoDisponivel = (pessoaId: string): number => {
    const { creditos, debitos } = pessoaSaldoMovimentacoes.reduce(
      (acc, mov) => {
        if (mov.pessoaId !== pessoaId) return acc;
        const valor = Number(mov.valor) || 0;
        if (mov.tipo === "credito") acc.creditos += valor;
        else acc.debitos += valor;
        return acc;
      },
      { creditos: 0, debitos: 0 },
    );
    return Math.max(0, Number((creditos - debitos).toFixed(2)));
  };

  const getParcelaSaldoAbatido = (parcelaId: string): number => {
    const total = pessoaSaldoMovimentacoes.reduce((sum, mov) => {
      if (mov.tipo !== "debito") return sum;
      if (mov.parcelaCompraId !== parcelaId) return sum;
      if ((mov.origem ?? "").toLowerCase() !== "abatimento_parcela_cartao") return sum;
      return sum + (Number(mov.valor) || 0);
    }, 0);
    return Number(total.toFixed(2));
  };

  const getParcelaSaldoPendente = (parcela: ParcelaCompra): number => {
    const valor = Number(parcela.valor) || 0;
    const abatido = getParcelaSaldoAbatido(parcela.id);
    return Math.max(0, Number((valor - abatido).toFixed(2)));
  };

  const compraSearchNormalized = compraSearch.trim().toLowerCase();
  const activeCartoesTab: CartoesTab = cartoesTab;

  const parcelaComprovanteMutation = useMutation({
    mutationFn: async ({ parcelaId, file }: { parcelaId: string; file: File }) => {
      const comprovante = await uploadParcelaComprovante(parcelaId, file);
      return { parcelaId, comprovante };
    },
    onMutate: ({ parcelaId }) => {
      setComprovanteUploadParcelaId(parcelaId);
    },
    onSuccess: async ({ parcelaId, comprovante }) => {
      setParcelaComprovantesById((prev) => ({
        ...prev,
        [parcelaId]: comprovante,
      }));
      toast({ title: "Comprovante anexado" });

      const keys: Array<ReadonlyArray<unknown>> = [
        ["/api/parcelas-compra"],
        ["/api/compras-cartao"],
        ["/api/cartoes"],
        ["/api/cartoes/resumo"],
        ["/api/dashboard/overview"],
        ["/api/financial/summary"],
        ["/api/financial/score"],
        ["/api/financial/insights"],
      ];

      if (viewingCompra?.id) {
        keys.push(["/api/parcelas-compra", viewingCompra.id]);
      }

      await Promise.all(
        keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      await refetchParcelas();
    },
    onError: (error) => {
      toast({
        title: "Erro ao anexar comprovante",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setComprovanteUploadParcelaId(null);
    },
  });

  const deleteParcelaComprovanteMutation = useMutation({
    mutationFn: async ({ parcelaId }: { parcelaId: string }) => {
      await deleteParcelaComprovante(parcelaId);
      return { parcelaId };
    },
    onMutate: ({ parcelaId }) => {
      setComprovanteDeleteParcelaId(parcelaId);
    },
    onSuccess: async ({ parcelaId }) => {
      setParcelaComprovantesById((prev) => ({
        ...prev,
        [parcelaId]: null,
      }));
      toast({ title: "Comprovante excluido" });

      const keys: Array<ReadonlyArray<unknown>> = [
        ["/api/parcelas-compra"],
        ["/api/compras-cartao"],
        ["/api/cartoes"],
        ["/api/cartoes/resumo"],
        ["/api/dashboard/overview"],
        ["/api/financial/summary"],
        ["/api/financial/score"],
        ["/api/financial/insights"],
      ];

      if (viewingCompra?.id) {
        keys.push(["/api/parcelas-compra", viewingCompra.id]);
      }

      await Promise.all(
        keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
      await refetchParcelas();
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir comprovante",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    },
    onSettled: () => {
      setComprovanteDeleteParcelaId(null);
    },
  });

  const getParcelaComprovante = (parcela: ParcelaCompra): ParcelaComprovanteResumo | null => {
    if (Object.prototype.hasOwnProperty.call(parcelaComprovantesById, parcela.id)) {
      return parcelaComprovantesById[parcela.id] ?? null;
    }

    const raw = parcela as unknown as Record<string, unknown>;
    const nome = typeof raw.comprovanteNome === "string" ? raw.comprovanteNome : null;
    const mimeType = typeof raw.comprovanteMimeType === "string" ? raw.comprovanteMimeType : null;
    const tamanhoRaw = raw.comprovanteTamanho;
    const tamanho = typeof tamanhoRaw === "number"
      ? tamanhoRaw
      : typeof tamanhoRaw === "string"
        ? Number(tamanhoRaw)
        : NaN;
    const enviadoEmRaw = raw.comprovanteEnviadoEm;
    const enviadoEm = typeof enviadoEmRaw === "string"
      ? enviadoEmRaw
      : enviadoEmRaw instanceof Date
        ? enviadoEmRaw.toISOString()
        : null;

    if (!nome || !mimeType || !Number.isFinite(tamanho)) {
      return null;
    }

    return {
      nome,
      mimeType,
      tamanho,
      enviadoEm,
      downloadUrl: getParcelaComprovanteDownloadUrl(parcela.id),
    };
  };

  const getFilteredCardCompras = (cartaoId: string) => {
    const card = cartoes.find((item) => item.id === cartaoId);
    return getCardCompras(cartaoId).filter((compra) => {
      if (!compraSearchNormalized) return true;
      const texto = [
        compra.descricao,
        card?.nome,
        compra.dataCompra,
        String(compra.valorParcela),
        String(compra.valorTotal),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return texto.includes(compraSearchNormalized);
    });
  };

  const formatMesExibicao = (mes: string) => {
    const [ano, mesNumero] = mes.split("-");
    const parsedMonth = Number(mesNumero);
    if (!ano || !Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) return mes;
    const data = new Date(Number(ano), parsedMonth - 1, 1);
    return format(data, "MMMM 'de' yyyy", { locale: ptBR }).replace(/^\w/, (char) => char.toUpperCase());
  };

  const retryDeleteFaturaImpact = async () => {
    if (!deleteFaturaMes) return;
    if (deleteFaturaScope === "cartao" && !deleteFaturaCartaoId) return;
    setDeleteFaturaImpact(null);
    setDeleteFaturaImpactError(null);
    setDeleteFaturaImpactLoading(true);
    try {
      const response = await withTimeout(
        deleteFaturaScope === "cartao"
          ? deleteFaturaCartaoMes(deleteFaturaCartaoId, deleteFaturaMes, { dryRun: true })
          : deleteFaturasMes(deleteFaturaMes, { dryRun: true }),
        DELETE_MODAL_TIMEOUT_MS,
        "Tempo limite ao calcular impacto. Tente novamente.",
      );
      setDeleteFaturaImpact(response);
      logDev("delete-fatura:preview:retry-success", {
        comprasRemovidas: response.impact.comprasRemovidas,
        parcelasRemovidas: response.impact.parcelasRemovidas,
      });
    } catch (error) {
      const message = getErrorMessage(error);
      setDeleteFaturaImpactError(message);
      toast({
        title: "Erro ao calcular impacto",
        description: message,
        variant: "destructive",
      });
      logDev("delete-fatura:preview:retry-error", {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setDeleteFaturaImpactLoading(false);
    }
  };

  const getCurrentParcelaIdForCompra = (compra: CompraCartao): string | null => {
    const rows = parcelasCompraByUser
      .filter((parcela) => parcela.compraCartaoId === compra.id)
      .sort((a, b) => a.numero - b.numero);
    if (rows.length === 0) return null;
    const byNumero = rows.find((parcela) => parcela.numero === compra.parcelaAtual);
    if (byNumero) return byNumero.id;
    const firstPendente = rows.find((parcela) => isParcelaComprometendoLimite(parcela.statusCartao));
    return firstPendente?.id ?? rows[0].id;
  };

  const loadDeleteCompraImpact = async (
    compra: CompraCartao,
    scope: DeleteCompraScope,
    options?: { isActive?: () => boolean },
  ) => {
    const canUpdate = () => (options?.isActive ? options.isActive() : true);
    const parcelaId = scope === "single_parcela"
      ? getCurrentParcelaIdForCompra(compra) ?? undefined
      : undefined;

    if (scope === "single_parcela" && !parcelaId) {
      if (!canUpdate()) return;
      setDeleteCompraImpact(null);
      setDeleteCompraImpactError("Nao foi possivel identificar a parcela alvo para esta compra.");
      return;
    }

    if (!canUpdate()) return;
    setDeleteCompraImpactLoading(true);
    setDeleteCompraImpactError(null);
    try {
      const response = await withTimeout(
        deleteCompraCartaoComEscopo(compra.id, {
          scope,
          parcelaId,
          dryRun: true,
        }),
        DELETE_MODAL_TIMEOUT_MS,
        "Tempo limite ao calcular impacto. Tente novamente.",
      );
      if (!canUpdate()) return;
      setDeleteCompraImpact(response);
    } catch (error) {
      if (!canUpdate()) return;
      setDeleteCompraImpact(null);
      const message = getErrorMessage(error);
      setDeleteCompraImpactError(message);
      toast({
        title: "Erro ao calcular impacto",
        description: message,
        variant: "destructive",
      });
    } finally {
      if (!canUpdate()) return;
      setDeleteCompraImpactLoading(false);
    }
  };

  const resetDeleteCompraDialog = () => {
    setOpenDeleteCompraDialog(false);
    setDeleteCompraTarget(null);
    setDeleteCompraScope("all_parcelas");
    setDeleteCompraImpact(null);
    setDeleteCompraImpactLoading(false);
    setDeleteCompraImpactError(null);
    setDeleteCompraSubmitting(false);
  };

  const openDeleteCompraConfirm = (compra: CompraCartao) => {
    setDeleteCompraTarget(compra);
    setDeleteCompraScope(Number(compra.parcelas) > 1 ? "single_parcela" : "all_parcelas");
    setDeleteCompraImpact(null);
    setDeleteCompraImpactError(null);
    setOpenDeleteCompraDialog(true);
  };

  const openAbaterSaldoParcelaDialog = (parcelaId: string, pessoaId: string) => {
    const parcela = parcelasCompraData.find((item) => item.id === parcelaId);
    if (!parcela) return;

    const saldoDisponivel = getPessoaSaldoDisponivel(pessoaId);
    const pendente = getParcelaSaldoPendente(parcela);
    const sugestao = Math.min(saldoDisponivel, pendente);

    setAbaterSaldoParcelaId(parcelaId);
    setAbaterSaldoParcelaForm({
      valor: sugestao > 0 ? sugestao.toFixed(2) : "",
      data: format(new Date(), "yyyy-MM-dd"),
      observacao: "",
    });
  };

  const resetImportState = () => {
    setOpenImport(false);
    setImportCartaoId("");
    setImportCartaoHint("");
    setImportItems([]);
    setImportTexto("");
    setImportVencimento("");
    setImportEditingId(null);
    setImportPreviewLogId(null);
    setImportSourceType("manual");
    setImportSourceName("");
    setImportIssuerMismatchWarning("");
    setImportIssuerMismatchMustAcknowledge(false);
    setImportIssuerMismatchAcknowledged(false);
    setImportConfirmResult(null);
    setHistoryRollbackLogId(null);
    setRememberingCompraAliasByItemId({});
    setSavedCompraAliasByItemId({});
  };

  const handleImportCartaoChange = (value: string) => {
    const changed = value !== importCartaoId;
    setImportCartaoId(value);
    setImportCartaoHint("");
    setImportIssuerMismatchWarning("");
    setImportIssuerMismatchMustAcknowledge(false);
    setImportIssuerMismatchAcknowledged(false);

    if (changed && (importItems.length > 0 || importPreviewLogId)) {
      setImportItems([]);
      setImportPreviewLogId(null);
      setImportEditingId(null);
      setImportSourceType("manual");
      setImportSourceName("");
      setImportIssuerMismatchWarning("");
      setImportIssuerMismatchMustAcknowledge(false);
      setImportIssuerMismatchAcknowledged(false);
      setImportConfirmResult(null);
      toast({
        title: "Cartao de destino alterado",
        description: "Gere o preview novamente para importar no cartao selecionado.",
      });
    }
  };

  const resolveImportCartaoId = (sourceText: string): string | null => {
    if (importCartaoId) return importCartaoId;

    const suggestion = suggestImportCardByText(sourceText, cartoes);
    if (suggestion.kind === "single_match") {
      setImportCartaoId(suggestion.card.id);
      setImportCartaoHint(
        `Cartao sugerido automaticamente: ${suggestion.issuerLabel} -> ${formatImportCardOptionLabel(suggestion.card)}`,
      );
      return suggestion.card.id;
    }

    if (suggestion.kind === "multiple_cards") {
      setImportCartaoHint(
        `Detectamos ${suggestion.issuerLabel}, mas existem ${suggestion.cards.length} cartoes compatíveis. Selecione manualmente.`,
      );
      return null;
    }

    if (suggestion.kind === "issuer_without_card") {
      setImportCartaoHint(
        `Detectamos ${suggestion.issuerLabel}, mas nao encontramos cartao cadastrado correspondente. Selecione manualmente.`,
      );
      return null;
    }

    if (suggestion.kind === "multiple_issuers") {
      setImportCartaoHint(
        `Detectamos mais de um emissor (${suggestion.issuerLabels.join(", ")}). Selecione o cartao manualmente.`,
      );
      return null;
    }

    setImportCartaoHint("Nao foi possivel detectar o emissor. Selecione manualmente o cartao de destino.");
    return null;
  };

  const applyPdfIssuerMismatchGuard = (
    sourceText: string,
    selectedCartaoId: string,
    parsedItems: ParsedItem[] = [],
  ) => {
    setImportIssuerMismatchWarning("");
    setImportIssuerMismatchMustAcknowledge(false);
    setImportIssuerMismatchAcknowledged(false);

    const selectedCartao = cartoes.find((item) => item.id === selectedCartaoId);
    if (!selectedCartao) return;

    const applyStrongMismatchReview = (warning: string) => {
      setImportItems((items) =>
        items.map((item) => {
          const isMercadoPagoItem = item.invoiceIssuerDetected === "mercado_pago"
            || item.parserUsed === "mercado_pago_textual_pdf"
            || /^\d{4}$/.test((item.cardLast4 ?? "").trim());
          if (!isMercadoPagoItem) return item;

          const issues = item.validationIssues ?? [];
          const nextIssues = issues.includes(warning) ? issues : [...issues, warning];
          const nextConfidenceScore = Math.max(
            0,
            Math.min(typeof item.confidenceScore === "number" ? item.confidenceScore : 80, 70),
          );

          return {
            ...item,
            reviewRequired: true,
            validationIssues: nextIssues,
            confidenceScore: nextConfidenceScore,
            confidenceLevel: nextConfidenceScore >= 65 ? "media" : "baixa",
          };
        }),
      );
    };

    const mercadoPagoLast4 = Array.from(new Set(
      parsedItems
        .map((item) => item.cardLast4?.trim() ?? "")
        .filter((value) => /^\d{4}$/.test(value)),
    ));
    const isMercadoPagoInvoice = detectMercadoPagoInvoiceText(sourceText) || mercadoPagoLast4.length > 0;

    if (isMercadoPagoInvoice) {
      const selectedLooksMercadoPago = isMercadoPagoCardLikeName(selectedCartao.nome);
      const selectedCardLast4 = extractCardLast4FromName(selectedCartao.nome);

      if (!selectedLooksMercadoPago) {
        const warning = `Esta fatura parece ser Mercado Pago, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`;
        setImportIssuerMismatchWarning(warning);
        setImportIssuerMismatchMustAcknowledge(true);
        applyStrongMismatchReview(warning);
        return;
      }

      if (
        selectedCardLast4
        && mercadoPagoLast4.length > 0
        && !mercadoPagoLast4.includes(selectedCardLast4)
      ) {
        const warning = `Esta fatura contém compras dos cartões finais ${listToHumanReadable(mercadoPagoLast4)}, mas o cartão selecionado não parece corresponder a esses finais.`;
        setImportIssuerMismatchWarning(warning);
        setImportIssuerMismatchMustAcknowledge(true);
        applyStrongMismatchReview(warning);
        return;
      }

      if (mercadoPagoLast4.length > 1) {
        setImportIssuerMismatchWarning(
          `Esta fatura contém compras de mais de um cartão Mercado Pago: finais ${listToHumanReadable(mercadoPagoLast4)}. Confira se deseja importar todos neste cartão.`,
        );
      }
      return;
    }

    const isNubankInvoice = detectNubankInvoiceText(sourceText);
    if (isNubankInvoice && !isNubankCardLikeName(selectedCartao.nome)) {
      setImportIssuerMismatchWarning(
        `Esta fatura parece ser Nubank, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    const isItauInvoice = detectItauInvoiceText(sourceText);
    if (isItauInvoice && !isItauCardLikeName(selectedCartao.nome)) {
      setImportIssuerMismatchWarning(
        `Esta fatura parece ser Itaú, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    const suggestion = suggestImportCardByText(sourceText, cartoes);

    if (suggestion.kind === "single_match" && suggestion.card.id !== selectedCartaoId) {
      setImportIssuerMismatchWarning(
        `Esta fatura parece ser ${suggestion.issuerLabel}, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    if (
      suggestion.kind === "multiple_cards" &&
      !suggestion.cards.some((card) => card.id === selectedCartaoId)
    ) {
      setImportIssuerMismatchWarning(
        `Detectamos ${suggestion.issuerLabel} no PDF, mas o cartão selecionado é ${selectedCartao.nome}. Revise antes de confirmar.`,
      );
      setImportIssuerMismatchMustAcknowledge(true);
      return;
    }

    if (suggestion.kind === "issuer_without_card") {
      setImportIssuerMismatchWarning(
        `Detectamos emissor ${suggestion.issuerLabel} no PDF. Confirme se o cartão selecionado (${selectedCartao.nome}) é o destino correto.`,
      );
    }
  };

  const handleCreateCard = () => {
    createCardMutation.mutate(
      {
        ...cardForm,
        iconeId: newCardIcone,
      },
      {
        onSuccess: () => {
          setOpenCard(false);
          setCardForm({ nome: "", limite: "", melhorDiaCompra: "", diaVencimento: "" });
          setNewCardIcone(null);
          toast({ title: "Cartao adicionado" });
        },
        onError: (error) => {
          const planLimitError = parsePlanLimitError(error);
          toast({
            title: planLimitError ? "Limite do plano Free atingido" : "Erro",
            description: getErrorMessage(error),
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleUpdateCard = () => {
    if (!editingCard) return;
    updateCardMutation.mutate(
      {
        id: editingCard.id,
        data: { ...editCardForm, iconeId: editCardIcone },
      },
      {
        onSuccess: () => {
          setEditingCard(null);
          toast({ title: "Cartao atualizado" });
        },
        onError: (error) => {
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
        },
      },
    );
  };

  const handleCreateCompra = () => {
    createCompraMutation.mutate(
      {
        cartaoId: selectedCartao,
        descricao: compraForm.descricao,
        valorTotal: compraForm.valorTotal,
        parcelas: compraForm.parcelas,
        dataCompra: compraForm.dataCompra,
        pessoaId: compraForm.pessoaId || null,
      },
      {
        onSuccess: () => {
          setOpenCompra(false);
          setCompraForm({ descricao: "", valorTotal: "", parcelas: "1", dataCompra: "", pessoaId: "" });
          toast({ title: "Compra registrada" });
        },
        onError: (error) => {
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
        },
      },
    );
  };

  const handleUpdateCompra = () => {
    if (!editingCompra) return;
    logDev("update-compra:start", {
      compraId: editingCompra.id,
      cartaoId: editingCompra.cartaoId,
      valorTotal: editCompraForm.valorTotal,
      parcelas: editCompraForm.parcelas,
      pessoaId: editCompraForm.pessoaId || null,
    });
    updateCompraMutation.mutate(
      {
        id: editingCompra.id,
        data: editCompraForm,
      },
      {
        onSuccess: () => {
          setEditingCompra(null);
          toast({ title: "Compra atualizada" });
          logDev("update-compra:success", { compraId: editingCompra.id });
        },
        onError: (error) => {
          toast({ title: "Erro", description: getErrorMessage(error), variant: "destructive" });
          logDev("update-compra:error", {
            compraId: editingCompra.id,
            message: error instanceof Error ? error.message : String(error),
          });
        },
      },
    );
  };

  const handleMarcarReembolso = (id: string, pago: boolean) => {
    marcarReembolsoMutation.mutate(
      { id, pago },
      {
        onSuccess: () => {
          toast({ title: "Status de reembolso atualizado" });
        },
      },
    );
  };

  const handleDeleteCard = (id: string) => {
    deleteCardMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: "Cartao removido" });
      },
    });
  };

  const handleConfirmDeleteFatura = () => {
    if (!deleteFaturaMes) {
      toast({ title: "Selecione o mês da fatura", variant: "destructive" });
      return;
    }
    if (deleteFaturaScope === "cartao" && !deleteFaturaCartaoId) {
      toast({ title: "Selecione o cartão", variant: "destructive" });
      return;
    }

    logDev("delete-fatura:confirm:start", {
      scope: deleteFaturaScope,
      mes: deleteFaturaMes,
      cartaoId: deleteFaturaScope === "cartao" ? deleteFaturaCartaoId : undefined,
    });

    const mutation = deleteFaturaScope === "cartao"
      ? deleteFaturaCartaoMutation.mutateAsync({
        cartaoId: deleteFaturaCartaoId,
        mes: deleteFaturaMes,
      })
      : deleteFaturasMesMutation.mutateAsync({ mes: deleteFaturaMes });

    void withTimeout(
      mutation,
      DELETE_MODAL_TIMEOUT_MS,
      "Tempo limite ao excluir fatura. Tente novamente.",
    ).then((response) => {
      setOpenDeleteFaturaDialog(false);
      setDeleteFaturaImpact(null);
      setDeleteFaturaImpactError(null);
      toast({
        title: "Fatura excluída com sucesso",
        description: `${response.impact.comprasRemovidas} compra(s) e ${response.impact.parcelasRemovidas} parcela(s) removidas.`,
      });
      logDev("delete-fatura:confirm:success", {
        comprasRemovidas: response.impact.comprasRemovidas,
        parcelasRemovidas: response.impact.parcelasRemovidas,
        valorTotalRemovido: response.impact.valorTotalRemovido,
      });
    }).catch((error) => {
      toast({
        title: "Erro ao excluir fatura",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      logDev("delete-fatura:confirm:error", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
  };

  const handleConfirmDeleteCompra = () => {
    if (!deleteCompraTarget) return;
    const parcelaId = deleteCompraScope === "single_parcela"
      ? getCurrentParcelaIdForCompra(deleteCompraTarget) ?? undefined
      : undefined;

    if (deleteCompraScope === "single_parcela" && !parcelaId) {
      toast({
        title: "Não foi possível localizar a parcela",
        description: "Abra as parcelas da compra para sincronizar e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    setDeleteCompraSubmitting(true);
    void withTimeout(
      deleteCompraMutation.mutateAsync({
        compraId: deleteCompraTarget.id,
        scope: deleteCompraScope,
        parcelaId,
      }),
      DELETE_MODAL_TIMEOUT_MS,
      "Tempo limite ao excluir compra/parcela. Tente novamente.",
    ).then(() => {
      const scopeLabel = deleteCompraScope === "single_parcela"
        ? "Parcela removida"
        : "Compra removida";
      toast({ title: scopeLabel });
      resetDeleteCompraDialog();
    }).catch((error) => {
      toast({
        title: "Erro ao excluir",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }).finally(() => {
      setDeleteCompraSubmitting(false);
    });
  };

  const handlePayParcela = (id: string, pago: boolean, dataPagamento?: string) => {
    setParcelaSubmittingId(id);
    logDev("pay-parcela:start", { parcelaId: id, pago, dataPagamento: dataPagamento ?? null });
    payParcelaMutation.mutate(
      { id, pago, dataPagamento },
      {
        onSuccess: () => {
          setPayingParcelaId(null);
          toast({ title: "Status da parcela atualizado" });
          logDev("pay-parcela:success", { parcelaId: id, pago });
        },
        onError: (error) => {
          toast({ title: "Erro ao atualizar parcela", description: getErrorMessage(error), variant: "destructive" });
          logDev("pay-parcela:error", {
            parcelaId: id,
            pago,
            message: error instanceof Error ? error.message : String(error),
          });
        },
        onSettled: () => {
          setParcelaSubmittingId((current) => (current === id ? null : current));
        },
      },
    );
  };

  const handlePayParcelaPessoa = (id: string, pago: boolean) => {
    payParcelaPessoaMutation.mutate(
      { id, pago },
      {
        onSuccess: () => {
          toast({ title: "Reembolso atualizado" });
        },
      },
    );
  };

  const handleEditParcela = (id: string) => {
    editParcelaMutation.mutate(
      { id, valor: editingParcelaValor, dataVencimento: editingParcelaData },
      {
        onSuccess: () => {
          setEditingParcelaId(null);
          toast({ title: "Parcela atualizada" });
        },
      },
    );
  };

  const handleConfirmImport = async () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    const cartaoId = importCartaoId;
    if (!cartaoId) {
      toast({ title: "Selecione um cartao para importar", variant: "destructive" });
      return;
    }
    if (!importPreviewLogId) {
      toast({ title: "Gere o preview antes de confirmar a importacao", variant: "destructive" });
      return;
    }

    if (importIssuerMismatchMustAcknowledge && !importIssuerMismatchAcknowledged) {
      toast({
        title: "Confirme o alerta de emissor antes de importar",
        description: "Marque que está ciente do cartão de destino para continuar.",
        variant: "destructive",
      });
      return;
    }

    const itemsForConfirm = importItems.map((item) => {
      if (item.reconcileAction !== "replace_existing") return item;
      return {
        ...item,
        action: "skip" as const,
        forceImport: false,
        serviceSuggestionAction: "ignore" as const,
        linkedServiceId: null,
        replaceExistingServiceLink: false,
        serviceAction: { type: "none" as const },
      };
    });
    const reconcileItems = itemsForConfirm.filter((item) => item.reconcileAction === "replace_existing");

    const reconcileItemsMissingTarget = reconcileItems.filter((item) => !item.reconcileExistingCompraCartaoId);
    if (reconcileItemsMissingTarget.length > 0) {
      toast({
        title: "Reconciliação incompleta",
        description: "Há itens para vincular/substituir sem compra existente selecionada.",
        variant: "destructive",
      });
      return;
    }

    const invalidSelectedItems = itemsForConfirm.filter((item) => (
      item.action === "import" && getImportItemEffectiveStatus(item) === "invalido"
    ));
    if (invalidSelectedItems.length > 0) {
      toast({
        title: "Itens inválidos não podem ser importados",
        description: "Revise os itens marcados como inválidos antes de confirmar.",
        variant: "destructive",
      });
      return;
    }

    const duplicateExactWithoutForce = itemsForConfirm.filter((item) => (
      item.action === "import"
      && getImportItemEffectiveStatus(item) === "duplicata_exata"
      && item.forceImport !== true
    ));
    if (duplicateExactWithoutForce.length > 0) {
      toast({
        title: "Duplicata exata exige confirmação explícita",
        description: "Marque a opção de forçar importação nos itens de duplicata exata.",
        variant: "destructive",
      });
      return;
    }

    const reconcileInvalidItems = reconcileItems.filter((item) => getImportItemEffectiveStatus(item) === "invalido");
    if (reconcileInvalidItems.length > 0) {
      toast({
        title: "Itens inválidos não podem ser reconciliados",
        description: "Revise os itens com vínculo/substituição antes de confirmar.",
        variant: "destructive",
      });
      return;
    }

    const reconcileDuplicateExactWithoutForce = reconcileItems.filter((item) => (
      getImportItemEffectiveStatus(item) === "duplicata_exata" && item.forceImport !== true
    ));
    if (reconcileDuplicateExactWithoutForce.length > 0) {
      toast({
        title: "Duplicata exata exige confirmação explícita",
        description: "Marque a opção de forçar importação nos itens de duplicata exata antes de reconciliar.",
        variant: "destructive",
      });
      return;
    }

    const reconcileMissingValueConfirmation = reconcileItems.filter((item) => {
      const existingCompraId = item.reconcileExistingCompraCartaoId;
      if (!existingCompraId) return true;
      const existingCompra = compras.find((compra) => compra.id === existingCompraId);
      if (!existingCompra) return true;
      const existingValorParcela = Number(existingCompra.valorParcela) || 0;
      const existingValorTotal = Number(existingCompra.valorTotal) || 0;
      const valueChanged = Math.abs(existingValorParcela - item.valorParcela) > 0.01
        || Math.abs(existingValorTotal - item.valor) > 0.01;
      if (!valueChanged) return false;
      return item.reconcileConfirmValueChange !== true;
    });
    if (reconcileMissingValueConfirmation.length > 0) {
      toast({
        title: "Confirme alteração de valor",
        description: "Há itens de vincular/substituir com diferença de valor sem confirmação explícita.",
        variant: "destructive",
      });
      return;
    }

    const missingLinkedServiceItems = itemsForConfirm.filter((item) => (
      item.action === "import"
      && item.serviceSuggestionAction === "link_existing"
      && !item.linkedServiceId
    ));
    if (missingLinkedServiceItems.length > 0) {
      toast({
        title: "Selecione o serviço para concluir o vínculo",
        description: "Há itens marcados para vincular serviço existente sem serviço selecionado.",
        variant: "destructive",
      });
      return;
    }

    const replaceNotConfirmedItems = itemsForConfirm.filter((item) => {
      if (item.action !== "import" || item.serviceSuggestionAction !== "link_existing" || !item.linkedServiceId) {
        return false;
      }
      const selectedService = servicos.find((servico) => servico.id === item.linkedServiceId);
      if (!selectedService?.compraCartaoId) return false;
      return item.replaceExistingServiceLink !== true;
    });
    if (replaceNotConfirmedItems.length > 0) {
      toast({
        title: "Confirme a substituição do vínculo",
        description: "Há serviços já vinculados a outra compra. Marque que deseja substituir o vínculo para continuar.",
        variant: "destructive",
      });
      return;
    }

    let reconcileAppliedCount = 0;
    try {
      if (reconcileItems.length > 0) {
        setIsReconcilingImport(true);
        for (const item of reconcileItems) {
          const existingCompraId = item.reconcileExistingCompraCartaoId;
          if (!existingCompraId) {
            throw new Error("Compra existente não encontrada para reconciliação.");
          }
          const existingCompra = compras.find((compra) => compra.id === existingCompraId);
          if (!existingCompra) {
            throw new Error("Compra existente não encontrada para reconciliação.");
          }
          const existingValorParcela = Number(existingCompra.valorParcela) || 0;
          const existingValorTotal = Number(existingCompra.valorTotal) || 0;
          const valueChanged = Math.abs(existingValorParcela - item.valorParcela) > 0.01
            || Math.abs(existingValorTotal - item.valor) > 0.01;

          await reconcileImportedPurchase({
            existingCompraCartaoId: existingCompraId,
            importItem: item,
            confirmValueChange: valueChanged ? item.reconcileConfirmValueChange === true : false,
            updateDescription: true,
          });
          reconcileAppliedCount += 1;
        }
        toast({
          title: "Reconciliação aplicada",
          description: `${reconcileItems.length} compra(s) existente(s) foram atualizadas sem criar duplicidade.`,
        });
      }

      const result = await batchImportMutation.mutateAsync({
        items: itemsForConfirm,
        cartaoId,
        previewLogId: importPreviewLogId,
        sourceType: importSourceType,
        sourceName: importSourceName || undefined,
      });

      const resultSummary = result.summary ?? {
        totalProcessed: result.createdCount + result.skippedCount,
        createdCount: result.createdCount,
        ignoredCount: result.skippedCount,
        blockedExactDuplicates: 0,
        forcedExactDuplicates: 0,
        invalidCount: 0,
        errorCount: 0,
        servicesCreatedCount: 0,
        servicesSkippedCount: 0,
        servicesLinkedCount: 0,
        servicesLinkSkippedCount: 0,
      };

      setLastImportLogId(result.importLogId);
      setImportConfirmResult({
        ...result,
        summary: {
          ...resultSummary,
          reconciledExistingCount: reconcileItems.length,
        },
      });
      setImportPreviewLogId(null);
      setImportItems([]);
      setImportTexto("");
      setImportVencimento("");
      setImportEditingId(null);
      setImportSourceType("manual");
      setImportSourceName("");
      setImportCartaoHint("");
      setRememberingCompraAliasByItemId({});
      setSavedCompraAliasByItemId({});
    } catch (error) {
      if (reconcileAppliedCount > 0) {
        void queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/cartoes/resumo"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      }
      toast({ title: "Erro na importacao", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setIsReconcilingImport(false);
    }
  };

  const handleRememberCompraAlias = async (
    params: { item: ParsedItem; existingCompra: CompraCartao },
  ): Promise<void> => {
    const { item, existingCompra } = params;
    const itemId = item.id;
    setRememberingCompraAliasByItemId((current) => ({ ...current, [itemId]: true }));

    try {
      const aliasDraft = buildCompraAliasDraft(item, existingCompra);
      if (!aliasDraft.compraCartaoId || !aliasDraft.nomeImportado) {
        throw new Error("Dados da compra existente incompletos.");
      }
      if (IS_DEV) {
        logDev("compra-alias:payload:sanitized", {
          compraCartaoId: aliasDraft.compraCartaoId,
          hasCartaoId: Boolean(aliasDraft.cartaoId),
          issuer: aliasDraft.issuer,
          parserUsed: aliasDraft.parserUsed,
          hasCardLast4: Boolean(aliasDraft.cardLast4),
          hasValorParcela: aliasDraft.valorParcela != null,
          hasTotalParcelas: aliasDraft.totalParcelas != null,
        });
      }
      const response = await createCompraAlias(aliasDraft);

      setImportItems((currentItems) => currentItems.map((current) => {
        if (current.id !== itemId) return current;
        return {
          ...current,
          action: "skip",
          forceImport: false,
          reconcileAction: "none",
          reconcileExistingCompraCartaoId: existingCompra.id,
          reconcileConfirmValueChange: false,
          serviceSuggestionAction: "ignore",
          linkedServiceId: null,
          replaceExistingServiceLink: false,
        };
      }));
      setSavedCompraAliasByItemId((current) => ({ ...current, [itemId]: true }));
      toast({
        title: response.reusedExisting
          ? "Equivalência já existente"
          : "Equivalência salva",
        description: "Equivalência salva. Este item foi marcado como Ignorar para evitar duplicidade.",
      });
    } catch (error) {
      const message = getErrorMessage(error);
      const isValidationError = /obrigatorio|inválid|incomplet|cart[aã]o inválido|não correspondem/i.test(message);
      toast({
        title: "Não foi possível salvar equivalência",
        description: isValidationError
          ? "Não foi possível salvar: dados da compra existente incompletos."
          : message,
        variant: "destructive",
      });
    } finally {
      setRememberingCompraAliasByItemId((current) => ({ ...current, [itemId]: false }));
    }
  };

  const requestRollbackConfirmation = (): boolean => {
    if (typeof window === "undefined") return true;
    return window.confirm(
      "Deseja desfazer esta importação? Compras do lote e vínculos de serviço associados poderão ser revertidos com segurança.",
    );
  };

  const handleRollbackImportById = (importLogId: string, options?: { requireConfirm?: boolean }) => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }
    const shouldConfirm = options?.requireConfirm !== false;
    if (shouldConfirm && !requestRollbackConfirmation()) {
      return;
    }

    setHistoryRollbackLogId(importLogId);

    rollbackImportMutation.mutate(importLogId, {
      onSuccess: (result) => {
        if (lastImportLogId === importLogId) {
          setLastImportLogId(null);
        }
        setImportConfirmResult((current) => (
          current?.importLogId === importLogId ? null : current
        ));
        const servicesRemoved = result.servicesRemovedCount ?? 0;
        const servicesUnlinked = result.servicesUnlinkedCount ?? 0;
        const servicesRestored = result.servicesRestoredCount ?? 0;
        const warnings = result.serviceRollbackWarnings ?? [];
        toast({
          title: "Importação desfeita com sucesso.",
          description: [
            `${result.deletedCount} compra(s) removida(s) do lote ${result.importLogId.slice(0, 8)}.`,
            `Serviços removidos: ${servicesRemoved}.`,
            `Serviços desvinculados: ${servicesUnlinked}.`,
            `Vínculos restaurados: ${servicesRestored}.`,
          ].join(" "),
        });
        if (warnings.length > 0) {
          toast({
            title: "Rollback concluído com avisos",
            description: "Alguns vínculos de serviço não foram alterados automaticamente por segurança.",
            variant: "default",
          });
        }
      },
      onError: (error) => {
        toast({
          title: "Não foi possível desfazer a importação",
          description: getErrorMessage(error),
          variant: "destructive",
        });
      },
      onSettled: () => {
        setHistoryRollbackLogId((current) => (current === importLogId ? null : current));
      },
    });
  };

  const handleRollbackLastImport = () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    if (!lastImportLogId) return;

    handleRollbackImportById(lastImportLogId);
  };

  const handleParseTexto = async () => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    if (!importTexto.trim()) {
      toast({ title: "Cole ou escreva o texto da fatura", variant: "destructive" });
      return;
    }

    const cartaoId = resolveImportCartaoId(importTexto);
    if (!cartaoId) {
      toast({ title: "Selecione um cartao para importar", variant: "destructive" });
      return;
    }

      setImportLoading(true);
      setImportConfirmResult(null);
      try {
      const result = parseCsv(importTexto, compras, cartaoId, {
        referenceBillingDate: importVencimento || undefined,
      });
      const venc = findVencimentoFatura(importTexto);
      if (venc) setImportVencimento(venc);

      const ignoredDetails = buildIgnoredDetails(result.stats);
      const hasIgnoredRows = countIgnoredRows(result.stats) > 0;
      if (result.items.length === 0) {
        toast({
          title: "Nenhuma compra detectada. Verifique o formato do texto.",
          description: ignoredDetails,
          variant: "destructive",
        });
        setImportItems([]);
        setImportPreviewLogId(null);
        return;
      }

      const preview = await previewImportCompras({
        cartaoId,
        sourceType: "texto",
        sourceName: "texto-livre",
        items: result.items,
      });

      const mergedItems = mergePreviewItemsWithLocalSignals(preview.items, result.items, servicos);

      setImportItems(mergedItems);
      setImportEditingId(null);
      setImportPreviewLogId(preview.importLogId);
      setImportSourceType("texto");
      setImportSourceName("texto-livre");
      setImportIssuerMismatchWarning("");
      setImportIssuerMismatchMustAcknowledge(false);
      setImportIssuerMismatchAcknowledged(false);

      toast({
        title: `${preview.summary.importItems} item(ns) pronto(s) para importar`,
        description:
          `Confianca media ${Math.round(preview.summary.averageConfidence)}%. ` +
          `${preview.summary.reviewItems} item(ns) requer(em) revisao.` +
          (hasIgnoredRows && ignoredDetails ? ` ${ignoredDetails}` : ""),
      });
    } catch (error) {
      toast({
        title: "Erro ao gerar preview da importacao",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      setImportPreviewLogId(null);
    } finally {
      setImportLoading(false);
    }
  };

  const applyImportEdit = () => {
    if (!importEditingId) return;
    const p = Math.max(1, parseInt(importEditForm.parcelas) || 1);
    const pa = Math.min(Math.max(1, parseInt(importEditForm.parcelaAtual) || 1), p);
    const vp = parseFloat(importEditForm.valor) || 0; // valor da parcela
    const vt = Number((vp * p).toFixed(2)); // valorTotal = parcela × total
    const nextItems = importItems.map((item) => {
      if (item.id !== importEditingId) return item;

      const nextItem: ParsedItem = {
        ...item,
        descricao: importEditForm.descricao || item.descricao,
        valor: vp > 0 ? vt : item.valor,
        valorParcela: vp > 0 ? vp : item.valorParcela,
        parcelas: p,
        parcelaAtual: pa,
        parcelasRestantes: Math.max(p - pa + 1, 0),
        dataCompra: importEditForm.dataCompra || item.dataCompra,
        vencimentoFatura: importEditForm.vencimentoFatura || null,
      };
      const nextStatus = getImportItemEffectiveStatus(nextItem);
      const validationIssues = isImportItemStructurallyInvalid(nextItem)
        ? ["Item requer revisão após edição."]
        : [];
      const canImport = nextStatus !== "invalido";

      const recurringServiceCandidate = detectRecurringServiceCandidate(nextItem.descricao);
      const createServiceSuggestion = recurringServiceCandidate.isServiceCandidate
        ? {
          nome: recurringServiceCandidate.matchedProvider ?? nextItem.descricao,
          valorMensal: nextItem.valorParcela,
          dataCobranca: Number((nextItem.vencimentoFatura ?? nextItem.dataCompra).slice(-2)) || 1,
          categoria: recurringServiceCandidate.categorySuggestion ?? "outro",
        }
        : null;

      return {
        ...nextItem,
        status: nextStatus,
        canImport,
        reviewRequired: nextStatus !== "novo",
        validationIssues,
        forceImport: nextStatus === "duplicata_exata" ? (nextItem.forceImport === true) : false,
        action: canImport ? nextItem.action : "skip",
        recurringServiceCandidate,
        createServiceSuggestion,
        serviceSuggestionAction: recurringServiceCandidate.isServiceCandidate
          ? (item.serviceSuggestionAction ?? "ignore")
          : "ignore",
        linkedServiceId: recurringServiceCandidate.isServiceCandidate ? item.linkedServiceId ?? null : null,
        replaceExistingServiceLink: recurringServiceCandidate.isServiceCandidate
          ? item.replaceExistingServiceLink === true
          : false,
        serviceSuggestionWarning: null,
      };
    });
    setImportItems(applyServiceSuggestionMetadata(nextItems, servicos));
    setImportEditingId(null);
  };

  const applyVencimentoToAll = () => {
    if (!importVencimento) return;
    setImportItems(importItems.map((item) => ({ ...item, vencimentoFatura: importVencimento })));
  };

  const handleFileUpload = async (file: File) => {
    if (!smartImportLiberado) {
      showSmartImportPremiumToast();
      return;
    }

    const extension = getImportFileExtension(file.name);
    if (!extension || !IMPORT_ALLOWED_EXTENSIONS.has(extension)) {
      toast({
        title: "Arquivo não suportado",
        description: "Use arquivos .csv, .ofx, .qfx, .txt ou .pdf (texto).",
        variant: "destructive",
      });
      return;
    }

    if (file.size <= 0) {
      toast({
        title: "Arquivo vazio",
        description: "Selecione um arquivo com conteúdo para continuar.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > IMPORT_FILE_MAX_SIZE_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: `Limite de ${formatImportFileSize(IMPORT_FILE_MAX_SIZE_BYTES)} por arquivo.`,
        variant: "destructive",
      });
      return;
    }

    if (!isImportMimeAllowed(extension, file.type ?? "")) {
      toast({
        title: "Tipo de arquivo inválido",
        description: "O tipo do arquivo não corresponde à extensão informada.",
        variant: "destructive",
      });
      return;
    }

    setImportLoading(true);
    setImportConfirmResult(null);
    try {
      let content = "";
      let pdfSignalText = "";
      let pdfPlainFallbackText = "";
      let pdfIssuerHint: "itau" | "mercado_pago" | undefined;
      const debugImportPdf = isImportPdfDebugEnabled();
      if (extension === "pdf") {
        const pdfBuffer = await file.arrayBuffer();
        const extractedPdf = await extractPdfTextVariantsFromPdfBuffer(pdfBuffer);
        const combinedPdfText = [extractedPdf.plainText, extractedPdf.positionalText]
          .map((part) => part.trim())
          .filter((part) => part.length > 0)
          .join("\n");

        if (!isExtractedPdfTextUsable(combinedPdfText)) {
          toast({
            title: "PDF sem texto extraível",
            description: "Este PDF parece ser imagem/escaneado. A importação por imagem será liberada em uma etapa futura.",
            variant: "destructive",
          });
          setImportItems([]);
          setImportPreviewLogId(null);
          return;
        }

        pdfSignalText = combinedPdfText;
        pdfPlainFallbackText = extractedPdf.plainText || combinedPdfText;
        const itauDetectedFromSignals = detectItauInvoiceText(combinedPdfText);
        const mercadoPagoDetectedFromSignals = detectMercadoPagoInvoiceText(combinedPdfText);
        if (debugImportPdf && typeof console !== "undefined") {
          const detectedIssuer = itauDetectedFromSignals
            ? "itau"
            : mercadoPagoDetectedFromSignals
              ? "mercado_pago"
              : "unknown";
          console.info("[import-itau][debug] issuer.detected", detectedIssuer);
        }
        if (itauDetectedFromSignals) {
          if (debugImportPdf) {
            logItauImportDebugSnapshot({
              fileName: file.name,
              plainText: extractedPdf.plainText,
              positionalText: extractedPdf.positionalText,
              mergedSignalText: combinedPdfText,
            });
          }
          pdfIssuerHint = "itau";
          content = extractedPdf.positionalText || extractedPdf.plainText;
        } else if (mercadoPagoDetectedFromSignals) {
          pdfIssuerHint = "mercado_pago";
          content = extractedPdf.positionalText || extractedPdf.plainText;
        } else {
          content = extractedPdf.plainText || extractedPdf.positionalText;
        }
      } else {
        content = await file.text();
      }

      const detectionContent = extension === "pdf" && pdfSignalText ? pdfSignalText : content;
      const cartaoId = resolveImportCartaoId(`${file.name}\n${detectionContent}`);
      if (!cartaoId) {
        toast({ title: "Selecione um cartao para importar", variant: "destructive" });
        return;
      }
      let result: ParseResult;
      const name = file.name.toLowerCase();
      let sourceType: "csv" | "ofx" | "qfx" | "texto" | "pdf";
      if (name.endsWith(".ofx")) {
        result = parseOfx(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "ofx";
      } else if (name.endsWith(".qfx")) {
        result = parseOfx(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "qfx";
      } else if (name.endsWith(".txt")) {
        result = parseCsv(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "texto";
      } else if (name.endsWith(".pdf")) {
        const selectedCard = cartoes.find((item) => item.id === cartaoId);
        result = parsePdf(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
          selectedCardName: selectedCard?.nome ?? "",
          issuerHint: pdfIssuerHint,
          debugImportPdf,
          itauFallbackContent: pdfPlainFallbackText,
        });
        sourceType = "pdf";
      } else {
        result = parseCsv(content, compras, cartaoId, {
          referenceBillingDate: importVencimento || undefined,
        });
        sourceType = "csv";
      }
      const venc = findVencimentoFatura(detectionContent);
      if (venc) setImportVencimento(venc);
      const ignoredDetails = buildIgnoredDetails(result.stats);
      const hasIgnoredRows = countIgnoredRows(result.stats) > 0;
      const parserWarning = result.parserWarnings?.[0] ?? "";
      if (result.items.length === 0) {
        toast({
          title: "Nenhuma compra detectada no arquivo.",
          description: parserWarning
            ? `${parserWarning}${ignoredDetails ? ` ${ignoredDetails}` : ""}`
            : ignoredDetails,
          variant: "destructive",
        });
        setImportItems([]);
        setImportPreviewLogId(null);
        return;
      }

      const preview = await previewImportCompras({
        cartaoId,
        sourceType,
        sourceName: file.name,
        items: result.items,
      });

      const mergedItems = mergePreviewItemsWithLocalSignals(preview.items, result.items, servicos);

      setImportItems(mergedItems);
      setImportEditingId(null);
      setImportPreviewLogId(preview.importLogId);
      setImportSourceType(sourceType);
      setImportSourceName(file.name);
      if (sourceType === "pdf") {
        applyPdfIssuerMismatchGuard(`${file.name}\n${detectionContent}`, cartaoId, mergedItems);
      } else {
        setImportIssuerMismatchWarning("");
        setImportIssuerMismatchMustAcknowledge(false);
        setImportIssuerMismatchAcknowledged(false);
      }

      toast({
        title: `${preview.summary.importItems} item(ns) pronto(s) para importar`,
        description:
          `Confianca media ${Math.round(preview.summary.averageConfidence)}%. ` +
          `${preview.summary.reviewItems} item(ns) requer(em) revisao.` +
          (hasIgnoredRows && ignoredDetails ? ` ${ignoredDetails}` : ""),
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      const normalizedMessage = errorMessage.toLowerCase();
      const isPdfSignatureError = extension === "pdf" && error instanceof Error && error.message === "INVALID_PDF_SIGNATURE";
      const isPdfParsingError = extension === "pdf" && (
        normalizedMessage.includes("invalidpdf")
        || normalizedMessage.includes("unexpectedresponse")
        || normalizedMessage.includes("formaterror")
        || normalizedMessage.includes("malformed")
      );

      toast({
        title: "Erro ao ler arquivo",
        description: isPdfSignatureError
          ? "Arquivo PDF inválido ou corrompido."
          : isPdfParsingError
            ? "Não foi possível ler este PDF. Envie um PDF textual válido."
            : errorMessage,
        variant: "destructive",
      });
      setImportPreviewLogId(null);
      setImportIssuerMismatchWarning("");
      setImportIssuerMismatchMustAcknowledge(false);
      setImportIssuerMismatchAcknowledged(false);
    } finally { setImportLoading(false); }
  };

  const showCompraSearch = activeCartoesTab === "compras" || activeCartoesTab === "fatura";
  const handleCartoesTabChange = (tab: CartoesTab) => {
    setCartoesTab(tab);
    setComprasCartaoFocadoId(null);
  };
  const cartoesInsightsItems = (() => {
    if (cartoes.length === 0) return [] as CartaoInsightItem[];

    const items: CartaoInsightItem[] = [];
    const rankedByUtil = cartoes
      .map((cartao) => {
        const limite = Number(cartao.limite) || 0;
        const comprometido = getCardUsedLimit(cartao.id);
        const percentual = limite > 0 ? (comprometido / limite) * 100 : 0;
        return { cartao, percentual };
      })
      .sort((a, b) => b.percentual - a.percentual);

    const critical = rankedByUtil.find((item) => item.percentual >= 85);
    if (critical) {
      items.push({
        id: `critical-${critical.cartao.id}`,
        severity: "critical",
        title: `${critical.cartao.nome} quase comprometido`,
        description: `${critical.percentual.toFixed(0)}% do limite já utilizado.`,
      });
    }

    const warning = rankedByUtil.find((item) => item.percentual >= 65 && item.percentual < 85);
    if (warning) {
      items.push({
        id: `warning-${warning.cartao.id}`,
        severity: "warning",
        title: `${warning.cartao.nome} exige atenção`,
        description: `Uso de limite em ${warning.percentual.toFixed(0)}%.`,
      });
    }

    const compraLonga = compras.find((compra) => Number(compra.parcelas) >= 24);
    if (compraLonga) {
      items.push({
        id: `long-${compraLonga.id}`,
        severity: "info",
        title: "Parcelamento longo identificado",
        description: `${compraLonga.descricao} em ${compraLonga.parcelas} parcelas.`,
      });
    }

    const bestAvailable = cartoes
      .map((cartao) => ({ cartao, disponivel: getCardAvailableLimit(cartao.id) }))
      .sort((a, b) => b.disponivel - a.disponivel)[0];
    if (bestAvailable && bestAvailable.disponivel > 0) {
      items.push({
        id: `best-${bestAvailable.cartao.id}`,
        severity: "info",
        title: "Melhor disponibilidade atual",
        description: `${bestAvailable.cartao.nome} com ${formatCartaoCurrency(bestAvailable.disponivel)} disponível.`,
      });
    }

    return items.slice(0, 4);
  })();

  if (isLoading) {
    return (
      <div className="app-page-shell app-section-stack">
        <Skeleton className="h-8 w-32" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page-shell app-section-stack" data-testid="cartoes-page">
      <CartoesPageHeader
        title="Cartoes de Credito"
        subtitle="Gerencie seus cartoes e compras parceladas"
        actions={(
          <>
            <div className="flex min-w-0 flex-col items-stretch gap-2 sm:col-span-2 md:flex-row md:items-center xl:col-span-1">
              <Button
                variant="outline"
                onClick={openImportDialog}
                className="min-w-0 flex-1 justify-start text-left whitespace-normal break-words touch-feedback sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
                data-testid="button-importar-fatura"
              >
                <Upload className="mr-2 h-4 w-4 flex-shrink-0" />
                <span className="leading-tight">
                  {smartImportLiberado ? "Importar Fatura" : "Importação inteligente (Premium)"}
                </span>
              </Button>
              {!smartImportLiberado ? (
                <Badge
                  variant="secondary"
                  className="w-fit shrink-0 whitespace-nowrap self-start sm:self-auto"
                  data-testid="badge-smart-import-premium"
                >
                  Premium
                </Badge>
              ) : null}
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteFaturaScope("cartao");
                setDeleteFaturaMes(format(new Date(), "yyyy-MM"));
                setDeleteFaturaImpact(null);
                setDeleteFaturaImpactError(null);
                setOpenDeleteFaturaDialog(true);
              }}
              disabled={cartoes.length === 0}
              className="min-w-0 w-full justify-start text-left whitespace-normal break-words touch-feedback sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
              data-testid="button-excluir-fatura"
            >
              <Trash2 className="mr-2 h-4 w-4 flex-shrink-0" />
              Excluir fatura
            </Button>
            {smartImportLiberado && lastImportLogId ? (
              <Button
                variant="outline"
                className="min-w-0 w-full justify-start text-left whitespace-normal break-words touch-feedback sm:col-span-2 sm:justify-center xl:w-auto xl:flex-none xl:whitespace-nowrap"
                onClick={handleRollbackLastImport}
                disabled={rollbackImportMutation.isPending}
                data-testid="button-rollback-import"
              >
                <RefreshCw className="mr-2 h-4 w-4 flex-shrink-0" />
                {rollbackImportMutation.isPending ? "Revertendo..." : "Desfazer Ultima Importacao"}
              </Button>
            ) : null}
            <Button
              className="w-full touch-feedback sm:col-span-2 xl:w-auto xl:flex-none"
              data-testid="button-add-cartao"
              onClick={() => setOpenCard(true)}
            >
              <Plus className="mr-2 h-4 w-4" /> Novo cartao
            </Button>
          </>
        )}
      />

      <CartoesSummarySection
        hasCartoes={cartoes.length > 0}
        totalFaturas={totalFaturas}
        totalAguardandoReembolso={totalAguardandoReembolso}
        formatCurrency={formatCartaoCurrency}
        showInsights={false}
        insights={<CartoesInsights items={cartoesInsightsItems} />}
        filterBar={(
          <CartoesFilterBar
            cartoesTab={activeCartoesTab}
            onTabChange={handleCartoesTabChange}
            compraSearch={compraSearch}
            onCompraSearchChange={setCompraSearch}
            showSearch={showCompraSearch}
          />
        )}
      />

      <NovaCompraCartaoDialog
        open={openCompra}
        onOpenChange={setOpenCompra}
        form={compraForm}
        setForm={setCompraForm}
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        onSubmit={handleCreateCompra}
        isPending={createCompraMutation.isPending}
      />

      <CartaoFormDialog
        open={openCard}
        onOpenChange={setOpenCard}
        title="Novo Cartao"
        form={cardForm}
        setForm={setCardForm}
        iconPicker={(
          <Suspense fallback={<Skeleton className="h-14 w-full" />}>
            <IconPicker value={newCardIcone} name={cardForm.nome} onChange={setNewCardIcone} size="md" />
          </Suspense>
        )}
        onSubmit={handleCreateCard}
        isPending={createCardMutation.isPending}
        pendingLabel="Salvando..."
        submitLabel="Salvar"
        testIds={{
          nome: "input-cartao-nome",
          limite: "input-cartao-limite",
          melhorDiaCompra: "input-cartao-melhordia",
          diaVencimento: "input-cartao-vencimento",
          submit: "button-save-cartao",
        }}
      />

      <CartaoFormDialog
        open={!!editingCard}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCard(null);
            setEditCardIcone(null);
          }
        }}
        title="Editar Cartao"
        form={editCardForm}
        setForm={setEditCardForm}
        iconPicker={(
          <Suspense fallback={<Skeleton className="h-14 w-full" />}>
            <IconPicker value={editCardIcone} name={editCardForm.nome} onChange={setEditCardIcone} size="md" />
          </Suspense>
        )}
        onSubmit={handleUpdateCard}
        isPending={updateCardMutation.isPending}
        pendingLabel="Salvando..."
        submitLabel="Salvar alteracoes"
        testIds={{
          nome: "input-edit-cartao-nome",
          limite: "input-edit-cartao-limite",
          melhorDiaCompra: "input-edit-cartao-melhordia",
          diaVencimento: "input-edit-cartao-vencimento",
          submit: "button-save-edit-cartao",
        }}
      />

      <EditarCompraCartaoDialog
        open={!!editingCompra}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCompra(null);
          }
        }}
        form={editCompraForm}
        setForm={setEditCompraForm}
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        onSubmit={handleUpdateCompra}
        isPending={updateCompraMutation.isPending}
      />

      <CartoesDialogs
        openDeleteFaturaDialog={openDeleteFaturaDialog}
        setOpenDeleteFaturaDialog={setOpenDeleteFaturaDialog}
        deleteFaturaScope={deleteFaturaScope}
        setDeleteFaturaScope={setDeleteFaturaScope}
        deleteFaturaMes={deleteFaturaMes}
        setDeleteFaturaMes={setDeleteFaturaMes}
        deleteFaturaCartaoId={deleteFaturaCartaoId}
        setDeleteFaturaCartaoId={setDeleteFaturaCartaoId}
        deleteFaturaImpact={deleteFaturaImpact}
        setDeleteFaturaImpact={setDeleteFaturaImpact}
        deleteFaturaImpactLoading={deleteFaturaImpactLoading}
        deleteFaturaImpactError={deleteFaturaImpactError}
        setDeleteFaturaImpactError={setDeleteFaturaImpactError}
        onRetryDeleteFaturaImpact={() => {
          void retryDeleteFaturaImpact();
        }}
        setDeleteFaturaImpactLoading={setDeleteFaturaImpactLoading}
        deleteFaturaCartaoPending={deleteFaturaCartaoMutation.isPending}
        deleteFaturasMesPending={deleteFaturasMesMutation.isPending}
        onConfirmDeleteFatura={handleConfirmDeleteFatura}
        formatMesExibicao={formatMesExibicao}
        formatCurrency={formatCartaoCurrency}
        cartoes={cartoes}
        openDeleteCompraDialog={openDeleteCompraDialog}
        setOpenDeleteCompraDialog={setOpenDeleteCompraDialog}
        resetDeleteCompraDialog={resetDeleteCompraDialog}
        deleteCompraTarget={deleteCompraTarget}
        deleteCompraScope={deleteCompraScope}
        setDeleteCompraScope={setDeleteCompraScope}
        deleteCompraImpact={deleteCompraImpact}
        setDeleteCompraImpact={setDeleteCompraImpact}
        deleteCompraImpactLoading={deleteCompraImpactLoading}
        deleteCompraImpactError={deleteCompraImpactError}
        deleteCompraSubmitting={deleteCompraSubmitting}
        onRetryDeleteCompraImpact={() => {
          if (!deleteCompraTarget) return;
          void loadDeleteCompraImpact(deleteCompraTarget, deleteCompraScope);
        }}
        onConfirmDeleteCompra={handleConfirmDeleteCompra}
      />

      <ParcelasTab
        open={!!viewingCompra}
        onOpenChange={(open) => {
          if (!open) {
            setViewingCompra(null);
            setAbaterSaldoParcelaId(null);
            setParcelaSubmittingId(null);
            setComprovanteUploadParcelaId(null);
          }
        }}
        viewingCompra={viewingCompra}
        parcelasCompraData={parcelasCompraData}
        parcelasLoading={!!viewingCompra && isParcelasCompraLoading}
        parcelasErrorMessage={
          viewingCompra && isParcelasCompraError
            ? getErrorMessage(parcelasCompraError)
            : null
        }
        pessoas={pessoas}
        formatCurrency={formatCartaoCurrency}
        getParcelaSaldoPendente={getParcelaSaldoPendente}
        getParcelaSaldoAbatido={getParcelaSaldoAbatido}
        getPessoaSaldoDisponivel={getPessoaSaldoDisponivel}
        isParcelaVencida={isParcelaVencida}
        isParcelaComprometendoLimite={isParcelaComprometendoLimite}
        editingParcelaId={editingParcelaId}
        setEditingParcelaId={setEditingParcelaId}
        editingParcelaValor={editingParcelaValor}
        setEditingParcelaValor={setEditingParcelaValor}
        editingParcelaData={editingParcelaData}
        setEditingParcelaData={setEditingParcelaData}
        payingParcelaId={payingParcelaId}
        setPayingParcelaId={setPayingParcelaId}
        payParcelaData={payParcelaData}
        setPayParcelaData={setPayParcelaData}
        onEditParcela={handleEditParcela}
        onPayParcela={handlePayParcela}
        onPayParcelaPessoa={handlePayParcelaPessoa}
        parcelaActionLoadingId={parcelaSubmittingId}
        isParcelaActionPending={payParcelaMutation.isPending}
        onOpenAbaterSaldoParcela={openAbaterSaldoParcelaDialog}
        abaterSaldoParcelaId={abaterSaldoParcelaId}
        setAbaterSaldoParcelaId={setAbaterSaldoParcelaId}
        abaterSaldoParcelaForm={abaterSaldoParcelaForm}
        setAbaterSaldoParcelaForm={setAbaterSaldoParcelaForm}
        onSubmitAbaterSaldo={() => {
          if (!viewingCompra?.pessoaId || !abaterSaldoParcelaId) return;
          abaterSaldoParcelaMutation.mutate(
            {
              pessoaId: viewingCompra.pessoaId,
              parcelaId: abaterSaldoParcelaId,
              valor: abaterSaldoParcelaForm.valor,
              data: abaterSaldoParcelaForm.data,
              observacao: abaterSaldoParcelaForm.observacao || null,
            },
            {
              onSuccess: (result) => {
                setAbaterSaldoParcelaId(null);
                toast({
                  title: result.quitada ? "Parcela quitada com saldo" : "Abatimento parcial registrado",
                  description: `Saldo utilizado: ${formatCartaoCurrency(result.valorAbatido)}`,
                });
                refetchParcelas();
              },
              onError: (error) => {
                toast({
                  title: "Erro ao abater saldo",
                  description: getErrorMessage(error),
                  variant: "destructive",
                });
              },
            },
          );
        }}
        isAbaterSaldoPending={abaterSaldoParcelaMutation.isPending}
        getParcelaComprovante={getParcelaComprovante}
        onUploadParcelaComprovante={async (parcelaId, file) => {
          await parcelaComprovanteMutation.mutateAsync({ parcelaId, file });
        }}
        comprovanteUploadLoadingId={comprovanteUploadParcelaId}
        onDeleteParcelaComprovante={async (parcelaId) => {
          await deleteParcelaComprovanteMutation.mutateAsync({ parcelaId });
        }}
        comprovanteDeleteLoadingId={comprovanteDeleteParcelaId}
      />

      <ImportFaturaDialog
        open={openImport}
        onOpenChange={(v) => {
          if (!v) {
            setOpenImport(false);
            setImportCartaoId("");
            setImportCartaoHint("");
            setImportItems([]);
            setImportTexto("");
            setImportVencimento("");
            setImportEditingId(null);
            setImportPreviewLogId(null);
            setImportSourceType("manual");
            setImportSourceName("");
            setImportIssuerMismatchWarning("");
            setImportIssuerMismatchMustAcknowledge(false);
            setImportIssuerMismatchAcknowledged(false);
            setImportConfirmResult(null);
            setRememberingCompraAliasByItemId({});
            setSavedCompraAliasByItemId({});
            return;
          }
          if (!smartImportLiberado) {
            setOpenImport(false);
            showSmartImportPremiumToast();
            return;
          }
          setOpenImport(true);
        }}
        cartoes={cartoes}
        compras={compras}
        importCartaoId={importCartaoId}
        setImportCartaoId={handleImportCartaoChange}
        servicos={servicos}
        servicoPessoas={servicoPessoas}
        importCartaoHint={importCartaoHint}
        formatCartaoOptionLabel={formatImportCardOptionLabel}
        importTab={importTab}
        setImportTab={(value) => setImportTab(value)}
        importTexto={importTexto}
        setImportTexto={setImportTexto}
        onParseTexto={handleParseTexto}
        importLoading={importLoading}
        onFileUpload={handleFileUpload}
        importItems={importItems}
        setImportItems={setImportItems}
        importVencimento={importVencimento}
        setImportVencimento={setImportVencimento}
        onApplyVencimentoToAll={applyVencimentoToAll}
        importEditingId={importEditingId}
        setImportEditingId={setImportEditingId}
        importEditForm={importEditForm}
        setImportEditForm={setImportEditForm}
        onApplyImportEdit={applyImportEdit}
        formatCurrency={formatCartaoCurrency}
        isBatchImportPending={batchImportMutation.isPending || isReconcilingImport}
        issuerMismatchWarning={importIssuerMismatchWarning}
        issuerMismatchRequiresAcknowledgement={importIssuerMismatchMustAcknowledge}
        issuerMismatchAcknowledged={importIssuerMismatchAcknowledged}
        onIssuerMismatchAcknowledgedChange={setImportIssuerMismatchAcknowledged}
        onConfirmImport={handleConfirmImport}
        confirmResult={importConfirmResult}
        onRollbackImport={
          importConfirmResult
            ? () => handleRollbackImportById(importConfirmResult.importLogId)
            : undefined
        }
        isRollbackPending={rollbackImportMutation.isPending && !!historyRollbackLogId}
        importLogs={importLogs}
        isImportLogsLoading={isImportLogsLoading}
        rollbackImportLogLoadingId={historyRollbackLogId}
        onRollbackImportLog={(importLogId) => handleRollbackImportById(importLogId)}
        onRememberCompraAlias={handleRememberCompraAlias}
        rememberingCompraAliasByItemId={rememberingCompraAliasByItemId}
        savedCompraAliasByItemId={savedCompraAliasByItemId}
        compraAliases={compraAliases}
        isCompraAliasesLoading={isCompraAliasesLoading}
        onStartNewImport={() => {
          setImportConfirmResult(null);
          setImportItems([]);
          setImportPreviewLogId(null);
          setImportTexto("");
          setImportVencimento("");
          setImportEditingId(null);
          setImportSourceType("manual");
          setImportSourceName("");
          setImportCartaoHint("");
          setImportIssuerMismatchWarning("");
          setImportIssuerMismatchMustAcknowledge(false);
          setImportIssuerMismatchAcknowledged(false);
          setRememberingCompraAliasByItemId({});
          setSavedCompraAliasByItemId({});
        }}
      />

      <div data-testid={`cartoes-tab-${activeCartoesTab}`}>
        <CartoesGrid
          cartoes={cartoes}
          cartoesTab={activeCartoesTab}
          getCardTotal={getCardTotal}
          getCardUsedLimit={getCardUsedLimit}
          getCardAvailableLimit={getCardAvailableLimit}
          getCardCompras={getCardCompras}
          getFilteredCardCompras={getFilteredCardCompras}
          formatCartaoCurrency={formatCartaoCurrency}
          onOpenCompras={(cartaoId) => {
            setCartoesTab("compras");
            setSelectedCartao(cartaoId);
            setComprasCartaoFocadoId(cartaoId);
          }}
          onDeleteCompra={openDeleteCompraConfirm}
        />
      </div>

      <div className={activeCartoesTab === "compras" || cartoes.length === 0 ? "" : "hidden"}>
      {cartoes.length === 0 ? (
        <CartoesEmptyState />
      ) : prefs.mobileMode ? (
        <CartoesMobileTabs
          cartoes={cartoes}
          selectedCartao={selectedCartao}
          setSelectedCartao={setSelectedCartao}
          setOpenCompra={setOpenCompra}
          totalFaturas={totalFaturas}
          formatCurrency={formatCartaoCurrency}
          getCardTotal={getCardTotal}
          getCardAvailableLimit={getCardAvailableLimit}
          getFilteredCardCompras={getFilteredCardCompras}
          servicos={servicos}
          onOpenParcelas={setViewingCompra}
          onDeleteCompra={openDeleteCompraConfirm}
        />
      ) : (
        <CartoesComprasGrid
          cartoes={cartoes}
          pessoas={pessoas}
          servicos={servicos}
          formatCurrency={formatCartaoCurrency}
          getCardTotal={getCardTotal}
          getCardUsedLimit={getCardUsedLimit}
          getCardAvailableLimit={getCardAvailableLimit}
          getFilteredCardCompras={getFilteredCardCompras}
          getDaysUntilInvoice={getDaysUntilInvoice}
          getNextInvoiceDate={getNextInvoiceDate}
          focusedCartaoId={comprasCartaoFocadoId}
          onEditCartao={(cartao) => {
            setEditingCard(cartao);
            setEditCardForm({
              nome: cartao.nome,
              limite: String(cartao.limite),
              melhorDiaCompra: String(cartao.melhorDiaCompra),
              diaVencimento: String(cartao.diaVencimento),
            });
            setEditCardIcone(cartao.iconeId || null);
          }}
          onDeleteCartao={handleDeleteCard}
          onAddCompra={(cartaoId) => {
            setSelectedCartao(cartaoId);
            setOpenCompra(true);
          }}
          onOpenParcelas={setViewingCompra}
          onEditCompra={(compra) => {
            setEditingCompra(compra);
            setEditCompraForm({
              descricao: compra.descricao,
              valorTotal: String(compra.valorTotal),
              parcelas: String(compra.parcelas),
              pessoaId: compra.pessoaId ?? "",
              statusPessoa: compra.statusPessoa ?? "pendente",
            });
          }}
          onDeleteCompra={openDeleteCompraConfirm}
          onMarcarReembolso={(compraId) => handleMarcarReembolso(compraId, true)}
        />
      )}
      </div>
    </div>
  );
}






