import { apiRequest } from "@/lib/queryClient";

export type CommunityProfileVisibility = "private" | "community";

export type CommunityCreatorPackApiModel = {
  id: string;
  publicCode: string | null;
  name: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  iconsCount: number;
  installCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
};

export type CommunityCreatorProfileApiModel = {
  publicCode: string;
  username: string | null;
  displayName: string;
  fullName: string | null;
  bio: string | null;
  profileVisibility: CommunityProfileVisibility;
  isOwnProfile: boolean;
  metrics: {
    packsPublished: number;
    iconsPublished: number;
    installs: number;
    ratingAverage: number | null;
    ratingCount: number;
  };
  packs: CommunityCreatorPackApiModel[];
};

export type UpdateCommunityProfilePayload = {
  bio?: string | null;
  profileVisibility?: CommunityProfileVisibility;
};

export async function fetchOwnCommunityProfile(): Promise<CommunityCreatorProfileApiModel> {
  const response = await apiRequest("GET", "/api/community/profile");
  return response.json();
}

export async function updateOwnCommunityProfile(
  payload: UpdateCommunityProfilePayload,
): Promise<CommunityCreatorProfileApiModel> {
  const response = await apiRequest("PATCH", "/api/community/profile", payload);
  return response.json();
}

export async function fetchCommunityCreatorProfile(
  publicCode: string,
): Promise<CommunityCreatorProfileApiModel> {
  const response = await apiRequest(
    "GET",
    `/api/community/creators/${encodeURIComponent(publicCode)}`,
  );
  return response.json();
}
