import { Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CommunityProfileVisibility } from "@/services/api/community-profiles";

type PerfilCommunityProfileCardProps = {
  isVisible: boolean;
  bio: string;
  onBioChange: (value: string) => void;
  profileVisibility: CommunityProfileVisibility;
  onProfileVisibilityChange: (value: CommunityProfileVisibility) => void;
  onSave: () => void;
  onViewProfile: () => void;
  saveDisabled: boolean;
  canViewProfile: boolean;
};

export function PerfilCommunityProfileCard({
  isVisible,
  bio,
  onBioChange,
  profileVisibility,
  onProfileVisibilityChange,
  onSave,
  onViewProfile,
  saveDisabled,
  canViewProfile,
}: PerfilCommunityProfileCardProps) {
  return (
    <Card className={isVisible ? "fintech-surface desktop-hover-lift touch-feedback" : "hidden"}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe2 className="h-4 w-4" />
          Perfil de criador
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Controle como sua autoria e seus packs aparecem para outros usuários autenticados.
        </p>
        <div className="space-y-2">
          <Label htmlFor="community-profile-bio">Apresentação</Label>
          <Textarea
            id="community-profile-bio"
            value={bio}
            onChange={(event) => onBioChange(event.target.value)}
            maxLength={280}
            rows={4}
            placeholder="Conte brevemente sobre os ícones e packs que você cria."
          />
          <p className="text-right text-xs text-muted-foreground">{bio.length}/280</p>
        </div>
        <div className="space-y-2">
          <Label>Visibilidade do perfil</Label>
          <Select
            value={profileVisibility}
            onValueChange={(value) => onProfileVisibilityChange(value as CommunityProfileVisibility)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Privado</SelectItem>
              <SelectItem value="community">Visível na comunidade</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            O perfil comunitário exige login e nunca exibe e-mail ou informações financeiras.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button onClick={onSave} disabled={saveDisabled}>
            {saveDisabled ? "Salvando..." : "Salvar perfil de criador"}
          </Button>
          <Button variant="outline" onClick={onViewProfile} disabled={!canViewProfile}>
            Ver meu perfil
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
