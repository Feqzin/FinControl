import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FileText,
  Zap,
  Repeat,
  CreditCard,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Info,
} from "lucide-react";
import { parseFinancialText, ParsedItem, ParsedItemDivida } from "@/utils/financialTextParser";
import type { Pessoa, Cartao } from "@shared/schema";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const EXAMPLE_TEXT = `João me deve 250 reais - vencimento 15/04
Devo 500 pra Maria - pix - 20/04
Netflix mensal 39,90 dia 15
Parcela 3/10 do celular no Nubank R$ 120
Paguei 80 reais de dívida pro Carlos hoje
Spotify mensal 21,90`;

type ImportarTextoPanelProps = {
  onCompleted?: (createdCount: number) => void;
};

export function ImportarTextoPanel({ onCompleted }: ImportarTextoPanelProps) {
  const { toast } = useToast();
  const [texto, setTexto] = useState("");
  const [preview, setPreview] = useState<ParsedItem[] | null>(null);
  const [erros, setErros] = useState<{ linha: number; texto: string }[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);

  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });

  const handleAnalisar = () => {
    setDone(false);
    const result = parseFinancialText(texto);
    setPreview(result.items);
    setErros(result.erros);
  };

  const removeItem = (index: number) => {
    if (!preview) return;
    setPreview(preview.filter((_, i) => i !== index));
  };

  const handleConfirmar = async () => {
    if (!preview || preview.length === 0) return;
    setImporting(true);

    let created = 0;
    const pessoaMap = new Map<string, string>(pessoas.map((pessoa) => [pessoa.nome.toLowerCase(), pessoa.id]));
    const cartaoMap = new Map<string, string>(cartoes.map((cartao) => [cartao.nome.toLowerCase(), cartao.id]));

    for (const item of preview) {
      try {
        if (item.tipo === "divida") {
          const dividaItem = item as ParsedItemDivida;
          let pessoaId = pessoaMap.get(dividaItem.pessoa.toLowerCase());

          if (!pessoaId) {
            const response = await apiRequest("POST", "/api/pessoas", {
              nome: dividaItem.pessoa,
              tipo: dividaItem.subtipo === "receber" ? "me_deve" : "eu_devo",
              telefone: "",
              observacao: "Criado via importacao",
            });
            const newPessoa = (await response.json()) as { id?: string };
            if (!newPessoa.id) {
              throw new Error("Pessoa criada sem id");
            }
            pessoaId = newPessoa.id;
            pessoaMap.set(dividaItem.pessoa.toLowerCase(), pessoaId);
          }

          if (!pessoaId) {
            throw new Error("Pessoa nao encontrada para importar divida");
          }

          await apiRequest("POST", "/api/dividas", {
            pessoaId,
            tipo: dividaItem.subtipo,
            valor: String(dividaItem.valor),
            dataVencimento: dividaItem.vencimento,
            status: dividaItem.status,
            dataPagamento: dividaItem.status === "pago" ? format(new Date(), "yyyy-MM-dd") : null,
            formaPagamento: dividaItem.formaPagamento,
            descricao: dividaItem.descricao,
          });
          created += 1;
          continue;
        }

        if (item.tipo === "servico") {
          await apiRequest("POST", "/api/servicos", {
            nome: item.nome,
            categoria: item.categoria,
            valorMensal: String(item.valor),
            dataCobranca: item.diaCobranca,
            formaPagamento: "pix",
            status: "ativo",
          });
          created += 1;
          continue;
        }

        if (item.tipo === "cartao") {
          let cartaoId = cartaoMap.get(item.cartao.toLowerCase());

          if (!cartaoId) {
            const response = await apiRequest("POST", "/api/cartoes", {
              nome: item.cartao,
              limite: "5000",
              melhorDiaCompra: 1,
              diaVencimento: 10,
            });
            const newCartao = (await response.json()) as { id?: string };
            if (!newCartao.id) {
              throw new Error("Cartao criado sem id");
            }
            cartaoId = newCartao.id;
            cartaoMap.set(item.cartao.toLowerCase(), cartaoId);
          }

          if (!cartaoId) {
            throw new Error("Cartao nao encontrado para importar compra");
          }

          await apiRequest("POST", "/api/compras-cartao", {
            cartaoId,
            descricao: item.descricao || item.cartao,
            valorTotal: String(item.valor * item.totalParcelas),
            parcelas: item.totalParcelas,
            parcelaAtual: item.parcelaAtual,
            valorParcela: String(item.valor),
            dataCompra: format(new Date(), "yyyy-MM-dd"),
          });
          created += 1;
        }
      } catch {
      }
    }

    queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
    queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
    queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });

    setImporting(false);
    setDone(true);
    setPreview(null);
    setTexto("");
    toast({
      title: "Importacao concluida",
      description: `${created} registro(s) criados com sucesso`,
    });
    onCompleted?.(created);
  };

  const handleCancelar = () => {
    setPreview(null);
    setErros([]);
    setDone(false);
  };

  return (
    <div className="space-y-4" data-testid="importar-texto-panel">
      {done && (
        <Alert className="border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <AlertDescription className="text-emerald-700">
            Importacao concluida com sucesso! Os registros ja aparecem no sistema.
          </AlertDescription>
        </Alert>
      )}

      {!preview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" /> Cole seu texto abaixo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              data-testid="textarea-importar"
              placeholder={EXAMPLE_TEXT}
              value={texto}
              onChange={(event) => setTexto(event.target.value)}
              className="min-h-[180px] sm:min-h-[220px] font-mono text-sm resize-y"
            />

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button
                onClick={handleAnalisar}
                disabled={!texto.trim()}
                className="w-full sm:flex-1"
                data-testid="button-analisar"
              >
                <Zap className="w-4 h-4 mr-2" /> Analisar texto
              </Button>
              <Button
                variant="outline"
                onClick={() => setTexto(EXAMPLE_TEXT)}
                className="w-full sm:w-auto"
                data-testid="button-example"
              >
                Ver exemplo
              </Button>
            </div>

            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription className="text-sm">
                <strong>Dicas de escrita:</strong> mencione nomes ("Joao me deve 250"), valores ("R$ 39,90"),
                datas ("dia 15", "20/04", "amanha"), servicos ("Netflix mensal") e parcelas ("3/10 do celular").
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {preview !== null && (
        <div className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Preview da importacao</h2>
              <p className="text-sm text-muted-foreground">
                {preview.length} registro(s) identificado(s)
                {erros.length > 0 && ` · ${erros.length} linha(s) ignorada(s)`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancelar} className="w-full sm:w-auto">
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          </div>

          {erros.length > 0 && (
            <Alert className="border-amber-500/20 bg-amber-500/5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <AlertDescription>
                <p className="font-medium text-amber-700 mb-2">Linhas nao interpretadas:</p>
                <ul className="space-y-1">
                  {erros.map((erro) => (
                    <li key={erro.linha} className="text-sm text-amber-600">
                      Linha {erro.linha}: <span className="font-mono">{erro.texto}</span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {preview.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center">
                <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground">Nenhum registro foi identificado no texto.</p>
                <Button variant="outline" className="mt-4" onClick={handleCancelar}>
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                {preview.map((item, index) => (
                  <Card key={index} className="hover-elevate" data-testid={`preview-item-${index}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0 ${
                            item.tipo === "divida"
                              ? item.subtipo === "receber"
                                ? "bg-emerald-500/10"
                                : "bg-red-500/10"
                              : item.tipo === "servico"
                                ? "bg-blue-500/10"
                                : "bg-purple-500/10"
                          }`}>
                            {item.tipo === "divida" ? (
                              item.subtipo === "receber"
                                ? <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                                : <ArrowDownRight className="w-4 h-4 text-red-600" />
                            ) : item.tipo === "servico" ? (
                              <Repeat className="w-4 h-4 text-blue-600" />
                            ) : (
                              <CreditCard className="w-4 h-4 text-purple-600" />
                            )}
                          </div>

                          <div className="min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={
                                  item.tipo === "divida"
                                    ? item.subtipo === "receber"
                                      ? "default"
                                      : "destructive"
                                    : "secondary"
                                }
                              >
                                {item.tipo === "divida"
                                  ? item.subtipo === "receber" ? "A receber" : "A pagar"
                                  : item.tipo === "servico" ? "Servico"
                                    : "Compra parcelada"}
                              </Badge>
                              {item.tipo === "divida" && item.status === "pago" && (
                                <Badge variant="secondary">Pago</Badge>
                              )}
                            </div>

                            {item.tipo === "divida" && (
                              <div>
                                <p className="font-semibold">{item.pessoa}</p>
                                <p className="text-sm text-muted-foreground">
                                  Vencimento: {item.vencimento}
                                  {item.formaPagamento && ` · ${item.formaPagamento}`}
                                </p>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">{item.linhaOriginal}</p>
                              </div>
                            )}
                            {item.tipo === "servico" && (
                              <div>
                                <p className="font-semibold">{item.nome}</p>
                                <p className="text-sm text-muted-foreground">
                                  {item.categoria} · Cobranca dia {item.diaCobranca}
                                </p>
                              </div>
                            )}
                            {item.tipo === "cartao" && (
                              <div>
                                <p className="font-semibold">{item.descricao}</p>
                                <p className="text-sm text-muted-foreground">
                                  Cartao: {item.cartao} · Parcela {item.parcelaAtual}/{item.totalParcelas}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-lg font-bold">
                            {item.tipo === "divida"
                              ? formatCurrency(item.valor)
                              : item.tipo === "servico"
                                ? `${formatCurrency(item.valor)}/mes`
                                : `${formatCurrency(item.valor)}/x`}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                            data-testid={`button-remove-preview-${index}`}
                            aria-label={`Remover item ${index + 1} da prévia`}
                            title="Remover item da prévia"
                          >
                            <Trash2 className="w-4 h-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Separator />

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="w-full sm:flex-1"
                  onClick={handleConfirmar}
                  disabled={importing || preview.length === 0}
                  data-testid="button-confirmar-importacao"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {importing ? "Importando..." : `Confirmar ${preview.length} registro(s)`}
                </Button>
                <Button variant="outline" onClick={handleCancelar} className="w-full sm:w-auto" data-testid="button-cancelar-importacao">
                  Cancelar
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
