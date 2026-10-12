import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
} from "@/components/ui/Card";
import type { PreservationItem } from "@/data/preservationData";
import { ArrowRight, Check } from "lucide-react";

interface PreservationCardProps {
    item: PreservationItem;
}

export default function PreservationCard({ item }: PreservationCardProps) {
    const Icon = item.icon;

    return (
        <Card className="group h-full flex flex-col justify-between border border-muted bg-card hover:border-primary-background hover:shadow-lg hover:shadow-primary/5 hover:-translate-y-0.5 transition-all duration-300 rounded-xl overflow-hidden">
            <CardHeader className="p-5 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="size-11 rounded-xl bg-primary-background border border-primary/20 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white group-hover:scale-105 transition-all duration-300 shadow-2xs">
                        <Icon className="size-5" />
                    </div>
                    {item.category && (
                        <span className="text-[11px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full bg-primary-background text-primary border border-primary/20 group-hover:bg-primary group-hover:text-white group-hover:border-primary transition-all duration-300">
                            {item.category}
                        </span>
                    )}
                </div>

                <div>
                    <h3 className="text-base sm:text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                        {item.title}
                    </h3>
                    <CardDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed mt-1">
                        {item.description}
                    </CardDescription>
                </div>
            </CardHeader>

            <CardContent className="p-5 pt-0 mt-auto">
                <div className="rounded-xl bg-secondary border border-muted p-3.5 space-y-2.5 transition-colors group-hover:border-primary-background group-hover:bg-primary-background/20">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                PDF Input
                            </span>
                            <span className="text-sm font-medium text-foreground">
                                {item.comparison.original}
                            </span>
                        </div>
                        <div className="flex items-center justify-center size-6 rounded-full bg-primary-background text-primary border border-primary/20 shrink-0">
                            <ArrowRight className="size-3" />
                        </div>
                        <div className="flex flex-col items-end text-right min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                DOCX Output
                            </span>
                            <span className="text-xs font-semibold text-primary">
                                {item.comparison.result}
                            </span>
                        </div>
                    </div>

                    {item.comparison.description && (
                        <div className="pt-2 border-t border-muted flex items-start gap-1.5 text-xs text-muted-foreground">
                            <Check className="size-3.5 text-success shrink-0 mt-0.5" />
                            <span className="leading-snug">{item.comparison.description}</span>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
