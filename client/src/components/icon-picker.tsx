import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconPickerBuiltinIconCard } from "@/components/icon-picker-builtin-icon-card";
import { IconPickerEditDialogContent } from "@/components/icon-picker-edit-dialog-content";
import { IconPickerEmptyState } from "@/components/icon-picker-empty-state";
import { IconPickerExploreIconCard } from "@/components/icon-picker-explore-icon-card";
import { IconPickerManageBuiltinActions } from "@/components/icon-picker-manage-builtin-actions";
import { IconPickerManageExploreActions } from "@/components/icon-picker-manage-explore-actions";
import { IconPickerManageExploreInfo } from "@/components/icon-picker-manage-explore-info";
import { IconPickerManagePackActions } from "@/components/icon-picker-manage-pack-actions";
import { IconPickerManagePersonalCoreActions } from "@/components/icon-picker-manage-personal-core-actions";
import { IconPickerManagePersonalPublicationActions } from "@/components/icon-picker-manage-personal-publication-actions";
import { IconPickerPackDetailIconCard } from "@/components/icon-picker-pack-detail-icon-card";
import { IconPickerPackCard } from "@/components/icon-picker-pack-card";
import { IconPickerPackSelectIconCard } from "@/components/icon-picker-pack-select-icon-card";
import { IconPickerPersonalIconCard } from "@/components/icon-picker-personal-icon-card";
import { IconPickerSectionHeader } from "@/components/icon-picker-section-header";
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BrandIconDisplay, LIBRARY_ICONS } from "@/lib/brand-icons";
import { Check, ImagePlus, RotateCcw, Settings2, Trash2, Upload } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  addCommunityPackItemToLibrary,
  addCommunityPackToLibrary,
  addCommunityIconToLibrary,
  addOfficialIconToLibrary,
  addOfficialPackToLibrary,
  createCommunityIconPack,
  fetchCommunityIconPackDetails,
  fetchIconPacks,
  fetchCommunityIcons,
  fetchOfficialIcons,
  publishCommunityIcon,
  unpublishCommunityIconPack,
  type OfficialIconApiModel,
  type OfficialIconPackApiModel,
  unpublishCommunityIcon,
} from "@/services/api/official-icons";
import {
  createUserIconLibraryBatch,
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
import {
  ICON_CATEGORY_OPTIONS as USER_ICON_CATEGORIES,
  getIconCategoryLabel,
} from "@shared/icon-categories";
import {
  buildIconKeywordsFromNameAndFilename,
  ICON_ALLOWED_MIME_TYPES,
  ICON_BATCH_UPLOAD_MAX_ITEMS,
  ICON_UPLOAD_MAX_BYTES,
  mergeBatchUploadKeywords,
  parseKeywordInput,
  readFileAsDataUrl,
  sanitizeIconNameInput,
  suggestBatchIconNameFromFileName,
  isIconMimeTypeAllowed,
} from "@/components/icon-picker-upload-batch.utils";
import {
  filterAndSortPersonalIcons,
  paginateItems,
  type PersonalIconSortOrder,
} from "@/components/icon-picker-pagination.utils";
import {
  buildPackMatchSummaryByPackId,
  formatPackMatchHint,
  hasExploreSearchTerm,
  resolveExploreIconsForView,
  resolveExplorePacksForView,
} from "@/components/icon-picker-explore-search.utils";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  NOOP_ICON_CHANGE,
  NOOP_ICON_META,
} from "@/components/icon-picker.constants";
import {
  formatCommunityAuthorLabel,
  getExploreIconPackOriginLabel,
  getItemTerms,
  getPackAddActionLabel,
  getPackLibrarySummaryLabel,
  resolvePackProgress,
  resolveUserIconCategory,
} from "@/components/icon-picker.utils";
import type {
  BatchUploadDraftItem,
  IconPickerProps,
  IconPickerSelectMeta,
  IconUploadMode,
  ManageActionTarget,
} from "./icon-picker/icon-picker.types";
export type {
  IconPickerSelectMeta,
  IconPickerSelectionSource,
} from "./icon-picker/icon-picker.types";

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
  const isMobile = useIsMobile();
  const safeOnChange = onChange ?? NOOP_ICON_CHANGE;
  const safeOnSelectMeta = onSelectMeta ?? NOOP_ICON_META;
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"official" | "personal" | "explore" | "upload">("official");
  const [uploadMode, setUploadMode] = useState<IconUploadMode>("individual");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>("");
  const [uploadIconName, setUploadIconName] = useState("");
  const [uploadCategory, setUploadCategory] = useState("outro");
  const [uploadKeywords, setUploadKeywords] = useState("");
  const [batchDefaultCategory, setBatchDefaultCategory] = useState("outro");
  const [batchDefaultKeywords, setBatchDefaultKeywords] = useState("");
  const [batchDraftItems, setBatchDraftItems] = useState<BatchUploadDraftItem[]>([]);
  const [batchReadInProgress, setBatchReadInProgress] = useState(false);
  const [editingIcon, setEditingIcon] = useState<UserIconLibraryItemApiModel | null>(null);
  const [editIconName, setEditIconName] = useState("");
  const [editCategory, setEditCategory] = useState("outro");
  const [editKeywords, setEditKeywords] = useState("");
  const [deletingIcon, setDeletingIcon] = useState<UserIconLibraryItemApiModel | null>(null);
  const [iconActionLoadingKey, setIconActionLoadingKey] = useState<string | null>(null);
  const [ignoredSuggestionKey, setIgnoredSuggestionKey] = useState<string | null>(null);
  const [autoAppliedSuggestionKey, setAutoAppliedSuggestionKey] = useState<string | null>(null);
  const [myIconsSearch, setMyIconsSearch] = useState("");
  const [myIconsCategory, setMyIconsCategory] = useState("all");
  const [myIconsOrder, setMyIconsOrder] = useState<PersonalIconSortOrder>("recent");
  const [myIconsPage, setMyIconsPage] = useState(1);
  const [exploreSearch, setExploreSearch] = useState("");
  const [exploreCategory, setExploreCategory] = useState("all");
  const [exploreOrigin, setExploreOrigin] = useState<"all" | "official" | "community">("all");
  const [exploreType, setExploreType] = useState<"all" | "icons" | "packs">("packs");
  const [explorePacksPage, setExplorePacksPage] = useState(1);
  const [exploreIconsPage, setExploreIconsPage] = useState(1);
  const [manageActionTarget, setManageActionTarget] = useState<ManageActionTarget | null>(null);
  const [createPackOpen, setCreatePackOpen] = useState(false);
  const [newPackName, setNewPackName] = useState("");
  const [newPackDescription, setNewPackDescription] = useState("");
  const [newPackCategory, setNewPackCategory] = useState("outro");
  const [newPackPublish, setNewPackPublish] = useState(true);
  const [newPackSelectedIconIds, setNewPackSelectedIconIds] = useState<string[]>([]);
  const [packDetailsOpen, setPackDetailsOpen] = useState(false);
  const [packDetailsTarget, setPackDetailsTarget] = useState<OfficialIconPackApiModel | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const hasExploreSearch = hasExploreSearchTerm(exploreSearch);

  const { data: personalIcons = [], isLoading: isLoadingPersonalIcons } = useQuery<UserIconLibraryItemApiModel[]>({
    queryKey: ["/api/user-icon-library"],
    queryFn: fetchUserIconLibrary,
    enabled: open,
    staleTime: 60_000,
  });

  const { data: explorePacks = [], isLoading: isLoadingExplorePacks } = useQuery<OfficialIconPackApiModel[]>({
    queryKey: ["/api/icons/packs", "explore", exploreCategory, exploreOrigin],
    queryFn: () =>
      fetchIconPacks({
        category: exploreCategory !== "all" ? exploreCategory : undefined,
        origin: exploreOrigin,
      }),
    enabled: open,
    staleTime: 60_000,
  });

  const { data: officialIcons = [], isLoading: isLoadingOfficialIcons } = useQuery<OfficialIconApiModel[]>({
    queryKey: ["/api/icons/explore", exploreSearch, exploreCategory, exploreOrigin],
    queryFn: async () => {
      const query = {
        search: exploreSearch || undefined,
        includePackItems: hasExploreSearch || undefined,
      };
      const filterForView = (icons: OfficialIconApiModel[]): OfficialIconApiModel[] =>
        resolveExploreIconsForView(icons, {
          search: exploreSearch,
          category: exploreCategory,
        });

      if (exploreOrigin === "community") {
        const communityIcons = await fetchCommunityIcons(query);
        return filterForView(communityIcons);
      }

      if (exploreOrigin === "official") {
        const onlyOfficialIcons = await fetchOfficialIcons({
          ...query,
          origin: "official",
        });
        return filterForView(onlyOfficialIcons);
      }

      const [officialList, communityList] = await Promise.all([
        fetchOfficialIcons({
          ...query,
          origin: "official",
        }),
        fetchCommunityIcons(query),
      ]);

      return filterForView([...officialList, ...communityList]);
    },
    enabled: open && (exploreType !== "packs" || hasExploreSearch),
    staleTime: 60_000,
  });

  const { data: activePackDetails, isLoading: isLoadingPackDetails } = useQuery<{
    pack: OfficialIconPackApiModel;
    icons: OfficialIconApiModel[];
  }>({
    queryKey: ["/api/icons/packs/details", packDetailsTarget?.id, packDetailsTarget?.sourceType],
    queryFn: async () => {
      if (!packDetailsTarget) {
        throw new Error("Pack não selecionado.");
      }
      if (packDetailsTarget.sourceType === "community") {
        return fetchCommunityIconPackDetails(packDetailsTarget.id);
      }
      const icons = await fetchOfficialIcons({
        packId: packDetailsTarget.id,
        origin: "official",
      });
      return { pack: packDetailsTarget, icons };
    },
    enabled: open && packDetailsOpen && Boolean(packDetailsTarget),
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
      if (publication.packId) continue;
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

  const uploadBatchMutation = useMutation({
    mutationFn: async (payload: {
      requests: Array<{
        sourceItemId: string;
        body: {
          imageDataUrl: string;
          name: string;
          category?: string | null;
          keywords?: string[];
          originalFileName?: string | null;
        };
      }>;
      defaultCategory: string;
      defaultKeywords: string[];
    }) => {
      const result = await createUserIconLibraryBatch({
        defaultCategory: payload.defaultCategory,
        defaultKeywords: payload.defaultKeywords,
        icons: payload.requests.map((request) => request.body),
      });
      return result;
    },
    onSuccess: (result, variables) => {
      const failedByIndex = new Map(result.failed.map((entry) => [entry.requestIndex, entry.reason]));
      const requestIndexByItemId = new Map(
        variables.requests.map((request, index) => [request.sourceItemId, index] as const),
      );

      setBatchDraftItems((current) => {
        const next: BatchUploadDraftItem[] = [];
        for (const item of current) {
          const requestIndex = requestIndexByItemId.get(item.id);
          if (requestIndex === undefined) {
            next.push(item);
            continue;
          }
          const failedReason = failedByIndex.get(requestIndex);
          if (failedReason) {
            next.push({
              ...item,
              error: failedReason,
            });
          }
        }
        return next;
      });

      const createdCount = result.created.length;
      const failedCount = result.failed.length;
      toast({
        title: `${createdCount} ícones salvos. ${failedCount} falharam.`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icon-match-rules"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível salvar o lote de ícones.";
      toast({
        title: "Erro ao salvar lote",
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
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs/details"] });
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
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs/details"] });
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

  const addCommunityPackItemMutation = useMutation({
    mutationFn: async (itemPublicCode: string) => addCommunityPackItemToLibrary(itemPublicCode),
    onSuccess: (result) => {
      toast({
        title: result.alreadyInLibrary ? "Ícone já estava na sua biblioteca." : "Ícone do pack adicionado à sua biblioteca.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs/details"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icon-match-rules"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível adicionar o ícone do pack.";
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

  const addPackToLibraryMutation = useMutation({
    mutationFn: async (pack: OfficialIconPackApiModel) =>
      pack.sourceType === "community"
        ? addCommunityPackToLibrary(pack.id)
        : addOfficialPackToLibrary(pack.id),
    onSuccess: (result) => {
      const addedCount = Number(result.addedCount ?? 0);
      const alreadyCount = Number(result.alreadyInLibraryCount ?? 0);
      const title = addedCount > 0
        ? "Pack atualizado na sua biblioteca."
        : "Este pack já está na sua biblioteca.";
      toast({
        title,
        description: `${addedCount} ícone(s) adicionados e ${alreadyCount} já existente(s).`,
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/user-icon-library"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/official"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs/details"] });
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

  const createCommunityPackMutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      description?: string | null;
      category?: string | null;
      userIconIds: string[];
      publish?: boolean;
    }) => createCommunityIconPack(payload),
    onSuccess: () => {
      toast({
        title: "Pack criado com sucesso.",
      });
      setCreatePackOpen(false);
      setNewPackName("");
      setNewPackDescription("");
      setNewPackCategory("outro");
      setNewPackPublish(true);
      setNewPackSelectedIconIds([]);
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível criar o pack.";
      toast({
        title: "Erro ao criar pack",
        description: message,
        variant: "destructive",
      });
    },
  });

  const unpublishCommunityPackMutation = useMutation({
    mutationFn: async (packId: string) => unpublishCommunityIconPack(packId),
    onSuccess: () => {
      toast({ title: "Pack despublicado com sucesso." });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community/packs"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/community"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/icons/explore"] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Não foi possível despublicar o pack.";
      toast({
        title: "Erro ao despublicar pack",
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

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    if (uploadMode === "batch") {
      const selectedFiles = files.slice(0, ICON_BATCH_UPLOAD_MAX_ITEMS);
      if (files.length > ICON_BATCH_UPLOAD_MAX_ITEMS) {
        toast({
          title: "Limite por lote atingido",
          description: `Somente os primeiros ${ICON_BATCH_UPLOAD_MAX_ITEMS} arquivos foram considerados.`,
          variant: "destructive",
        });
      }

      setBatchReadInProgress(true);
      const inheritedCategory = resolveUserIconCategory(batchDefaultCategory);
      const inheritedKeywords = parseKeywordInput(batchDefaultKeywords);
      const createdItems = await Promise.all(
        selectedFiles.map(async (file, index): Promise<BatchUploadDraftItem> => {
          const suggestedName = suggestBatchIconNameFromFileName(file.name);
          const mergedKeywords = mergeBatchUploadKeywords({
            defaultKeywords: inheritedKeywords,
            iconName: suggestedName,
            originalFileName: file.name,
          });

          if (!isIconMimeTypeAllowed(file.type)) {
            return {
              id: `${Date.now()}-${index}-${file.name}`,
              originalFileName: file.name,
              previewDataUrl: null,
              iconName: suggestedName,
              category: inheritedCategory,
              keywords: mergedKeywords.join(", "),
              error: "Tipo de arquivo inválido. Use PNG, JPG ou SVG.",
            };
          }

          if (file.size > ICON_UPLOAD_MAX_BYTES) {
            return {
              id: `${Date.now()}-${index}-${file.name}`,
              originalFileName: file.name,
              previewDataUrl: null,
              iconName: suggestedName,
              category: inheritedCategory,
              keywords: mergedKeywords.join(", "),
              error: "Arquivo muito grande. Limite de 512 KB.",
            };
          }

          try {
            const dataUrl = await readFileAsDataUrl(file);
            return {
              id: `${Date.now()}-${index}-${file.name}`,
              originalFileName: file.name,
              previewDataUrl: dataUrl,
              iconName: suggestedName,
              category: inheritedCategory,
              keywords: mergedKeywords.join(", "),
              error: null,
            };
          } catch {
            return {
              id: `${Date.now()}-${index}-${file.name}`,
              originalFileName: file.name,
              previewDataUrl: null,
              iconName: suggestedName,
              category: inheritedCategory,
              keywords: mergedKeywords.join(", "),
              error: "Falha ao ler o arquivo.",
            };
          }
        }),
      );

      let exceededAvailableSlots = false;
      setBatchDraftItems((current) => {
        const availableSlots = Math.max(0, ICON_BATCH_UPLOAD_MAX_ITEMS - current.length);
        if (availableSlots === 0) {
          exceededAvailableSlots = createdItems.length > 0;
          return current;
        }
        if (createdItems.length > availableSlots) {
          exceededAvailableSlots = true;
        }
        return [...current, ...createdItems.slice(0, availableSlots)];
      });
      if (exceededAvailableSlots) {
        toast({
          title: "Limite do lote atingido",
          description: `Você pode manter até ${ICON_BATCH_UPLOAD_MAX_ITEMS} ícones no lote por vez.`,
          variant: "destructive",
        });
      }
      setBatchReadInProgress(false);
      event.target.value = "";
      return;
    }

    const file = files[0];
    if (!file) return;
    if (!isIconMimeTypeAllowed(file.type)) {
      toast({ title: "Formato inválido", description: "Use PNG, JPG ou SVG", variant: "destructive" });
      event.target.value = "";
      return;
    }
    if (file.size > ICON_UPLOAD_MAX_BYTES) {
      toast({
        title: "Arquivo muito grande",
        description: "Use um ícone de até 512 KB.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const suggestedName = sanitizeIconNameInput(file.name);
      const suggestedKeywords = buildIconKeywordsFromNameAndFilename({
        name: suggestedName,
        originalFileName: file.name,
      });
      setUploadPreview(dataUrl);
      setUploadFileName(file.name);
      setUploadIconName((prev) => prev || suggestedName);
      setUploadKeywords((prev) => prev || suggestedKeywords.join(", "));
    } catch {
      toast({
        title: "Falha ao ler arquivo",
        description: "Não foi possível processar este ícone.",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
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

  const handleBatchDraftUpdate = (id: string, patch: Partial<BatchUploadDraftItem>) => {
    setBatchDraftItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };

  const handleBatchDraftRemove = (id: string) => {
    setBatchDraftItems((current) => current.filter((item) => item.id !== id));
  };

  const handleConfirmBatchUpload = () => {
    if (batchDraftItems.length === 0) {
      toast({
        title: "Selecione arquivos para o lote",
        description: "Adicione pelo menos um ícone para continuar.",
        variant: "destructive",
      });
      return;
    }

    const inheritedCategory = resolveUserIconCategory(batchDefaultCategory);
    const inheritedKeywords = parseKeywordInput(batchDefaultKeywords);
    const nextDraftItems: BatchUploadDraftItem[] = [];
    const requests: Array<{
      sourceItemId: string;
      body: {
        imageDataUrl: string;
        name: string;
        category?: string | null;
        keywords?: string[];
        originalFileName?: string | null;
      };
    }> = [];

    for (const item of batchDraftItems) {
      const sanitizedName = sanitizeIconNameInput(item.iconName);
      const resolvedCategory = resolveUserIconCategory(item.category || inheritedCategory);
      const mergedKeywords = mergeBatchUploadKeywords({
        defaultKeywords: inheritedKeywords,
        itemKeywords: item.keywords,
        iconName: sanitizedName,
        originalFileName: item.originalFileName,
      });

      if (!item.previewDataUrl) {
        nextDraftItems.push({
          ...item,
          iconName: sanitizedName,
          category: resolvedCategory,
          keywords: parseKeywordInput(item.keywords).join(", "),
          error: item.error ?? "Arquivo inválido para upload.",
        });
        continue;
      }

      if (sanitizedName.length < 2) {
        nextDraftItems.push({
          ...item,
          iconName: sanitizedName,
          category: resolvedCategory,
          keywords: mergedKeywords.join(", "),
          error: "Nome do ícone obrigatório.",
        });
        continue;
      }

      nextDraftItems.push({
        ...item,
        iconName: sanitizedName,
        category: resolvedCategory,
        keywords: mergedKeywords.join(", "),
        error: null,
      });
      requests.push({
        sourceItemId: item.id,
        body: {
          imageDataUrl: item.previewDataUrl,
          name: sanitizedName,
          category: resolvedCategory,
          keywords: mergedKeywords,
          originalFileName: item.originalFileName || null,
        },
      });
    }

    setBatchDraftItems(nextDraftItems);

    if (requests.length === 0) {
      toast({
        title: "Nenhum ícone válido para salvar",
        description: "Corrija os itens com erro e tente novamente.",
        variant: "destructive",
      });
      return;
    }

    uploadBatchMutation.mutate({
      requests,
      defaultCategory: inheritedCategory,
      defaultKeywords: inheritedKeywords,
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
    setBatchDraftItems([]);
    setBatchDefaultCategory("outro");
    setBatchDefaultKeywords("");
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
      queryClient.invalidateQueries({ queryKey: ["/api/icons/community/packs"] }),
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

  const isAddExploreIconPending = (icon: OfficialIconApiModel): boolean => {
    if (icon.sourceType === "community" && icon.packItemPublicCode) {
      return addCommunityPackItemMutation.isPending && addCommunityPackItemMutation.variables === icon.packItemPublicCode;
    }
    if (icon.sourceType === "community") {
      return addCommunityIconMutation.isPending && addCommunityIconMutation.variables === icon.id;
    }
    return addOfficialIconMutation.isPending && addOfficialIconMutation.variables === icon.id;
  };

  const addExploreIconToLibrary = async (icon: OfficialIconApiModel): Promise<{ userIconId: string | null }> => {
    if (icon.sourceType === "community" && icon.packItemPublicCode) {
      const result = await addCommunityPackItemMutation.mutateAsync(icon.packItemPublicCode);
      return { userIconId: result.userIconId ?? null };
    }
    if (icon.sourceType === "community") {
      const result = await addCommunityIconMutation.mutateAsync(icon.id);
      return { userIconId: result.icon?.id ?? null };
    }
    const result = await addOfficialIconMutation.mutateAsync(icon.id);
    return { userIconId: result.icon?.id ?? null };
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

  const openPackDetails = (pack: OfficialIconPackApiModel) => {
    setPackDetailsTarget(pack);
    setPackDetailsOpen(true);
  };

  const openPackActions = (pack: OfficialIconPackApiModel) => {
    setManageActionTarget({
      type: "pack",
      pack,
    });
  };

  const toggleCreatePackIconSelection = (iconId: string) => {
    setNewPackSelectedIconIds((current) =>
      current.includes(iconId)
        ? current.filter((id) => id !== iconId)
        : [...current, iconId],
    );
  };

  const handleCreatePack = () => {
    const trimmedName = newPackName.trim();
    if (trimmedName.length < 2) {
      toast({
        title: "Nome do pack obrigatório",
        description: "Informe um nome com pelo menos 2 caracteres.",
        variant: "destructive",
      });
      return;
    }
    if (newPackSelectedIconIds.length === 0) {
      toast({
        title: "Selecione ícones para o pack",
        description: "Escolha ao menos um ícone da sua biblioteca.",
        variant: "destructive",
      });
      return;
    }

    createCommunityPackMutation.mutate({
      name: trimmedName,
      description: newPackDescription.trim() || null,
      category: resolveUserIconCategory(newPackCategory),
      userIconIds: newPackSelectedIconIds,
      publish: newPackPublish,
    });
  };

  const iconsPerPage = isMobile ? 24 : 40;
  const packsPerPage = 12;

  const filteredPersonalIcons = useMemo(
    () => filterAndSortPersonalIcons(personalIcons, {
      search: myIconsSearch,
      category: myIconsCategory,
      sort: myIconsOrder,
    }),
    [personalIcons, myIconsSearch, myIconsCategory, myIconsOrder],
  );

  const paginatedPersonalIcons = useMemo(
    () => paginateItems(filteredPersonalIcons, myIconsPage, iconsPerPage),
    [filteredPersonalIcons, myIconsPage, iconsPerPage],
  );

  const packMatchSummaryByPackId = useMemo(
    () => buildPackMatchSummaryByPackId(officialIcons),
    [officialIcons],
  );

  const filteredExplorePacks = useMemo(
    () => resolveExplorePacksForView(explorePacks, {
      search: exploreSearch,
      matchingPackIds: new Set(packMatchSummaryByPackId.keys()),
    }),
    [explorePacks, exploreSearch, packMatchSummaryByPackId],
  );

  const explorePacksById = useMemo(
    () => new Map(explorePacks.map((pack) => [pack.id, pack])),
    [explorePacks],
  );

  const shouldShowExploreGlobalEmpty =
    hasExploreSearch
    && exploreType === "all"
    && filteredExplorePacks.length === 0
    && officialIcons.length === 0;

  const paginatedExplorePacks = useMemo(
    () => paginateItems(filteredExplorePacks, explorePacksPage, packsPerPage),
    [filteredExplorePacks, explorePacksPage],
  );

  const paginatedExploreIcons = useMemo(
    () => paginateItems(officialIcons, exploreIconsPage, iconsPerPage),
    [officialIcons, exploreIconsPage, iconsPerPage],
  );

  useEffect(() => {
    setMyIconsPage(1);
  }, [myIconsSearch, myIconsCategory, myIconsOrder, isMobile]);

  useEffect(() => {
    setExplorePacksPage(1);
    setExploreIconsPage(1);
  }, [exploreSearch, exploreCategory, exploreOrigin, exploreType, isMobile]);

  useEffect(() => {
    if (myIconsPage > paginatedPersonalIcons.totalPages) {
      setMyIconsPage(1);
    }
  }, [myIconsPage, paginatedPersonalIcons.totalPages]);

  useEffect(() => {
    if (explorePacksPage > paginatedExplorePacks.totalPages) {
      setExplorePacksPage(1);
    }
  }, [explorePacksPage, paginatedExplorePacks.totalPages]);

  useEffect(() => {
    if (exploreIconsPage > paginatedExploreIcons.totalPages) {
      setExploreIconsPage(1);
    }
  }, [exploreIconsPage, paginatedExploreIcons.totalPages]);

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
        <DialogContent
          overlayClassName="z-[70]"
          className="z-[70] flex h-[94dvh] max-h-[94dvh] w-[95vw] max-w-[1040px] flex-col overflow-hidden p-0 sm:h-[85vh] sm:max-h-[85vh]"
        >
          <div className="shrink-0 border-b border-border/60 bg-background/95 px-4 py-4 backdrop-blur-sm sm:px-6 sm:py-5">
            <DialogHeader className="pr-8">
              <DialogTitle>{isManageMode ? "Biblioteca de ícones" : "Alterar Ícone"}</DialogTitle>
              <DialogDescription className="sr-only">
                Gerencie a biblioteca de ícones, explore conteúdos publicados e faça uploads personalizados.
              </DialogDescription>
            </DialogHeader>

            {shouldShowSuggestion && !isManageMode ? (
              <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-3">
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
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(nextValue) => setActiveTab(nextValue as "official" | "personal" | "explore" | "upload")}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div className="shrink-0 border-b border-border/60 bg-background/95 px-4 py-3 sm:px-6">
              <TabsList className="h-auto w-full justify-start gap-1.5 overflow-x-auto rounded-2xl border-border/60 bg-muted/35 p-1 sm:grid sm:grid-cols-4 sm:overflow-hidden">
                <TabsTrigger value="official" className="min-h-10 px-3 text-xs sm:w-full sm:text-sm">Ícones oficiais</TabsTrigger>
                <TabsTrigger value="personal" className="min-h-10 px-3 text-xs sm:w-full sm:text-sm">Meus ícones</TabsTrigger>
                <TabsTrigger value="explore" className="min-h-10 px-3 text-xs sm:w-full sm:text-sm">Explorar</TabsTrigger>
                <TabsTrigger value="upload" className="min-h-10 px-3 text-xs sm:w-full sm:text-sm">Upload</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="official" className="mt-0 min-h-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
              {CATEGORIES.map((cat) => {
                const items = LIBRARY_ICONS.filter((i) => i.category === cat);
                return (
                  <div key={cat}>
                    <IconPickerSectionHeader className="mb-2">
                      {CATEGORY_LABELS[cat]}
                    </IconPickerSectionHeader>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {items.map((item) => {
                        const isSelected = value === item.key;
                        const normalizedBuiltinKey = item.key.trim().toLowerCase();
                        const isBuiltinDisabled = disabledBuiltinIconKeys.has(normalizedBuiltinKey);
                        const automationLabel = isBuiltinDisabled ? "Automação desativada" : "Automação ativa";
                        return (
                          <IconPickerBuiltinIconCard
                            key={item.key}
                            iconKey={item.key}
                            label={item.label}
                            isSelected={isSelected}
                            isAutomationDisabled={isBuiltinDisabled}
                            onClick={() => openManageBuiltinActions(item.key, item.label)}
                            testId={`icon-option-${item.key}`}
                            title={`${item.label} · ${automationLabel}`}
                            ariaLabel={`${item.label}. ${automationLabel}. Abrir ações do ícone.`}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}

            </TabsContent>

            <TabsContent value="personal" className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <IconPickerSectionHeader>
                    Meus ícones
                  </IconPickerSectionHeader>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:items-center">
                    <Input
                      value={myIconsSearch}
                      onChange={(event) => setMyIconsSearch(event.target.value)}
                      placeholder="Buscar meus ícones..."
                      aria-label="Buscar meus ícones"
                      className="w-full xl:min-w-[220px]"
                    />
                    <Select value={myIconsCategory} onValueChange={setMyIconsCategory}>
                      <SelectTrigger aria-label="Filtrar categoria dos meus ícones" className="w-full xl:min-w-[170px]">
                        <SelectValue placeholder="Categoria" />
                      </SelectTrigger>
                      <SelectContent className="z-[90]">
                        <SelectItem value="all">Todas categorias</SelectItem>
                        {USER_ICON_CATEGORIES.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={myIconsOrder}
                      onValueChange={(next) => setMyIconsOrder(next as PersonalIconSortOrder)}
                    >
                      <SelectTrigger aria-label="Ordenar meus ícones" className="w-full xl:min-w-[170px]">
                        <SelectValue placeholder="Ordenar" />
                      </SelectTrigger>
                      <SelectContent className="z-[90]">
                        <SelectItem value="recent">Mais recentes</SelectItem>
                        <SelectItem value="name-asc">Nome A-Z</SelectItem>
                        <SelectItem value="category">Categoria</SelectItem>
                      </SelectContent>
                    </Select>
                    {personalIcons.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setCreatePackOpen(true)}
                        data-testid="button-criar-pack"
                        className="h-10 w-full xl:w-auto"
                      >
                        Criar pack
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {isLoadingPersonalIcons ? (
                <p className="text-xs text-muted-foreground">Carregando ícones personalizados...</p>
              ) : personalIcons.length === 0 ? (
                <IconPickerEmptyState
                  title="Você ainda não enviou ícones personalizados."
                  description="Faça upload individual ou em lote para começar."
                  actionLabel="Fazer upload"
                  onAction={() => setActiveTab("upload")}
                />
              ) : filteredPersonalIcons.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum ícone encontrado para esse filtro.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {paginatedPersonalIcons.items.map((item) => {
                      const isSelected = value === item.imageUrl;
                      const isAutomationEnabled = (iconMatchRulesByIconId.get(item.imageUrl)?.length ?? 0) > 0;
                      const publication = communityPublicationBySourceUserIconId.get(item.id) ?? null;
                      const isAutomationDisabled = !isAutomationEnabled;
                      const automationLabel = isAutomationDisabled ? "Automação desativada" : "Automação ativa";
                      return (
                        <IconPickerPersonalIconCard
                          key={item.id}
                          name={item.name}
                          imageUrl={item.imageUrl}
                          isSelected={isSelected}
                          isAutomationDisabled={isAutomationDisabled}
                          onClick={() => openManagePersonalActions(item, publication)}
                          testId={`icon-personal-option-${item.id}`}
                          title={`${item.name} · ${automationLabel}`}
                          ariaLabel={`${item.name}. ${automationLabel}. Abrir ações do ícone.`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 p-2 text-xs text-muted-foreground">
                    <p>
                      Mostrando {paginatedPersonalIcons.startIndex + 1}–{paginatedPersonalIcons.endIndex} de{" "}
                      {paginatedPersonalIcons.totalItems} ícones
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={paginatedPersonalIcons.page <= 1}
                        onClick={() => setMyIconsPage((current) => Math.max(1, current - 1))}
                      >
                        Anterior
                      </Button>
                      <span>
                        Página {paginatedPersonalIcons.page} de {paginatedPersonalIcons.totalPages}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={paginatedPersonalIcons.page >= paginatedPersonalIcons.totalPages}
                        onClick={() =>
                          setMyIconsPage((current) => Math.min(paginatedPersonalIcons.totalPages, current + 1))
                        }
                      >
                        Próxima
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {value && !isManageMode ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleReset}
                  data-testid="button-reset-icone"
                >
                  <RotateCcw className="mr-2 h-3 w-3" />
                  Remover ícone personalizado (usar padrão)
                </Button>
              ) : null}
            </TabsContent>

            <TabsContent value="explore" className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    value={exploreSearch}
                    onChange={(event) => setExploreSearch(event.target.value)}
                    placeholder="Buscar pack ou ícone"
                    aria-label="Buscar pack ou ícone"
                    className="sm:col-span-2 lg:col-span-1"
                  />
                  <Select value={exploreType} onValueChange={(value) => setExploreType(value as "all" | "icons" | "packs")}>
                    <SelectTrigger aria-label="Filtrar tipo de conteúdo">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="packs">Packs</SelectItem>
                      <SelectItem value="icons">Ícones individuais</SelectItem>
                      <SelectItem value="all">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={exploreOrigin} onValueChange={(value) => setExploreOrigin(value as "all" | "official" | "community")}>
                    <SelectTrigger aria-label="Filtrar origem dos ícones">
                      <SelectValue placeholder="Origem" />
                    </SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="official">Oficiais</SelectItem>
                      <SelectItem value="community">Comunidade</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={exploreCategory} onValueChange={setExploreCategory}>
                    <SelectTrigger aria-label="Filtrar categoria de ícones">
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="all">Todas categorias</SelectItem>
                      {USER_ICON_CATEGORIES.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {shouldShowExploreGlobalEmpty ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum pack ou ícone encontrado para “{exploreSearch.trim()}”.
                </p>
              ) : null}

              {exploreType !== "icons" && !(shouldShowExploreGlobalEmpty && exploreType === "all") ? (
                <div className="space-y-2">
                  <IconPickerSectionHeader>
                    {hasExploreSearch ? "Packs encontrados" : "Packs disponíveis"}
                  </IconPickerSectionHeader>
                  {isLoadingExplorePacks ? (
                    <p className="text-xs text-muted-foreground">Carregando packs...</p>
                  ) : paginatedExplorePacks.totalItems === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum pack encontrado para esse filtro.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {paginatedExplorePacks.items.map((pack) => {
                          const progress = resolvePackProgress(pack);
                          const isFull = progress.status === "full";
                          const matchHint = hasExploreSearch
                            ? (formatPackMatchHint(packMatchSummaryByPackId.get(pack.id)) ?? "Match pelo nome/descrição do pack")
                            : null;
                          const categorySummary = `${pack.category ? getIconCategoryLabel(pack.category) : "Sem categoria"} · ${pack.iconsCount} ícone(s)`;
                          const authorLabel = pack.sourceType === "community"
                            ? `Publicado por: ${formatCommunityAuthorLabel(pack.ownerLabel)}`
                            : "Catálogo oficial";
                          return (
                            <IconPickerPackCard
                              key={pack.id}
                              name={pack.name}
                              matchHint={matchHint}
                              categorySummary={categorySummary}
                              authorLabel={authorLabel}
                              publicCode={pack.publicCode}
                              addActionLabel={getPackAddActionLabel(pack)}
                              addButtonVariant={isFull ? "outline" : "default"}
                              addDisabled={isFull || addPackToLibraryMutation.isPending}
                              onOpenDetails={() => openPackDetails(pack)}
                              onAddPack={() => addPackToLibraryMutation.mutate(pack)}
                              onOpenActions={() => openPackActions(pack)}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 p-2 text-xs text-muted-foreground">
                        <p>
                          Mostrando {paginatedExplorePacks.startIndex + 1}–{paginatedExplorePacks.endIndex} de{" "}
                          {paginatedExplorePacks.totalItems} packs
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={paginatedExplorePacks.page <= 1}
                            onClick={() => setExplorePacksPage((current) => Math.max(1, current - 1))}
                          >
                            Anterior
                          </Button>
                          <span>
                            Página {paginatedExplorePacks.page} de {paginatedExplorePacks.totalPages}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={paginatedExplorePacks.page >= paginatedExplorePacks.totalPages}
                            onClick={() =>
                              setExplorePacksPage((current) =>
                                Math.min(paginatedExplorePacks.totalPages, current + 1),
                              )
                            }
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {exploreType !== "packs" && !(shouldShowExploreGlobalEmpty && exploreType === "all") ? (
                <div className="space-y-2">
                  <IconPickerSectionHeader>
                    {hasExploreSearch ? "Ícones encontrados" : "Ícones individuais"}
                  </IconPickerSectionHeader>
                  {isLoadingOfficialIcons ? (
                    <p className="text-xs text-muted-foreground">Carregando ícones...</p>
                  ) : paginatedExploreIcons.totalItems === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {hasExploreSearch
                        ? "Nenhum ícone encontrado para esse filtro."
                        : "Nenhum ícone individual encontrado para esse filtro."}
                    </p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {paginatedExploreIcons.items.map((icon) => {
                          const alreadyAdded = icon.alreadyInLibrary || personalOfficialIconIds.has(icon.id);
                          const isCommunity = icon.sourceType === "community";
                          const categoryLabel = icon.category ? getIconCategoryLabel(icon.category) : "Sem categoria";
                          const authorLabel = isCommunity
                            ? `Publicado por: ${formatCommunityAuthorLabel(icon.ownerLabel)}`
                            : "Catálogo oficial";
                          return (
                            <IconPickerExploreIconCard
                              key={icon.id}
                              name={icon.name}
                              imageUrl={icon.imageUrl}
                              categoryLabel={categoryLabel}
                              originLabel={getExploreIconPackOriginLabel(icon)}
                              packItemPublicCode={icon.packItemPublicCode}
                              authorLabel={authorLabel}
                              availabilityLabel={alreadyAdded ? "Na sua biblioteca" : "Disponível"}
                              availabilityVariant={alreadyAdded ? "secondary" : "outline"}
                              showAddButton={!alreadyAdded}
                              addButtonDisabled={isAddExploreIconPending(icon)}
                              showOpenPackButton={Boolean(icon.packId && hasExploreSearch)}
                              onOpenActions={() => openExploreActions(icon, alreadyAdded)}
                              onAddIcon={async () => {
                                try {
                                  await addExploreIconToLibrary(icon);
                                } catch {
                                  // handled by mutation onError
                                }
                              }}
                              onOpenPack={() => {
                                const pack = explorePacksById.get(icon.packId ?? "");
                                if (pack) {
                                  openPackDetails(pack);
                                }
                              }}
                            />
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/70 p-2 text-xs text-muted-foreground">
                        <p>
                          Mostrando {paginatedExploreIcons.startIndex + 1}–{paginatedExploreIcons.endIndex} de{" "}
                          {paginatedExploreIcons.totalItems} ícones
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={paginatedExploreIcons.page <= 1}
                            onClick={() => setExploreIconsPage((current) => Math.max(1, current - 1))}
                          >
                            Anterior
                          </Button>
                          <span>
                            Página {paginatedExploreIcons.page} de {paginatedExploreIcons.totalPages}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={paginatedExploreIcons.page >= paginatedExploreIcons.totalPages}
                            onClick={() =>
                              setExploreIconsPage((current) =>
                                Math.min(paginatedExploreIcons.totalPages, current + 1),
                              )
                            }
                          >
                            Próxima
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="upload" className="mt-0 min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-4 py-4 sm:px-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-foreground">Tipo de upload</label>
                  <Select value={uploadMode} onValueChange={(nextMode) => setUploadMode(nextMode as IconUploadMode)}>
                    <SelectTrigger aria-label="Tipo de upload de ícone">
                      <SelectValue placeholder="Selecione o tipo de upload" />
                    </SelectTrigger>
                    <SelectContent className="z-[90]">
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="batch">Em lote</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {uploadMode === "batch" ? (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Categoria padrão do lote</label>
                    <Select value={batchDefaultCategory} onValueChange={setBatchDefaultCategory}>
                      <SelectTrigger aria-label="Categoria padrão do lote">
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent className="z-[90]">
                        {USER_ICON_CATEGORIES.map((category) => (
                          <SelectItem key={category.value} value={category.value}>
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>

              <div
                className="cursor-pointer space-y-3 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:bg-accent/50"
                onClick={() => fileRef.current?.click()}
              >
                {uploadMode === "individual" ? (
                  uploadPreview ? (
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
                  )
                ) : (
                  <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-xl bg-muted">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium">
                    {uploadMode === "batch" ? "Clique para selecionar vários arquivos" : "Clique para selecionar"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {uploadMode === "batch"
                      ? `PNG, JPG ou SVG · até ${ICON_BATCH_UPLOAD_MAX_ITEMS} arquivos`
                      : "PNG, JPG ou SVG"}
                  </p>
                </div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept={ICON_ALLOWED_MIME_TYPES.join(",")}
                className="hidden"
                onChange={handleFileChange}
                multiple={uploadMode === "batch"}
                data-testid="input-upload-icone"
              />

              {uploadMode === "individual" ? (
                <>
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
                        <SelectContent className="z-[90]">
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
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-foreground">Palavras-chave base do lote</label>
                    <Input
                      value={batchDefaultKeywords}
                      onChange={(event) => setBatchDefaultKeywords(event.target.value)}
                      placeholder="Ex: mercado pago, mp, carteira digital"
                      aria-label="Palavras-chave base do lote"
                      maxLength={500}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Essas palavras serão combinadas com as de cada item.
                    </p>
                  </div>

                  {batchReadInProgress ? (
                    <p className="text-xs text-muted-foreground">Processando arquivos do lote...</p>
                  ) : null}

                  {batchDraftItems.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhum arquivo no lote ainda.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {batchDraftItems.map((item) => (
                        <div key={item.id} className="rounded-lg border p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                              {item.previewDataUrl ? (
                                <img
                                  src={item.previewDataUrl}
                                  alt={item.iconName || "Preview"}
                                  className="h-10 w-10 rounded-md object-cover"
                                />
                              ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                                  <Upload className="h-4 w-4 text-muted-foreground" />
                                </div>
                              )}
                              <p className="truncate text-xs text-muted-foreground" title={item.originalFileName}>
                                {item.originalFileName}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() => handleBatchDraftRemove(item.id)}
                              aria-label={`Remover ${item.originalFileName} do lote`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <Input
                              value={item.iconName}
                              onChange={(event) => handleBatchDraftUpdate(item.id, { iconName: event.target.value, error: null })}
                              placeholder="Nome do ícone"
                              aria-label={`Nome do ícone ${item.originalFileName}`}
                              maxLength={120}
                            />
                            <Select
                              value={item.category}
                              onValueChange={(nextCategory) => handleBatchDraftUpdate(item.id, { category: nextCategory })}
                            >
                              <SelectTrigger aria-label={`Categoria do ícone ${item.originalFileName}`}>
                                <SelectValue placeholder="Categoria" />
                              </SelectTrigger>
                              <SelectContent className="z-[90]">
                                {USER_ICON_CATEGORIES.map((category) => (
                                  <SelectItem key={category.value} value={category.value}>
                                    {category.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Input
                              value={item.keywords}
                              onChange={(event) => handleBatchDraftUpdate(item.id, { keywords: event.target.value })}
                              placeholder="Palavras-chave"
                              aria-label={`Palavras-chave do ícone ${item.originalFileName}`}
                              maxLength={500}
                            />
                          </div>
                          {item.error ? (
                            <p className="mt-2 text-xs text-destructive">{item.error}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}

                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleConfirmBatchUpload}
                    disabled={batchDraftItems.length === 0 || batchReadInProgress || uploadBatchMutation.isPending}
                    data-testid="button-confirmar-upload-lote"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    {uploadBatchMutation.isPending ? "Salvando..." : "Salvar ícones"}
                  </Button>
                </>
              )}

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
        open={createPackOpen}
        onOpenChange={(nextOpen) => {
          setCreatePackOpen(nextOpen);
          if (!nextOpen) {
            setNewPackName("");
            setNewPackDescription("");
            setNewPackCategory("outro");
            setNewPackPublish(true);
            setNewPackSelectedIconIds([]);
          }
        }}
      >
        <DialogContent
          overlayClassName="z-[80]"
          className="z-[80] max-h-[85vh] w-[min(95vw,780px)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Criar pack</DialogTitle>
            <DialogDescription className="sr-only">
              Monte um pack com ícones da sua biblioteca e publique opcionalmente em Explorar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Nome do pack</label>
                <Input
                  value={newPackName}
                  onChange={(event) => setNewPackName(event.target.value)}
                  placeholder="Ex: Bancos BR"
                  maxLength={120}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Categoria</label>
                <Select value={newPackCategory} onValueChange={setNewPackCategory}>
                  <SelectTrigger aria-label="Categoria do pack">
                    <SelectValue placeholder="Categoria" />
                  </SelectTrigger>
                  <SelectContent className="z-[90]">
                    {USER_ICON_CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Descrição (opcional)</label>
              <Input
                value={newPackDescription}
                onChange={(event) => setNewPackDescription(event.target.value)}
                placeholder="Ex: Ícones úteis para bancos brasileiros"
                maxLength={280}
              />
            </div>

            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={newPackPublish}
                onChange={(event) => setNewPackPublish(event.target.checked)}
              />
              Publicar em Explorar ícones
            </label>

            <div className="space-y-2">
              <IconPickerSectionHeader>
                Selecione os ícones do pack
              </IconPickerSectionHeader>
              {personalIcons.length === 0 ? (
                <p className="text-xs text-muted-foreground">Você ainda não tem ícones na sua biblioteca.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {personalIcons.map((item) => {
                    const selected = newPackSelectedIconIds.includes(item.id);
                    return (
                      <IconPickerPackSelectIconCard
                        key={item.id}
                        imageUrl={item.imageUrl}
                        name={item.name}
                        categoryLabel={item.category ? getIconCategoryLabel(item.category) : "Sem categoria"}
                        isSelected={selected}
                        onClick={() => toggleCreatePackIconSelection(item.id)}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setCreatePackOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1"
              onClick={handleCreatePack}
              disabled={createCommunityPackMutation.isPending}
            >
              {createCommunityPackMutation.isPending ? "Salvando..." : "Criar pack"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={packDetailsOpen}
        onOpenChange={(nextOpen) => {
          setPackDetailsOpen(nextOpen);
          if (!nextOpen) {
            setPackDetailsTarget(null);
          }
        }}
      >
        <DialogContent
          overlayClassName="z-[80]"
          className="z-[80] max-h-[85vh] w-[min(95vw,860px)] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>{packDetailsTarget?.name || "Pack"}</DialogTitle>
            <DialogDescription className="sr-only">
              Revise os ícones deste pack e adicione itens à sua biblioteca.
            </DialogDescription>
          </DialogHeader>

          {packDetailsTarget ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {packDetailsTarget.sourceType === "community"
                  ? `Publicado por: ${formatCommunityAuthorLabel(packDetailsTarget.ownerLabel)}`
                  : "Catálogo oficial"}
              </p>
              {packDetailsTarget.publicCode ? (
                <p className="text-xs text-muted-foreground">
                  ID do pack: {packDetailsTarget.publicCode}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {packDetailsTarget.description || "Sem descrição"}
              </p>

              {isLoadingPackDetails ? (
                <p className="text-xs text-muted-foreground">Carregando ícones do pack...</p>
              ) : activePackDetails?.icons?.length ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {activePackDetails.icons.map((icon) => {
                    const alreadyAdded = icon.alreadyInLibrary || personalOfficialIconIds.has(icon.id);
                    return (
                      <IconPickerPackDetailIconCard
                        key={icon.id}
                        imageUrl={icon.imageUrl}
                        name={icon.name}
                        categoryLabel={icon.category ? getIconCategoryLabel(icon.category) : "Sem categoria"}
                        publicCode={icon.packItemPublicCode}
                        availabilityLabel={alreadyAdded ? "Na sua biblioteca" : "Disponível"}
                        availabilityVariant={alreadyAdded ? "secondary" : "outline"}
                        showAddButton={!alreadyAdded}
                        addDisabled={isAddExploreIconPending(icon)}
                        onOpenActions={() => openExploreActions(icon, alreadyAdded)}
                        onAddIcon={async () => {
                          try {
                            await addExploreIconToLibrary(icon);
                          } catch {
                            // handled by mutation onError
                          }
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum ícone ativo neste pack.</p>
              )}

              <Button
                type="button"
                className="w-full"
                variant={resolvePackProgress(packDetailsTarget).status === "full" ? "outline" : "default"}
                disabled={
                  (resolvePackProgress(packDetailsTarget).status === "full")
                  || addPackToLibraryMutation.isPending
                }
                onClick={() => addPackToLibraryMutation.mutate(packDetailsTarget)}
              >
                {getPackAddActionLabel(packDetailsTarget)}
              </Button>
            </div>
          ) : null}
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
        <DialogContent
          overlayClassName="z-[80]"
          className="z-[80] max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Editar ícone personalizado</DialogTitle>
            <DialogDescription className="sr-only">
              Atualize nome, categoria e palavras-chave do ícone personalizado.
            </DialogDescription>
          </DialogHeader>

          <IconPickerEditDialogContent
            iconName={editIconName}
            onIconNameChange={setEditIconName}
            iconNameLabel="Nome do ícone"
            iconNamePlaceholder="Ex: Itaú, KaBuM, Netflix"
            iconNameAriaLabel="Editar nome do ícone"
            category={editCategory}
            onCategoryChange={setEditCategory}
            categoryLabel="Categoria"
            categoryAriaLabel="Editar categoria do ícone"
            categoryPlaceholder="Selecione uma categoria"
            categoryOptions={USER_ICON_CATEGORIES}
            keywords={editKeywords}
            onKeywordsChange={setEditKeywords}
            keywordsLabel="Palavras-chave"
            keywordsPlaceholder="Ex: itau, itaú, itaucard, unibanco"
            keywordsAriaLabel="Editar palavras-chave do ícone"
            onCancel={() => setEditingIcon(null)}
            cancelLabel="Cancelar"
            onSave={handleSaveEditPersonalIcon}
            saveLabel="Salvar alterações"
            savePendingLabel="Salvando..."
            isSavePending={updatePersonalIconMutation.isPending}
          />
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
        <AlertDialogContent overlayClassName="z-[80]" className="z-[80]">
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
        <DialogContent
          overlayClassName="z-[80]"
          className="z-[80] max-w-sm"
        >
          <DialogHeader>
            <DialogTitle>
              {manageActionTarget?.type === "builtin"
                ? manageActionTarget.label
                : manageActionTarget?.type === "personal"
                  ? manageActionTarget.icon.name
                  : manageActionTarget?.type === "explore"
                    ? manageActionTarget.icon.name
                    : manageActionTarget?.type === "pack"
                      ? manageActionTarget.pack.name
                    : "Ações do ícone"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Escolha a ação desejada para o ícone ou pack selecionado.
            </DialogDescription>
          </DialogHeader>

          {manageActionTarget?.type === "builtin" ? (
            <IconPickerManageBuiltinActions
              onUseIcon={() => {
                handleSelectLibrary(manageActionTarget.iconKey);
                setManageActionTarget(null);
              }}
              onToggleAutomation={async () => {
                await handleToggleBuiltinIconAutomation(manageActionTarget.iconKey);
                setManageActionTarget(null);
              }}
              useIconLabel="Usar este ícone"
              toggleAutomationLabel={
                disabledBuiltinIconKeys.has(manageActionTarget.iconKey.trim().toLowerCase())
                  ? "Restaurar padrão"
                  : "Desativar para mim"
              }
              isToggleAutomationDisabled={isActionLoading(getBuiltinActionKey(manageActionTarget.iconKey))}
            />
          ) : manageActionTarget?.type === "personal" ? (
            <div className="space-y-2">
              <IconPickerManagePersonalCoreActions
                onUseIcon={() => {
                  handleSelectPersonal(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
                useIconLabel="Usar este ícone"
                showEditInformationButton={manageActionTarget.icon.sourceType !== "official"}
                onEditInformation={() => {
                  openEditPersonalIcon(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
                editInformationLabel="Editar informações"
                onToggleAutomation={async () => {
                  await handleTogglePersonalIconAutomation(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
                toggleAutomationLabel={
                  (iconMatchRulesByIconId.get(manageActionTarget.icon.imageUrl)?.length ?? 0) > 0
                    ? "Desativar automação"
                    : "Reativar automação"
                }
                isToggleAutomationDisabled={isActionLoading(getPersonalAutomationActionKey(manageActionTarget.icon))}
                onRemoveIcon={() => {
                  setDeletingIcon(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
                removeIconLabel={
                  manageActionTarget.icon.sourceType === "official"
                    ? "Remover da minha biblioteca"
                    : "Excluir da minha biblioteca"
                }
              />
              <IconPickerManagePersonalPublicationActions
                showPublicationActions={manageActionTarget.icon.sourceType !== "official"}
                onPublish={async () => {
                  await handlePublishPersonalIcon(manageActionTarget.icon);
                  setManageActionTarget(null);
                }}
                publishLabel={manageActionTarget.publication ? "Atualizar publicação" : "Publicar em Explorar ícones"}
                isPublishDisabled={isActionLoading(`personal:${manageActionTarget.icon.id}:publish`)}
                showUnpublishButton={Boolean(manageActionTarget.publication)}
                onUnpublish={async () => {
                  const publicationId = manageActionTarget.publication?.id;
                  if (!publicationId) return;
                  await handleUnpublishPersonalIcon(publicationId, manageActionTarget.icon.id);
                  setManageActionTarget(null);
                }}
                unpublishLabel="Despublicar"
                isUnpublishDisabled={isActionLoading(`personal:${manageActionTarget.icon.id}:unpublish`)}
              />
            </div>
          ) : manageActionTarget?.type === "explore" ? (
            <div className="space-y-2">
              <IconPickerManageExploreInfo
                showInLibraryBadge={manageActionTarget.alreadyAdded}
                inLibraryLabel="Na sua biblioteca"
                sourceLabel={
                  manageActionTarget.icon.sourceType === "community"
                    ? `Publicado por: ${formatCommunityAuthorLabel(manageActionTarget.icon.ownerLabel)}`
                    : "Catálogo oficial"
                }
                packOriginLabel={getExploreIconPackOriginLabel(manageActionTarget.icon)}
                categoryLabel={
                  manageActionTarget.icon.category
                    ? `Categoria: ${getIconCategoryLabel(manageActionTarget.icon.category)}`
                    : "Categoria: Sem categoria"
                }
                publicCodeLabel={
                  manageActionTarget.icon.packItemPublicCode
                    ? `ID do ícone: ${manageActionTarget.icon.packItemPublicCode}`
                    : null
                }
              />
              <IconPickerManageExploreActions
                showAddIconButton={!manageActionTarget.alreadyAdded}
                onAddIcon={async () => {
                  try {
                    await addExploreIconToLibrary(manageActionTarget.icon);
                    setManageActionTarget(null);
                  } catch {
                    // handled by mutation onError
                  }
                }}
                addIconLabel="Adicionar este ícone"
                isAddIconDisabled={isAddExploreIconPending(manageActionTarget.icon)}
                showOpenPackButton={Boolean(manageActionTarget.icon.packId)}
                onOpenPack={() => {
                  const pack = explorePacksById.get(manageActionTarget.icon.packId ?? "");
                  if (pack) {
                    openPackDetails(pack);
                  }
                  setManageActionTarget(null);
                }}
                openPackLabel="Abrir pack"
                showManageInLibraryButton={manageActionTarget.alreadyAdded}
                onManageInLibrary={() => {
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
                manageInLibraryLabel="Gerenciar na minha biblioteca"
                showUseIconButton={!isManageMode}
                onUseIcon={async () => {
                  try {
                    const existingPersonalIcon = findPersonalIconFromExploreCard(manageActionTarget.icon);
                    if (existingPersonalIcon) {
                      handleSelectPersonal(existingPersonalIcon);
                      setManageActionTarget(null);
                      return;
                    }

                    const addedResult = await addExploreIconToLibrary(manageActionTarget.icon);
                    const selectedUserIconId = addedResult.userIconId;
                    emitSelection({
                      displayValue: manageActionTarget.icon.imageUrl,
                      persistableIconId: selectedUserIconId,
                      source: "personal",
                      userIconId: selectedUserIconId,
                      officialIconId: manageActionTarget.icon.id,
                    });
                    if (!isManageMode) {
                      setOpen(false);
                    }
                    setManageActionTarget(null);
                  } catch {
                    // handled by mutation onError
                  }
                }}
                useIconLabel="Usar este ícone"
              />
            </div>
          ) : manageActionTarget?.type === "pack" ? (
            <IconPickerManagePackActions
              sourceLabel={
                manageActionTarget.pack.sourceType === "community"
                  ? `Publicado por: ${formatCommunityAuthorLabel(manageActionTarget.pack.ownerLabel)}`
                  : "Catálogo oficial"
              }
              publicCode={manageActionTarget.pack.publicCode}
              summaryLabel={getPackLibrarySummaryLabel(manageActionTarget.pack)}
              onViewDetails={() => {
                openPackDetails(manageActionTarget.pack);
                setManageActionTarget(null);
              }}
              viewDetailsLabel="Ver detalhes do pack"
              onAddPack={() => {
                addPackToLibraryMutation.mutate(manageActionTarget.pack);
                setManageActionTarget(null);
              }}
              addPackLabel={getPackAddActionLabel(manageActionTarget.pack)}
              addPackVariant={resolvePackProgress(manageActionTarget.pack).status === "full" ? "outline" : "default"}
              isAddPackDisabled={
                (resolvePackProgress(manageActionTarget.pack).status === "full")
                || addPackToLibraryMutation.isPending
              }
              showUnpublishButton={manageActionTarget.pack.sourceType === "community"}
              onUnpublishPack={async () => {
                try {
                  await unpublishCommunityPackMutation.mutateAsync(manageActionTarget.pack.id);
                  setManageActionTarget(null);
                } catch {
                  // handled by mutation onError
                }
              }}
              unpublishLabel="Despublicar pack"
              isUnpublishDisabled={unpublishCommunityPackMutation.isPending}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

