import type { Express, RequestHandler } from "express";
import { requireAuth } from "../auth";

type CrudController = {
  list?: RequestHandler;
  listByPessoa?: RequestHandler;
  listByCartao?: RequestHandler;
  create?: RequestHandler;
  createParcelado?: RequestHandler;
  update?: RequestHandler;
  delete?: RequestHandler;
  recalcular?: RequestHandler;
};

type ParcelasController = {
  list: RequestHandler;
  listByDivida: RequestHandler;
  update: RequestHandler;
  antecipar: RequestHandler;
  delete: RequestHandler;
  listCompra: RequestHandler;
  updateCompra: RequestHandler;
  replaceCompraBulk: RequestHandler;
};

type FinancialController = {
  summary: RequestHandler;
  score: RequestHandler;
  insights: RequestHandler;
};

type FinancialDomainControllers = {
  dividasController: Required<Pick<CrudController, "list" | "listByPessoa" | "create" | "createParcelado" | "update" | "delete" | "recalcular">>;
  parcelasController: ParcelasController;
  cartoesController: Required<Pick<CrudController, "list" | "create" | "update" | "delete">> & {
    deleteFaturaByCartaoMonth: RequestHandler;
    deleteFaturasByMonth: RequestHandler;
  };
  comprasCartaoController: Required<Pick<CrudController, "list" | "listByCartao" | "listByPessoa" | "create" | "update" | "delete">> & {
    deleteByCardRoute: RequestHandler;
  };
  financialController: FinancialController;
};

export function registerFinancialDomainRoutes(app: Express, controllers: FinancialDomainControllers): void {
  const {
    dividasController,
    parcelasController,
    cartoesController,
    comprasCartaoController,
    financialController,
  } = controllers;

  app.get("/api/dividas", requireAuth, dividasController.list);
  app.get("/api/dividas/pessoa/:pessoaId", requireAuth, dividasController.listByPessoa);
  app.post("/api/dividas", requireAuth, dividasController.create);
  app.post("/api/dividas/parcelado", requireAuth, dividasController.createParcelado);
  app.patch("/api/dividas/:id", requireAuth, dividasController.update);
  app.delete("/api/dividas/:id", requireAuth, dividasController.delete);
  app.post("/api/dividas/:id/recalcular", requireAuth, dividasController.recalcular);

  app.get("/api/parcelas", requireAuth, parcelasController.list);
  app.get("/api/parcelas/divida/:dividaId", requireAuth, parcelasController.listByDivida);
  app.patch("/api/parcelas/:id", requireAuth, parcelasController.update);
  app.post("/api/parcelas/antecipar", requireAuth, parcelasController.antecipar);
  app.delete("/api/parcelas/:id", requireAuth, parcelasController.delete);

  app.get("/api/parcelas-compra/:compraId", requireAuth, parcelasController.listCompra);
  app.patch("/api/parcelas-compra/:id", requireAuth, parcelasController.updateCompra);
  app.post("/api/parcelas-compra/bulk", requireAuth, parcelasController.replaceCompraBulk);

  app.get("/api/cartoes", requireAuth, cartoesController.list);
  app.post("/api/cartoes", requireAuth, cartoesController.create);
  app.patch("/api/cartoes/:id", requireAuth, cartoesController.update);
  app.delete("/api/cartoes/:id", requireAuth, cartoesController.delete);
  app.delete("/api/cartoes/:cartaoId/faturas/:mes", requireAuth, cartoesController.deleteFaturaByCartaoMonth);
  app.delete("/api/cartoes/faturas/:mes", requireAuth, cartoesController.deleteFaturasByMonth);

  app.get("/api/compras-cartao", requireAuth, comprasCartaoController.list);
  app.get("/api/compras-cartao/cartao/:cartaoId", requireAuth, comprasCartaoController.listByCartao);
  app.get("/api/compras-cartao/pessoa/:pessoaId", requireAuth, comprasCartaoController.listByPessoa);
  app.post("/api/compras-cartao", requireAuth, comprasCartaoController.create);
  app.patch("/api/compras-cartao/:id", requireAuth, comprasCartaoController.update);
  app.delete("/api/compras-cartao/:id", requireAuth, comprasCartaoController.delete);
  app.delete("/api/cartoes/compras/:compraId", requireAuth, comprasCartaoController.deleteByCardRoute);

  app.get("/api/financial/summary", requireAuth, financialController.summary);
  app.get("/api/financial/score", requireAuth, financialController.score);
  app.get("/api/financial/insights", requireAuth, financialController.insights);
}
