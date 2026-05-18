import { apiRequest } from "@/lib/queryClient";

export type UserIconLibraryItemApiModel = {
  id: string;
  userId: string;
  sourceType: "upload" | "official" | string;
  officialIconId: string | null;
  name: string;
  imageUrl: string;
  storagePath: string | null;
  category: string | null;
  tags: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserIconLibraryPayload = {
  name: string;
  category?: string | null;
  keywords?: string[] | string | null;
  originalFileName?: string | null;
  imageDataUrl: string;
};

export type UpdateUserIconLibraryPayload = {
  name?: string;
  category?: string | null;
  keywords?: string[] | string | null;
};

export async function fetchUserIconLibrary(): Promise<UserIconLibraryItemApiModel[]> {
  const response = await apiRequest("GET", "/api/user-icon-library");
  return response.json();
}

export async function createUserIconLibraryItem(
  payload: CreateUserIconLibraryPayload,
): Promise<UserIconLibraryItemApiModel> {
  const response = await apiRequest("POST", "/api/user-icon-library", payload);
  const body = await response.json();
  if (!body?.icon) {
    throw new Error("Resposta inválida ao salvar ícone.");
  }
  return body.icon as UserIconLibraryItemApiModel;
}

export async function updateUserIconLibraryItem(
  iconId: string,
  payload: UpdateUserIconLibraryPayload,
): Promise<UserIconLibraryItemApiModel> {
  const response = await apiRequest("PATCH", `/api/user-icon-library/${iconId}`, payload);
  const body = await response.json();
  if (!body?.icon) {
    throw new Error("Resposta inválida ao atualizar ícone.");
  }
  return body.icon as UserIconLibraryItemApiModel;
}

export async function deleteUserIconLibraryItem(iconId: string): Promise<void> {
  await apiRequest("DELETE", `/api/user-icon-library/${iconId}`);
}
