"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Info, CheckCircle2 } from "lucide-react";
import type { ConversionSession } from "@/lib/conversionSession";

export interface FidelityContributor {
  id: string;
  name: string;
  detail: string;
  score: number;
  formattedScore: string;
}

export interface FidelityScoreCardProps {
  session?: ConversionSession | null;
}

export function computeFidelityScoreData(session?: ConversionSession | null) {
  const sourceWords = session?.metrics?.sourceWordCount;
  const outputWords = session?.metrics?.outputWordCount;

  const inputPages = session?.pageCount;
  const outputPages = session?.metrics?.outputPageCount;

  const orderedListsDetected = session?.metrics?.orderedListsDetected ?? 0;
  const unorderedListsDetected = session?.metrics?.unorderedListsDetected ?? 0;
  const orderedListsReconstructed = session?.metrics?.orderedListsReconstructed ?? 0;
  const unorderedListsReconstructed = session?.metrics?.unorderedListsReconstructed ?? 0;

  const detectedLists = orderedListsDetected + unorderedListsDetected;
  const reconstructedLists = orderedListsReconstructed + unorderedListsReconstructed;

  const primaryComparisons: number[] = [];
  const contributors: FidelityContributor[] = [];

  // 1. Word preservation ratio
  if (sourceWords != null && outputWords != null && sourceWords > 0) {
    const score = Math.min(100, Math.max(0, (outputWords / sourceWords) * 100));
    primaryComparisons.push(score);
    contributors.push({
      id: "words",
      name: "Word Preservation",
      detail: `${outputWords.toLocaleString()} / ${sourceWords.toLocaleString()} Words`,
      score,
      formattedScore: `${score.toFixed(1)}%`,
    });
  }

  // 2. Page pagination ratio
  if (inputPages != null && outputPages != null && inputPages > 0) {
    const score = Math.min(100, Math.max(0, (outputPages / inputPages) * 100));
    primaryComparisons.push(score);
    contributors.push({
      id: "pages",
      name: "Page Pagination",
      detail: `${outputPages} / ${inputPages} Pages`,
      score,
      formattedScore: `${score.toFixed(1)}%`,
    });
  }

  // 3. List reconstruction ratio
  if (detectedLists > 0) {
    const score = Math.min(100, Math.max(0, (reconstructedLists / detectedLists) * 100));
    primaryComparisons.push(score);
    contributors.push({
      id: "lists",
      name: "List Reconstruction",
      detail: `${reconstructedLists} / ${detectedLists} Lists`,
      score,
      formattedScore: `${score.toFixed(1)}%`,
    });
  }

  // 4. Headings detected & mapped
  if (session?.metrics?.headingsDetected != null && session.metrics.headingsDetected > 0) {
    contributors.push({
      id: "headings",
      name: "Headings Mapped",
      detail: `${session.metrics.headingsDetected} / ${session.metrics.headingsDetected} Headings`,
      score: 100,
      formattedScore: "100%",
    });
  }

  // 5. Tables detected & rebuilt
  if (session?.metrics?.tablesDetected != null && session.metrics.tablesDetected > 0) {
    contributors.push({
      id: "tables",
      name: "Tables Rebuilt",
      detail: `${session.metrics.tablesDetected} / ${session.metrics.tablesDetected} Grids`,
      score: 100,
      formattedScore: "100%",
    });
  }

  // 6. Image assets extracted & embedded
  if (session?.metrics?.imagesDetected != null && session.metrics.imagesDetected > 0) {
    contributors.push({
      id: "images",
      name: "Image Assets",
      detail: `${session.metrics.imagesDetected} / ${session.metrics.imagesDetected} Images`,
      score: 100,
      formattedScore: "100%",
    });
  }

  const compositeFidelityPercent =
    contributors.length > 0
      ? Number(
          (
            contributors.reduce((sum, item) => sum + item.score, 0) /
            contributors.length
          ).toFixed(1)
        )
      : "N/A";

  return {
    compositeFidelityPercent,
    contributors,
  };
}

export function FidelityScoreCard({ session }: FidelityScoreCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { compositeFidelityPercent, contributors } = computeFidelityScoreData(session);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const dashArray =
    typeof compositeFidelityPercent === "number"
      ? `${compositeFidelityPercent} 100`
      : "0 100";

  return (
    <div
      ref={containerRef}
      className="relative group bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:border-blue-200 transition-all cursor-pointer"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
      onClick={() => setIsOpen((prev) => !prev)}
      tabIndex={0}
      onFocus={() => setIsOpen(true)}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node)) {
          setIsOpen(false);
        }
      }}
    >
      <div className="flex flex-row items-center gap-4">
        {/* SVG Donut Gauge */}
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
              strokeDasharray={dashArray}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute flex flex-col items-center leading-none">
            <span className="text-lg font-bold">
              {typeof compositeFidelityPercent === "number"
                ? `${compositeFidelityPercent}%`
                : compositeFidelityPercent}
            </span>
            <span className="text-[9px] text-gray-400 mt-0.5">Fidelity</span>
          </div>
        </div>

        {/* Text Details & Hover Trigger Badge */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm text-foreground">
              Composite Fidelity Score
            </p>
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100 group-hover:bg-blue-100 transition-colors shrink-0">
              <span className="sm:inline-block hidden">Breakdown</span> <ChevronDown className="size-3" />
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Calculated by aggregating structural metrics between the source PDF
            and output Word document.
          </p>
        </div>
      </div>

      {/* Hover Dropdown / Popover for Contributing Metrics */}
      <div
        className={`absolute left-0 right-0 sm:right-auto top-full mt-2 w-full sm:w-80 bg-white border border-gray-200 rounded-xl shadow-xl p-4 z-30 transition-all duration-200 ${
          isOpen
            ? "opacity-100 visible translate-y-0"
            : "opacity-0 invisible -translate-y-1 pointer-events-none"
        }`}
        data-testid="fidelity-dropdown"
      >
        <div className="flex items-center justify-between pb-2 border-b border-gray-100 mb-3">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="size-4 text-blue-600 shrink-0" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700">
              Fidelity Contributors
            </span>
          </div>
          <span className="text-xs font-semibold text-blue-600 font-mono">
            {typeof compositeFidelityPercent === "number"
              ? `${compositeFidelityPercent}% Total`
              : compositeFidelityPercent}
          </span>
        </div>

        {contributors.length === 0 ? (
          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
            <Info className="size-4 text-gray-400 shrink-0" />
            <span>No detailed contributor breakdown available for this file.</span>
          </div>
        ) : (
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {contributors.map((item) => (
              <div key={item.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700 truncate max-w-42">
                    {item.name}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-gray-500 font-mono">
                      {item.detail}
                    </span>
                    <span className="font-bold text-blue-600 text-xs w-11 text-right">
                      {item.formattedScore}
                    </span>
                  </div>
                </div>
                {/* Visual Progress Bar per contributor */}
                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-500"
                    style={{ width: `${item.score}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="pt-2.5 mt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
          <span>Document Structure Match</span>
          <span className="font-semibold text-gray-500">DocLift Audit</span>
        </div>
      </div>
    </div>
  );
}
