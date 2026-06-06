import { Skeleton } from "@/components/ui/skeleton";

export function CartoesPageLoadingState() {
  return (
    <div className="app-page-shell app-section-stack">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-64" />)}
      </div>
    </div>
  );
}
