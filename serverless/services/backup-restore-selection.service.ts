import {
  BACKUP_RESTORE_PREVIEW_MODULES,
  BACKUP_RESTORE_SUPPORTED_MODULE_KEYS,
  type BackupRestoreAction,
  type BackupRestoreMode,
  type BackupRestoreModuleKey,
} from "../../shared/backup-restore-modules.js";
import type {
  BackupImportMode,
  BackupJsonImportEnvelope,
  BackupJsonImportPayload,
  BackupJsonModulesSelection,
} from "../validators/backup-import.validators.js";

type JsonRow = Record<string, unknown>;

export type BackupRestorePreviewModule = {
  key: string;
  label: string;
  count: number;
  foundInBackup: boolean;
  canMerge: boolean;
  canReplace: boolean;
  activeCount: number | null;
  removedCount: number | null;
  warnings: string[];
};

export type BackupRestorePreview = {
  backupInfo: {
    fileName: string | null;
    createdAt: string | null;
    sizeBytes: number | null;
    version: string | null;
  };
  modules: BackupRestorePreviewModule[];
  warnings: string[];
};

export type BackupRestoreSelectionPlan = {
  mode: BackupImportMode;
  requestedActions: Record<BackupRestoreModuleKey, BackupRestoreAction>;
  effectiveActions: Record<BackupRestoreModuleKey, BackupRestoreAction>;
  warnings: string[];
  errors: string[];
};

const MODULE_TO_BACKUP_SECTION: Record<BackupRestoreModuleKey, keyof BackupJsonImportPayload> = {
  pessoas: "pessoas",
  dividas: "dividas",
  cartoes: "cartoes",
  compras: "compras",
  parcelasCompra: "parcelasCompra",
  servicos: "servicos",
  servicoPessoas: "servicoPessoas",
  servicoPagamentos: "servicoPagamentos",
  pessoaSaldoMovimentacoes: "pessoaSaldoMovimentacoes",
  metas: "metas",
};

const EMPTY_ACTIONS = Object.freeze(
  BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.reduce((acc, moduleKey) => {
    acc[moduleKey] = "ignore";
    return acc;
  }, {} as Record<BackupRestoreModuleKey, BackupRestoreAction>),
);

function cloneActions(source: Record<BackupRestoreModuleKey, BackupRestoreAction>): Record<BackupRestoreModuleKey, BackupRestoreAction> {
  return { ...source };
}

function resolveRequestedActions(
  mode: BackupRestoreMode,
  modules?: BackupJsonModulesSelection,
): Record<BackupRestoreModuleKey, BackupRestoreAction> {
  if (mode === "merge" || mode === "replace") {
    return BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.reduce((acc, moduleKey) => {
      acc[moduleKey] = mode;
      return acc;
    }, {} as Record<BackupRestoreModuleKey, BackupRestoreAction>);
  }

  const actions = cloneActions(EMPTY_ACTIONS);
  for (const moduleKey of BACKUP_RESTORE_SUPPORTED_MODULE_KEYS) {
    const nextAction = modules?.[moduleKey];
    if (nextAction === "merge" || nextAction === "replace" || nextAction === "ignore") {
      actions[moduleKey] = nextAction;
    }
  }

  return actions;
}

function asRow(value: unknown): JsonRow | null {
  if (typeof value !== "object" || value == null || Array.isArray(value)) {
    return null;
  }
  return value as JsonRow;
}

function hasStringValue(row: JsonRow | null, field: string): boolean {
  if (!row) return false;
  const value = row[field];
  return typeof value === "string" && value.trim() !== "";
}

function hasAnyRowWithStringField(rows: unknown[], field: string): boolean {
  for (const value of rows) {
    const row = asRow(value);
    if (hasStringValue(row, field)) return true;
  }
  return false;
}

function hasDeletedAt(row: unknown): boolean {
  const item = asRow(row);
  if (!item) return false;

  const deletedAt = item.deletedAt ?? item.deleted_at;
  if (deletedAt == null || deletedAt === "") return false;
  if (deletedAt instanceof Date) return !Number.isNaN(deletedAt.getTime());
  if (typeof deletedAt === "string") {
    return deletedAt.trim() !== "";
  }

  return false;
}

function addError(errors: string[], message: string): void {
  if (!errors.includes(message)) errors.push(message);
}

function addWarning(warnings: string[], message: string): void {
  if (!warnings.includes(message)) warnings.push(message);
}

