import type { IconPickerSelectMeta } from "./icon-picker/icon-picker.types";

export const CATEGORY_LABELS: Record<string, string> = {
  bancos: "Bancos",
  servicos: "Serviços",
  carteiras: "Carteiras",
};

export const CATEGORIES = ["bancos", "servicos", "carteiras"] as const;

export const NOOP_ICON_CHANGE = (_value: string | null): void => undefined;

export const NOOP_ICON_META = (_meta: IconPickerSelectMeta): void => undefined;
