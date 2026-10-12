import { Card } from "../ui/Card";
import Button from "../ui/Button";
import {
  AlertOctagon,
  Download,
  FileText,
  RotateCcw,
  FileUp,
  Files,
  RefreshCw,
} from "lucide-react";
import { useConversion } from "@/context/ConversionContext";

export interface ErrorStateCardProps {
  error?: string;
  reset?: () => void;
  onTryAnother?: () => void;
}

const ErrorStateCard = ({
  error,
  reset,
  onTryAnother,
}: ErrorStateCardProps = {}) => {
  const { resetKeepFile, reset: contextReset, file } = useConversion();

  const handleRetry = reset ?? resetKeepFile;
  const handleTryAnother = onTryAnother ?? contextReset;

  const errorMessage =
    error ??
    "To guarantee 100% editable accuracy, DocLift halts execution rather than generating corrupted or uneditable characters in your destination Word document.";

  const fileName = file?.name ?? "document.pdf";

  return (
    <div className="w-full max-w-5xl mx-auto my-6 space-y-6">
      {/* Top Error Callout Banner */}
      <div className="rounded-2xl border border-red-200 bg-red-50/90 p-5 sm:p-6 shadow-xs transition-all">
        <div className="flex items-start justify-between gap-4">
          <div className="size-11 sm:size-12 rounded-2xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm shadow-red-200">
            <AlertOctagon className="size-6" />
          </div>
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-red-950 font-heading">
                Conversion couldn&apos;t be completed
              </h1>
            </div>
            <p className="text-sm sm:text-base text-red-900/90 leading-relaxed font-sans">
              {errorMessage}
            </p>
          </div>
        </div>
      </div>

      <Card className="w-full p-6 sm:p-8 space-y-6 shadow-md">
        <div className="space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-heading truncate">
            We couldn&apos;t convert {fileName}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">
            We couldn&apos;t convert this PDF into an editable Word document. The file may contain content or formatting that DocLift can&apos;t process.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <h3 className="text-sm sm:text-base font-semibold text-foreground">
            Recommended Fixes:
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3.5 p-4 rounded-xl bg-secondary/60 border border-secondary hover:bg-secondary transition-colors">
              <div className="size-10 rounded-xl bg-primary-background text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <RefreshCw className="size-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Retry Conversion
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Try uploading the PDF again. Temporary processing issues can occasionally interrupt a conversion.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-xl bg-secondary/60 border border-secondary hover:bg-secondary transition-colors">
              <div className="size-10 rounded-xl bg-primary-background text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <Download className="size-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Download Fresh Copy
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Re-save or Re-download the PDF and try uploading the new copy.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-xl bg-secondary/60 border border-secondary hover:bg-secondary transition-colors">
              <div className="size-10 rounded-xl bg-primary-background text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <FileText className="size-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Open and Save Again
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Open the PDF in a viewer and save it as a new PDF and try converting that copy.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-xl bg-secondary/60 border border-secondary hover:bg-secondary transition-colors">
              <div className="size-10 rounded-xl bg-primary-background text-primary flex items-center justify-center shrink-0 border border-primary/20">
                <Files className="size-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-semibold text-foreground">
                  Try a Different PDF
                </h4>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Try converting a different PDF.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls Footer */}
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <Button
            variant="primary"
            size="md"
            onClick={handleTryAnother}
            className="gap-2 font-medium"
          >
            <FileUp className="size-4" />
            <span>Try Another File</span>
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={handleRetry}
            className="gap-2 font-medium"
          >
            <RotateCcw className="size-4" />
            <span>Retry Conversion</span>
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default ErrorStateCard;
