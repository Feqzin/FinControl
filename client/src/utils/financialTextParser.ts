import { format, addDays, addMonths, parseISO } from "date-fns";

export type ParsedItemDivida = {
  tipo: "divida";
  subtipo: "receber" | "pagar";
  pessoa: string;
  valor: number;
  vencimento: string;
  status: "pendente" | "pago";
  descricao: string;
  formaPagamento: string;
  linhaOriginal: string;
};

export type ParsedItemServico = {
  tipo: "servico";
  nome: string;
  valor: number;
  diaCobranca: number;
  categoria: string;
  linhaOriginal: string;
};

export type ParsedItemCartao = {
  tipo: "cartao";
  cartao: string;
  descricao: string;
  parcelaAtual: number;
  totalParcelas: number;
  valor: number;
  linhaOriginal: string;
};

export type ParsedItem = ParsedItemDivida | ParsedItemServico | ParsedItemCartao;

export type ParseResult = {
  items: ParsedItem[];
  erros: { linha: number; texto: string }[];
};

const SERVICOS_CONHECIDOS = [
  "netflix", "spotify", "amazon", "prime", "disney", "hbo", "max",
  "youtube", "apple", "icloud", "google", "dropbox", "adobe",
  "chatgpt", "openai", "github", "notion", "slack", "zoom",
  "academia", "smart fit", "gympass", "bodytech",
  "deezer", "telecine", "globoplay", "crunchyroll",
];

const FORMAS_PAGAMENTO_KEYWORDS: Record<string, string> = {
  pix: "pix",
  dinheiro: "dinheiro",
  especie: "dinheiro",
  cartao: "cartao",
  cartão: "cartao",
  transferencia: "transferencia",
  transferência: "transferencia",
  ted: "transferencia",
  doc: "transferencia",
  boleto: "boleto",
};

