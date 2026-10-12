import { type ComponentType } from "react";
import {
  FileSearchCorner,
  FileText,
  FolderArchive,
  PanelsTopLeft,
  Table,
} from "lucide-react";
import Stepper, { type Step, type StepTag } from "./Stepper";
import type { JobPhase, JobStatusResponse } from "@/lib/pollingApi";

export interface JobStepTemplate {
  phase: JobPhase;
  title: string;
  description: string;
  runningNote: string;
  startPercent: number;
  icon: ComponentType<{ className?: string }>;
}


export const JOB_STEPS: JobStepTemplate[] = [
  {
    phase: "LOADING_SOURCE",
    title: "Loading Source Document",
    description: "Reading and validating the uploaded PDF",
    runningNote: "Validating byte stream",
    startPercent: 10,
    icon: FileSearchCorner,
  },
  {
    phase: "EXTRACTING_CONTENT",
    title: "Extracting Content",
    description: "Parsing text, layout and reading order from every page",
    runningNote: "Parsing page content",
    startPercent: 25,
    icon: PanelsTopLeft,
  },
  {
    phase: "RECOVERING_STRUCTURE",
    title: "Recovering Structure",
    description: "Reconstructing tables, headings, lists and paragraphs",
    runningNote: "Rebuilding document structure",
    startPercent: 55,
    icon: Table,
  },
  {
    phase: "GENERATING_DOCUMENT",
    title: "Generating Word Document",
    description: "Mapping recovered structure to native Word (.docx) objects",
    runningNote: "Writing document model",
    startPercent: 75,
    icon: FileText,
  },
  {
    phase: "SAVING_OUTPUT",
    title: "Saving Output",
    description: "Packaging and storing the converted document",
    runningNote: "Finalizing file",
    startPercent: 90,
    icon: FolderArchive,
  },
];


export function getActiveStepIndex(job: JobStatusResponse | null): number {
  if (!job) return -1;
  if (job.status === "DONE" || job.phase === "COMPLETED") {
    return JOB_STEPS.length;
  }
  const index = JOB_STEPS.findIndex((step) => step.phase === job.phase);
  if (index !== -1) return index;
  // PROCESSING without a known phase yet: treat as the first step.
  return job.status === "PROCESSING" ? 0 : -1;
}

export function getOverallPercent(job: JobStatusResponse | null): number {
  if (!job) return 0;
  if (job.status === "DONE") return 100;
  return Math.min(100, Math.max(0, job.progressPercent ?? 0));
}


export function getProgressCeiling(job: JobStatusResponse | null): number {
  const current = getOverallPercent(job);
  if (!job || job.status !== "PROCESSING") return current;
  const activeIndex = getActiveStepIndex(job);
  const nextStart = JOB_STEPS[activeIndex + 1]?.startPercent ?? 100;
  return Math.max(current, nextStart - 1);
}

function completedTags(
  phase: JobPhase,
  job: JobStatusResponse,
): StepTag[] | undefined {
  if (phase === "LOADING_SOURCE" && job.pageCount != null) {
    return [{ label: `${job.pageCount} page${job.pageCount === 1 ? "" : "s"}` }];
  }
  if (phase === "EXTRACTING_CONTENT" && job.metrics?.sourceWordCount != null) {
    return [{ label: `${job.metrics.sourceWordCount.toLocaleString()} words extracted` }];
  }
  if (phase === "GENERATING_DOCUMENT" && job.metrics?.outputWordCount != null) {
    return [{ label: `${job.metrics.outputWordCount.toLocaleString()} words written` }];
  }
  return undefined;
}

export function buildJobSteps(job: JobStatusResponse | null): Step[] {
  const activeIndex = getActiveStepIndex(job);
  const failed = job?.status === "FAILED";

  return JOB_STEPS.map((template, i) => {
    const base = { title: template.title, description: template.description };

    if (job && i < activeIndex) {
      return {
        ...base,
        status: "complete",
        tags: completedTags(template.phase, job),
      };
    }

    if (i === activeIndex) {
      if (failed) return { ...base, status: "error", meta: "Failed" };
      return { ...base, status: "loading", runningNote: template.runningNote };
    }

    return {
      ...base,
      status: "pending",
      icon: template.icon,
      meta: failed ? "Skipped" : "Queued",
    };
  });
}

export interface JobStepperProps {
  job: JobStatusResponse | null;
}

export default function JobStepper({ job }: JobStepperProps) {
  return (
    <div className="flex min-h-140 w-full items-start px-4">
      <div className="w-full max-w-xl">
        <Stepper steps={buildJobSteps(job)} />
      </div>
    </div>
  );
}
