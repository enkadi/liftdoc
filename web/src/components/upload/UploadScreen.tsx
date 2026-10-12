"use client";

import { useRef, useState, useEffect } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import DropZone, { DropZoneHandle } from "@/components/upload/DropZone";
import { FileText, ArrowLeftRight, Trash, CheckCircle, ArrowRight, FileCheck, CheckCircle2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Accordion, { AccordionItem } from "@/components/ui/Accordion";
import { useConversion } from "@/context/ConversionContext";
import { toast } from "sonner";

import PreservationCard from "@/components/upload/PreservationCard";
import { preservationData } from "@/data/preservationData";

GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
).toString();

function formatFileSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function getPdfPageCount(file: File): Promise<number | null> {
    try {
        const data = new Uint8Array(await file.arrayBuffer());
        const loadingTask = getDocument({ data });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;
        await loadingTask.destroy?.();
        return numPages;
    } catch (error) {
        console.error("Failed to read PDF page count:", error);
        return null;
    }
}

export default function UploadScreen() {
    const { file: uploadedFile, setFile: setUploadedFile, clearFile, startConversion, isUploading } = useConversion();
    const dropZoneRef = useRef<DropZoneHandle>(null);
    const [pageCount, setPageCount] = useState<number | null>(null);

    useEffect(() => {
        if (!uploadedFile) return;

        let isMounted = true;
        getPdfPageCount(uploadedFile).then((count) => {
            if (!isMounted) return;

            if (count === 0) {
                toast.error("Empty PDF", {
                    description: "The uploaded PDF contains no pages.",
                });
                setPageCount(null);
                setUploadedFile(null);
                dropZoneRef.current?.clearFile();
                return;
            }

            setPageCount(count);
        });
        return () => {
            isMounted = false;
        };
    }, [uploadedFile, setUploadedFile]);

    const handleFileDrop = (file: File) => {
        setPageCount(null);
        setUploadedFile(file);
    };

    const handleRemoveFile = () => {
        const fileName = uploadedFile?.name;
        setPageCount(null);
        clearFile();
        dropZoneRef.current?.clearFile();
        toast.info("File removed", {
            description: fileName ? `${fileName} has been removed.` : "The selected file has been removed.",
        });
    };

    return (
        <div className="flex-1 space-y-4 p-4">
            <div className="mt-2 max-w-2xl text-center mx-auto space-y-3">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground font-heading">
                    Transform Your PDF into Editable Word Documents
                </h1>
                <p className="text-md sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
                    Convert digital PDFs into editable Word documents while preserving text, structure, formatting, images, tables, and reading order.
                </p>
            </div>
            {/* Upload Zone */}
            <div className="bg-card w-full mx-auto max-w-4xl flex flex-col space-y-6 p-6 sm:p-8 mb-10 rounded-2xl border border-primary-background">
                <DropZone ref={dropZoneRef} onDrop={handleFileDrop}>
                    <div className="relative mb-3">
                        <div className="size-16 sm:size-20 rounded-2xl bg-primary-background border border-primary/20 flex items-center justify-center text-primary shadow-2xs group-hover:scale-105 group-hover:bg-primary/60 group-hover:text-white transition-all duration-300">
                            <FileText className="size-8 sm:size-10" />
                        </div>
                        <div className="absolute -bottom-1 -right-1 size-7 rounded-full bg-primary text-white flex items-center justify-center border-2 border-white group-hover:bg-primary/90 transition-colors">
                            <ArrowLeftRight className="size-3" />
                        </div>
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-foreground font-sans group-hover:text-primary transition-colors">
                        Drag & drop your PDF here
                    </h3>
                    <p className="text-sm sm:text-md text-muted-foreground mt-1 max-w-sm">
                        Support for digital text layer PDFs with full layout preservation
                    </p>
                </DropZone>

                <div className="w-full flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-2.5 px-4 bg-secondary border border-muted rounded-xl text-sm sm:text-md text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-primary shrink-0"></span>
                        <span>Supported: <strong className="font-semibold text-foreground">PDF only (.pdf)</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-primary shrink-0"></span>
                        <span>Limit: <strong className="font-semibold text-foreground">Up to 10 MB</strong></span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-primary shrink-0"></span>
                        <span>Source: <strong className="font-semibold text-foreground">Digital text layer</strong></span>
                    </div>
                </div>

                {uploadedFile && (
                    <div className="w-full flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-primary rounded-xl">
                        <div className="flex flex-row items-center space-x-3 sm:space-x-4 min-w-0 w-full sm:w-auto flex-1">
                            <div className="size-12 rounded-xl bg-primary-background text-primary flex items-center justify-center shrink-0">
                                <FileText className="size-6 text-primary" />
                            </div>
                            <div className="flex-1 flex flex-col space-y-1 min-w-0">
                                <h1 className="text-base sm:text-lg font-semibold truncate">{uploadedFile.name}</h1>
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs bg-primary-background font-medium rounded-md px-2 py-1 text-primary">
                                        PDF Selected
                                    </span>
                                    <p className="text-xs sm:text-sm text-muted-foreground">
                                        {formatFileSize(uploadedFile.size)}
                                        {pageCount !== null && ` • ${pageCount} ${pageCount === 1 ? "page" : "pages"}`}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <Button variant="danger" size="sm" onClick={handleRemoveFile} className="w-full sm:w-auto justify-center">
                            <Trash className="size-4" />
                            <span>Remove File</span>
                        </Button>
                    </div>
                )}

                <Button
                    size="lg"
                    disabled={!uploadedFile || isUploading}
                    loading={isUploading}
                    loadingText="Starting Conversion..."
                    onClick={() => startConversion()}
                    className="w-full"
                >
                    <span>Convert to Word (.docx)</span>
                    <ArrowRight className="size-4" />
                </Button>
            </div>

            {/* Valid Files Accordion */}
            <Accordion className="w-full pt-1">
                <AccordionItem
                    title={
                        <span className="flex items-center gap-2 font-regular text-foreground">
                            <FileCheck className="size-4 text-primary shrink-0" />
                            <span>Valid files you can upload for conversion</span>
                        </span>
                    }
                    defaultOpen={false}
                    className="bg-white border-primary max-w-4xl mx-auto"
                >
                    <ul className="space-y-2.5 pt-2 text-xs sm:text-sm text-muted-foreground">
                        <li className="flex items-start gap-2.5">
                            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold text-foreground">File Format:</strong> Standard PDF documents only (<code>.pdf</code> extension).
                            </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold text-foreground">Digital Text Layer:</strong> Must contain selectable, highlightable text (born-digital PDFs, not scanned image-only documents).
                            </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold text-foreground">File Size:</strong> File size must not exceed <strong className="font-semibold text-foreground">10 MB</strong>.
                            </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold text-foreground">No Password / Encryption:</strong> The PDF must be unencrypted and not password-protected.
                            </span>
                        </li>
                        <li className="flex items-start gap-2.5">
                            <CheckCircle2 className="size-4 text-primary shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold text-foreground">Page Count:</strong> Document must have at least 1 readable page.
                            </span>
                        </li>
                    </ul>
                </AccordionItem>
            </Accordion>
                
            {/* Bottom Section: What DocLift Preserves */}
            <section
                aria-labelledby="preserves-heading"
                className="w-full mx-auto flex flex-col space-y-6 sm:p-8 p-5 bg-white border border-primary-background rounded-2xl"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex flex-col space-y-1">
                        <h2
                            id="preserves-heading"
                            className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 font-heading"
                        >
                            What DocLift Preserves
                        </h2>
                        <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
                            Unlike generic OCR or naive converters that dump arbitrary text frames, DocLift reconstructs the logical semantic tree of your document.
                        </p>
                    </div>

                    <div className="shrink-0 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-success text-xs sm:text-sm font-semibold self-start sm:self-center">
                        <CheckCircle className="size-4 text-success shrink-0" />
                        <span>99.8% Word Style Parity</span>
                    </div>
                </div>

                {/* Bottom Section Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {preservationData.map((item) => (
                        <PreservationCard
                            key={item.id}
                            item={item}
                        />
                    ))}
                </div>
            </section>
        </div>
    );
}