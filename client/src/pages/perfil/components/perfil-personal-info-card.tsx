import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type PerfilPersonalInfoCardProps = {
  isVisible: boolean;
  title: string;
  avatarText: string;
  displayName: string;
  usernameLabel: string;
  nomeCompleto: string;
  onNomeCompletoChange: (value: string) => void;
  publicUsername: string;
  onPublicUsernameChange: (value: string) => void;
  publicUsernameDisabled: boolean;
  publicUsernameHelperText: string;
  fullNameVisibility: "private" | "public";
  onFullNameVisibilityChange: (value: "private" | "public") => void;
  onSave: () => void;
  saveDisabled: boolean;
  saveLabel: string;
};

export function PerfilPersonalInfoCard({
  isVisible,
  title,
  avatarText,
  displayName,
  usernameLabel,
  nomeCompleto,
  onNomeCompletoChange,
  publicUsername,
  onPublicUsernameChange,
  publicUsernameDisabled,
  publicUsernameHelperText,
  fullNameVisibility,
  onFullNameVisibilityChange,
  onSave,
  saveDisabled,
  saveLabel,
}: PerfilPersonalInfoCardProps) {
  return (
    <Card className={isVisible ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
      <CardHeader className="pb-4">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="w-4 h-4" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary font-bold text-2xl flex-shrink-0">
            {avatarText}
          </div>
          <div>
            <p className="font-semibold text-lg">{displayName}</p>
            <p className="text-sm text-muted-foreground">{usernameLabel}</p>
          </div>
        </div>
        <Separator />
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Nome completo</Label>
            <Input
              data-testid="input-nome-completo"
              value={nomeCompleto}
              onChange={(e) => onNomeCompletoChange(e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>
          <div className="space-y-2">
            <Label>Usuário público</Label>
            <Input
              value={publicUsername}
              onChange={(event) => onPublicUsernameChange(event.target.value)}
              placeholder="ex: fernandoq87"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={publicUsernameDisabled}
            />
            <p className="text-xs text-muted-foreground">
              {publicUsernameHelperText}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Privacidade do nome completo</Label>
            <Select
              value={fullNameVisibility}
              onValueChange={(value) => onFullNameVisibilityChange(value as "private" | "public")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Não exibir publicamente</SelectItem>
                <SelectItem value="public">Exibir publicamente</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Por padrão, outros usuários veem apenas seu usuário público.
            </p>
          </div>
        </div>
        <Button
          onClick={onSave}
          disabled={saveDisabled}
          data-testid="button-save-profile"
        >
          {saveLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
