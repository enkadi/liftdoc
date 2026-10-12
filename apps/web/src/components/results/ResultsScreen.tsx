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
import { FidelityScoreCard } from "@/components/results/FidelityScoreCard";

export default function ResultsScreen() {
  const { requestReset, session, timeElapsed } = useConversion();
  const docxTitle =
    session?.output?.filename ||
    (session?.fileName
      ? session.fileName.replace(/\.[^./]+$/, ".docx")
      : "Word Document.docx");

  const durationSeconds = timeElapsed > 0 ? timeElapsed : (session?.durationSeconds ?? timeElapsed);
  const conversionTimeText = (() => {
    if (durationSeconds == null) return null;
    if (durationSeconds > 0 && durationSeconds < 1) {
      const ms = Math.round(durationSeconds * 100);
      return `${ms}ms conversion time`;
    }
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

  const metadataSummary = [fileSizeText, conversionTimeText]
    .filter(Boolean)
    .join(" • ");

  const sourceWords = session?.metrics?.sourceWordCount;
  const outputWords = session?.metrics?.outputWordCount;
  const wordCount = outputWords ?? sourceWords;



  const dynamicChecklistData = checklistData.map((item) => {
    if (item.id === 1 && wordCount != null) {
      return {
        ...item,
        badge: `${wordCount.toLocaleString()} Words`,
      };
    }

    if (item.id === 2 && session?.metrics?.multiColumnPageCount != null) {
      const count = session.metrics.multiColumnPageCount;
      return {
        ...item,
        badge: count > 0 ? `${count} Multi-Column ${count === 1 ? "Page" : "Pages"}` : "Single-Column",
        description: count > 0
          ? `Detected and preserved multi-column page layout across ${count} ${count === 1 ? "page" : "pages"}.`
          : item.description,
      };
    }

    if (item.id === 3 && session?.metrics?.headingsDetected != null) {
      const hCount = session.metrics.headingsDetected;
      const h1 = session.metrics.h1HeadingCount ?? 0;
      const h2 = session.metrics.h2HeadingCount ?? 0;
      const h3 = session.metrics.h3HeadingCount ?? 0;
      return {
        ...item,
        badge: hCount > 0 ? `${hCount} Headings Mapped` : "No Headings Detected",
        description: hCount > 0
          ? `Mapped ${hCount} heading structures (${h1} H1, ${h2} H2, ${h3} H3) into native Word paragraph styles.`
          : item.description,
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

  const dynamicFidelityMetrics = fidelityMetrics.map((item) => {
    if (item.id === 1 && session?.metrics?.headingsDetected != null) {
      return {
        ...item,
        value: session.metrics.headingsDetected,
        note: "Mapped",
      };
    }
    if (item.id === 2 && session?.metrics?.tablesDetected != null) {
      return {
        ...item,
        value: session.metrics.tablesDetected,
        note: `${session.metrics.tablesDetected === 1 ? "Grid" : "Grids"} Rebuilt`,
      };
    }
    if (item.id === 3 && session?.metrics?.imagesDetected != null) {
      return {
        ...item,
        value: session.metrics.imagesDetected,
        note: "Embedded Assets",
      };
    }
    return item;
  });

  const dynamicSummaryCards = summaryCards.map((item) => {
    if (item.id === 1 && session?.metrics?.imagesDetected != null) {
      const imgCount = session.metrics.imagesDetected;
      return {
        ...item,
        badge: `${imgCount} ${imgCount === 1 ? "Asset" : "Assets"}`,
        description:
          imgCount > 0
            ? `${imgCount} ${imgCount === 1 ? "bitmap image" : "bitmap images"} normalized to PNGs and embedded into the Word document.`
            : "No bitmap images detected in the document.",
      };
    }
    if (item.id === 2) {
      if (session?.metrics) {
        const {
          orderedListsDetected,
          unorderedListsDetected,
          orderedListsReconstructed,
          unorderedListsReconstructed,
        } = session.metrics;

        const ordDet = orderedListsDetected ?? 0;
        const unordDet = unorderedListsDetected ?? 0;
        const ordRec = orderedListsReconstructed ?? 0;
        const unordRec = unorderedListsReconstructed ?? 0;

        const detectedTotal = ordDet + unordDet;
        const reconstructedTotal = ordRec + unordRec;

        const formatBreakdown = (ordered: number, unordered: number) => {
          if (ordered === 0 && unordered === 0) return "0 lists";
          const parts: string[] = [];
          if (ordered > 0) parts.push(`${ordered} ordered`);
          if (unordered > 0) parts.push(`${unordered} unordered`);
          return parts.join(" & ");
        };

        return {
          ...item,
          badge: `${reconstructedTotal} ${reconstructedTotal === 1 ? "List" : "Lists"}`,
          detectedLists: detectedTotal,
          reconstructedLists: reconstructedTotal,
          detectedListsDetail: formatBreakdown(ordDet, unordDet),
          reconstructedListsDetail: formatBreakdown(ordRec, unordRec),
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
                <p className="text-xs">Conversion Completed</p>
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
              Reliable Validation
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
              Output: Word Document
            </span>
          </div>

          {/* Composite Fidelity Score Card with interactive breakdown dropdown */}
          <FidelityScoreCard session={session} />

          {dynamicFidelityMetrics.map((item) => (
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
        {dynamicSummaryCards.map((item) => (
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