function extractValue(text: string): number | null {
  const patterns = [
    /R\$\s*([\d.,]+)/i,
    /(\d{1,3}(?:\.\d{3})*,\d{2})/,
    /(\d+,\d{2})/,
    /(\d+\.\d{2})/,
    /\b(\d{2,6})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const raw = match[1].replace(/\./g, "").replace(",", ".");
      const num = parseFloat(raw);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  return null;
}

function extractDate(text: string): string {
  const today = new Date();

  if (/\bhoje\b/i.test(text)) return format(today, "yyyy-MM-dd");
  if (/\bamanh[aã]\b/i.test(text)) return format(addDays(today, 1), "yyyy-MM-dd");
  if (/\bm[eê]s\s+que\s+vem\b/i.test(text)) return format(addMonths(today, 1), "yyyy-MM-dd");
  if (/\bpr[oó]ximo\s+m[eê]s\b/i.test(text)) return format(addMonths(today, 1), "yyyy-MM-dd");
  if (/\bessa\s+semana\b/i.test(text)) return format(addDays(today, 3), "yyyy-MM-dd");

  const ddmmyyyy = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m}-${d}`;
  }

  const ddmm = text.match(/(\d{1,2})\/(\d{1,2})(?!\/\d)/);
  if (ddmm) {
    const [, d, m] = ddmm;
    const year = today.getFullYear();
    const parsed = new Date(year, parseInt(m) - 1, parseInt(d));
    if (parsed < today) parsed.setFullYear(year + 1);
    return format(parsed, "yyyy-MM-dd");
  }

  const ddmonth = text.match(/(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i);
  if (ddmonth) {
    const months: Record<string, number> = {
      jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
      jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
    };
    const day = parseInt(ddmonth[1]);
    const month = months[ddmonth[2].toLowerCase()];
    const year = today.getFullYear();
    const d = new Date(year, month, day);
    if (d < today) d.setFullYear(year + 1);
    return format(d, "yyyy-MM-dd");
  }

  return format(addDays(today, 30), "yyyy-MM-dd");
}

function extractInstallments(text: string): { atual: number; total: number } | null {
  const xSlash = text.match(/(\d+)\/(\d+)/);
  if (xSlash) return { atual: parseInt(xSlash[1]), total: parseInt(xSlash[2]) };

  const xPattern = text.match(/(\d+)\s*x\b/i);
  if (xPattern) return { atual: 1, total: parseInt(xPattern[1]) };

  const parcelaOf = text.match(/parcela\s+(\d+)\s+de\s+(\d+)/i);
  if (parcelaOf) return { atual: parseInt(parcelaOf[1]), total: parseInt(parcelaOf[2]) };

  return null;
}

function extractPerson(text: string, stopWords: string[]): string {
  const cleaned = text
    .replace(/R\$\s*[\d.,]+/g, "")
    .replace(/[\d.,]+(,\d{2})?/g, "")
    .replace(/\d{1,2}\/\d{1,2}(\/\d{4})?/g, "")
    .replace(/\d+x/gi, "")
    .replace(/\d+\/\d+/g, "");

  const lower = cleaned.toLowerCase();
  for (const sw of stopWords) {
    const idx = lower.indexOf(sw);
    if (idx !== -1) {
      const before = cleaned.slice(0, idx).trim();
      const after = cleaned.slice(idx + sw.length).trim();
      const candidate = (before + " " + after).trim();
      const words = candidate.split(/\s+/).filter((w) =>
        w.length > 1 &&
        !/^(de|da|do|me|eu|a|o|para|por|em|com|hoje|amanha|pix|cartao|dinheiro|via|pelo|pela|ate|ate)$/i.test(w)
      );
      if (words.length > 0) return words.slice(0, 2).join(" ");
    }
  }
  return "Desconhecido";
}

function extractFormaPagamento(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, forma] of Object.entries(FORMAS_PAGAMENTO_KEYWORDS)) {
    if (lower.includes(keyword)) return forma;
  }
  return "pix";
}

function extractDayOfMonth(text: string): number {
  const match = text.match(/dia\s+(\d{1,2})/i) || text.match(/\b(\d{1,2})\b/);
  if (match) {
    const day = parseInt(match[1]);
    if (day >= 1 && day <= 31) return day;
  }
  return 1;
}

function detectCategory(name: string): string {
  const lower = name.toLowerCase();
  const streaming = ["netflix", "disney", "hbo", "max", "amazon", "prime", "telecine", "globoplay", "crunchyroll", "deezer", "spotify", "youtube", "apple music"];
  const software = ["chatgpt", "openai", "github", "notion", "slack", "zoom", "adobe", "dropbox", "google", "icloud", "apple"];
  const fitness = ["academia", "smart fit", "gympass", "bodytech"];

  if (streaming.some((s) => lower.includes(s))) return "Streaming";
  if (software.some((s) => lower.includes(s))) return "Software";
  if (fitness.some((s) => lower.includes(s))) return "Lazer";
  return "Assinatura";
}

export function parseFinancialText(text: string): ParseResult {
  const lines = text.split("\n");
  const items: ParsedItem[] = [];
  const erros: { linha: number; texto: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const linha = lines[i].trim();
    if (!linha || linha.startsWith("#") || linha.startsWith("//")) continue;

    const lower = linha.toLowerCase();
    const valor = extractValue(linha);

    const isCartao =
      /\bcart[aã]o\b/i.test(lower) ||
      /\bfatura\b/i.test(lower) ||
      /\bparcel/i.test(lower) ||
      /\d+\/\d+/.test(lower) ||
      /\d+\s*x\b/i.test(lower);

    const isServico =
      SERVICOS_CONHECIDOS.some((s) => lower.includes(s)) ||
      /\bmensal\b/i.test(lower) ||
      /\bassina(tura|ndo)\b/i.test(lower) ||
      /\btodo\s+(m[eê]s|dia)\b/i.test(lower) ||
      /\brecorrente\b/i.test(lower);

    const isDividaReceber =
      /\bme\s+deve\b/i.test(lower) ||
      /\bvai\s+me\s+pagar\b/i.test(lower) ||
      /\bme\s+pagou\b/i.test(lower) ||
      /\ba\s+receber\b/i.test(lower) ||
      /\brecebo\b/i.test(lower);

    const isDividaPagar =
      /\b(eu\s+)?devo\b/i.test(lower) ||
      /\bvou\s+pagar\b/i.test(lower) ||
      /\bpaguei\b/i.test(lower) ||
      /\ba\s+pagar\b/i.test(lower) ||
      /\bdevendo\b/i.test(lower);

    if (isCartao && !isDividaReceber && !isDividaPagar) {
      if (!valor) {
        erros.push({ linha: i + 1, texto: linha });
        continue;
      }
      const installments = extractInstallments(linha);
      const cartaoName = linha.match(/(?:no|do|para)\s+(\w+)/i)?.[1] ||
        SERVICOS_CONHECIDOS.find((s) => lower.includes(s)) || "Cartao";

      items.push({
        tipo: "cartao",
        cartao: cartaoName,
        descricao: linha.replace(/R\$[\s\d.,]+/g, "").replace(/\d+\/\d+|\d+x/gi, "").trim(),
        parcelaAtual: installments?.atual || 1,
        totalParcelas: installments?.total || 1,
        valor,
        linhaOriginal: linha,
      });
      continue;
    }

    if (isServico && !isDividaReceber && !isDividaPagar) {
      if (!valor) {
        erros.push({ linha: i + 1, texto: linha });
        continue;
      }
      const serviceName =
        SERVICOS_CONHECIDOS.find((s) => lower.includes(s)) ||
        linha.split(/[\s,]+/).find((w) => w.length > 2 && !/^\d/.test(w)) ||
        "Servico";

      items.push({
        tipo: "servico",
        nome: serviceName.charAt(0).toUpperCase() + serviceName.slice(1),
        valor,
        diaCobranca: extractDayOfMonth(linha),
        categoria: detectCategory(lower),
        linhaOriginal: linha,
      });
      continue;
    }

    if (isDividaReceber || isDividaPagar) {
      if (!valor) {
        erros.push({ linha: i + 1, texto: linha });
        continue;
      }

      const isPago = /\bpaguei\b|\bme\s+pagou\b|\bjá\s+pag|\bjá\s+foi\s+pag/i.test(lower);
      const subtipo: "receber" | "pagar" = isDividaReceber ? "receber" : "pagar";

      const stopWords = isDividaReceber
        ? ["me deve", "vai me pagar", "me pagou", "a receber", "recebo"]
        : ["eu devo", "devo", "vou pagar", "paguei", "a pagar", "devendo"];

      const pessoa = extractPerson(linha, stopWords);
      const vencimento = isPago ? format(new Date(), "yyyy-MM-dd") : extractDate(linha);
      const formaPagamento = extractFormaPagamento(linha);

      items.push({
        tipo: "divida",
        subtipo,
        pessoa,
        valor,
        vencimento,
        status: isPago ? "pago" : "pendente",
        descricao: linha,
        formaPagamento,
        linhaOriginal: linha,
      });
      continue;
    }

    erros.push({ linha: i + 1, texto: linha });
  }

  return { items, erros };
}
