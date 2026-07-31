import { useQuery } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import {
  ArrowLeft,
  Download,
  Image,
  LockKeyhole,
  Package2,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchCommunityCreatorProfile,
  type CommunityCreatorPackApiModel,
} from "@/services/api/community-profiles";

function formatMetric(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function CreatorPackCard({ pack }: { pack: CommunityCreatorPackApiModel }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex min-h-28 items-center gap-4 border-b bg-muted/20 p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-background">
          {pack.coverImageUrl ? (
            <img
              src={pack.coverImageUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-12 w-12 object-contain"
            />
          ) : (
            <Package2 className="h-7 w-7 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <h3 className="truncate font-semibold">{pack.name}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {pack.description || "Pack comunitário publicado no FinControl."}
          </p>
        </div>
      </div>
      <CardContent className="space-y-3 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{pack.category || "Sem categoria"}</Badge>
          {pack.publicCode ? <Badge variant="outline">{pack.publicCode}</Badge> : null}
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/35 px-2 py-2">
            <p className="text-sm font-semibold">{formatMetric(pack.iconsCount)}</p>
            <p className="text-[11px] text-muted-foreground">ícones</p>
          </div>
          <div className="rounded-xl bg-muted/35 px-2 py-2">
            <p className="text-sm font-semibold">{formatMetric(pack.installCount)}</p>
            <p className="text-[11px] text-muted-foreground">instalações</p>
          </div>
          <div className="rounded-xl bg-muted/35 px-2 py-2">
            <p className="text-sm font-semibold">
              {pack.ratingAverage === null ? "—" : pack.ratingAverage.toFixed(1)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {pack.ratingCount === 1 ? "avaliação" : "avaliações"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CommunityCreatorPage() {
  const [, params] = useRoute("/comunidade/criadores/:publicCode");
  const [, navigate] = useLocation();
  const publicCode = params?.publicCode ?? "";
  const profileQuery = useQuery({
    queryKey: ["/api/community/creators", publicCode],
    queryFn: () => fetchCommunityCreatorProfile(publicCode),
    enabled: Boolean(publicCode),
  });

  if (profileQuery.isPending) {
    return (
      <div className="app-page-shell app-section-stack mx-auto max-w-5xl">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-56 w-full rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <div className="app-page-shell mx-auto max-w-2xl">
        <Button variant="ghost" className="mb-4" onClick={() => window.history.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center px-6 py-12 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <LockKeyhole className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-xl font-semibold">Perfil não disponível</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Este criador não existe ou escolheu manter o perfil privado.
            </p>
            <Button className="mt-6" onClick={() => navigate("/")}>
              Ir para o painel
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const profile = profileQuery.data;
  const avatarText = (profile.fullName || profile.displayName).replace(/^@/, "").charAt(0).toUpperCase() || "U";
  const metricCards = [
    {
      label: "Packs publicados",
      value: formatMetric(profile.metrics.packsPublished),
      icon: Package2,
    },
    {
      label: "Ícones publicados",
      value: formatMetric(profile.metrics.iconsPublished),
      icon: Image,
    },
    {
      label: "Instalações",
      value: formatMetric(profile.metrics.installs),
      icon: Download,
    },
    {
      label: "Avaliação",
      value: profile.metrics.ratingAverage === null
        ? "Sem notas"
        : `${profile.metrics.ratingAverage.toFixed(1)} (${formatMetric(profile.metrics.ratingCount)})`,
      icon: Star,
    },
  ];

  return (
    <div className="app-page-shell app-section-stack mx-auto max-w-5xl" data-testid="community-creator-page">
      <Button variant="ghost" className="w-fit" onClick={() => window.history.back()}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Voltar
      </Button>

      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        <CardContent className="-mt-10 pb-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-4 border-card bg-primary text-2xl font-bold text-primary-foreground shadow-sm">
              {avatarText}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-bold">{profile.displayName}</h1>
                {profile.isOwnProfile ? <Badge>Seu perfil</Badge> : null}
              </div>
              {profile.fullName ? (
                <p className="mt-1 text-sm text-muted-foreground">{profile.fullName}</p>
              ) : null}
              <p className="mt-1 text-xs text-muted-foreground">ID público: {profile.publicCode}</p>
            </div>
            {profile.isOwnProfile ? (
              <Button variant="outline" onClick={() => navigate("/perfil")}>
                Editar perfil
              </Button>
            ) : null}
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-muted-foreground">
            {profile.bio || "Este criador ainda não adicionou uma apresentação."}
          </p>
        </CardContent>
      </Card>

      <section aria-labelledby="creator-metrics-title">
        <h2 id="creator-metrics-title" className="sr-only">Métricas do criador</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map((metric) => {
            const MetricIcon = metric.icon;
            return (
              <Card key={metric.label}>
                <CardContent className="flex items-center gap-3 p-4 sm:p-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MetricIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{metric.value}</p>
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="creator-packs-title">
        <div className="mb-4">
          <h2 id="creator-packs-title" className="text-xl font-semibold">Packs publicados</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Coleções ativas compartilhadas por este criador.
          </p>
        </div>
        {profile.packs.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nenhum pack publicado</CardTitle>
              <CardDescription>
                Este criador ainda não possui coleções públicas ativas.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {profile.packs.map((pack) => (
              <CreatorPackCard key={pack.id} pack={pack} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
