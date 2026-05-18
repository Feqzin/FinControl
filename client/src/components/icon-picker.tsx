import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandIconDisplay, LIBRARY_ICONS } from "@/lib/brand-icons";
import { Check, ImagePlus, RotateCcw, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  addOfficialIconToLibrary,
  addOfficialPackToLibrary,
  fetchOfficialIconPacks,
  fetchOfficialIcons,
  type OfficialIconApiModel,
  type OfficialIconPackApiModel,
} from "@/services/api/official-icons";
import {
  createUserIconLibraryItem,
  fetchUserIconLibrary,
  type UserIconLibraryItemApiModel,
} from "@/services/api/user-icon-library";

interface IconPickerProps {
  value?: string | null;
  name?: string;
  onChange: (value: string | null) => void;
  size?: "sm" | "md" | "lg";
}

const CATEGORY_LABELS: Record<string, string> = {
  bancos: "Bancos",
  servicos: "Serviços",
  carteiras: "Carteiras",
};

const CATEGORIES = ["bancos", "servicos", "carteiras"] as const;
const ICON_UPLOAD_MAX_BYTES = 512 * 1024;

export function IconPicker({ value, name = "", onChange, size = "md" }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [exploreSearch, setExploreSearch] = useState("");
  const [exploreCategory, setExploreCategory] = useState("all");
  const [explorePackId, setExplorePackId] = useState("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: personalIcons = [], isLoading: isLoadingPersonalIcons } = useQuery<UserIconLibraryItemApiModel[]>({
    queryKey: ["/api/user-icon-library"],
    queryFn: fetchUserIconLibrary,
    enabled: open,
    staleTime: 60_000,
  });

  const { data: officialPacks = [] } = useQuery<OfficialIconPackApiModel[]>({
    queryKey: ["/api/icons/packs"],
    queryFn: fetchOfficialIconPacks,
    enabled: open,
    staleTime: 60_000,
  });

  const { data: officialIcons = [], isLoading: isLoadingOfficialIcons } = useQuery<OfficialIconApiModel[]>({
    queryKey: ["/api/icons/official", exploreSearch, exploreCategory, explorePackId],
    queryFn: () =>
      fetchOfficialIcons({
        search: exploreSearch || undefined,
        category: exploreCategory !== "all" ? exploreCategory : undefined,
        packId: explorePackId !== "all" ? explorePackId : undefined,
      }),
    enabled: open,
    staleTime: 60_000,
  });

  const officialIconsInLibrary = useMemo(
    () => new Set(personalIcons.map((icon) => icon.officialIconId).filter((id): id is string => Boolean(id))),
    [personalIcons],
  );

  const uploadIconMutation = useMutation({
    mutationFn: async (payload: { imageDataUrl: string; name?: string | null }) =>
      createUserIconLibraryItem(payload),
    onSuccess: (icon) => {
      onChange(icon.imageUrl);
      setUploadPreview(null);
      setUploadFileName("");
      setOpen(false);
      toast({
        title: "Ícone salvo na sua biblioteca.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o ícone.";
      toast({
        title: "Erro ao salvar ícone",
        description: message,
        variant: "destructive",
      });
    },
  });

  const addOfficialIconMutation = useMutation({
    mutationFn: async (iconId: string) => addOfficialIconToLibrary(iconId),
    onSuccess: (result) => {
      toast({
        title: result.alreadyInLibrary ? "Ícone já estava na sua biblioteca." : "Ícone adicionado à sua biblioteca.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível adicionar o ícone.";
      toast({
        title: "Erro ao adicionar ícone",
        description: message,
        variant: "destructive",
      });
    },
  });

  const addOfficialPackMutation = useMutation({
    mutationFn: async (packId: string) => addOfficialPackToLibrary(packId),
    onSuccess: (result) => {
      toast({
        title: "Pack adicionado à sua biblioteca.",
        description: `${result.addedCount} ícone(s) novo(s) e ${result.alreadyInLibraryCount} já existente(s).`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível adicionar o pack.";
      toast({
        title: "Erro ao adicionar pack",
        description: message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Formato inválido", description: "Use PNG, JPG ou SVG", variant: "destructive" });
      return;
    }
    if (file.size > ICON_UPLOAD_MAX_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: "Use um ícone de até 512 KB.",
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setUploadPreview(dataUrl);
      setUploadFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSelectLibrary = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  const handleSelectPersonal = (imageUrl: string) => {
    onChange(imageUrl);
    setOpen(false);
  };

  const handleConfirmUpload = () => {
    if (!uploadPreview) return;
    uploadIconMutation.mutate({
      imageDataUrl: uploadPreview,
      name: uploadFileName || "Ícone personalizado",
    });
  };

  const handleReset = () => {
    onChange(null);
    setOpen(false);
    setUploadPreview(null);
    setUploadFileName("");
  };

  const personalOfficialIconIds = officialIconsInLibrary;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="button-alterar-icone"
        className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 p-2 transition-colors hover:border-primary hover:bg-accent"
      >
        <BrandIconDisplay name={name} iconeId={value} size={size} />
        <div className="text-left">
          <p className="text-xs font-medium">Ícone</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ImagePlus className="h-3 w-3" />
            Alterar ícone
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alterar Ícone</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="biblioteca">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="biblioteca">Biblioteca</TabsTrigger>
              <TabsTrigger value="explorar">Explorar ícones</TabsTrigger>
              <TabsTrigger value="upload">Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="biblioteca" className="mt-4 space-y-4">
              {CATEGORIES.map((cat) => {
                const items = LIBRARY_ICONS.filter((i) => i.category === cat);
                return (
                  <div key={cat}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {CATEGORY_LABELS[cat]}
                    </p>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                      {items.map((item) => {
                        const isSelected = value === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => handleSelectLibrary(item.key)}
                            data-testid={`icon-option-${item.key}`}
                            className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-all hover:bg-accent ${
                              isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                            }`}
                          >
                            <div className="relative">
                              <BrandIconDisplay name={item.label} iconeId={item.key} size="md" />
                              {isSelected ? (
                                <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                                  <Check className="h-2.5 w-2.5 text-primary-foreground" />
                                </div>
                              ) : null}
                            </div>
                            <span className="text-center text-[10px] leading-tight text-muted-foreground">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Meus ícones
                </p>
                {isLoadingPersonalIcons ? (
                  <p className="text-xs text-muted-foreground">Carregando ícones personalizados...</p>
                ) : personalIcons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Você ainda não enviou ícones personalizados.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                    {personalIcons.map((item) => {
                      const isSelected = value === item.imageUrl;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectPersonal(item.imageUrl)}
                          data-testid={`icon-personal-option-${item.id}`}
                          className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-all hover:bg-accent ${
                            isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                          }`}
                        >
                          <div className="relative">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="h-10 w-10 rounded-xl object-cover"
                            />
                            {isSelected ? (
                              <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                                <Check className="h-2.5 w-2.5 text-primary-foreground" />
                              </div>
                            ) : null}
                          </div>
                          <span className="line-clamp-2 text-center text-[10px] leading-tight text-muted-foreground">
                            {item.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {value ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 w-full"
                  onClick={handleReset}
                  data-testid="button-reset-icone"
                >
                  <RotateCcw className="mr-2 h-3 w-3" />
                  Remover ícone personalizado (usar padrão)
                </Button>
              ) : null}
            </TabsContent>

            <TabsContent value="explorar" className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input
                  value={exploreSearch}
                  onChange={(event) => setExploreSearch(event.target.value)}
                  placeholder="Buscar ícone oficial"
                  aria-label="Buscar ícone oficial"
                  className="sm:col-span-2"
                />
                <Select value={exploreCategory} onValueChange={setExploreCategory}>
                  <SelectTrigger aria-label="Filtrar categoria de ícones oficiais">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas categorias</SelectItem>
                    <SelectItem value="bancos">Bancos</SelectItem>
                    <SelectItem value="servicos">Serviços</SelectItem>
                    <SelectItem value="carteiras">Carteiras</SelectItem>
                    <SelectItem value="marketplaces">Marketplaces</SelectItem>
                    <SelectItem value="transporte">Transporte</SelectItem>
                    <SelectItem value="supermercados">Supermercados</SelectItem>
                    <SelectItem value="games">Games</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Select value={explorePackId} onValueChange={setExplorePackId}>
                <SelectTrigger aria-label="Filtrar pack oficial">
                  <SelectValue placeholder="Pack oficial" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os packs</SelectItem>
                  {officialPacks.map((pack) => (
                    <SelectItem key={pack.id} value={pack.id}>
                      {pack.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {officialPacks.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Packs disponíveis
                  </p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {officialPacks.map((pack) => {
                      const allAlreadyAdded = pack.iconsCount > 0 && pack.addedIconsCount >= pack.iconsCount;
                      return (
                        <div key={pack.id} className="rounded-lg border p-3">
                          <p className="text-sm font-medium">{pack.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {pack.description || "Sem descrição"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {pack.addedIconsCount}/{pack.iconsCount} na sua biblioteca
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            variant={allAlreadyAdded ? "outline" : "default"}
                            className="mt-2 w-full"
                            disabled={allAlreadyAdded || addOfficialPackMutation.isPending}
                            onClick={() => addOfficialPackMutation.mutate(pack.id)}
                          >
                            {allAlreadyAdded ? "Na sua biblioteca" : "Adicionar pack"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Ícones oficiais
                </p>
                {isLoadingOfficialIcons ? (
                  <p className="text-xs text-muted-foreground">Carregando ícones oficiais...</p>
                ) : officialIcons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum ícone oficial encontrado para esse filtro.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {officialIcons.map((icon) => {
                      const alreadyAdded = icon.alreadyInLibrary || personalOfficialIconIds.has(icon.id);
                      return (
                        <div key={icon.id} className="rounded-lg border p-2">
                          <div className="flex items-center gap-2">
                            <img
                              src={icon.imageUrl}
                              alt={icon.name}
                              className="h-9 w-9 rounded-lg object-cover"
                            />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium">{icon.name}</p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {icon.category || icon.packName || "Sem categoria"}
                              </p>
                            </div>
                          </div>
                          <div className="mt-2 space-y-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={alreadyAdded ? "outline" : "default"}
                              className="h-7 w-full text-xs"
                              disabled={addOfficialIconMutation.isPending && addOfficialIconMutation.variables === icon.id}
                              onClick={() => {
                                if (alreadyAdded) {
                                  handleSelectPersonal(icon.imageUrl);
                                  return;
                                }
                                addOfficialIconMutation.mutate(icon.id);
                              }}
                            >
                              {alreadyAdded ? "Na sua biblioteca" : "Adicionar à minha biblioteca"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="mt-4 space-y-4">
              <div
                className="cursor-pointer space-y-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors hover:bg-accent/50"
                onClick={() => fileRef.current?.click()}
              >
                {uploadPreview ? (
                  <img
                    src={uploadPreview}
                    alt="Preview"
                    className="mx-auto h-20 w-20 rounded-xl object-cover"
                  />
                ) : value && value.startsWith("data:") ? (
                  <img
                    src={value}
                    alt="Ícone atual"
                    className="mx-auto h-20 w-20 rounded-xl object-cover"
                  />
                ) : (
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-xl bg-muted">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">Clique para selecionar</p>
                  <p className="text-xs text-muted-foreground">PNG, JPG ou SVG</p>
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                className="hidden"
                onChange={handleFileChange}
                data-testid="input-upload-icone"
              />

              {uploadPreview ? (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleConfirmUpload}
                  data-testid="button-confirmar-upload"
                  disabled={uploadIconMutation.isPending}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {uploadIconMutation.isPending ? "Salvando..." : "Salvar na biblioteca e usar este ícone"}
                </Button>
              ) : null}

              {value ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleReset}
                >
                  <RotateCcw className="mr-2 h-3 w-3" />
                  Remover ícone personalizado
                </Button>
              ) : null}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
