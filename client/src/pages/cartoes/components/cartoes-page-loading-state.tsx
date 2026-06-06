import { Skeleton } from "@/components/ui/skeleton";

export function CartoesPageLoadingState() {
  return (
    <div className="app-page-shell app-section-stack">
      <div className="rounded-[28px] border border-border/60 bg-card/95 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <Skeleton className="h-10 w-64 rounded-full" />
            <Skeleton className="h-4 w-80 max-w-full rounded-full" />
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[420px]">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-11 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="rounded-[26px] border border-border/60 bg-card/95 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-36 rounded-full" />
                <Skeleton className="h-8 w-32 rounded-full" />
              </div>
              <Skeleton className="h-12 w-12 rounded-2xl" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-[24px] border border-border/60 bg-card/95 p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
            <Skeleton className="h-10 w-full rounded-2xl" />
            <Skeleton className="h-10 w-full rounded-2xl lg:w-72" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-[26px] border border-border/60 bg-card/95 p-5 shadow-sm">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-2xl" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-28 rounded-full" />
                    <Skeleton className="h-4 w-24 rounded-full" />
                  </div>
                </div>
                <Skeleton className="h-9 w-28 rounded-2xl" />
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <Skeleton className="h-24 rounded-2xl" />
                <Skeleton className="h-24 rounded-2xl" />
              </div>
              <div className="space-y-2 rounded-2xl border border-border/50 bg-background/80 px-3 py-3">
                <div className="flex justify-between gap-2">
                  <Skeleton className="h-4 w-20 rounded-full" />
                  <Skeleton className="h-4 w-10 rounded-full" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="grid grid-cols-2 gap-2">
                  <Skeleton className="h-8 rounded-xl" />
                  <Skeleton className="h-8 rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
