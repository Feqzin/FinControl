import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  DollarSign, TrendingUp, Shield, BarChart3, Eye, EyeOff, Target, Copy, Check,
} from "lucide-react";

function PasswordInput({ id, placeholder, value, onChange, testId }: {
  id: string; placeholder: string; value: string; onChange: (v: string) => void; testId?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        data-testid={testId}
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
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const checks = [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const score = checks.filter(Boolean).length;
  const labels = ["Muito fraca", "Fraca", "Boa", "Forte"];
  const colors = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500"];
  const textColors = ["text-red-600", "text-orange-600", "text-amber-600", "text-emerald-600"];
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? colors[score - 1] : "bg-muted"}`} />
        ))}
      </div>
      <p className={`text-xs ${textColors[score - 1] || "text-muted-foreground"}`}>
        {score > 0 ? labels[score - 1] : ""}
        {password.length > 0 && password.length < 8 && " · Minimo 8 caracteres"}
      </p>
    </div>
  );
}

export default function AuthPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({ nomeCompleto: "", username: "", password: "" });
  const [tab, setTab] = useState("login");

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotUsername, setForgotUsername] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync(loginData);
    } catch (error: any) {
      toast({ title: "Erro ao entrar", description: error.message, variant: "destructive" });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerData.password.length < 8) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    try {
      await register.mutateAsync(registerData);
    } catch (error: any) {
      toast({ title: "Erro ao criar conta", description: error.message, variant: "destructive" });
    }
  };

  const handleDemoLogin = async () => {
    try {
      await login.mutateAsync({ username: "demo", password: "demo123" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { username: forgotUsername });
      const data = await res.json();
      if (data.resetLink) {
        setResetLink(data.resetLink);
      } else {
        toast({ title: "Enviado", description: data.message });
        setForgotMode(false);
      }
    } catch {
      toast({ title: "Erro ao processar", variant: "destructive" });
    } finally {
      setForgotLoading(false);
    }
  };

  const copyLink = () => {
    if (resetLink) {
      navigator.clipboard.writeText(window.location.origin + resetLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex" data-testid="auth-page">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-primary mb-4">
              <DollarSign className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">FinControl</h1>
            <p className="text-muted-foreground mt-1">Controle financeiro pessoal</p>
          </div>

          {forgotMode ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Redefinir senha</CardTitle>
                <CardDescription>Informe seu usuario para gerar o link de redefinicao</CardDescription>
              </CardHeader>
              <CardContent>
                {resetLink ? (
                  <div className="space-y-4">
                    <div className="p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
                      Link gerado. Em producao, este link seria enviado por email.
                    </div>
                    <div className="flex gap-2">
                      <Input value={window.location.origin + resetLink} readOnly className="text-xs" />
                      <Button type="button" variant="outline" size="icon" onClick={copyLink}>
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => { window.location.href = resetLink; }}
                    >
                      Ir para redefinicao
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={() => { setForgotMode(false); setResetLink(null); }}>
                      Voltar ao login
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgot} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Usuario</Label>
                      <Input
                        data-testid="input-forgot-username"
                        placeholder="seu@email.com"
                        value={forgotUsername}
                        onChange={(e) => setForgotUsername(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={forgotLoading} data-testid="button-forgot-submit">
                      {forgotLoading ? "Processando..." : "Gerar link"}
                    </Button>
                    <Button variant="ghost" className="w-full" type="button" onClick={() => setForgotMode(false)}>
                      Voltar ao login
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          ) : (
            <>
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" data-testid="tab-login">Entrar</TabsTrigger>
                  <TabsTrigger value="register" data-testid="tab-register">Criar conta</TabsTrigger>
                </TabsList>

                <TabsContent value="login">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Bem-vindo de volta</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="login-username">Usuario</Label>
                          <Input
                            id="login-username"
                            data-testid="input-login-username"
                            placeholder="seu@email.com"
                            value={loginData.username}
                            onChange={(e) => setLoginData({ ...loginData, username: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="login-password">Senha</Label>
                          <PasswordInput
                            id="login-password"
                            testId="input-login-password"
                            placeholder="Sua senha"
                            value={loginData.password}
                            onChange={(v) => setLoginData({ ...loginData, password: v })}
                          />
                        </div>
                        <Button
                          type="button"
                          variant="link"
                          className="p-0 h-auto text-xs text-muted-foreground"
                          onClick={() => setForgotMode(true)}
                          data-testid="link-forgot-password"
                        >
                          Esqueci minha senha
                        </Button>
                        <Button
                          type="submit"
                          className="w-full"
                          data-testid="button-login"
                          disabled={login.isPending}
                        >
                          {login.isPending ? "Entrando..." : "Entrar"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="register">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Criar sua conta</CardTitle>
                      <CardDescription>Seus dados ficam isolados e seguros</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reg-nome">Nome completo</Label>
                          <Input
                            id="reg-nome"
                            data-testid="input-register-nome"
                            placeholder="Seu nome"
                            value={registerData.nomeCompleto}
                            onChange={(e) => setRegisterData({ ...registerData, nomeCompleto: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-username">Usuario</Label>
                          <Input
                            id="reg-username"
                            data-testid="input-register-username"
                            placeholder="seu@email.com"
                            value={registerData.username}
                            onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-password">Senha</Label>
                          <PasswordInput
                            id="reg-password"
                            testId="input-register-password"
                            placeholder="Minimo 8 caracteres"
                            value={registerData.password}
                            onChange={(v) => setRegisterData({ ...registerData, password: v })}
                          />
                          <PasswordStrength password={registerData.password} />
                        </div>
                        <Button
                          type="submit"
                          className="w-full"
                          data-testid="button-register"
                          disabled={register.isPending}
                        >
                          {register.isPending ? "Criando..." : "Criar conta"}
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              <div className="mt-4">
                <div className="relative flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleDemoLogin}
                  disabled={login.isPending}
                  data-testid="button-demo-login"
                >
                  Testar versao demo
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Explore o app sem criar conta. Dados de exemplo incluidos.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-primary/5 items-center justify-center p-12">
        <div className="max-w-md space-y-8">
          <h2 className="text-3xl font-bold tracking-tight">Organize suas finanças com simplicidade</h2>
          <p className="text-muted-foreground text-lg">
            Controle dívidas, cartões de crédito, assinaturas e muito mais em um único lugar.
          </p>
          <div className="space-y-4">
            {[
              { icon: TrendingUp, title: "Previsão financeira", desc: "Saiba quanto entra e sai todo mês" },
              { icon: Shield, title: "Dados isolados e seguros", desc: "Cada usuário tem seu próprio espaço privado" },
              { icon: Target, title: "Metas financeiras", desc: "Acompanhe seus objetivos com progresso visual" },
              { icon: BarChart3, title: "Relatórios detalhados", desc: "Acompanhe seus gastos com gráficos interativos" },
            ].map(({ icon: Icon, title, desc }) => (
              <div className="flex items-start gap-3" key={title}>
                <div className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 flex-shrink-0">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-muted-foreground">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
