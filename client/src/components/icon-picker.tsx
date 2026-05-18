import { useState, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandIconDisplay, LIBRARY_ICONS } from "@/lib/brand-icons";
import { ImagePlus, RotateCcw, Check, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
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
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { data: personalIcons = [], isLoading: isLoadingPersonalIcons } = useQuery<UserIconLibraryItemApiModel[]>({
    queryKey: ["/api/user-icon-library"],
    queryFn: fetchUserIconLibrary,
    enabled: open,
    staleTime: 60_000,
  });

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="button-alterar-icone"
        className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 p-2 hover:border-primary hover:bg-accent transition-colors"
      >
        <BrandIconDisplay name={name} iconeId={value} size={size} />
        <div className="text-left">
          <p className="text-xs font-medium">Ícone</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <ImagePlus className="w-3 h-3" />
            Alterar ícone
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Alterar Ícone</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="biblioteca">
            <TabsList className="w-full">
              <TabsTrigger value="biblioteca" className="flex-1">Biblioteca</TabsTrigger>
              <TabsTrigger value="upload" className="flex-1">Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="biblioteca" className="space-y-4 mt-4">
              {CATEGORIES.map((cat) => {
                const items = LIBRARY_ICONS.filter((i) => i.category === cat);
                return (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all hover:bg-accent ${
                              isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                            }`}
                          >
                            <div className="relative">
                              <BrandIconDisplay name={item.label} iconeId={item.key} size="md" />
                              {isSelected && (
                                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground text-center leading-tight">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
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
                          className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all hover:bg-accent ${
                            isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                          }`}
                        >
                          <div className="relative">
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-10 h-10 rounded-xl object-cover"
                            />
                            {isSelected ? (
                              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                                <Check className="w-2.5 h-2.5 text-primary-foreground" />
                              </div>
                            ) : null}
                          </div>
                          <span className="text-[10px] text-muted-foreground text-center leading-tight">
                            {item.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {value && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={handleReset}
                  data-testid="button-reset-icone"
                >
                  <RotateCcw className="w-3 h-3 mr-2" />
                  Remover ícone personalizado (usar padrão)
                </Button>
              )}
            </TabsContent>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center space-y-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                {uploadPreview ? (
                  <img
                    src={uploadPreview}
                    alt="Preview"
                    className="w-20 h-20 object-cover rounded-xl mx-auto"
                  />
                ) : value && value.startsWith("data:") ? (
                  <img
                    src={value}
                    alt="Ícone atual"
                    className="w-20 h-20 object-cover rounded-xl mx-auto"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-xl bg-muted flex items-center justify-center mx-auto">
                    <Upload className="w-8 h-8 text-muted-foreground" />
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

              {uploadPreview && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleConfirmUpload}
                  data-testid="button-confirmar-upload"
                  disabled={uploadIconMutation.isPending}
                >
                  <Check className="w-4 h-4 mr-2" />
                  {uploadIconMutation.isPending ? "Salvando..." : "Salvar na biblioteca e usar este ícone"}
                </Button>
              )}

              {value && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleReset}
                >
                  <RotateCcw className="w-3 h-3 mr-2" />
                  Remover ícone personalizado
                </Button>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
