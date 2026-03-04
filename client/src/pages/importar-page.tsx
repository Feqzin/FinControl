import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Zap, Receipt, Repeat, CreditCard,
  Trash2, CheckCircle, AlertTriangle, X, ArrowUpRight, ArrowDownRight,
  Info,
} from "lucide-react";
import { parseFinancialText, ParsedItem, ParsedItemDivida } from "@/utils/financialTextParser";
import type { Pessoa, Cartao } from "@shared/schema";
import { format } from "date-fns";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const EXAMPLE_TEXT = `João me deve 250 reais - vencimento 15/04
Devo 500 pra Maria - pix - 20/04
Netflix mensal 39,90 dia 15
Parcela 3/10 do celular no Nubank R$ 120
Paguei 80 reais de dívida pro Carlos hoje
Spotify mensal 21,90`;

export default function ImportarPage() {
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
    const pessoaMap = new Map<string, string>(pessoas.map((p) => [p.nome.toLowerCase(), p.id]));
    const cartaoMap = new Map<string, string>(cartoes.map((c) => [c.nome.toLowerCase(), c.id]));

    for (const item of preview) {
      try {
        if (item.tipo === "divida") {
          const div = item as ParsedItemDivida;
          let pessoaId = pessoaMap.get(div.pessoa.toLowerCase());

          if (!pessoaId) {
            const res = await apiRequest("POST", "/api/pessoas", {
              nome: div.pessoa,
              tipo: div.subtipo === "receber" ? "me_deve" : "eu_devo",
              telefone: "",
              observacao: "Criado via importacao",
            });
            const newPessoa = await res.json();
            pessoaId = newPessoa.id;
            pessoaMap.set(div.pessoa.toLowerCase(), pessoaId!);
          }

          await apiRequest("POST", "/api/dividas", {
            pessoaId,
            tipo: div.subtipo,
            valor: String(div.valor),
            dataVencimento: div.vencimento,
            status: div.status,
            dataPagamento: div.status === "pago" ? format(new Date(), "yyyy-MM-dd") : null,
            formaPagamento: div.formaPagamento,
            descricao: div.descricao,
          });
          created++;
        } else if (item.tipo === "servico") {
          await apiRequest("POST", "/api/servicos", {
            nome: item.nome,
            categoria: item.categoria,
            valorMensal: String(item.valor),
            dataCobranca: item.diaCobranca,
            formaPagamento: "pix",
            status: "ativo",
          });
          created++;
        } else if (item.tipo === "cartao") {
          let cartaoId = cartaoMap.get(item.cartao.toLowerCase());

          if (!cartaoId) {
            const first = cartoes[0];
            if (first) {
              cartaoId = first.id;
            } else {
              const res = await apiRequest("POST", "/api/cartoes", {
                nome: item.cartao,
                limite: "5000",
                melhorDiaCompra: 1,
                diaVencimento: 10,
              });
              const newCartao = await res.json();
              cartaoId = newCartao.id;
              cartaoMap.set(item.cartao.toLowerCase(), cartaoId!);
            }
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
          created++;
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
  };

  const handleCancelar = () => {
    setPreview(null);
    setErros([]);
    setDone(false);
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto" data-testid="importar-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importar por Texto</h1>
        <p className="text-muted-foreground">
          Cole um texto com suas anotacoes financeiras e o sistema vai interpretar automaticamente
        </p>
      </div>

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
              onChange={(e) => setTexto(e.target.value)}
              className="min-h-[200px] font-mono text-sm resize-none"
            />

            <div className="flex gap-3">
              <Button
                onClick={handleAnalisar}
                disabled={!texto.trim()}
                className="flex-1"
                data-testid="button-analisar"
              >
                <Zap className="w-4 h-4 mr-2" /> Analisar texto
              </Button>
              <Button
                variant="outline"
                onClick={() => setTexto(EXAMPLE_TEXT)}
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
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Preview da importacao</h2>
              <p className="text-sm text-muted-foreground">
                {preview.length} registro(s) identificado(s)
                {erros.length > 0 && ` · ${erros.length} linha(s) ignorada(s)`}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCancelar}>
              <X className="w-4 h-4 mr-1" /> Cancelar
            </Button>
          </div>

          {erros.length > 0 && (
            <Alert className="border-amber-500/20 bg-amber-500/5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <AlertDescription>
                <p className="font-medium text-amber-700 mb-2">Linhas nao interpretadas:</p>
                <ul className="space-y-1">
                  {erros.map((e) => (
                    <li key={e.linha} className="text-sm text-amber-600">
                      Linha {e.linha}: <span className="font-mono">{e.texto}</span>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {preview.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <FileText className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-muted-foreground">Nenhum registro foi identificado no texto.</p>
                <Button variant="outline" className="mt-4" onClick={handleCancelar}>
                  Tentar novamente
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="space-y-2">
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
                              <Badge variant={
                                item.tipo === "divida"
                                  ? item.subtipo === "receber" ? "default" : "destructive"
                                  : "secondary"
                              }>
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
                              ? formatCurrency(item.valor) + "/mes"
                              : formatCurrency(item.valor) + "/x"}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                            data-testid={`button-remove-preview-${index}`}
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

              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  onClick={handleConfirmar}
                  disabled={importing || preview.length === 0}
                  data-testid="button-confirmar-importacao"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {importing ? "Importando..." : `Confirmar ${preview.length} registro(s)`}
                </Button>
                <Button variant="outline" onClick={handleCancelar} data-testid="button-cancelar-importacao">
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
