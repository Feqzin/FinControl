import { useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  User, Download, Shield, Database, LogOut, CheckCircle, HelpCircle, Upload
} from "lucide-react";
import { TourRestartButton } from "@/components/onboarding-tour";
import type {
  Cartao,
  CompraCartao,
  Divida,
  Meta,
  ParcelaCompra,
  Pessoa,
  PessoaSaldoMovimentacao,
  Servico,
  ServicoPagamento,
  ServicoPessoa,
} from "@shared/schema";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

type ImportBackupResponse = {
  pessoasImportadas: number;
  cartoesImportados: number;
  dividasImportadas: number;
  comprasImportadas: number;
  servicosImportados: number;
  servicoPessoasImportados?: number;
  servicoPagamentosImportados?: number;
  saldoMovimentacoesImportadas?: number;
  metasImportadas: number;
};

function parseImportApiError(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Falha ao importar backup. Tente novamente.";
  }

  const message = error.message ?? "";
  const jsonStart = message.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(message.slice(jsonStart)) as { message?: unknown };
      if (typeof parsed.message === "string" && parsed.message.trim() !== "") {
        return parsed.message;
      }
    } catch {
      // Mantem fallback padrao.
    }
  }

  return message || "Falha ao importar backup. Tente novamente.";
}

export default function PerfilPage() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [nomeCompleto, setNomeCompleto] = useState((user as any)?.nomeCompleto || "");
  const [arquivoImportacao, setArquivoImportacao] = useState<File | null>(null);
  const inputImportacaoRef = useRef<HTMLInputElement | null>(null);

  const { data: dividas = [] } = useQuery<Divida[]>({ queryKey: ["/api/dividas"] });
  const { data: servicos = [] } = useQuery<Servico[]>({ queryKey: ["/api/servicos"] });
  const { data: servicoPessoas = [] } = useQuery<ServicoPessoa[]>({ queryKey: ["/api/servico-pessoas"] });
  const { data: servicoPagamentos = [] } = useQuery<ServicoPagamento[]>({ queryKey: ["/api/servico-pagamentos"] });
  const { data: pessoaSaldoMovimentacoes = [] } = useQuery<PessoaSaldoMovimentacao[]>({
    queryKey: ["/api/pessoas/saldo-movimentacoes"],
  });
  const { data: cartoes = [] } = useQuery<Cartao[]>({ queryKey: ["/api/cartoes"] });
  const { data: compras = [] } = useQuery<CompraCartao[]>({ queryKey: ["/api/compras-cartao"] });
  const { data: parcelasCompra = [] } = useQuery<ParcelaCompra[]>({ queryKey: ["/api/parcelas-compra"] });
  const { data: pessoas = [] } = useQuery<Pessoa[]>({ queryKey: ["/api/pessoas"] });
  const { data: metas = [] } = useQuery<Meta[]>({ queryKey: ["/api/metas"] });

  const updateProfile = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/auth/profile", { nomeCompleto });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Perfil atualizado" });
    },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  const importBackup = useMutation({
    mutationFn: async (arquivo: File): Promise<ImportBackupResponse> => {
      const texto = await arquivo.text();
      let backup: unknown;

      try {
        backup = JSON.parse(texto);
      } catch {
        throw new Error("Arquivo JSON invalido. Verifique o arquivo e tente novamente.");
      }

      const res = await apiRequest("POST", "/api/import", backup);
      return res.json();
    },
    onSuccess: (resultado) => {
      setArquivoImportacao(null);
      if (inputImportacaoRef.current) {
        inputImportacaoRef.current.value = "";
      }

      queryClient.invalidateQueries({ queryKey: ["/api/pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dividas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cartoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compras-cartao"] });
      queryClient.invalidateQueries({ queryKey: ["/api/parcelas-compra"] });
      queryClient.invalidateQueries({ queryKey: ["/api/servicos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pessoas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/servico-pagamentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pessoas/saldo-movimentacoes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/metas"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/score"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial/summary"] });

      toast({
        title: "Importacao concluida",
        description: `Pessoas: ${resultado.pessoasImportadas}, Cartoes: ${resultado.cartoesImportados}, Dividas: ${resultado.dividasImportadas}, Compras: ${resultado.comprasImportadas}, Servicos: ${resultado.servicosImportados}, Vinculos de servico: ${resultado.servicoPessoasImportados ?? 0}, Pagamentos de servico: ${resultado.servicoPagamentosImportados ?? 0}, Movimentações de saldo: ${resultado.saldoMovimentacoesImportadas ?? 0}, Metas: ${resultado.metasImportadas}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao importar backup",
        description: parseImportApiError(error),
        variant: "destructive",
      });
    },
  });

  const exportarDados = () => {
    const data = {
      exportadoEm: new Date().toISOString(),
      usuario: user?.username,
      pessoas,
      dividas,
      cartoes,
      compras,
      parcelasCompra,
      servicos,
      servicoPessoas,
      servicoPagamentos,
      pessoaSaldoMovimentacoes,
      metas,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fincontrol-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Backup exportado com sucesso" });
  };

  const importarDados = () => {
    if (!arquivoImportacao) {
      toast({
        title: "Selecione um arquivo",
        description: "Escolha um arquivo .json de backup para importar.",
        variant: "destructive",
      });
      return;
    }

    const confirmed = window.confirm(
      "Importar novamente pode duplicar dados. Deseja continuar com a importação?",
    );
    if (!confirmed) {
      return;
    }

    importBackup.mutate(arquivoImportacao);
  };

  const totalReceber = dividas.filter((d) => d.tipo === "receber" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);
  const totalPagar = dividas.filter((d) => d.tipo === "pagar" && d.status === "pendente").reduce((s, d) => s + Number(d.valor), 0);

  return (
    <div className="p-6 space-y-6 max-w-2xl" data-testid="perfil-page">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Meu Perfil</h1>
        <p className="text-muted-foreground">Gerencie sua conta e exporte seus dados</p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4" /> Informacoes pessoais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary font-bold text-2xl flex-shrink-0">
              {((user as any)?.nomeCompleto || user?.username || "?")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-lg">{(user as any)?.nomeCompleto || user?.username}</p>
              <p className="text-sm text-muted-foreground">{user?.username}</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input
                data-testid="input-nome-completo"
                value={nomeCompleto}
                onChange={(e) => setNomeCompleto(e.target.value)}
                placeholder="Seu nome completo"
              />
            </div>
            <div className="space-y-2">
              <Label>Usuario</Label>
              <Input value={user?.username || ""} disabled />
            </div>
          </div>
          <Button
            onClick={() => updateProfile.mutate()}
            disabled={updateProfile.isPending}
            data-testid="button-save-profile"
          >
            {updateProfile.isPending ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-4 h-4" /> Status da conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Dados isolados — apenas voce acessa sua conta</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Senha protegida com criptografia segura</span>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 flex-shrink-0" />
              <span>Sessao segura com cookie httpOnly</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4" /> Resumo dos dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: "Pessoas", value: pessoas.length },
              { label: "Dividas", value: dividas.length },
              { label: "Cartoes", value: cartoes.length },
              { label: "Servicos", value: servicos.length },
              { label: "Metas", value: metas.length },
              { label: "Compras", value: compras.length },
              { label: "Mov. saldo", value: pessoaSaldoMovimentacoes.length },
            ].map(({ label, value }) => (
              <div key={label} className="p-3 rounded-md bg-muted/40 text-center">
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div className="p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20">
              <p className="text-xs text-muted-foreground">A receber</p>
              <p className="font-bold text-emerald-600">{formatCurrency(totalReceber)}</p>
            </div>
            <div className="p-3 rounded-md bg-red-500/5 border border-red-500/20">
              <p className="text-xs text-muted-foreground">A pagar</p>
              <p className="font-bold text-red-600">{formatCurrency(totalPagar)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="w-4 h-4" /> Backup de dados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Exporte todos os seus dados em formato JSON para backup ou migracao.
          </p>
          <Button
            variant="outline"
            onClick={exportarDados}
            data-testid="button-export"
            className="w-full"
          >
            <Download className="w-4 h-4 mr-2" /> Exportar dados (JSON)
          </Button>
          <Separator />
          <p className="text-sm text-muted-foreground">
            Importe um backup JSON para restaurar seus dados nesta conta.
          </p>
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
            Importar novamente pode duplicar dados.
          </p>
          <Input
            ref={inputImportacaoRef}
            type="file"
            accept=".json,application/json"
            onChange={(e) => setArquivoImportacao(e.target.files?.[0] ?? null)}
            disabled={importBackup.isPending}
            data-testid="input-import-backup"
          />
          <Button
            onClick={importarDados}
            disabled={!arquivoImportacao || importBackup.isPending}
            data-testid="button-import-backup"
            className="w-full"
          >
            {importBackup.isPending ? (
              "Importando..."
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" /> Importar dados (JSON)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="w-4 h-4" /> Ajuda e Tutorial
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Precisa de uma ajuda para entender como o sistema funciona?
          </p>
          <TourRestartButton />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <Button
            variant="destructive"
            onClick={() => logout.mutate()}
            className="w-full"
            data-testid="button-logout-profile"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
