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
            widths={["w-full", "w-full", "w-full", "w-full"]}
            className="w-full xl:min-w-[420px]"
          />
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <FintechLoadingMetricCard
            key={index}
            titleWidth="w-36"
            valueWidth="w-32"
            iconSizeClassName="h-12 w-12"
          />
        ))}
      </div>

      <FintechLoadingSurface className="rounded-[24px]">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full rounded-2xl" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
            <Skeleton className="h-10 w-full rounded-2xl" />
            <Skeleton className="h-10 w-full rounded-2xl lg:w-72" />
          </div>
        </div>
      </FintechLoadingSurface>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <FintechLoadingSurface key={index}>
            <div className="space-y-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-11 w-11 rounded-2xl bg-muted/70" />
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-28 rounded-full bg-muted/65" />
                    <Skeleton className="h-4 w-24 rounded-full bg-muted/60" />
                  </div>
                </div>
                <Skeleton className="h-9 w-28 rounded-2xl bg-muted/65" />
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <FintechLoadingSurface tone="inset" className="rounded-2xl">
                  <div className="h-24" />
                </FintechLoadingSurface>
                <FintechLoadingSurface tone="inset" className="rounded-2xl">
                  <div className="h-24" />
                </FintechLoadingSurface>
              </div>
              <div className="space-y-2">
                <FintechLoadingListItem
                  tone="inset"
                  className="rounded-2xl"
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
            </div>
          </FintechLoadingSurface>
        ))}
      </div>
    </div>
  );
}
