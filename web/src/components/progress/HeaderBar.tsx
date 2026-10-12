import { Card, CardContent } from "../ui/Card";
import { FileInput, ArrowRight, FileTypeCorner, Timer } from "lucide-react";
import FileInfoCard from "./FileInfoCard";
import { useConversion } from "@/context/ConversionContext";
import { JobStatusResponse } from "@/lib/pollingApi";

export interface HeaderBarProps {
  file: File | null;
  timeElapsed: number;
  timeRemaining: JobStatusResponse["estimatedTotalSeconds"] | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const HeaderBar = ({ file, timeElapsed, timeRemaining }: HeaderBarProps) => {
  const { session, setActiveView } = useConversion();

  const isDone = session?.status === "done";

  const fileName = file?.name || session?.fileName || "Untitled document";
  const sourceFileName = fileName;
  const targetFileName = fileName.endsWith(".docx")
    ? fileName
    : fileName.includes(".")
    ? fileName.replace(/\.[^./]+$/, ".docx")
    : `${fileName}.docx`;
  const sourceFileDescription = file
    ? `PDF Document • ${formatFileSize(file.size)}`
    : session?.fileName
    ? "PDF Document"
    : "No file selected";
  const targetFileDescription = "Word Document (.docx)";

  return (
    <div className="mb-6 w-full">
      <Card className="mt-6 w-full max-w-5xl mx-auto">
        <CardContent className="p-4 sm:p-6">
          {/* Header Bar */}
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-4 lg:items-center lg:justify-between w-full">
            {/* Left: Document Pair */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 min-w-0 flex-1 items-stretch sm:items-center">
              {/* Source File */}
              <div className="min-w-0 flex-1">
                <FileInfoCard
                  icon={FileInput}
                  iconClassName="text-destructive"
                  iconContainerClassName="bg-red-100"
                  name={sourceFileName}
                  description={sourceFileDescription}
                />
              </div>
              {/* Arrow Indicator  */}
              <div className="flex flex-col items-center justify-center gap-1 p-1 shrink-0">
                <ArrowRight className="size-5 sm:size-6 text-primary rotate-90 sm:rotate-0" />
                <p className="text-xs hidden sm:block tracking-widest text-muted-foreground">DOCX</p>
              </div>
              {/* Target File */}
              <button
                type="button"
                disabled={!isDone}
                onClick={() => {
                  if (isDone) {
                    setActiveView("result");
                  }
                }}
                className={`text-left min-w-0 flex-1 rounded-lg border transition-all ${
                  isDone
                    ? "cursor-pointer border-primary shadow-lg hover:scale-101 hover:opacity-80"
                    : "cursor-not-allowed border-muted-foreground opacity-60"
                }`}
                aria-label={`Open ${targetFileName}`}
              >
                <FileInfoCard
                  icon={FileTypeCorner}
                  iconClassName="text-blue-600"
                  iconContainerClassName="bg-blue-200"
                  name={targetFileName}
                  description={targetFileDescription}
                />
              </button>
            </div>
            {/* Right: Time */}
            <div className="flex items-center justify-center sm:justify-end gap-3 sm:gap-4 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-muted">
              {/* Time elapsed */}
              <div className="flex flex-col items-center sm:items-end justify-center">
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                  Time Elapsed
                </p>
                <p className="text-sm sm:text-base font-medium whitespace-nowrap">{formatTime(timeElapsed)} elapsed</p>
              </div>
              {/* Divider */}
              <div className="border-l border-muted-foreground h-8 mx-1 sm:mx-2"></div>
              {/* Time remaining */}
              <div className="flex flex-col items-center sm:items-start justify-center">
                <p className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                  Estimated Time Remaining
                </p>
                <div className="flex gap-2 items-center justify-center whitespace-nowrap">
                  <Timer className="size-4 sm:size-5 text-muted-foreground shrink-0" />
                  <p className="text-sm sm:text-base font-medium">
                    {timeRemaining == null
                      ? "Calculating..."
                      : `~${formatTime(Math.ceil(timeRemaining))} remaining`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HeaderBar;
