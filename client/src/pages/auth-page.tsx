import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, TrendingUp, Shield, BarChart3 } from "lucide-react";

export default function AuthPage() {
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [loginData, setLoginData] = useState({ username: "", password: "" });
  const [registerData, setRegisterData] = useState({ username: "", password: "" });

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
    try {
      await register.mutateAsync(registerData);
    } catch (error: any) {
      toast({ title: "Erro ao registrar", description: error.message, variant: "destructive" });
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

          <Tabs defaultValue="login" className="w-full">
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
                      <Label htmlFor="login-username">E-mail ou usuario</Label>
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
                      <Input
                        id="login-password"
                        data-testid="input-login-password"
                        type="password"
                        placeholder="Sua senha"
                        value={loginData.password}
                        onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" data-testid="button-login" disabled={login.isPending}>
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
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reg-username">E-mail ou usuario</Label>
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
                      <Input
                        id="reg-password"
                        data-testid="input-register-password"
                        type="password"
                        placeholder="Crie uma senha"
                        value={registerData.password}
                        onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" data-testid="button-register" disabled={register.isPending}>
                      {register.isPending ? "Criando..." : "Criar conta"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-primary/5 items-center justify-center p-12">
        <div className="max-w-md space-y-8">
          <h2 className="text-3xl font-bold tracking-tight">Organize suas financas com simplicidade</h2>
          <p className="text-muted-foreground text-lg">
            Controle dividas, cartoes de credito, assinaturas e muito mais em um unico lugar.
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Previsao financeira</p>
                <p className="text-sm text-muted-foreground">Saiba quanto entra e sai todo mes</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                <Shield className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Controle de dividas</p>
                <p className="text-sm text-muted-foreground">Gerencie quem te deve e para quem voce deve</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex items-center justify-center w-8 h-8 rounded-md bg-primary/10">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Relatorios detalhados</p>
                <p className="text-sm text-muted-foreground">Acompanhe seus gastos com graficos</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
