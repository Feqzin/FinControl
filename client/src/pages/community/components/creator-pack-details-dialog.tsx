import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Download, Loader2, PackagePlus, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import type { CommunityCreatorPackApiModel } from "@/services/api/community-profiles";
import {
  addCommunityPackToLibrary,
  fetchCommunityIconPackDetails,
} from "@/services/api/official-icons";

type CreatorPackDetailsDialogProps = {
  pack: CommunityCreatorPackApiModel | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPackAdded: () => void;
};

function formatMetric(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function CreatorPackDetailsDialog({
  pack,
  open,
  onOpenChange,
  onPackAdded,
}: CreatorPackDetailsDialogProps) {
  const { toast } = useToast();
  const detailsQuery = useQuery({
    queryKey: ["/api/icons/community/packs", pack?.id],
    queryFn: () => fetchCommunityIconPackDetails(pack?.id ?? ""),
    enabled: open && Boolean(pack?.id),
  });
  const details = detailsQuery.data;
  const allIconsAdded = Boolean(
    details
    && details.icons.length > 0
    && details.icons.every((icon) => icon.alreadyInLibrary),
  );
  const packAlreadyAdded = details?.pack.libraryStatus === "full" || allIconsAdded;

  const addPackMutation = useMutation({
    mutationFn: () => addCommunityPackToLibrary(pack?.id ?? ""),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/icons/community/packs", pack?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      onPackAdded();
      toast({
        title: result.addedCount > 0 ? "Pack adicionado" : "Pack já estava na biblioteca",
        description: result.addedCount > 0
          ? `${result.addedCount} ${result.addedCount === 1 ? "ícone adicionado" : "ícones adicionados"}.`
          : "Nenhum ícone novo precisou ser adicionado.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao adicionar pack",
        description: "Não foi possível adicionar este pack à sua biblioteca agora.",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4 pr-8">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border bg-muted/20">
              {pack?.coverImageUrl ? (
                <img
                  src={pack.coverImageUrl}
                  alt=""
                  className="h-12 w-12 object-contain"
                />
              ) : (
                <PackagePlus className="h-7 w-7 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 text-left">
              <DialogTitle>{pack?.name ?? "Detalhes do pack"}</DialogTitle>
              <DialogDescription className="mt-1">
                {pack?.description || "Pack comunitário publicado no FinControl."}
              </DialogDescription>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{pack?.category || "Sem categoria"}</Badge>
                {pack?.publicCode ? <Badge variant="outline">{pack.publicCode}</Badge> : null}
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border bg-muted/20 px-3 py-2 text-center">
            <p className="font-semibold">{formatMetric(pack?.iconsCount ?? 0)}</p>
            <p className="text-xs text-muted-foreground">ícones</p>
          </div>
          <div className="rounded-xl border bg-muted/20 px-3 py-2 text-center">
            <p className="flex items-center justify-center gap-1 font-semibold">
              <Download className="h-3.5 w-3.5" />
              {formatMetric(pack?.installCount ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">instalações</p>
          </div>
          <div className="rounded-xl border bg-muted/20 px-3 py-2 text-center">
            <p className="flex items-center justify-center gap-1 font-semibold">
              <Star className="h-3.5 w-3.5" />
              {pack?.ratingAverage === null || pack?.ratingAverage === undefined
                ? "—"
                : pack.ratingAverage.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground">avaliação</p>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="font-semibold">Ícones do pack</h3>
            {packAlreadyAdded ? (
              <Badge variant="secondary" className="gap-1">
                <Check className="h-3 w-3" />
                Na sua biblioteca
              </Badge>
            ) : null}
          </div>

          {detailsQuery.isPending ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: Math.min(pack?.iconsCount ?? 3, 6) || 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-xl" />
              ))}
            </div>
          ) : detailsQuery.isError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Não foi possível carregar os ícones deste pack.
            </div>
          ) : details?.icons.length ? (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {details.icons.map((icon) => (
                <div key={icon.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <img
                    src={icon.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-10 shrink-0 rounded-xl object-contain"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{icon.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {icon.category || "Sem categoria"}
                    </p>
                  </div>
                  {icon.alreadyInLibrary ? (
                    <Check className="h-4 w-4 shrink-0 text-primary" aria-label="Na sua biblioteca" />
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border p-4 text-sm text-muted-foreground">
              Este pack ainda não possui ícones disponíveis.
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={detailsQuery.isPending || detailsQuery.isError || packAlreadyAdded || addPackMutation.isPending}
            onClick={() => addPackMutation.mutate()}
          >
            {addPackMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : packAlreadyAdded ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <PackagePlus className="mr-2 h-4 w-4" />
            )}
            {packAlreadyAdded ? "Já adicionado" : "Adicionar pack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
