"use client";

import { useState } from "react";
import { downloadFile } from "@/lib/downloadApi";
import Button from "../ui/Button";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function DownloadButton({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<"idle" | "downloading" | "error">(
    "idle",
  );

  async function handleClick() {
    setStatus("downloading");
    try {
      await downloadFile(jobId);
      setStatus("idle");
    } catch (error) {
      console.error("Download failed:", error);
      setStatus("error");
      toast.error("Download failed", {
        description: "Downloading your file was unsuccessful. Try again.",
      });
    }
  }

  return (
    <div>
      <Button
        variant="primary"
        onClick={handleClick}
        disabled={status === "downloading"}
        className="w-full"
      >
        <Download className="size-4" />
        {status === "downloading" ? "Downloading..." : "Download"}
      </Button>
    </div>
  );
}
