import {
  type ComponentType,
} from "react";
import {
  Check,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";

// The states a step can be in. "error" is a failed step.
export type StepStatus =
  | "pending"
  | "loading"
  | "complete"
  | "error"
  | "cancelled";
export interface StepTag {
  icon?: ComponentType<{ className?: string }>;
  label: string;
}

export interface StepProgress {
  label: string;
  percent: number;
  note?: string;
  stats?: string[];
}

export interface Step {
  title: string;
  description: string;
  status: StepStatus;
  icon?: ComponentType<{ className?: string }>;
  meta?: string;
  runningNote?: string;
  tags?: StepTag[];
  progress?: StepProgress;
}

interface StepIconProps {
  status: StepStatus;
  icon?: ComponentType<{ className?: string }>;
}
function StepIcon({ status, icon: ContentIcon }: StepIconProps) {
  const base =
    "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ml-4";
  if (status === "complete") {
    return (
      <div className={`${base} bg-brand-secondary`}>
        <Check className="h-4 w-4 text-brand-primary" strokeWidth={3} />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className={`${base} bg-brand-primary`}>
        <Loader2
          className="h-4 w-4 animate-spin text-white"
          strokeWidth={2.5}
        />
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className={`${base} bg-rose-500`}>
        <AlertCircle className="h-4 w-4 text-white" strokeWidth={2.5} />
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className={`${base} bg-slate-300`}>
        <X className="h-4 w-4 text-slate-600" strokeWidth={2.5} />
      </div>
    );
  }

  return (
    <div className={`${base} bg-slate-100`}>
      {ContentIcon ? (
        <ContentIcon className="h-4 w-4 text-slate-400" />
      ) : (
        <span className="h-2 w-2 rounded-full bg-slate-300" />
      )}
    </div>
  );
}

interface ConnectorProps {
  status: StepStatus;
}
function Connector({ status }: ConnectorProps) {
  const filled = status === "complete";
  const active = status === "loading";

  return (
    <div className="relative ml-4 h-full w-0.5 flex-1 bg-slate-200">
      <div
        className={`absolute inset-x-0 top-0 w-full origin-top bg-brand-primary transition-transform duration-500 ease-out ${
          filled ? "scale-y-100" : active ? "scale-y-50" : "scale-y-0"
        }`}
        style={{ height: "100%" }}
      />
    </div>
  );
}

function StepRow({ step }: { step: Step }) {
  const muted = step.status === "pending";

  return (
    <div className="flex items-start justify-between md:w-200">
      <div className="min-w-0">
        <p
          className={`text-sm md:text-2xl font-semibold ${muted ? "text-slate-400" : "text-slate-900"}`}
        >
          {step.title}
        </p>
        <p
          className={`mt-1 text-sm ${muted ? "text-slate-300" : "text-slate-500"}`}
        >
          {step.description}
        </p>

        {step.tags && step.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {step.tags.map((tag, i) => {
              const TagIcon = tag.icon;
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                    muted
                      ? "bg-slate-50 text-slate-400"
                      : "bg-indigo-50 text-indigo-600"
                  }`}
                >
                  {TagIcon && <TagIcon className="h-3 w-3" />}
                  {tag.label}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {step.meta && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm  text-slate-500">
          {step.meta}
        </span>
      )}
    </div>
  );
}

function ActiveStepCard({ step }: { step: Step }) {
  const { title, description, runningNote, progress } = step;
  const cancelled = step.status === "cancelled";

  return (
    <div
      className={`rounded-xl border md:w-200 p-4 ${
        cancelled
          ? "border-slate-200 bg-slate-50"
          : "border-secondary bg-secondary"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p
            className={`text-base font-semibold md:text-3xl ${cancelled ? "text-slate-600" : "text-primary"}`}
          >
            {title}
          </p>
          <span
            className={`rounded-full px-2 py-0.5 text-sm truncate font-medium ${
              cancelled
                ? "bg-slate-200 text-slate-600"
                : "bg-indigo-100 text-primary"
            }`}
          >
            {cancelled ? "Cancelled" : "In Progress"}
          </span>
        </div>
        {!cancelled && runningNote && (
          <span className="text-sm italic text-primary">{runningNote}</span>
        )}
      </div>

      <p
        className={`mt-1 text-sm ${cancelled ? "text-slate-500" : "text-indigo-900/70"}`}
      >
        {description}
      </p>

      {progress && (
        <div className="mt-3 rounded-lg bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-slate-600">{progress.label}</span>
            <span
              className={`font-semibold ${cancelled ? "text-slate-500" : "text-primary"}`}
            >
              {Math.round(progress.percent)}%
              {progress.note ? ` ${progress.note}` : ""}
            </span>
          </div>

          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full rounded-full transition-all duration-300 ease-out ${
                cancelled ? "bg-slate-400" : "bg-primary"
              }`}
              style={{
                width: `${Math.min(100, Math.max(0, progress.percent))}%`,
              }}
            />
          </div>

          {progress.stats && progress.stats.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {progress.stats.map((stat, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1.5 text-sm text-primary"
                >
                  <span className="h-1 w-1 rounded-full bg-primary" />
                  {stat}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export interface StepperProps {
  steps: Step[];
}

export default function Stepper({ steps }: StepperProps) {
  return (
    <ol className="w-full max-w-xl">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;

        return (
          <li key={i} className="relative flex gap-4 pb-8 last:pb-0">
            <div className="flex flex-col items-center">
              <StepIcon status={step.status} icon={step.icon} />
              {!isLast && (
                <div className="mt-1 flex-1">
                  <Connector status={step.status} />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              {step.status === "loading" || step.status === "cancelled" ? (
                <ActiveStepCard step={step} />
              ) : (
                <StepRow step={step} />
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
