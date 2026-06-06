import { useState } from "react";
import type { PessoaSortBy } from "@/pages/pessoas/pessoas-sort.utils";

export function usePessoasFilters() {
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("todos");
  const [sortBy, setSortBy] = useState<PessoaSortBy>("nome_az");

  return {
    search,
    setSearch,
    filterTipo,
    setFilterTipo,
    sortBy,
    setSortBy,
    isRemovedFilter: filterTipo === "removidas",
  };
}
