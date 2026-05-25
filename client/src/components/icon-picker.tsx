import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandIconDisplay, LIBRARY_ICONS } from "@/lib/brand-icons";
import { Check, ImagePlus, RotateCcw, Settings2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  addCommunityIconToLibrary,
  addOfficialIconToLibrary,
  addOfficialPackToLibrary,
  fetchCommunityIcons,
  fetchOfficialIconPacks,
  fetchOfficialIcons,
  publishCommunityIcon,
  type OfficialIconApiModel,
  type OfficialIconPackApiModel,
  unpublishCommunityIcon,
} from "@/services/api/official-icons";
import {
  createUserIconLibraryItem,
  deleteUserIconLibraryItem,
  fetchUserIconLibrary,
  updateUserIconLibraryItem,
  type UserIconLibraryItemApiModel,
} from "@/services/api/user-icon-library";
import {
  createIconMatchRules,
  deleteIconMatchRule,
  fetchIconMatchRules,
  type IconMatchRuleApiModel,
} from "@/services/api/icon-match-rules";
import {
  BUILTIN_ICON_PREFERENCE_RULE_ICON_ID,
  buildBuiltinIconDisablePreferenceTerm,
  getDisabledBuiltinIconKeysFromRules,
  matchIconByText,
  parseBuiltinIconDisablePreferenceTerm,
  type UserIconMatchRule,
} from "@/lib/purchase-icon-matching";

interface IconPickerProps {
  value?: string | null;
  name?: string;
  onChange?: (value: string | null) => void;
  onSelectMeta?: (meta: IconPickerSelectMeta) => void;
  size?: "sm" | "md" | "lg";
  mode?: "select" | "manage";
  autoApplySuggestion?: boolean;
  triggerLabel?: string;
  triggerDescription?: string;
  triggerTestId?: string;
}

export type IconPickerSelectionSource =
  | "builtin"
  | "personal"
  | "suggestion"
  | "upload"
  | "reset"
  | "unknown";

export type IconPickerSelectMeta = {
  displayValue: string | null;
  persistableIconId: string | null;
  source: IconPickerSelectionSource;
  userIconId?: string | null;
  officialIconId?: string | null;
};

type ManageBuiltinTarget = {
  type: "builtin";
  iconKey: string;
  label: string;
};

type ManagePersonalTarget = {
  type: "personal";
  icon: UserIconLibraryItemApiModel;
  publication: OfficialIconApiModel | null;
};

type ManageExploreTarget = {
  type: "explore";
  icon: OfficialIconApiModel;
  alreadyAdded: boolean;
};

type ManageActionTarget = ManageBuiltinTarget | ManagePersonalTarget | ManageExploreTarget;

const CATEGORY_LABELS: Record<string, string> = {
  bancos: "Bancos",
  servicos: "Serviços",
  carteiras: "Carteiras",
};

const CATEGORIES = ["bancos", "servicos", "carteiras"] as const;
const ICON_UPLOAD_MAX_BYTES = 512 * 1024;
const USER_ICON_CATEGORIES = [
  { value: "banco", label: "Banco" },
  { value: "servico", label: "Serviço" },
  { value: "carteira", label: "Carteira" },
  { value: "loja", label: "Loja" },
  { value: "mercado", label: "Mercado" },
  { value: "transporte", label: "Transporte" },
  { value: "game", label: "Game" },
  { value: "outro", label: "Outro" },
] as const;
const USER_ICON_CATEGORY_VALUES: Set<string> = new Set(USER_ICON_CATEGORIES.map((item) => item.value));
const NOOP_ICON_CHANGE = (_value: string | null): void => undefined;
const NOOP_ICON_META = (_meta: IconPickerSelectMeta): void => undefined;

function sanitizeIconNameInput(value: string): string {
  return value
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function parseKeywordInput(value: string): string[] {
  const unique = new Set<string>();
  const output: string[] = [];
  for (const raw of value.split(",")) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) continue;
    const normalized = trimmed
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
    output.push(trimmed.slice(0, 80));
  }
  return output;
}

function resolveUserIconCategory(value: string | null | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return USER_ICON_CATEGORY_VALUES.has(normalized) ? normalized : "outro";
}

function getItemTerms(item: Pick<UserIconLibraryItemApiModel, "name" | "tags">): string[] {
  const terms = [item.name, ...(Array.isArray(item.tags) ? item.tags : [])]
    .map((term) => String(term ?? "").trim())
    .filter((term) => term.length > 0);
  return Array.from(new Set(terms));
}

