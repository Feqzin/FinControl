import { apiRequest } from "@/lib/queryClient";

export type OfficialIconApiModel = {
  id: string;
  iconKey: string;
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
};

function toQueryString(query: FetchOfficialIconsQuery): string {
  const params = new URLSearchParams();
  if (query.search?.trim()) params.set("search", query.search.trim());
  if (query.category?.trim()) params.set("category", query.category.trim());
  if (query.packId?.trim()) params.set("packId", query.packId.trim());
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

export async function addOfficialIconToLibrary(iconId: string): Promise<AddOfficialIconToLibraryResult> {
  const response = await apiRequest("POST", `/api/icons/official/${iconId}/add-to-library`);
  return response.json();
}

export async function addOfficialPackToLibrary(packId: string): Promise<AddOfficialPackToLibraryResult> {
  const response = await apiRequest("POST", `/api/icons/packs/${packId}/add-to-library`);
  return response.json();
}
