"use client";

import {
  RotateCw,
  CircleCheck,
  Info,
  ListChecks,
  ChartLine,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { ChecklistCard } from "@/components/results/ChecklistCard";
import { FidelityMetricCard } from "@/components/results/FidelityMetricCard";
import { SummaryCard } from "@/components/results/SummaryCard";
import {
  checklistData,
  fidelityMetrics,
  summaryCards,
} from "@/data/resultsData";
import { useConversion } from "@/context/ConversionContext";
import DownloadButton from "@/components/results/DownloadButton";

export default function ResultsScreen() {
  const { requestReset, session } = useConversion();
  const docxTitle =
    session?.output?.filename ||
    (session?.fileName
      ? session.fileName.replace(/\.[^./]+$/, ".docx")
      : "Word Document.docx");

  const durationSeconds = session?.durationSeconds;
  const conversionTimeText = (() => {
    if (durationSeconds == null) return null;
    const roundedSeconds = Math.round(durationSeconds);
    const mins = Math.floor(roundedSeconds / 60);
    const secs = roundedSeconds % 60;
    const formatted = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    return `${formatted} conversion time`;
  })();

  const sizeBytes =
    session?.output?.sizeBytes ??
    session?.outputSizeBytes ??
    session?.fileSize;
  const fileSizeText = sizeBytes
    ? sizeBytes < 1024 * 1024
      ? `${(sizeBytes / 1024).toFixed(1)} KB`
      : `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : null;

  const pageCountText =
    session?.pageCount != null
      ? `${session.pageCount} ${session.pageCount === 1 ? "page" : "pages"}`
      : null;

  const metadataSummary = [pageCountText, fileSizeText, conversionTimeText]
    .filter(Boolean)
    .join(" • ");

  const sourceWords = session?.metrics?.sourceWordCount;
  const outputWords = session?.metrics?.outputWordCount;
  const wordCount = outputWords ?? sourceWords;

  const textYieldPercent =
    sourceWords != null && outputWords != null && sourceWords > 0
      ? Number(
          Math.min(100, Math.max(0, (outputWords / sourceWords) * 100)).toFixed(1)
        )
      : 'NA';

  const dynamicChecklistData = checklistData.map((item) => {
    if (item.id === 1 && wordCount != null) {
      return {
        ...item,
        badge: `${wordCount.toLocaleString()} Words`,
      };
    }
    if (item.id === 4 && session?.metrics) {
      const {
        orderedListsDetected,
        unorderedListsDetected,
        orderedListsReconstructed,
        unorderedListsReconstructed,
      } = session.metrics;

      const hasDetected =
        orderedListsDetected != null || unorderedListsDetected != null;
      const hasReconstructed =
        orderedListsReconstructed != null || unorderedListsReconstructed != null;

      if (hasDetected || hasReconstructed) {
        const detectedTotal =
          (orderedListsDetected ?? 0) + (unorderedListsDetected ?? 0);
        const reconstructedTotal =
          (orderedListsReconstructed ?? 0) + (unorderedListsReconstructed ?? 0);

        const badgeText =
          detectedTotal > 0
            ? `${reconstructedTotal}/${detectedTotal} Lists Reconstructed`
            : "No Lists Detected";

        return {
          ...item,
          badge: badgeText,
          description:
            detectedTotal > 0
              ? `Reconstructed ${reconstructedTotal} of ${detectedTotal} list structures detected in the source PDF (${unorderedListsReconstructed ?? 0} bulleted, ${orderedListsReconstructed ?? 0} numbered).`
              : item.description,
        };
      }
    }
    return item;
  });

  return (
    <div className="flex-1 space-y-4 p-4">
      {/* Header row */}
      <div className="bg-white w-full mx-auto max-w-5xl flex flex-col space-y-4 p-4 rounded-xl shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex flex-col gap-2 min-w-0 w-full flex-1">
            <div className="w-fit flex flex-col text-sm sm:flex-row gap-2 bg-primary-background p-1.5 rounded-lg sm:items-center">
              <div className="text-primary flex items-center gap-2">
                <CircleCheck className="size-3" />
                <p className="text-xs">Conversion Complete</p>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">
              Your Word document is ready for download
            </span>
            <div className="flex flex-col space-y-1 min-w-0 w-full">
              <h1
                className="text-2xl font-regular font-semibold truncate"
                title={docxTitle}
              >
                {docxTitle}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-sm sm:text-md bg-primary-background rounded-lg w-fit px-2 py-1 text-primary">
                  <span>Converted Word Document</span>
                </div>
                {session?.jobId && (
                  <span className="text-xs bg-gray-100 text-gray-600 font-mono px-2 py-1 rounded-md">
                    ID: {session.jobId}
                  </span>
                )}
                {metadataSummary && (
                  <p className="text-sm sm:text-md text-muted-foreground">
                    {metadataSummary}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col flex-nowrap md:flex-row gap-2 sm:w-auto w-full shrink-0">
            <Button variant="secondary" onClick={requestReset}>
              <RotateCw className="size-4" />
              <span>Convert Another File</span>
            </Button>
            {session?.jobId && <DownloadButton jobId={session.jobId} />}
          </div>
        </div>
      </div>

      {/* Checklist + Fidelity two-column section */}
      <div className="w-full mx-auto max-w-5xl grid grid-cols-1 sm:grid-cols-2 gap-4 shadow-sm rounded-xl">
        {/* Left — Structural Conversion Checklist */}
        <div className="flex flex-col space-y-3 bg-white p-4 rounded-xl">
          <div className="flex flex-row justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <ListChecks className="size-5 text-blue-600 shrink-0" />
              <h2 className="font-semibold text-2xl">Conversion Checklist</h2>
            </div>
            <span className="text-sm text-muted-foreground">
              Deterministic AST Validation
            </span>
          </div>
          {dynamicChecklistData.map((item) => (
            <ChecklistCard key={item.id} item={item} />
          ))}
        </div>

        {/* Right — Factual Fidelity Metrics */}
        <div className="flex flex-col space-y-3 bg-white p-4 rounded-xl">
          <div className="flex flex-row justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <ChartLine className="size-5 text-primary shrink-0" />
              <h2 className="font-semibold text-2xl">
                Factual Fidelity Metrics
              </h2>
            </div>
            <span className="text-sm text-muted-foreground">
              Target: Exact DOCX
            </span>
          </div>

          {/* Deterministic Text Yield donut */}
          <div className="flex flex-row items-center gap-4 bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
            <div className="relative flex items-center justify-center w-20 h-20 shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />
                <circle
                  cx="18"
                  cy="18"
                  r="15.9"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="3"
                  strokeDasharray={`${textYieldPercent} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center leading-none">
                <span className="text-lg font-bold">{textYieldPercent}%</span>
                <span className="text-[9px] text-gray-400 mt-0.5">
                  Text Match
                </span>
              </div>
            </div>
            <div className="flex flex-col">
              <p className="font-semibold text-sm">Deterministic Text Yield</p>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Calculated from Levenshtein token parity between raw PDF content
                streams and Word runs.
              </p>
            </div>
          </div>

          {fidelityMetrics.map((item) => (
            <FidelityMetricCard key={item.id} item={item} />
          ))}

          {/* Transparency note */}
          <div className="flex flex-row items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl p-3 mt-1">
            <Info className="size-4 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-primary mb-0.5">
                DocLift Transparency Principle
              </p>
              <p className="text-sm text-primary leading-relaxed">
                We never fabricate simulated 99.9% metrics. Our parser runs
                strict geometric audits: we make sure that all the content from
                the PDF is preserved and matched up with the Word document.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards at the bottom section */}
      <div className="w-full mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-4">
        {summaryCards.map((item) => (
          <SummaryCard
            key={item.id}
            item={item}
            completedAt={session?.completedAt}
          />
        ))}
      </div>
    </div>
  );
}
