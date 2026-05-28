export const BACKUP_RESTORE_SUPPORTED_MODULES = [
  { key: "pessoas", label: "Pessoas" },
  { key: "dividas", label: "Dívidas" },
  { key: "cartoes", label: "Cartões" },
  { key: "compras", label: "Compras de cartão" },
  { key: "parcelasCompra", label: "Parcelas de compra" },
  { key: "servicos", label: "Serviços" },
  { key: "servicoPessoas", label: "Vínculos de serviços" },
  { key: "servicoPagamentos", label: "Pagamentos de serviços" },
  { key: "pessoaSaldoMovimentacoes", label: "Saldos e movimentações" },
  { key: "metas", label: "Metas" },
] as const;

export const BACKUP_RESTORE_SUGGESTED_UNSUPPORTED_MODULES = [
  { key: "iconesPessoais", label: "Ícones pessoais" },
  { key: "regrasIcones", label: "Regras de ícones" },
  { key: "configuracoes", label: "Configurações" },
] as const;

export type BackupRestoreModuleKey = (typeof BACKUP_RESTORE_SUPPORTED_MODULES)[number]["key"];
export type BackupRestoreSuggestedUnsupportedModuleKey =
  (typeof BACKUP_RESTORE_SUGGESTED_UNSUPPORTED_MODULES)[number]["key"];
export type BackupRestorePreviewModuleKey = BackupRestoreModuleKey | BackupRestoreSuggestedUnsupportedModuleKey;

export type BackupRestoreAction = "merge" | "replace" | "ignore";
export type BackupRestoreMode = "merge" | "replace" | "custom";

export const BACKUP_RESTORE_SUPPORTED_MODULE_KEYS: readonly BackupRestoreModuleKey[] =
  BACKUP_RESTORE_SUPPORTED_MODULES.map((module) => module.key);

export const BACKUP_RESTORE_PREVIEW_MODULES = [
  ...BACKUP_RESTORE_SUPPORTED_MODULES,
  ...BACKUP_RESTORE_SUGGESTED_UNSUPPORTED_MODULES,
] as const;

export function isBackupRestoreModuleKey(value: string): value is BackupRestoreModuleKey {
  return (BACKUP_RESTORE_SUPPORTED_MODULE_KEYS as readonly string[]).includes(value);
}

export const BACKUP_RESTORE_ACTION_LABELS: Record<BackupRestoreAction, string> = {
  merge: "Mesclar",
  replace: "Substituir",
  ignore: "Ignorar",
};

export const BACKUP_RESTORE_MODE_LABELS: Record<BackupRestoreMode, string> = {
  merge: "Mesclar",
  replace: "Substituir",
  custom: "Personalizado",
};
