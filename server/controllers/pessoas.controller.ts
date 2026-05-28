import type { Request, Response } from "express";
import { PessoasService, type PessoaListStatus } from "../services/pessoas.service";
import { pessoaBody, pessoaRecoverOrphanLinksBody, pessoaUpdateBody } from "../validators/core-domain.validators";
import { getParam, getUserId, sendBadRequest, sendNotFound } from "./controller-utils";

function resolvePessoaListStatus(raw: unknown): PessoaListStatus {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "all") return "all";
  if (normalized === "removed" || normalized === "removidas" || normalized === "inativas" || normalized === "inactive") {
    return "removed";
  }
  return "active";
}

export function createPessoasController(service: PessoasService) {
  return {
    list: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const status = resolvePessoaListStatus(req.query.status);
      return res.json(await service.list(userId, status));
    },

    create: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = pessoaBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      return res.json(await service.create(userId, parsed.data));
    },

    update: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "id");
      const parsed = pessoaUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }
      const updated = await service.update(pessoaId, userId, parsed.data);
      if (!updated) {
        return sendNotFound(res);
      }
      return res.json(updated);
    },

    delete: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "id");
      const deleted = await service.delete(pessoaId, userId);
      if (!deleted) {
        return sendNotFound(res);
      }
      return res.json({ success: true });
    },

    restore: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const pessoaId = getParam(req, "id");
      const restored = await service.restore(pessoaId, userId);
      if (!restored) {
        return sendNotFound(res);
      }
      return res.json(restored);
    },

    listOrfas: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      return res.json(await service.listOrphanLinks(userId));
    },

    recoverOrphanLinks: async (req: Request, res: Response) => {
      const userId = getUserId(req);
      const parsed = pessoaRecoverOrphanLinksBody.safeParse(req.body);
      if (!parsed.success) {
        return sendBadRequest(res, parsed.error.message);
      }

      const result = await service.recoverOrphanLinks(userId, parsed.data);
      if ("error" in result) {
        if (result.error === "TARGET_PESSOA_NOT_FOUND") {
          return sendNotFound(res, "Pessoa de destino nao encontrada.");
        }
        if (result.error === "ORPHAN_GROUP_NOT_FOUND") {
          return sendNotFound(res, "Nenhum vinculo orfao encontrado para o grupo informado.");
        }
        if (result.error === "TARGET_PESSOA_REMOVED") {
          return sendBadRequest(res, "A pessoa de destino esta removida. Restaure-a antes de vincular.");
        }
        if (result.error === "NOME_REQUIRED") {
          return sendBadRequest(res, "Informe um nome para recuperar os vinculos orfaos.");
        }
        return sendBadRequest(res, "Chave de grupo orfao invalida.");
      }

      return res.json(result);
    },
  };
}
