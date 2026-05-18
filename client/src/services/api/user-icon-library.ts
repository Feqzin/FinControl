import { apiRequest } from "@/lib/queryClient";

export type UserIconLibraryItemApiModel = {
  id: string;
  userId: string;
  name: string;
  imageUrl: string;
  storagePath: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateUserIconLibraryPayload = {
  name?: string | null;
  category?: string | null;
  imageDataUrl: string;
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

export async function deleteUserIconLibraryItem(iconId: string): Promise<void> {
  await apiRequest("DELETE", `/api/user-icon-library/${iconId}`);
}
