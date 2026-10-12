import { Card, CardContent } from "@/components/ui/Card";
import { CheckCircle2 } from "lucide-react";
import type { ChecklistItem } from "@/data/resultsData";

interface ChecklistCardProps {
    item: ChecklistItem;
}

export function ChecklistCard({ item }: ChecklistCardProps) {

    return (
        <Card className="group w-full transition-all hover:scale-[1.01] hover:shadow-md">
            <CardContent className="flex flex-row items-start gap-4 p-4">
                <div className="mt-0.5 shrink-0">
                    <CheckCircle2 className="size-5 text-success" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                        <p className="font-semibold text-sm">{item.title}</p>
                        <span className="text-xs bg-muted text-faded rounded-md px-2 py-0.5 whitespace-nowrap">
                            {item.badge}
                        </span>
                    </div>
                    <p className="text-xs text-faded leading-relaxed">{item.description}</p>
                </div>
            </CardContent>
        </Card>
    );
}
