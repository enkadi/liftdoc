import { useEffect, useState } from "react";
import ProgressCard from "./ProgressCard";
import HeaderBar from "./HeaderBar";
import { useConversion } from "@/context/ConversionContext";
import { useJobStatus } from "@/app/hooks/useJobStatus";

const ProgressScreen = () => {
  const { file, session, setActiveView } = useConversion();
  const isActive =
    session?.status === "queued" || session?.status === "processing";
  const { job, notFound } = useJobStatus(isActive ? session.jobId : null);

  const [timeElapsed, setTimeElapsed] = useState(() => {
    if (session?.createdAt) {
      return Math.max(0, Math.floor((Date.now() - session.createdAt) / 1000));
    }
    return 0;
  });

  useEffect(() => {
    if (session?.status === "processing" || session?.status === "queued") {
      const interval = setInterval(() => {
        setTimeElapsed((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [session?.status]);

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