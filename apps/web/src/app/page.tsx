"use client";

import UploadScreen from "@/components/upload/UploadScreen";
import ProgressScreen from "@/components/progress/ProgressScreen";
import ResultsScreen from "@/components/results/ResultsScreen";
import { useConversion } from "@/context/ConversionContext";

export default function Home() {
    const { resetKey, activeView, isInitialized } = useConversion();

    if (!isInitialized) {
        return <main className="min-h-[calc(100dvh-140px)] flex flex-col" />;
    }

    return (
        <main className="min-h-[calc(100dvh-140px)] flex flex-col">
            {activeView === "upload" && <UploadScreen key={resetKey} />}
            {activeView === "progress" && <ProgressScreen />}
            {activeView === "result" && <ResultsScreen />}
        </main>
    );
}