function validateDependencies(
  payload: BackupJsonImportPayload,
  actions: Record<BackupRestoreModuleKey, BackupRestoreAction>,
  errors: string[],
): void {
  const isSelected = (moduleKey: BackupRestoreModuleKey) => actions[moduleKey] !== "ignore";

  if (isSelected("dividas") && !isSelected("pessoas")) {
    addError(errors, "Campo invalido: seleção personalizada exige Pessoas ao restaurar Dívidas.");
  }

  if (isSelected("compras") && !isSelected("cartoes")) {
    addError(errors, "Campo invalido: seleção personalizada exige Cartões ao restaurar Compras de cartão.");
  }

  if (
    isSelected("compras")
    && hasAnyRowWithStringField(payload.compras as unknown[], "pessoaId")
    && !isSelected("pessoas")
  ) {
    addError(errors, "Campo invalido: Compras vinculadas a pessoas exigem restauração de Pessoas.");
  }

  if (isSelected("parcelasCompra") && !isSelected("compras")) {
    addError(errors, "Campo invalido: Parcelas de compra exigem restauração de Compras de cartão.");
  }

  if (
    isSelected("servicos")
    && hasAnyRowWithStringField(payload.servicos as unknown[], "compraCartaoId")
    && !isSelected("compras")
  ) {
    addError(errors, "Campo invalido: Serviços vinculados a cartão exigem restauração de Compras de cartão.");
  }

  if (isSelected("servicoPessoas") && !isSelected("servicos")) {
    addError(errors, "Campo invalido: Vínculos de serviços exigem restauração de Serviços.");
  }

  if (isSelected("servicoPessoas") && !isSelected("pessoas")) {
    addError(errors, "Campo invalido: Vínculos de serviços exigem restauração de Pessoas.");
  }

  if (isSelected("servicoPagamentos") && !isSelected("servicoPessoas")) {
    addError(errors, "Campo invalido: Pagamentos de serviços exigem restauração de Vínculos de serviços.");
  }

  if (isSelected("pessoaSaldoMovimentacoes") && !isSelected("pessoas")) {
    addError(errors, "Campo invalido: Saldos e movimentações exigem restauração de Pessoas.");
  }

  if (
    isSelected("pessoaSaldoMovimentacoes")
    && hasAnyRowWithStringField(payload.pessoaSaldoMovimentacoes as unknown[], "dividaId")
    && !isSelected("dividas")
  ) {
    addError(errors, "Campo invalido: Há movimentações vinculadas a dívidas; restaure Dívidas junto de Saldos e movimentações.");
  }

  if (
    isSelected("pessoaSaldoMovimentacoes")
    && hasAnyRowWithStringField(payload.pessoaSaldoMovimentacoes as unknown[], "compraCartaoId")
    && !isSelected("compras")
  ) {
    addError(errors, "Campo invalido: Há movimentações vinculadas a compras; restaure Compras junto de Saldos e movimentações.");
  }

  if (
    isSelected("pessoaSaldoMovimentacoes")
    && hasAnyRowWithStringField(payload.pessoaSaldoMovimentacoes as unknown[], "parcelaCompraId")
    && !isSelected("parcelasCompra")
  ) {
    addError(errors, "Campo invalido: Há movimentações vinculadas a parcelas; restaure Parcelas de compra junto de Saldos e movimentações.");
  }

  if (
    isSelected("pessoaSaldoMovimentacoes")
    && hasAnyRowWithStringField(payload.pessoaSaldoMovimentacoes as unknown[], "servicoPessoaId")
    && !isSelected("servicoPessoas")
  ) {
    addError(errors, "Campo invalido: Há movimentações vinculadas a serviços; restaure Vínculos de serviços junto de Saldos e movimentações.");
  }
}

function validateReplaceSideEffects(
  actions: Record<BackupRestoreModuleKey, BackupRestoreAction>,
  errors: string[],
): void {
  const requireAlsoReplace = (source: BackupRestoreModuleKey, dependents: BackupRestoreModuleKey[]): void => {
    if (actions[source] !== "replace") return;

    for (const dependent of dependents) {
      if (actions[dependent] !== "replace") {
        addError(
          errors,
          `Campo invalido: substituir ${source} exige também substituir ${dependent} para evitar efeitos colaterais nos vínculos.`,
        );
      }
    }
  };

  requireAlsoReplace("pessoas", ["dividas", "compras", "servicoPessoas", "pessoaSaldoMovimentacoes"]);
  requireAlsoReplace("dividas", ["pessoaSaldoMovimentacoes"]);
  requireAlsoReplace("cartoes", ["compras"]);
  requireAlsoReplace("compras", ["parcelasCompra", "servicos", "pessoaSaldoMovimentacoes"]);
  requireAlsoReplace("parcelasCompra", ["pessoaSaldoMovimentacoes"]);
  requireAlsoReplace("servicos", ["servicoPessoas"]);
  requireAlsoReplace("servicoPessoas", ["servicoPagamentos", "pessoaSaldoMovimentacoes"]);
}

