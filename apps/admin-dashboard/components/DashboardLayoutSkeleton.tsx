import { Skeleton } from "@blush/ui/components/ui/skeleton";

/**
 * Mirrors the signed-in shell: a glass navigation frame with the content
 * panel inset inside it, so nothing jumps when the real layout arrives.
 */
export function DashboardLayoutSkeleton() {
  return (
    <div className="admin-dashboard-shell flex h-svh gap-0 overflow-hidden p-2">
      {/* Sidebar skeleton */}
      <div className="admin-glass-card hidden w-64 shrink-0 flex-col rounded-[1.25rem] border p-2 md:flex">
        <div className="flex h-16 items-center gap-2.5">
          <Skeleton className="size-9 rounded-xl bg-white/65 dark:bg-white/10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-28 bg-white/60 dark:bg-white/8" />
            <Skeleton className="h-2.5 w-20 bg-white/50 dark:bg-white/6" />
          </div>
        </div>

        <div className="mt-4 flex-1 space-y-2">
          {[0, 1, 2, 3, 4, 5, 6].map(index => (
            <Skeleton
              key={index}
              className="h-10 w-full rounded-xl bg-white/50 dark:bg-white/6"
            />
          ))}
        </div>

        <Skeleton className="h-14 w-full rounded-xl bg-white/50 dark:bg-white/6" />
      </div>

      {/* Inset content panel */}
      <div className="admin-content-panel flex min-w-0 flex-1 flex-col overflow-hidden rounded-[1.5rem]">
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/60 bg-white/35 px-5 backdrop-blur-xl dark:border-white/8 dark:bg-white/4">
          <Skeleton className="h-4 w-32 bg-white/60 dark:bg-white/8" />
          <Skeleton className="ml-auto h-9 w-9 rounded-lg bg-white/60 dark:bg-white/8" />
        </div>

        <div className="flex-1 space-y-6 p-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map(index => (
              <Skeleton
                key={index}
                className="h-32 rounded-[1.35rem] bg-white/55 dark:bg-white/6"
              />
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map(index => (
              <Skeleton
                key={index}
                className="h-32 rounded-[1.35rem] bg-white/55 dark:bg-white/6"
              />
            ))}
          </div>
          <Skeleton className="h-64 rounded-[1.45rem] bg-white/55 dark:bg-white/6" />
        </div>
      </div>
    </div>
  );
}
