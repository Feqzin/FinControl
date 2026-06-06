import { useState } from "react";
import type { Divida, Pessoa } from "@shared/schema";

export function usePessoasDialogState() {
  const [openPessoa, setOpenPessoa] = useState(false);
  const [openDivida, setOpenDivida] = useState(false);
  const [openOrphanRecovery, setOpenOrphanRecovery] = useState(false);
  const [selectedPessoa, setSelectedPessoa] = useState<Pessoa | null>(null);
  const [historyPessoa, setHistoryPessoa] = useState<Pessoa | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payingDivida, setPayingDivida] = useState<Divida | null>(null);
  const [abaterSaldoOpen, setAbaterSaldoOpen] = useState(false);
  const [abaterSaldoDivida, setAbaterSaldoDivida] = useState<Divida | null>(null);
  const [abaterSaldoServicoOpen, setAbaterSaldoServicoOpen] = useState(false);
  const [abaterSaldoServicoPessoaId, setAbaterSaldoServicoPessoaId] = useState<string | null>(null);
  const [editingPessoa, setEditingPessoa] = useState<Pessoa | null>(null);
  const [vincularCompraOpen, setVincularCompraOpen] = useState(false);
  const [compraSelecionadaParaVinculo, setCompraSelecionadaParaVinculo] = useState<string | null>(null);

  return {
    openPessoa,
    setOpenPessoa,
    openDivida,
    setOpenDivida,
    openOrphanRecovery,
    setOpenOrphanRecovery,
    selectedPessoa,
    setSelectedPessoa,
    historyPessoa,
    setHistoryPessoa,
    payOpen,
    setPayOpen,
    payingDivida,
    setPayingDivida,
    abaterSaldoOpen,
    setAbaterSaldoOpen,
    abaterSaldoDivida,
    setAbaterSaldoDivida,
    abaterSaldoServicoOpen,
    setAbaterSaldoServicoOpen,
    abaterSaldoServicoPessoaId,
    setAbaterSaldoServicoPessoaId,
    editingPessoa,
    setEditingPessoa,
    vincularCompraOpen,
    setVincularCompraOpen,
    compraSelecionadaParaVinculo,
    setCompraSelecionadaParaVinculo,
  };
}
