import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
} from "@/components/ui/Card";
import { ArrowRight, Check } from "lucide-react";
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
          {/* figures variant: assets chips */}
          {item.variant === "figures" && item.files && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Embedded Assets
                </span>
                <span className="text-sm font-semibold text-primary">
                  Lossless PNG
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {item.files.map((f) => (
                  <span
                    key={f.name}
                    className="text-sm bg-card border border-muted text-muted-foreground rounded-md px-2 py-1 font-mono shadow-2xs"
                  >
                    {f.name}
                  </span>
                ))}
                {item.extraFiles && item.extraFiles > 0 && (
                  <span className="text-sm bg-primary-background border border-primary/20 text-primary font-medium rounded-md px-2 py-1">
                    +{item.extraFiles} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* typography variant: from → to mapping */}
          {item.variant === "typography" && item.mapping && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Source Font
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {item.mapping.from}
                  </span>
                </div>
                <div className="flex items-center justify-center size-6 rounded-full bg-primary-background text-primary border border-primary/20 shrink-0">
                  <ArrowRight className="size-3" />
                </div>
                <div className="flex flex-col items-end text-right min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Target Style
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {item.mapping.to}
                  </span>
                </div>
              </div>

              {item.mapping.matchLabel && (
                <div className="pt-2 mt-2 border-t border-muted flex items-start gap-1.5 text-sm text-muted-foreground">
                  <Check className="size-3.5 text-success shrink-0 mt-0.5" />
                  <span className="leading-snug">
                    {item.mapping.matchLabel}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* session variant: auto-purge progress indicator */}
          {item.variant === "session" && progress !== undefined && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Cache Status
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
                    {purgeText}
                  </span>
                </div>
                <div className="flex flex-col items-end text-right min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-success">
                    Privacy Active
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-muted-foreground">
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