export function IconPicker({
  value,
  name = "",
  onChange,
  onSelectMeta,
  size = "md",
  mode = "select",
  autoApplySuggestion = true,
  triggerLabel,
  triggerDescription,
  triggerTestId,
}: IconPickerProps) {
  const isManageMode = mode === "manage";
  const safeOnChange = onChange ?? NOOP_ICON_CHANGE;
  const safeOnSelectMeta = onSelectMeta ?? NOOP_ICON_META;
  const [open, setOpen] = useState(false);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [uploadIconName, setUploadIconName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("outro");
  const [uploadKeywords, setUploadKeywords] = useState("");
  const [editingIcon, setEditingIcon] = useState<UserIconLibraryItemApiModel | null>(null);
  const [editIconName, setEditIconName] = useState("");
  const [editCategory, setEditCategory] = useState("outro");
  const [editKeywords, setEditKeywords] = useState("");
  const [deletingIcon, setDeletingIcon] = useState<UserIconLibraryItemApiModel | null>(null);
  const [iconActionLoadingKey, setIconActionLoadingKey] = useState<string | null>(null);
  const [ignoredSuggestionKey, setIgnoredSuggestionKey] = useState<string | null>(null);
  const [autoAppliedSuggestionKey, setAutoAppliedSuggestionKey] = useState<string | null>(null);
  const [exploreSearch, setExploreSearch] = useState("");
  const [exploreCategory, setExploreCategory] = useState("all");
  const [exploreOrigin, setExploreOrigin] = useState<"all" | "official" | "community">("all");
  const [explorePackId, setExplorePackId] = useState("all");
  const [manageActionTarget, setManageActionTarget] = useState<ManageActionTarget | null>(null);
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
    queryKey: ["/api/icons/explore", exploreSearch, exploreCategory, explorePackId, exploreOrigin],
    queryFn: async () => {
      const query = {
        search: exploreSearch || undefined,
        category: exploreCategory !== "all" ? exploreCategory : undefined,
      };

      if (exploreOrigin === "community") {
        return fetchCommunityIcons(query);
      }

      if (exploreOrigin === "official") {
        return fetchOfficialIcons({
          ...query,
          origin: "official",
          packId: explorePackId !== "all" ? explorePackId : undefined,
        });
      }

      const [officialList, communityList] = await Promise.all([
        fetchOfficialIcons({
          ...query,
          origin: "official",
          packId: explorePackId !== "all" ? explorePackId : undefined,
        }),
        fetchCommunityIcons(query),
      ]);

      return [...officialList, ...communityList];
    },
    enabled: open,
    staleTime: 60_000,
  });

  const { data: myCommunityPublications = [] } = useQuery<OfficialIconApiModel[]>({
    queryKey: ["/api/icons/community", "mine"],
    queryFn: () => fetchCommunityIcons(),
    enabled: open,
    staleTime: 60_000,
  });

  const { data: iconMatchRules = [] } = useQuery<IconMatchRuleApiModel[]>({
    queryKey: ["/api/icon-match-rules"],
    queryFn: fetchIconMatchRules,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const normalizedUserRules = useMemo<UserIconMatchRule[]>(
    () => iconMatchRules.map((rule) => ({
      id: rule.id,
      iconId: rule.iconId,
      normalizedTerm: rule.normalizedTerm,
      originalTerm: rule.originalTerm,
    })),
    [iconMatchRules],
  );

  const iconSuggestion = useMemo(
    () => matchIconByText(name, normalizedUserRules),
    [name, normalizedUserRules],
  );

  const iconMatchRulesByIconId = useMemo(() => {
    const map = new Map<string, IconMatchRuleApiModel[]>();
    for (const rule of iconMatchRules) {
      if (rule.iconId === BUILTIN_ICON_PREFERENCE_RULE_ICON_ID) continue;
      const rows = map.get(rule.iconId) ?? [];
      rows.push(rule);
      map.set(rule.iconId, rows);
    }
    return map;
  }, [iconMatchRules]);

  const disabledBuiltinIconRuleByKey = useMemo(() => {
    const map = new Map<string, IconMatchRuleApiModel>();
    for (const rule of iconMatchRules) {
      if (rule.iconId !== BUILTIN_ICON_PREFERENCE_RULE_ICON_ID) continue;
      const key = parseBuiltinIconDisablePreferenceTerm(rule.originalTerm);
      if (!key) continue;
      map.set(key, rule);
    }
    return map;
  }, [iconMatchRules]);

  const disabledBuiltinIconKeys = useMemo(
    () => getDisabledBuiltinIconKeysFromRules(normalizedUserRules),
    [normalizedUserRules],
  );

  const officialIconsInLibrary = useMemo(
    () => new Set(personalIcons.map((icon) => icon.officialIconId).filter((id): id is string => Boolean(id))),
    [personalIcons],
  );

  const communityPublicationBySourceUserIconId = useMemo(() => {
    const map = new Map<string, OfficialIconApiModel>();
    for (const publication of myCommunityPublications) {
      const sourceUserIconId = publication.sourceUserIconId?.trim();
      if (!sourceUserIconId) continue;
      map.set(sourceUserIconId, publication);
    }
    return map;
  }, [myCommunityPublications]);

  const personalIconByImageUrl = useMemo(
    () => new Map(personalIcons.map((icon) => [icon.imageUrl, icon])),
    [personalIcons],
  );

  const personalIconById = useMemo(
    () => new Map(personalIcons.map((icon) => [icon.id, icon])),
    [personalIcons],
  );

  const emitSelection = (meta: IconPickerSelectMeta) => {
    safeOnChange(meta.displayValue);
    safeOnSelectMeta(meta);
  };

  const resolveSuggestionMeta = (iconId: string): IconPickerSelectMeta => {
    const personalByImage = personalIconByImageUrl.get(iconId);
    if (personalByImage) {
      return {
        displayValue: personalByImage.imageUrl,
        persistableIconId: personalByImage.id,
        source: "suggestion",
        userIconId: personalByImage.id,
        officialIconId: personalByImage.officialIconId ?? null,
      };
    }

    const personalById = personalIconById.get(iconId);
    if (personalById) {
      return {
        displayValue: personalById.imageUrl,
        persistableIconId: personalById.id,
        source: "suggestion",
        userIconId: personalById.id,
        officialIconId: personalById.officialIconId ?? null,
      };
    }

    const looksLikeRemoteReference = /^data:/i.test(iconId) || /^https?:\/\//i.test(iconId);
    return {
      displayValue: iconId,
      persistableIconId: looksLikeRemoteReference ? null : iconId,
      source: "suggestion",
    };
  };

  useEffect(() => {
    if (isManageMode) return;
    if (!autoApplySuggestion) return;
    if (!open) return;
    if (value) return;
    if (!name.trim()) return;
    if (!iconSuggestion.matched || !iconSuggestion.shouldAutoApply) return;
    if (iconSuggestion.source !== "personal_rule") return;
    if (!iconSuggestion.iconId) return;

    const signature = `${name.trim().toLowerCase()}::${iconSuggestion.iconId}`;
    if (ignoredSuggestionKey === signature) return;
    if (autoAppliedSuggestionKey === signature) return;

    const suggestionMeta = resolveSuggestionMeta(iconSuggestion.iconId);
    safeOnChange(suggestionMeta.displayValue);
    safeOnSelectMeta(suggestionMeta);
    setAutoAppliedSuggestionKey(signature);
  }, [
    isManageMode,
    open,
    value,
    name,
    iconSuggestion,
    ignoredSuggestionKey,
    autoAppliedSuggestionKey,
    autoApplySuggestion,
    personalIconByImageUrl,
    personalIconById,
    safeOnChange,
    safeOnSelectMeta,
  ]);

  useEffect(() => {
    if (exploreOrigin !== "community") return;
    if (explorePackId === "all") return;
    setExplorePackId("all");
  }, [exploreOrigin, explorePackId]);

  const uploadIconMutation = useMutation({
    mutationFn: async (payload: {
      imageDataUrl: string;
      name: string;
      category?: string | null;
      keywords?: string[];
      originalFileName?: string | null;
    }) =>
      createUserIconLibraryItem(payload),
    onSuccess: (icon) => {
      emitSelection({
        displayValue: icon.imageUrl,
        persistableIconId: icon.id,
        source: "upload",
        userIconId: icon.id,
        officialIconId: icon.officialIconId ?? null,
      });
      setUploadPreview(null);
      setUploadFileName("");
      setUploadIconName("");
      setUploadCategory("outro");
      setUploadKeywords("");
      if (!isManageMode) {
        setOpen(false);
      }
      toast({
        title: "Ícone salvo na sua biblioteca.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icon-match-rules"] });
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

  const updatePersonalIconMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      category?: string | null;
      keywords?: string[];
    }) =>
      updateUserIconLibraryItem(payload.id, {
        name: payload.name,
        category: payload.category,
        keywords: payload.keywords,
      }),
    onSuccess: () => {
      setEditingIcon(null);
      toast({ title: "Ícone atualizado com sucesso." });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icon-match-rules"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível atualizar o ícone.";
      toast({
        title: "Erro ao atualizar ícone",
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
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
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

  const addCommunityIconMutation = useMutation({
    mutationFn: async (iconId: string) => addCommunityIconToLibrary(iconId),
    onSuccess: (result) => {
      toast({
        title: result.alreadyInLibrary ? "Ícone já estava na sua biblioteca." : "Ícone publicado adicionado à sua biblioteca.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível adicionar o ícone publicado.";
      toast({
        title: "Erro ao adicionar ícone",
        description: message,
        variant: "destructive",
      });
    },
  });

  const publishCommunityIconMutation = useMutation({
    mutationFn: async (userIconId: string) => publishCommunityIcon(userIconId),
    onSuccess: (result) => {
      toast({
        title: result.alreadyPublished ? "Publicação atualizada em Explorar ícones." : "Ícone publicado em Explorar ícones.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível publicar o ícone.";
      toast({
        title: "Erro ao publicar ícone",
        description: message,
        variant: "destructive",
      });
    },
  });

  const unpublishCommunityIconMutation = useMutation({
    mutationFn: async (publicationId: string) => unpublishCommunityIcon(publicationId),
    onSuccess: () => {
      toast({ title: "Ícone despublicado com sucesso." });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível despublicar o ícone.";
      toast({
        title: "Erro ao despublicar ícone",
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
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
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

  const deletePersonalIconMutation = useMutation({
    mutationFn: async (icon: UserIconLibraryItemApiModel) => deleteUserIconLibraryItem(icon.id),
    onSuccess: (_result, deletedIcon) => {
      const deletedImageUrl = deletedIcon.imageUrl ?? null;
      setDeletingIcon(null);
      if (deletedImageUrl && value === deletedImageUrl) {
        emitSelection({
          displayValue: null,
          persistableIconId: null,
          source: "reset",
        });
      }
      toast({
        title: "Ícone excluído da sua biblioteca.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icon-match-rules"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível excluir o ícone.";
      toast({
        title: "Erro ao excluir ícone",
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
      setUploadIconName((prev) => prev || sanitizeIconNameInput(file.name));
    };
    reader.readAsDataURL(file);
  };

  const handleSelectLibrary = (key: string) => {
    emitSelection({
      displayValue: key,
      persistableIconId: key,
      source: "builtin",
    });
    if (!isManageMode) {
      setOpen(false);
    }
  };

  const handleSelectPersonal = (icon: UserIconLibraryItemApiModel) => {
    emitSelection({
      displayValue: icon.imageUrl,
      persistableIconId: icon.id,
      source: "personal",
      userIconId: icon.id,
      officialIconId: icon.officialIconId ?? null,
    });
    if (!isManageMode) {
      setOpen(false);
    }
  };

  const handleConfirmUpload = () => {
    if (!uploadPreview) return;
    const sanitizedName = sanitizeIconNameInput(uploadIconName);
    if (sanitizedName.length < 2) {
      toast({
        title: "Nome obrigatório",
        description: "Informe um nome amigável para o ícone.",
        variant: "destructive",
      });
      return;
    }

    const parsedKeywords = parseKeywordInput(uploadKeywords);
    uploadIconMutation.mutate({
      imageDataUrl: uploadPreview,
      name: sanitizedName,
      category: resolveUserIconCategory(uploadCategory),
      keywords: parsedKeywords,
      originalFileName: uploadFileName || null,
    });
  };

  const handleReset = () => {
    emitSelection({
      displayValue: null,
      persistableIconId: null,
      source: "reset",
    });
    setOpen(false);
    setUploadPreview(null);
    setUploadFileName("");
    setUploadIconName("");
    setUploadCategory("outro");
    setUploadKeywords("");
    setIgnoredSuggestionKey(null);
    setAutoAppliedSuggestionKey(null);
  };

  const suggestionSignature = `${name.trim().toLowerCase()}::${iconSuggestion.iconId ?? ""}`;
  const isSuggestionIgnored = ignoredSuggestionKey === suggestionSignature;
  const shouldShowSuggestion =
    open &&
    !value &&
    iconSuggestion.matched &&
    iconSuggestion.shouldSuggest &&
    Boolean(iconSuggestion.iconId) &&
    !isSuggestionIgnored;

  const handleUseSuggestion = () => {
    if (!iconSuggestion.iconId) return;
    emitSelection(resolveSuggestionMeta(iconSuggestion.iconId));
    setIgnoredSuggestionKey(null);
  };

  const handleIgnoreSuggestion = () => {
    setIgnoredSuggestionKey(suggestionSignature);
  };

  const openEditPersonalIcon = (icon: UserIconLibraryItemApiModel) => {
    setEditingIcon(icon);
    setEditIconName(icon.name ?? "");
    setEditCategory(resolveUserIconCategory(icon.category));
    setEditKeywords(Array.isArray(icon.tags) ? icon.tags.join(", ") : "");
  };

  const handleSaveEditPersonalIcon = () => {
    if (!editingIcon) return;
    const sanitizedName = sanitizeIconNameInput(editIconName);
    if (sanitizedName.length < 2) {
      toast({
        title: "Nome obrigatório",
        description: "Informe um nome amigável para o ícone.",
        variant: "destructive",
      });
      return;
    }
    updatePersonalIconMutation.mutate({
      id: editingIcon.id,
      name: sanitizedName,
      category: resolveUserIconCategory(editCategory),
      keywords: parseKeywordInput(editKeywords),
    });
  };

  const handleConfirmDeletePersonalIcon = () => {
    if (!deletingIcon) return;
    deletePersonalIconMutation.mutate(deletingIcon);
  };

  const invalidateIconQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/icon-match-rules"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] }),
    ]);
  };

  const runIconAction = async (actionKey: string, action: () => Promise<void>) => {
    setIconActionLoadingKey(actionKey);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível concluir esta ação.";
      toast({
        title: "Erro ao atualizar ícone",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIconActionLoadingKey((current) => (current === actionKey ? null : current));
    }
  };

  const handleToggleBuiltinIconAutomation = async (iconKey: string) => {
    const normalizedKey = iconKey.trim().toLowerCase();
    const existingRule = disabledBuiltinIconRuleByKey.get(normalizedKey);
    const actionKey = `builtin:${normalizedKey}:${existingRule ? "restore" : "disable"}`;

    await runIconAction(actionKey, async () => {
      if (existingRule) {
        await deleteIconMatchRule(existingRule.id);
        toast({ title: "Automação restaurada para este ícone padrão." });
      } else {
        await createIconMatchRules({
          iconId: BUILTIN_ICON_PREFERENCE_RULE_ICON_ID,
          terms: [buildBuiltinIconDisablePreferenceTerm(normalizedKey)],
        });
        toast({ title: "Automação desativada para este ícone padrão." });
      }
      await invalidateIconQueries();
    });
  };

  const handleTogglePersonalIconAutomation = async (icon: UserIconLibraryItemApiModel) => {
    const rules = iconMatchRulesByIconId.get(icon.imageUrl) ?? [];
    const isAutomationEnabled = rules.length > 0;
    const actionKey = `personal:${icon.id}:${isAutomationEnabled ? "disable" : "restore"}`;

    await runIconAction(actionKey, async () => {
      if (isAutomationEnabled) {
        await Promise.all(rules.map((rule) => deleteIconMatchRule(rule.id)));
        toast({ title: "Automação desativada para este ícone." });
        await invalidateIconQueries();
        return;
      }

      if (icon.sourceType === "official" && icon.officialIconId) {
        await addOfficialIconToLibrary(icon.officialIconId);
      } else {
        await updateUserIconLibraryItem(icon.id, {
          name: icon.name,
          category: icon.category,
          keywords: getItemTerms(icon),
        });
      }

      toast({ title: "Automação reativada para este ícone." });
      await invalidateIconQueries();
    });
  };

  const handlePublishPersonalIcon = async (icon: UserIconLibraryItemApiModel) => {
    const actionKey = `personal:${icon.id}:publish`;
    await runIconAction(actionKey, async () => {
      await publishCommunityIconMutation.mutateAsync(icon.id);
      await invalidateIconQueries();
    });
  };

  const handleUnpublishPersonalIcon = async (publicationId: string, iconId: string) => {
    const actionKey = `personal:${iconId}:unpublish`;
    await runIconAction(actionKey, async () => {
      await unpublishCommunityIconMutation.mutateAsync(publicationId);
      await invalidateIconQueries();
    });
  };

  const findPersonalIconFromExploreCard = (icon: OfficialIconApiModel): UserIconLibraryItemApiModel | null => {
    const byOfficialId = personalIcons.find((item) => item.officialIconId === icon.id);
    if (byOfficialId) return byOfficialId;
    const byImage = personalIcons.find((item) => item.imageUrl === icon.imageUrl);
    return byImage ?? null;
  };

  const isActionLoading = (actionKey: string): boolean => iconActionLoadingKey === actionKey;

  const personalOfficialIconIds = officialIconsInLibrary;
  const getBuiltinActionKey = (iconKey: string): string => {
    const normalizedBuiltinKey = iconKey.trim().toLowerCase();
    const isBuiltinDisabled = disabledBuiltinIconKeys.has(normalizedBuiltinKey);
    return `builtin:${normalizedBuiltinKey}:${isBuiltinDisabled ? "restore" : "disable"}`;
  };

  const getPersonalAutomationActionKey = (icon: UserIconLibraryItemApiModel): string => {
    const isAutomationEnabled = (iconMatchRulesByIconId.get(icon.imageUrl)?.length ?? 0) > 0;
    return `personal:${icon.id}:${isAutomationEnabled ? "disable" : "restore"}`;
  };

  const openManageBuiltinActions = (iconKey: string, label: string) => {
    setManageActionTarget({ type: "builtin", iconKey, label });
  };

  const openManagePersonalActions = (
    icon: UserIconLibraryItemApiModel,
    publication: OfficialIconApiModel | null = null,
  ) => {
    setManageActionTarget({ type: "personal", icon, publication });
  };

  const openExploreActions = (icon: OfficialIconApiModel, alreadyAdded: boolean) => {
    setManageActionTarget({
      type: "explore",
      icon,
      alreadyAdded,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid={triggerTestId ?? (isManageMode ? "button-open-icon-library-manage" : "button-alterar-icone")}
        className={
          isManageMode
            ? "flex w-full items-center gap-2 rounded-lg border border-muted-foreground/30 p-2 text-left transition-colors hover:border-primary hover:bg-accent"
            : "flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 p-2 transition-colors hover:border-primary hover:bg-accent"
        }
      >
        {isManageMode ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Settings2 className="h-4 w-4" />
          </div>
        ) : (
          <BrandIconDisplay name={name} iconeId={value} size={size} />
        )}
        <div className="text-left">
          <p className="text-xs font-medium">
            {isManageMode ? (triggerLabel || "Biblioteca de ícones") : "Ícone"}
          </p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            {isManageMode ? (
              triggerDescription || "Gerenciar uploads e automações"
            ) : (
              <>
                <ImagePlus className="h-3 w-3" />
                Alterar ícone
              </>
            )}
          </p>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] w-[min(95vw,900px)] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isManageMode ? "Biblioteca de ícones" : "Alterar Ícone"}</DialogTitle>
          </DialogHeader>

          {shouldShowSuggestion && !isManageMode ? (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold text-primary">
                Ícone sugerido para este nome
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Encontramos um ícone compatível para <span className="font-medium text-foreground">{name}</span>.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleUseSuggestion}
                >
                  Usar este ícone
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleIgnoreSuggestion}
                >
                  Ignorar sugestão
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Confiança: {Math.round(iconSuggestion.confidenceScore * 100)}%
                </span>
              </div>
            </div>
          ) : null}

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
                        const normalizedBuiltinKey = item.key.trim().toLowerCase();
                        const isBuiltinDisabled = disabledBuiltinIconKeys.has(normalizedBuiltinKey);
                        return (
                          <div
                            key={item.key}
                            className={`relative rounded-lg border p-2 transition-all ${
                              isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                            }`}
                          >
                            {isBuiltinDisabled ? (
                              <Badge
                                variant="secondary"
                                className="absolute left-1 top-1 z-10 h-5 rounded-sm px-1 text-[10px]"
                                title="Automação desativada"
                              >
                                Off
                              </Badge>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openManageBuiltinActions(item.key, item.label)}
                              data-testid={`icon-option-${item.key}`}
                              className="flex w-full flex-col items-center gap-1 rounded-md p-1 text-left transition-colors hover:bg-accent"
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
                          </div>
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
                      const isAutomationEnabled = (iconMatchRulesByIconId.get(item.imageUrl)?.length ?? 0) > 0;
                      const publication = communityPublicationBySourceUserIconId.get(item.id) ?? null;
                      return (
                        <div
                          key={item.id}
                          className={`relative rounded-lg border p-2 transition-all ${
                            isSelected ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                          }`}
                        >
                          {!isAutomationEnabled ? (
                            <Badge
                              variant="secondary"
                              className="absolute left-1 top-1 z-10 h-5 rounded-sm px-1 text-[10px]"
                              title="Automação desativada"
                            >
                              Off
                            </Badge>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openManagePersonalActions(item, publication)}
                            data-testid={`icon-personal-option-${item.id}`}
                            className="flex w-full flex-col items-center gap-1 rounded-md p-1 text-left transition-colors hover:bg-accent"
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
                            <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground" title={item.name}>
                              {item.name}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {value && !isManageMode ? (
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <Input
                  value={exploreSearch}
                  onChange={(event) => setExploreSearch(event.target.value)}
                  placeholder="Buscar ícone"
                  aria-label="Buscar ícone"
                  className="sm:col-span-2"
                />
                <Select value={exploreOrigin} onValueChange={(value) => setExploreOrigin(value as "all" | "official" | "community")}>
                  <SelectTrigger aria-label="Filtrar origem dos ícones">
                    <SelectValue placeholder="Origem" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="official">Oficiais</SelectItem>
                    <SelectItem value="community">Comunidade</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={exploreCategory} onValueChange={setExploreCategory}>
                  <SelectTrigger aria-label="Filtrar categoria de ícones">
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
                <SelectTrigger aria-label="Filtrar pack" disabled={exploreOrigin === "community"}>
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

              {exploreOrigin !== "community" && officialPacks.length > 0 ? (
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
                  Ícones disponíveis
                </p>
                {isLoadingOfficialIcons ? (
                  <p className="text-xs text-muted-foreground">Carregando ícones oficiais...</p>
                ) : officialIcons.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum ícone oficial encontrado para esse filtro.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {officialIcons.map((icon) => {
                      const alreadyAdded = icon.alreadyInLibrary || personalOfficialIconIds.has(icon.id);
                      const isCommunity = icon.sourceType === "community";
                      return (
                        <button
                          key={icon.id}
                          type="button"
                          className="rounded-lg border p-2 text-left transition-colors hover:bg-accent"
                          onClick={() => openExploreActions(icon, alreadyAdded)}
                        >
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
                          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-muted-foreground">
                              {isCommunity ? (icon.ownerLabel || "Publicado por usuário") : "Catálogo oficial"}
                            </span>
                            <Badge variant={alreadyAdded ? "secondary" : "outline"} className="h-5 px-1.5 text-[10px]">
                              {alreadyAdded ? "Na sua biblioteca" : "Disponível"}
                            </Badge>
                          </div>
                        </button>
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

              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Nome do ícone</label>
                  <Input
                    value={uploadIconName}
                    onChange={(event) => setUploadIconName(event.target.value)}
                    placeholder="Ex: Itaú, KaBuM, Netflix"
                    aria-label="Nome do ícone"
                    maxLength={120}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Categoria</label>
                  <Select value={uploadCategory} onValueChange={setUploadCategory}>
                    <SelectTrigger aria-label="Categoria do ícone">
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {USER_ICON_CATEGORIES.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Palavras-chave para reconhecimento automático</label>
                  <Input
                    value={uploadKeywords}
                    onChange={(event) => setUploadKeywords(event.target.value)}
                    placeholder="Ex: itau, itaú, itaucard, unibanco"
                    aria-label="Palavras-chave do ícone"
                    maxLength={500}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Use palavras que costumam aparecer na fatura ou no nome da compra.
                  </p>
                </div>
              </div>

              {uploadPreview ? (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handleConfirmUpload}
                  data-testid="button-confirmar-upload"
                  disabled={uploadIconMutation.isPending}
                >
                  <Check className="mr-2 h-4 w-4" />
                  {uploadIconMutation.isPending ? "Salvando..." : "Salvar ícone"}
                </Button>
              ) : null}

              {value && !isManageMode ? (
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

      <Dialog
        open={Boolean(editingIcon)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setEditingIcon(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar ícone personalizado</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Nome do ícone</label>
              <Input
                value={editIconName}
                onChange={(event) => setEditIconName(event.target.value)}
                placeholder="Ex: Itaú, KaBuM, Netflix"
                aria-label="Editar nome do ícone"
                maxLength={120}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Categoria</label>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger aria-label="Editar categoria do ícone">
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {USER_ICON_CATEGORIES.map((category) => (
                    <SelectItem key={category.value} value={category.value}>
                      {category.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Palavras-chave</label>
              <Input
                value={editKeywords}
                onChange={(event) => setEditKeywords(event.target.value)}
                placeholder="Ex: itau, itaú, itaucard, unibanco"
                aria-label="Editar palavras-chave do ícone"
                maxLength={500}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setEditingIcon(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleSaveEditPersonalIcon}
              disabled={updatePersonalIconMutation.isPending}
            >
              {updatePersonalIconMutation.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deletingIcon)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !deletePersonalIconMutation.isPending) {
            setDeletingIcon(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletingIcon?.sourceType === "official" ? "Remover este ícone da sua biblioteca?" : "Excluir este ícone?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ele será removido da sua biblioteca e deixará de ser usado automaticamente em compras, cartões e serviços futuros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePersonalIconMutation.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleConfirmDeletePersonalIcon();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deletePersonalIconMutation.isPending}
            >
              {deletePersonalIconMutation.isPending
                ? "Excluindo..."
                : deletingIcon?.sourceType === "official"
                  ? "Remover da biblioteca"
                  : "Excluir ícone"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={Boolean(manageActionTarget)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setManageActionTarget(null);
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {manageActionTarget?.type === "builtin"
                ? manageActionTarget.label
                : manageActionTarget?.type === "personal"
                  ? manageActionTarget.icon.name
                  : manageActionTarget?.type === "explore"
                    ? manageActionTarget.icon.name
                    : "Ações do ícone"}
            </DialogTitle>
          </DialogHeader>

          {manageActionTarget?.type === "builtin" ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  handleSelectLibrary(manageActionTarget.iconKey);
                  setManageActionTarget(null);
                }}
              >
                Usar este ícone
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={isActionLoading(getBuiltinActionKey(manageActionTarget.iconKey))}
                onClick={async () => {
                  await handleToggleBuiltinIconAutomation(manageActionTarget.iconKey);
                  setManageActionTarget(null);
                }}
              >
                {disabledBuiltinIconKeys.has(manageActionTarget.iconKey.trim().toLowerCase())
                  ? "Restaurar padrão"
                  : "Desativar para mim"}
              </Button>
            </div>
          ) : manageActionTarget?.type === "personal" ? (
            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => {
                  handleSelectPersonal(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
              >
                Usar este ícone
              </Button>
              {manageActionTarget.icon.sourceType !== "official" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    openEditPersonalIcon(manageActionTarget.icon);
                    setManageActionTarget(null);
                  }}
                >
                  Editar informações
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                disabled={isActionLoading(getPersonalAutomationActionKey(manageActionTarget.icon))}
                onClick={async () => {
                  await handleTogglePersonalIconAutomation(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
              >
                {(iconMatchRulesByIconId.get(manageActionTarget.icon.imageUrl)?.length ?? 0) > 0
                  ? "Desativar automação"
                  : "Reativar automação"}
              </Button>
              {manageActionTarget.icon.sourceType !== "official" ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isActionLoading(`personal:${manageActionTarget.icon.id}:publish`)}
                    onClick={async () => {
                      await handlePublishPersonalIcon(manageActionTarget.icon);
                      setManageActionTarget(null);
                    }}
                  >
                    {manageActionTarget.publication ? "Atualizar publicação" : "Publicar em Explorar ícones"}
                  </Button>
                  {manageActionTarget.publication ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start"
                      disabled={isActionLoading(`personal:${manageActionTarget.icon.id}:unpublish`)}
                      onClick={async () => {
                        const publicationId = manageActionTarget.publication?.id;
                        if (!publicationId) return;
                        await handleUnpublishPersonalIcon(publicationId, manageActionTarget.icon.id);
                        setManageActionTarget(null);
                      }}
                    >
                      Despublicar
                    </Button>
                  ) : null}
                </>
              ) : null}
              <Button
                type="button"
                variant="destructive"
                className="w-full justify-start"
                onClick={() => {
                  setDeletingIcon(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
              >
                {manageActionTarget.icon.sourceType === "official"
                  ? "Remover da minha biblioteca"
                  : "Excluir da minha biblioteca"}
              </Button>
            </div>
          ) : manageActionTarget?.type === "explore" ? (
            <div className="space-y-2">
              {manageActionTarget.alreadyAdded ? (
                <Badge variant="secondary" className="w-fit">
                  Na sua biblioteca
                </Badge>
              ) : null}
              {manageActionTarget.icon.sourceType === "community" ? (
                <p className="text-xs text-muted-foreground">
                  {manageActionTarget.icon.ownerLabel || "Publicado por usuário"}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Catálogo oficial</p>
              )}

              {!manageActionTarget.alreadyAdded ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  disabled={
                    manageActionTarget.icon.sourceType === "community"
                      ? addCommunityIconMutation.isPending && addCommunityIconMutation.variables === manageActionTarget.icon.id
                      : addOfficialIconMutation.isPending && addOfficialIconMutation.variables === manageActionTarget.icon.id
                  }
                  onClick={async () => {
                    try {
                      if (manageActionTarget.icon.sourceType === "community") {
                        await addCommunityIconMutation.mutateAsync(manageActionTarget.icon.id);
                      } else {
                        await addOfficialIconMutation.mutateAsync(manageActionTarget.icon.id);
                      }
                      setManageActionTarget(null);
                    } catch {
                      // handled by mutation onError
                    }
                  }}
                >
                  Adicionar à minha biblioteca
                </Button>
              ) : null}

              {manageActionTarget.alreadyAdded ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start"
                  onClick={() => {
                    const personalIcon = findPersonalIconFromExploreCard(manageActionTarget.icon);
                    if (!personalIcon) {
                      setManageActionTarget(null);
                      return;
                    }
                    openManagePersonalActions(
                      personalIcon,
                      communityPublicationBySourceUserIconId.get(personalIcon.id) ?? null,
                    );
                  }}
                >
                  Gerenciar na minha biblioteca
                </Button>
              ) : null}

              {!isManageMode ? (
                <Button
                  type="button"
                  className="w-full justify-start"
                  onClick={async () => {
                    try {
                      const existingPersonalIcon = findPersonalIconFromExploreCard(manageActionTarget.icon);
                      if (existingPersonalIcon) {
                        handleSelectPersonal(existingPersonalIcon);
                        setManageActionTarget(null);
                        return;
                      }

                      if (manageActionTarget.icon.sourceType === "community") {
                        const result = await addCommunityIconMutation.mutateAsync(manageActionTarget.icon.id);
                        handleSelectPersonal(result.icon);
                      } else {
                        const result = await addOfficialIconMutation.mutateAsync(manageActionTarget.icon.id);
                        handleSelectPersonal(result.icon);
                      }
                      setManageActionTarget(null);
                    } catch {
                      // handled by mutation onError
                    }
                  }}
                >
                  Usar este ícone
                </Button>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
