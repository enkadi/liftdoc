import { useEffect } from "react";
import ProgressCard from "./ProgressCard";
import HeaderBar from "./HeaderBar";
import { useConversion } from "@/context/ConversionContext";
import { useJobStatus } from "@/app/hooks/useJobStatus";

const ProgressScreen = () => {
  const { file, session, setActiveView, timeElapsed } = useConversion();
  const isActive =
    session?.status === "queued" || session?.status === "processing";
  const { job, notFound } = useJobStatus(isActive ? session.jobId : null);

  const timeRemaining =
    session?.status === "done" ? 0 : (job?.estimatedRemainingSeconds ?? null);

  useEffect(() => {
    if (session?.status === "done") {
      const timer = setTimeout(() => {
        setActiveView("result");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [session?.status, setActiveView]);

  const isFailed = session?.status === "failed";

  return (
    <div className="w-full flex-1 px-4 py-2">
      {!isFailed && (
        <HeaderBar
          file={file}
          timeElapsed={timeElapsed}
          timeRemaining={timeRemaining}
        />
      )}
      <ProgressCard job={job} notFound={notFound} />
    </div>
  );
};

export default ProgressScreen;