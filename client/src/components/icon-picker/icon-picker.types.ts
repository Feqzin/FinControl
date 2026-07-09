import type {
  OfficialIconApiModel,
  OfficialIconPackApiModel,
} from "@/services/api/official-icons";
import type { UserIconLibraryItemApiModel } from "@/services/api/user-icon-library";

export interface IconPickerProps {
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
  id?: string | null;
  userIconId?: string | null;
  personalIconId?: string | null;
  officialIconId?: string | null;
  iconId?: string | null;
  imageUrl?: string | null;
  previewUrl?: string | null;
  storagePath?: string | null;
  name?: string | null;
};

export type ManageBuiltinTarget = {
  type: "builtin";
  iconKey: string;
  label: string;
};

export type ManagePersonalTarget = {
  type: "personal";
  icon: UserIconLibraryItemApiModel;
  publication: OfficialIconApiModel | null;
};

export type ManageExploreTarget = {
  type: "explore";
  icon: OfficialIconApiModel;
  alreadyAdded: boolean;
};

export type ManagePackTarget = {
  type: "pack";
  pack: OfficialIconPackApiModel;
};

export type ManageActionTarget =
  | ManageBuiltinTarget
  | ManagePersonalTarget
  | ManageExploreTarget
  | ManagePackTarget;

export type IconUploadMode = "individual" | "batch";

export type BatchUploadDraftItem = {
  id: string;
  originalFileName: string;
  previewDataUrl: string | null;
  iconName: string;
  category: string;
  keywords: string;
  error: string | null;
};
