import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Eye, EyeOff, CheckCircle } from "lucide-react";

function PasswordInput({ id, placeholder, value, onChange }: {
  id: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
        required
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function RedefinirSenhaPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "As senhas nao coincidem", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "A senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/reset-password", { token, password });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json();
        toast({ title: "Erro", description: data.message, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao redefinir senha", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" data-testid="redefinir-senha-page">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-primary mb-4">
            <DollarSign className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">FinControl</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Redefinir senha</CardTitle>
            <CardDescription>
              {token ? "Escolha uma nova senha segura" : "Token invalido ou ausente"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {done ? (
              <div className="text-center space-y-4">
                <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto" />
                <p className="font-medium">Senha redefinida com sucesso!</p>
                <Button className="w-full" onClick={() => navigate("/")}>
                  Ir para o login
                </Button>
              </div>
            ) : !token ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">Link de redefinicao invalido ou expirado.</p>
                <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
                  Voltar ao login
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nova senha</Label>
                  <PasswordInput id="new-password" placeholder="Minimo 8 caracteres" value={password} onChange={setPassword} />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar senha</Label>
                  <PasswordInput id="confirm-password" placeholder="Repita a senha" value={confirm} onChange={setConfirm} />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-reset-submit">
                  {loading ? "Redefinindo..." : "Redefinir senha"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
