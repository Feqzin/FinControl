import { Skeleton } from "@/components/ui/skeleton";
import {
  FintechLoadingActionCluster,
  FintechLoadingListItem,
  FintechLoadingMetricCard,
  FintechLoadingPageHeader,
  FintechLoadingSurface,
} from "@/components/layout/fintech-loading-shell";

export function CartoesPageLoadingState() {
  return (
    <div className="app-page-shell app-section-stack">
      <FintechLoadingPageHeader
        showEyebrow={false}
        titleWidth="w-64"
        subtitleWidth="w-80 max-w-full"
        actions={
          <FintechLoadingActionCluster
            widths={["w-full", "w-full", "w-full"]}
            className="w-full lg:min-w-[360px]"
          />
        }
      />

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <FintechLoadingMetricCard
            key={index}
            titleWidth="w-36"
            valueWidth="w-32"
            iconSizeClassName="h-11 w-11"
          />
        ))}
      </div>

      <FintechLoadingSurface className="rounded-[24px]">
        <div className="flex flex-col gap-2.5">
          <Skeleton className="h-10 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-[22px]" />
          <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_auto]">
            <Skeleton className="h-10 w-full rounded-2xl" />
            <Skeleton className="h-10 w-full rounded-2xl lg:w-72" />
          </div>
        </div>
      </FintechLoadingSurface>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <FintechLoadingSurface key={index}>
            <div className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-2xl bg-muted/70" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-28 rounded-full bg-muted/65" />
                    <Skeleton className="h-4 w-20 rounded-full bg-muted/60" />
                  </div>
                </div>
                <Skeleton className="h-8 w-24 rounded-xl bg-muted/65" />
              </div>
              <FintechLoadingSurface tone="inset" className="rounded-[22px]">
                <div className="space-y-3 p-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-20 rounded-full bg-muted/60" />
                      <Skeleton className="h-6 w-28 rounded-full bg-muted/65" />
                    </div>
                    <div className="space-y-2 border-l border-border/40 pl-3">
                      <Skeleton className="h-3 w-16 rounded-full bg-muted/60" />
                      <Skeleton className="h-6 w-24 rounded-full bg-muted/65" />
                    </div>
                  </div>
                  <FintechLoadingSurface tone="inset" className="rounded-2xl">
                    <div className="space-y-2.5 p-3">
                      <FintechLoadingListItem
                        tone="inset"
                        className="rounded-2xl border-none bg-transparent p-0 shadow-none"
                        iconSizeClassName="hidden"
                        showSubtitle={false}
                        titleWidth="w-20"
                        trailingWidth="w-10"
                      />
                      <Skeleton className="h-2 w-full rounded-full bg-muted/60" />
                      <div className="grid grid-cols-2 gap-2">
                        <Skeleton className="h-8 rounded-xl bg-muted/65" />
                        <Skeleton className="h-8 rounded-xl bg-muted/65" />
                      </div>
                    </div>
                  </FintechLoadingSurface>
                </div>
              </FintechLoadingSurface>
            </div>
          </FintechLoadingSurface>
        ))}
      </div>
    </div>
  );
}
