import { useEffect, useState } from "react";

type UsePessoasPaginationStateArgs = {
  mobileMode: boolean;
  search: string;
  filterTipo: string;
  sortBy: string;
};

export function usePessoasPaginationState({
  mobileMode,
  search,
  filterTipo,
  sortBy,
}: UsePessoasPaginationStateArgs) {
  const [visiblePessoasCount, setVisiblePessoasCount] = useState(mobileMode ? 12 : 18);

  useEffect(() => {
    setVisiblePessoasCount(mobileMode ? 12 : 18);
  }, [mobileMode, search, filterTipo, sortBy]);

  const loadMorePessoas = () => {
    setVisiblePessoasCount((prev) => prev + (mobileMode ? 8 : 12));
  };

  return {
    visiblePessoasCount,
    loadMorePessoas,
  };
}
