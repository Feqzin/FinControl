import { apiRequest } from "@/lib/queryClient";

export type OfficialIconApiModel = {
  id: string;
  iconKey: string;
  sourceType?: "official" | "community";
  sourceUserIconId?: string | null;
  ownerUserId?: string | null;
  ownerLabel?: string | null;
  ownerPublicCode?: string | null;
  name: string;
  imageUrl: string;
  storagePath: string | null;
  category: string | null;
  tags: string[];
  aliases: string[];
  packId: string | null;
  packName: string | null;
  alreadyInLibrary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type OfficialIconPackApiModel = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  sourceType: "official" | "community";
  ownerUserId: string | null;
  ownerLabel: string | null;
  ownerPublicCode: string | null;
  isPublished: boolean;
  iconsCount: number;
  addedIconsCount: number;
  createdAt: string;
  updatedAt: string;
};

export type AddOfficialIconToLibraryResult = {
  icon: {
    id: string;
    userId: string;
    sourceType: string;
    officialIconId: string | null;
    name: string;
    imageUrl: string;
    storagePath: string | null;
    category: string | null;
    tags: string[] | null;
    createdAt: string;
    updatedAt: string;
  };
  alreadyInLibrary: boolean;
  createdMatchRules: number;
};

export type AddOfficialPackToLibraryResult = {
  packId: string;
  totalIcons: number;
  addedCount: number;
  alreadyInLibraryCount: number;
  createdMatchRules: number;
};

export type FetchOfficialIconsQuery = {
  search?: string;
  category?: string;
  packId?: string;
  origin?: "all" | "official" | "community";
  includePackItems?: boolean;
};

export type FetchOfficialIconPacksQuery = {
  search?: string;
  category?: string;
  origin?: "all" | "official" | "community";
};

export type CreateCommunityIconPackPayload = {
  name: string;
  description?: string | null;
  category?: string | null;
  userIconIds: string[];
  publish?: boolean;
};

export type UpdateCommunityIconPackPayload = {
  name?: string;
  description?: string | null;
  category?: string | null;
  publish?: boolean;
};

export type CommunityIconPackDetailsApiModel = {
  pack: OfficialIconPackApiModel;
  icons: OfficialIconApiModel[];
};

function toQueryString(query: FetchOfficialIconsQuery): string {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.category?.trim()) params.set("category", query.category.trim());
  if (query.packId?.trim()) params.set("packId", query.packId.trim());
  if (query.origin?.trim()) params.set("origin", query.origin.trim());
  if (query.includePackItems !== undefined) params.set("includePackItems", String(query.includePackItems));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function fetchOfficialIcons(query: FetchOfficialIconsQuery = {}): Promise<OfficialIconApiModel[]> {
  const response = await apiRequest("GET", `/api/icons/official${toQueryString(query)}`);
  const body = await response.json();
  return Array.isArray(body?.icons) ? body.icons : [];
}

export async function fetchOfficialIconPacks(): Promise<OfficialIconPackApiModel[]> {
  const response = await apiRequest("GET", "/api/icons/packs");
  const body = await response.json();
  return Array.isArray(body?.packs) ? body.packs : [];
}

export async function fetchIconPacks(query: FetchOfficialIconPacksQuery = {}): Promise<OfficialIconPackApiModel[]> {
  const response = await apiRequest("GET", `/api/icons/packs${toQueryString(query)}`);
  const body = await response.json();
  return Array.isArray(body?.packs) ? body.packs : [];
}

export async function addOfficialIconToLibrary(iconId: string): Promise<AddOfficialIconToLibraryResult> {
  const response = await apiRequest("POST", `/api/icons/official/${iconId}/add-to-library`);
  return response.json();
}

export async function addOfficialPackToLibrary(packId: string): Promise<AddOfficialPackToLibraryResult> {
  const response = await apiRequest("POST", `/api/icons/packs/${packId}/add-to-library`);
  return response.json();
}

export async function fetchCommunityIcons(query: FetchOfficialIconsQuery = {}): Promise<OfficialIconApiModel[]> {
  const response = await apiRequest("GET", `/api/icons/community${toQueryString(query)}`);
  const body = await response.json();
  return Array.isArray(body?.icons) ? body.icons : [];
}

export async function addCommunityIconToLibrary(iconId: string): Promise<AddOfficialIconToLibraryResult> {
  const response = await apiRequest("POST", `/api/icons/community/${iconId}/add-to-library`);
  return response.json();
}

export async function publishCommunityIcon(userIconId: string): Promise<{
  publication: OfficialIconApiModel;
  alreadyPublished: boolean;
}> {
  const response = await apiRequest("POST", "/api/icons/community/publish", {
    userIconId,
  });
  return response.json();
}

export async function unpublishCommunityIcon(publicationId: string): Promise<{
  publication: OfficialIconApiModel;
}> {
  const response = await apiRequest("PATCH", `/api/icons/community/${publicationId}/unpublish`);
  return response.json();
}

export async function createCommunityIconPack(payload: CreateCommunityIconPackPayload): Promise<CommunityIconPackDetailsApiModel> {
  const response = await apiRequest("POST", "/api/icons/community/packs", payload);
  return response.json();
}

export async function fetchCommunityIconPacks(query: FetchOfficialIconPacksQuery = {}): Promise<OfficialIconPackApiModel[]> {
  const response = await apiRequest("GET", `/api/icons/community/packs${toQueryString(query)}`);
  const body = await response.json();
  return Array.isArray(body?.packs) ? body.packs : [];
}

export async function fetchCommunityIconPackDetails(packId: string): Promise<CommunityIconPackDetailsApiModel> {
  const response = await apiRequest("GET", `/api/icons/community/packs/${packId}`);
  return response.json();
}

export async function addCommunityPackToLibrary(packId: string): Promise<AddOfficialPackToLibraryResult> {
  const response = await apiRequest("POST", `/api/icons/community/packs/${packId}/add-to-library`);
  return response.json();
}

export async function updateCommunityIconPack(
  packId: string,
  payload: UpdateCommunityIconPackPayload,
): Promise<{ pack: OfficialIconPackApiModel }> {
  const response = await apiRequest("PATCH", `/api/icons/community/packs/${packId}`, payload);
  return response.json();
}

export async function unpublishCommunityIconPack(packId: string): Promise<{ pack: OfficialIconPackApiModel }> {
  const response = await apiRequest("PATCH", `/api/icons/community/packs/${packId}/unpublish`);
  return response.json();
}
