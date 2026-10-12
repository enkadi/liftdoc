import { CardDescription } from "../ui/Card";
import type { LucideIcon } from "lucide-react";

interface FileInfoCardProps {
  icon: LucideIcon;
  iconClassName: string;
  iconContainerClassName: string;
  name?: string;
  description?: string;
}

const FileInfoCard = ({
  icon: Icon,
  iconClassName,
  iconContainerClassName,
  name = "Untitled document",
  description = "No file selected",
}: FileInfoCardProps) => (
  <div className="flex items-center gap-3 bg-secondary rounded-lg p-3 sm:p-4 min-w-0 max-w-full">
    <div
      className={`flex items-center justify-center rounded-lg p-3 sm:p-4 shrink-0 ${iconContainerClassName}`}
    >
      <Icon className={`size-5 sm:size-6 ${iconClassName}`} />
    </div>
    <div className="flex flex-col min-w-0 flex-1">
      <h2
        className="text-sm sm:text-base font-semibold text-foreground truncate"
        title={name}
      >
        {name}
      </h2>
      <CardDescription className="text-[11px] sm:text-sm text-muted-foreground truncate">
        {description}
      </CardDescription>
    </div>
  </div>
);

export default FileInfoCard;