function sanitizeMissingModules(
  actions: Record<BackupRestoreModuleKey, BackupRestoreAction>,
  envelope: BackupJsonImportEnvelope,
  warnings: string[],
): Record<BackupRestoreModuleKey, BackupRestoreAction> {
  const sanitized = cloneActions(actions);

  for (const moduleKey of BACKUP_RESTORE_SUPPORTED_MODULE_KEYS) {
    if (!envelope.presentSections[moduleKey] && sanitized[moduleKey] !== "ignore") {
      addWarning(
        warnings,
        `Módulo '${moduleKey}' não foi encontrado no backup e será ignorado.`,
      );
      sanitized[moduleKey] = "ignore";
    }
  }

  return sanitized;
}

export function buildBackupRestoreSelectionPlan(input: {
  mode: BackupImportMode;
  modules?: BackupJsonModulesSelection;
  envelope: BackupJsonImportEnvelope;
}): BackupRestoreSelectionPlan {
  const warnings: string[] = [];
  const errors: string[] = [];

  const requestedActions = resolveRequestedActions(input.mode, input.modules);
  const effectiveActions = sanitizeMissingModules(requestedActions, input.envelope, warnings);

  if (input.mode === "custom") {
    const selectedCount = BACKUP_RESTORE_SUPPORTED_MODULE_KEYS
      .filter((moduleKey) => effectiveActions[moduleKey] !== "ignore")
      .length;

    if (selectedCount === 0) {
      addError(errors, "Campo invalido: selecione ao menos um módulo para restauração personalizada.");
    }

    validateDependencies(input.envelope.backup, effectiveActions, errors);
    validateReplaceSideEffects(effectiveActions, errors);
  }

  return {
    mode: input.mode,
    requestedActions,
    effectiveActions,
    warnings,
    errors,
  };
}

export function buildBackupRestorePreview(input: {
  envelope: BackupJsonImportEnvelope;
  fileName?: string | null;
  sizeBytes?: number | null;
  createdAt?: string | null;
}): BackupRestorePreview {
  const { envelope } = input;
  const warnings: string[] = [];

  const modules: BackupRestorePreviewModule[] = BACKUP_RESTORE_PREVIEW_MODULES.map((module) => {
    const supported = BACKUP_RESTORE_SUPPORTED_MODULE_KEYS.includes(module.key as BackupRestoreModuleKey);
    if (!supported) {
      return {
        key: module.key,
        label: module.label,
        count: 0,
        foundInBackup: false,
        canMerge: false,
        canReplace: false,
        activeCount: null,
        removedCount: null,
        warnings: ["Não encontrado no backup atual."],
      };
    }

    const moduleKey = module.key as BackupRestoreModuleKey;
    const rows = envelope.backup[MODULE_TO_BACKUP_SECTION[moduleKey]] as unknown[];
    const count = rows.length;

    let activeCount: number | null = null;
    let removedCount: number | null = null;
    if (moduleKey === "pessoas" || moduleKey === "dividas") {
      removedCount = rows.filter((row) => hasDeletedAt(row)).length;
      activeCount = count - removedCount;
    }

    const moduleWarnings: string[] = [];
    if (!envelope.presentSections[moduleKey]) {
      moduleWarnings.push("Não encontrado no backup.");
    }

    return {
      key: module.key,
      label: module.label,
      count,
      foundInBackup: envelope.presentSections[moduleKey],
      canMerge: true,
      canReplace: true,
      activeCount,
      removedCount,
      warnings: moduleWarnings,
    };
  });

  const plan = buildBackupRestoreSelectionPlan({
    mode: "merge",
    envelope,
  });
  warnings.push(...plan.warnings);

  return {
    backupInfo: {
      fileName: input.fileName ?? null,
      createdAt: input.createdAt ?? envelope.backup.exportadoEm,
      sizeBytes: input.sizeBytes ?? null,
      version: envelope.backupVersion,
    },
    modules,
    warnings,
  };
}
