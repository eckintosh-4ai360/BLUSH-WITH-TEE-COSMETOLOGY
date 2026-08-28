"use client";

import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Badge } from "@blush/ui/components/ui/badge";
import { Button } from "@blush/ui/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@blush/ui/components/ui/popover";
import { ScrollArea } from "@blush/ui/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function timeAgo(date: Date | string): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.round((value.getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["second", 60],
    ["minute", 60],
    ["hour", 24],
    ["day", 7],
    ["week", 4.35],
    ["month", 12],
  ];

  let amount = seconds;
  for (const [unit, size] of units) {
    if (Math.abs(amount) < size)
      return RELATIVE.format(Math.round(amount), unit);
    amount /= size;
  }
  return RELATIVE.format(Math.round(amount), "year");
}

/**
 * The notification centre behind the dashboard bell (§63). Clicking an item
 * marks it read and navigates to the record it is about.
 */
export function NotificationBell() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const notifications = trpc.notifications.list.useQuery(
    { unreadOnly: false, limit: 20 },
    { refetchInterval: 60_000, refetchOnWindowFocus: true }
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.invalidate(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => utils.notifications.invalidate(),
  });

  const unread = notifications.data?.unreadCount ?? 0;
  const rows = notifications.data?.rows ?? [];

  const open = (id: number, readAt: Date | null, link: string | null) => {
    if (!readAt) markRead.mutate({ ids: [id] });
    if (link) router.push(link);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative grid h-9 w-9 place-items-center rounded-xl border border-white/70 bg-white/45 text-muted-foreground shadow-sm backdrop-blur-xl transition-colors hover:bg-white/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Notifications
            </p>
            <p className="text-xs text-muted-foreground">
              {unread ? `${unread} unread` : "All caught up"}
            </p>
          </div>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>

        <ScrollArea className="max-h-96">
          {notifications.isLoading ? (
            <div className="space-y-2 p-3">
              {[0, 1, 2].map(index => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl bg-muted/60"
                />
              ))}
            </div>
          ) : !rows.length ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              Nothing here yet. New applications, orders, payments and low-stock
              alerts will appear as they happen.
            </p>
          ) : (
            <ul className="divide-y divide-border/50">
              {rows.map(row => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => open(row.id, row.readAt, row.link)}
                    className="flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                        row.readAt ? "bg-transparent" : "bg-primary"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {row.title}
                      </span>
                      {row.body ? (
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {row.body}
                        </span>
                      ) : null}
                      <span className="mt-1 flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className="text-[10px] capitalize"
                        >
                          {row.type.replaceAll("_", " ")}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {timeAgo(row.createdAt)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
