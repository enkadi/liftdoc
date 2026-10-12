import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Card } from "../ui/Card";
import { Progress } from "../ui/Progress";
import { Spinner } from "../ui/Spinner";
import { CheckIcon, BadgeCheck } from "lucide-react";
import JobStepper, {
  JOB_STEPS,
  getActiveStepIndex,
  getOverallPercent,
  getProgressCeiling,
} from "../ui/JobStepper";
import ErrorStateCard from "./ErrorStateCard";

import { useConversion } from "@/context/ConversionContext";
import { useSmoothedProgress } from "@/app/hooks/useSmoothedProgress";
import type { JobStatusResponse } from "@/lib/pollingApi";

interface ProgressCardProps {
  job: JobStatusResponse | null;
  notFound: boolean;
}

const ProgressCard = ({ job, notFound }: ProgressCardProps) => {
  const { updateStatus, session } = useConversion();
  const isActive =
    session?.status === "queued" || session?.status === "processing";

  const updateStatusRef = useRef(updateStatus);
  useEffect(() => {
    updateStatusRef.current = updateStatus;
  }, [updateStatus]);

  const jobStatus = job?.status;
  const durationSeconds = job?.durationSeconds ?? undefined;
  const outputSizeBytes = job?.output?.sizeBytes ?? undefined;

  useEffect(() => {
    if (!isActive) return;
    if (jobStatus === "DONE") {
      updateStatusRef.current("done", durationSeconds, outputSizeBytes);
    } else if (jobStatus === "FAILED") {
      updateStatusRef.current("failed");
      toast.error("Conversion failed");
    } else if (jobStatus === "PROCESSING" && session?.status === "queued") {
      updateStatusRef.current("processing");
    }
  }, [isActive, jobStatus, durationSeconds, outputSizeBytes, session?.status]);

  useEffect(() => {
    if (notFound && isActive) {
      updateStatusRef.current("failed");
      toast.error("Conversion job could not be found");
    }
  }, [notFound, isActive]);

  const totalSteps = JOB_STEPS.length;
  const activeIndex = getActiveStepIndex(job);
  const done = activeIndex >= totalSteps;
  const queued = activeIndex < 0;
  const currentStepIndex = Math.min(Math.max(activeIndex, 0), totalSteps - 1);
  const overallPercent = useSmoothedProgress(
    getOverallPercent(job),
    getProgressCeiling(job),
  );

  const calloutText = queued
    ? "Waiting in queue..."
    : done
      ? "Conversion complete. Preparing your results..."
      : `${JOB_STEPS[currentStepIndex].description}...`;

  if (session?.status === "failed") {
    return <ErrorStateCard />;
  }

  return (
    <div>
      {/* Main card */}
      <Card className="my-6 w-full max-w-5xl mx-auto flex flex-col p-4 sm:p-6">
        {/* Header and Percentage */}
        <h1 className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-10 p-4">
          <span className="text-lg md:text-3xl font-semibold">
            Reconstructing Document Structures
          </span>
          <span className="text-2xl md:text-3xl font-bold text-foreground self-end">
            {overallPercent}%{" "}
            <span className="text-sm text-muted-foreground">completed</span>
          </span>
        </h1>
        {/*Progress Bar Track  */}
        <div>
          <Progress
            value={overallPercent}
            className="bg-primary-background mx-2 w-auto *:bg-primary *:duration-700 *:ease-out"
          />
        </div>
        {/* Current Stage Callout */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-1 p-4">
          <div className="flex items-center gap-1 shrink-0">
            {done ? (
              <CheckIcon className="w-4 h-4 text-primary" />
            ) : (
              <Spinner className="w-4 h-4 text-primary" />
            )}
            <p className="font-bold text-sm">
              {queued
                ? "Queued:"
                : `Phase ${done ? totalSteps : currentStepIndex + 1} of ${totalSteps}:`}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">{calloutText}</p>
        </div>
        {/* Timeline Stepper */}
        <div className="-mx-4">
          <JobStepper job={job} />
        </div>
        {/* Pipeline Footer */}
        <Card className="mx-2 my-6 bg-secondary border-secondary">
          <div className="flex flex-row items-center gap-4 p-4">
            <div className="rounded-full bg-primary-background p-2 shrink-0">
              <BadgeCheck className="text-primary" />
            </div>
            <div className="flex flex-col">
              <p className="font-bold">Native Flow Fidelity Guarantee</p>
              <p className="text-sm text-muted-foreground">
                DocLift reconstructs actual Word document objects (tables,
                paragraphs, list definitions) rather than static text boxes.
                Once finished, document text reflows naturally when edited in
                Microsoft Word.
              </p>
            </div>
          </div>
        </Card>
      </Card>
    </div>
  );
};

export default ProgressCard;
