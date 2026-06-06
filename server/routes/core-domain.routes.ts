import type { Express, RequestHandler } from "express";
import { requireAuth } from "../auth";

type PessoasController = {
  listSaldoMovimentacoesByUser: RequestHandler;
  listSaldoMovimentacoes: RequestHandler;
  getResumo: RequestHandler;
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  delete: RequestHandler;
  restore: RequestHandler;
  deletePermanent: RequestHandler;
  listOrfas: RequestHandler;
  recoverOrphanLinks: RequestHandler;
};

type ServicosController = {
  listServicos: RequestHandler;
  createServico: RequestHandler;
  updateServico: RequestHandler;
  deleteServico: RequestHandler;
  listServicoPessoas: RequestHandler;
  createServicoPessoa: RequestHandler;
  updateServicoPessoa: RequestHandler;
  deleteServicoPessoa: RequestHandler;
  listServicoPagamentos: RequestHandler;
  createServicoPagamento: RequestHandler;
  deleteServicoPagamento: RequestHandler;
};

type MetasController = {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  delete: RequestHandler;
};

type RendasController = {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  delete: RequestHandler;
};

type PatrimoniosController = {
  list: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
  delete: RequestHandler;
};

type CoreDomainControllers = {
  pessoasController: PessoasController;
  servicosController: ServicosController;
  metasController: MetasController;
  rendasController: RendasController;
  patrimoniosController: PatrimoniosController;
};

export function registerCoreDomainRoutes(app: Express, controllers: CoreDomainControllers): void {
  const {
    pessoasController,
    servicosController,
    metasController,
    rendasController,
    patrimoniosController,
  } = controllers;

  app.get("/api/pessoas/saldo-movimentacoes", requireAuth, pessoasController.listSaldoMovimentacoesByUser);
  app.get("/api/pessoas/:pessoaId/saldo-movimentacoes", requireAuth, pessoasController.listSaldoMovimentacoes);
  app.get("/api/pessoas/:pessoaId/resumo", requireAuth, pessoasController.getResumo);
  app.get("/api/pessoas", requireAuth, pessoasController.list);
  app.post("/api/pessoas", requireAuth, pessoasController.create);
  app.patch("/api/pessoas/:id", requireAuth, pessoasController.update);
  app.delete("/api/pessoas/:id", requireAuth, pessoasController.delete);
  app.patch("/api/pessoas/:id/restore", requireAuth, pessoasController.restore);
  app.delete("/api/pessoas/:id/permanent", requireAuth, pessoasController.deletePermanent);
  app.get("/api/pessoas/orfas", requireAuth, pessoasController.listOrfas);
  app.post("/api/pessoas/recover-orphan-links", requireAuth, pessoasController.recoverOrphanLinks);

  app.get("/api/servicos", requireAuth, servicosController.listServicos);
  app.post("/api/servicos", requireAuth, servicosController.createServico);
  app.patch("/api/servicos/:id", requireAuth, servicosController.updateServico);
  app.delete("/api/servicos/:id", requireAuth, servicosController.deleteServico);

  app.get("/api/servico-pessoas", requireAuth, servicosController.listServicoPessoas);
  app.post("/api/servico-pessoas", requireAuth, servicosController.createServicoPessoa);
  app.patch("/api/servico-pessoas/:id", requireAuth, servicosController.updateServicoPessoa);
  app.delete("/api/servico-pessoas/:id", requireAuth, servicosController.deleteServicoPessoa);

  app.get("/api/servico-pagamentos", requireAuth, servicosController.listServicoPagamentos);
  app.post("/api/servico-pagamentos", requireAuth, servicosController.createServicoPagamento);
  app.delete("/api/servico-pagamentos/:id", requireAuth, servicosController.deleteServicoPagamento);

  app.get("/api/metas", requireAuth, metasController.list);
  app.post("/api/metas", requireAuth, metasController.create);
  app.patch("/api/metas/:id", requireAuth, metasController.update);
  app.delete("/api/metas/:id", requireAuth, metasController.delete);

  app.get("/api/rendas", requireAuth, rendasController.list);
  app.post("/api/rendas", requireAuth, rendasController.create);
  app.patch("/api/rendas/:id", requireAuth, rendasController.update);
  app.delete("/api/rendas/:id", requireAuth, rendasController.delete);

  app.get("/api/patrimonios", requireAuth, patrimoniosController.list);
  app.post("/api/patrimonios", requireAuth, patrimoniosController.create);
  app.patch("/api/patrimonios/:id", requireAuth, patrimoniosController.update);
  app.delete("/api/patrimonios/:id", requireAuth, patrimoniosController.delete);
}
