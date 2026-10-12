import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
} from "@/components/ui/Card";
import { ArrowRight } from "lucide-react";
import type { SummaryCardItem } from "@/data/resultsData";
import { formatTime } from "@/components/progress/HeaderBar";
import { PURGE_TTL_SECONDS, usePurgeCountdown } from "@/lib/usePurgeCountdown";

interface SummaryCardProps {
  item: SummaryCardItem;
  /** Epoch ms when the conversion finished; drives the session purge countdown. */
  completedAt?: number;
}

export function SummaryCard({ item, completedAt }: SummaryCardProps) {
  const Icon = item.icon;

  const remaining = usePurgeCountdown(
    item.variant === "session" ? completedAt : undefined,
  );
  const hasCountdown = remaining !== null;
  const badge = hasCountdown ? formatTime(remaining) : item.badge;
  const progress = hasCountdown
    ? (remaining / PURGE_TTL_SECONDS) * 100
    : item.progress;
  const purgeText = !hasCountdown
    ? "Auto-purges in 30m"
    : remaining > 0
      ? `Auto-purges in ${Math.ceil(remaining / 60)}m`
      : "Purged";

  return (
    <Card className="group h-full flex flex-col justify-between border border-muted bg-card hover:border-primary-background hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300 rounded-xl overflow-hidden">
      <CardHeader className="p-5 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="size-11 rounded-xl bg-primary-background border border-primary/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white group-hover:scale-105 transition-all duration-300 shadow-2xs">
            <Icon className="size-5" />
          </div>
          {badge && (
            <span className="text-[14px] font-semibold tabular-nums tracking-wide px-2.5 py-0.5 rounded-full bg-primary-background text-primary border border-primary/20 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all duration-300">
              {badge}
            </span>
          )}
        </div>

        <div>
          <h3 className="text-xl font-semibold text-foreground group-hover:text-primary transition-colors">
            {item.title}
          </h3>
          <CardDescription className="text-sm sm:text-md text-muted-foreground leading-relaxed mt-1">
            {item.description}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-0 mt-auto">
        <div className="rounded-xl bg-secondary border border-muted p-3.5 space-y-2.5 transition-colors group-hover:border-primary-background group-hover:bg-primary-background/20">
          {/* figures variant: just shows we embedded assets */}
          {item.variant === "figures" && (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Embedded Assets
                </span>
                <span className="text-sm font-semibold text-primary">
                  Lossless PNG
                </span>
              </div>
            </div>
          )}

          {/* lists variant: detected -> reconstructed mapping */}
          {item.variant === "lists" && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Detected Lists
                  </span>
                  <span className="text-xs sm:text-sm font-medium text-foreground">
                    {item.detectedListsDetail || (item.detectedLists != null ? String(item.detectedLists) : "-")}
                  </span>
                </div>
                <div className="flex items-center justify-center size-6 rounded-full bg-primary-background text-primary border border-primary/20 shrink-0">
                  <ArrowRight className="size-3" />
                </div>
                <div className="flex flex-col items-end text-right min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Reconstructed
                  </span>
                  <span className="text-xs sm:text-sm font-semibold text-primary">
                    {item.reconstructedListsDetail || (item.reconstructedLists != null ? String(item.reconstructedLists) : "-")}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* session variant: auto-purge progress indicator */}
          {item.variant === "session" && progress !== undefined && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold tracking-wider text-muted-foreground">
                    {purgeText}
                  </span>
                </div>
                <div className="flex flex-col items-end text-right min-w-0">
                  <span className="text-sm font-bold tracking-wider text-success">
                    {badge}
                  </span>
                </div>
              </div>

              <div className="pt-1">
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
