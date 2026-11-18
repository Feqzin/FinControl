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
  DollarSign, Eye, EyeOff, Copy, Check,
} from "lucide-react";
import { normalizePublicUsername, validatePublicUsername } from "@shared/public-username";

function extractApiErrorDetails(error: unknown): { message: string; errorCode: string | null } {
  const rawMessage = typeof (error as { message?: unknown } | null)?.message === "string"
    ? String((error as { message: string }).message)
    : "";
  const normalized = rawMessage.replace(/^\d+\s*:\s*/, "").trim();

  if (!normalized) {
    return { message: "Não foi possível processar a solicitação agora.", errorCode: null };
  }

  try {
    const parsed = JSON.parse(normalized) as { message?: unknown; errorCode?: unknown };
    return {
      message: typeof parsed.message === "string" && parsed.message.trim()
        ? parsed.message
        : normalized,
      errorCode: typeof parsed.errorCode === "string" && parsed.errorCode.trim()
        ? parsed.errorCode
        : null,
    };
  } catch {
    return { message: normalized, errorCode: null };
  }
}

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

export default function AuthPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [loginData, setLoginData] = useState({ identifier: "", password: "" });
  const [registerData, setRegisterData] = useState({ nomeCompleto: "", username: "", email: "", password: "" });
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
      const rawMessage = typeof error?.message === "string" ? error.message : "";
      const details = extractApiErrorDetails(error);
      const description = rawMessage.includes("401")
        ? "E-mail/usuário ou senha inválidos."
        : `${details.message}${details.errorCode ? ` (${details.errorCode})` : ""}`;
      toast({ title: "Erro ao entrar", description, variant: "destructive" });
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (registerData.password.length < 8) {
      toast({ title: "Senha muito curta", description: "A senha deve ter pelo menos 8 caracteres", variant: "destructive" });
      return;
    }
    const normalizedPublicUsername = normalizePublicUsername(registerData.username);
    const publicUsernameValidationError = validatePublicUsername(normalizedPublicUsername);
    if (publicUsernameValidationError) {
      toast({ title: "Usuário público inválido", description: publicUsernameValidationError, variant: "destructive" });
      return;
    }
    try {
      await register.mutateAsync({
        ...registerData,
        username: normalizedPublicUsername,
      });
    } catch (error: unknown) {
      const details = extractApiErrorDetails(error);
      toast({
        title: "Não foi possível criar a conta",
        description: details.message,
        variant: "destructive",
      });
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
    } catch (error) {
      toast({ title: "Não foi possível enviar", description: extractApiErrorDetails(error).message, variant: "destructive" });
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
    <div className="min-h-screen flex items-center justify-center bg-primary/5 p-4 sm:p-6" data-testid="auth-page">
      <div className="w-full flex items-center justify-center">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-md bg-primary mb-4">
              <DollarSign className="w-7 h-7 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">FinControl</h1>
            <p className="text-muted-foreground mt-1">Suas finanças em um só lugar</p>
          </div>

          {forgotMode ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Redefinir senha</CardTitle>
                <CardDescription>Informe seu e-mail ou usuário para receber o link de redefinição.</CardDescription>
              </CardHeader>
              <CardContent>
                {resetLink ? (
                  <div className="space-y-4">
                    <div className="p-3 rounded-md bg-emerald-500/5 border border-emerald-500/20 text-sm text-emerald-700">
                      Link gerado para teste local. Em produção, o envio é feito por e-mail.
                    </div>
                    <div className="flex gap-2">
                      <Input value={window.location.origin + resetLink} readOnly className="text-xs" />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={copyLink}
                        aria-label={copied ? "Link copiado" : "Copiar link de redefinição"}
                        title={copied ? "Link copiado" : "Copiar link"}
                      >
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
                      <Label>E-mail ou usuário</Label>
                      <Input
                        data-testid="input-forgot-username"
                        placeholder="seu@email.com"
                        value={forgotUsername}
                        onChange={(e) => setForgotUsername(e.target.value)}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={forgotLoading} data-testid="button-forgot-submit">
                      {forgotLoading ? "Enviando..." : "Enviar link"}
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
                          <Label htmlFor="login-username">E-mail ou usuário</Label>
                          <Input
                            id="login-username"
                            data-testid="input-login-username"
                            placeholder="seu@email.com ou usuário"
                            value={loginData.identifier}
                            onChange={(e) => setLoginData({ ...loginData, identifier: e.target.value })}
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
                          variant="ghost"
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
                      <CardDescription>Crie sua conta para começar.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <form onSubmit={handleRegister} className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reg-nome">Nome completo (opcional)</Label>
                          <Input
                            id="reg-nome"
                            data-testid="input-register-nome"
                            placeholder="Seu nome"
                            value={registerData.nomeCompleto}
                            onChange={(e) => setRegisterData({ ...registerData, nomeCompleto: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-username">Nome de usuário</Label>
                          <Input
                            id="reg-username"
                            data-testid="input-register-username"
                            placeholder="ex: fernandoq87"
                            value={registerData.username}
                            onChange={(e) => setRegisterData({ ...registerData, username: e.target.value })}
                            required
                          />
                          <p className="text-xs text-muted-foreground">
                            Pode aparecer nos recursos que você compartilhar.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-email">E-mail para recuperar a conta</Label>
                          <Input id="reg-email" type="email" autoComplete="email" placeholder="voce@exemplo.com"
                            value={registerData.email} onChange={(e) => setRegisterData({ ...registerData, email: e.target.value })} required />
                          <p className="text-xs text-muted-foreground">Usaremos este endereço para enviar o link caso você esqueça a senha.</p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="reg-password">Senha</Label>
                          <PasswordInput
                            id="reg-password"
                            testId="input-register-password"
                            placeholder="Mínimo de 8 caracteres"
                            value={registerData.password}
                            onChange={(v) => setRegisterData({ ...registerData, password: v })}
                          />
                          <p className="text-xs text-muted-foreground">Use pelo menos 8 caracteres.</p>
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

            </>
          )}
        </div>
      </div>
    </div>
  );
}
