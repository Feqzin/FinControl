import { storage } from "./storage";
import { db } from "./db";
import { users, pessoas, dividas, servicos } from "@shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function seedDatabase() {
  const existing = await storage.getUserByUsername("demo");
  if (existing) return;

  const hashedPassword = await hashPassword("demo123");
  const user = await storage.createUser({ username: "demo", password: hashedPassword });
  const uid = user.id;

  const p1 = await storage.createPessoa({ userId: uid, nome: "Carlos Silva", tipo: "me_deve", telefone: "(11) 99887-6655", observacao: "Amigo do trabalho" });
  const p2 = await storage.createPessoa({ userId: uid, nome: "Ana Santos", tipo: "me_deve", telefone: "(21) 98765-4321", observacao: "Vizinha" });
  const p3 = await storage.createPessoa({ userId: uid, nome: "Pedro Oliveira", tipo: "eu_devo", telefone: "(31) 91234-5678", observacao: "Emprestimo pessoal" });
  const p4 = await storage.createPessoa({ userId: uid, nome: "Maria Costa", tipo: "eu_devo", telefone: "", observacao: "Compra compartilhada" });

  await storage.createDivida({ userId: uid, pessoaId: p1.id, tipo: "receber", valor: "1500.00", dataVencimento: "2026-03-15", status: "pendente", descricao: "Emprestimo janeiro" });
  await storage.createDivida({ userId: uid, pessoaId: p1.id, tipo: "receber", valor: "350.00", dataVencimento: "2026-02-10", status: "pago", dataPagamento: "2026-02-10", formaPagamento: "pix", descricao: "Aluguel carro" });
  await storage.createDivida({ userId: uid, pessoaId: p2.id, tipo: "receber", valor: "200.00", dataVencimento: "2026-03-20", status: "pendente", descricao: "Jantar dividido" });
  await storage.createDivida({ userId: uid, pessoaId: p3.id, tipo: "pagar", valor: "3000.00", dataVencimento: "2026-03-25", status: "pendente", descricao: "Emprestimo carro" });
  await storage.createDivida({ userId: uid, pessoaId: p4.id, tipo: "pagar", valor: "450.00", dataVencimento: "2026-03-10", status: "pendente", descricao: "Compras mercado" });
  await storage.createDivida({ userId: uid, pessoaId: p4.id, tipo: "pagar", valor: "120.00", dataVencimento: "2026-02-05", status: "pago", dataPagamento: "2026-02-05", formaPagamento: "dinheiro", descricao: "Presente aniversario" });

  await storage.createCartao({ userId: uid, nome: "Nubank", limite: "8000.00", melhorDiaCompra: 10, diaVencimento: 20 });
  await storage.createCartao({ userId: uid, nome: "Itau Platinum", limite: "15000.00", melhorDiaCompra: 5, diaVencimento: 15 });

  await storage.createServico({ userId: uid, nome: "Netflix", categoria: "streaming", valorMensal: "39.90", dataCobranca: 5, formaPagamento: "cartao", status: "ativo" });
  await storage.createServico({ userId: uid, nome: "Spotify", categoria: "streaming", valorMensal: "21.90", dataCobranca: 10, formaPagamento: "cartao", status: "ativo" });
  await storage.createServico({ userId: uid, nome: "ChatGPT Plus", categoria: "software", valorMensal: "109.90", dataCobranca: 15, formaPagamento: "cartao", status: "ativo" });
  await storage.createServico({ userId: uid, nome: "Academia Smart Fit", categoria: "lazer", valorMensal: "99.90", dataCobranca: 1, formaPagamento: "debito", status: "ativo" });
  await storage.createServico({ userId: uid, nome: "Amazon Prime", categoria: "assinatura", valorMensal: "14.90", dataCobranca: 20, formaPagamento: "cartao", status: "cancelado" });

  console.log("Seed data created successfully");
}
