"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { ConversionSession } from "@/lib/conversionSession";

interface AbandonSessionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    session: ConversionSession | null;
}

export function getAbandonModalContent(session: ConversionSession | null) {
    const fileName = session?.fileName || "your document";
    const status = session?.status;

    if (status === "processing" || status === "queued") {
        return {
            title: "Conversion In Progress",
            description: `You have an active conversion in progress for "${fileName}". Starting a new conversion will abandon your current progress.`,
            confirmText: "Abandon & Restart",
        };
    }

    if (status === "done") {
        return {
            title: "Converted File Available",
            description: `You have a converted file ("${fileName}"), make sure you have downloaded it before starting a new conversion. Proceeding will abandon this converted file.`,
            confirmText: "Abandon & Start New",
        };
    }

    if (status === "failed") {
        return {
            title: "Previous Conversion Failed",
            description: `Your conversion for "${fileName}" failed. Do you want to restart the conversion?`,
            confirmText: "Restart Conversion",
        };
    }

    return {
        title: "Abandon Active Session?",
        description: `You have an active session for "${fileName}". Are you sure you want to abandon it and start a new conversion?`,
        confirmText: "Abandon & Start New",
    };
}

export default function AbandonSessionModal({
    isOpen,
    onClose,
    onConfirm,
    session,
}: AbandonSessionModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const previousActiveElementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen || !session) return;

        previousActiveElementRef.current = document.activeElement as HTMLElement;

        const focusableSelector =
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

        const timer = setTimeout(() => {
            if (!modalRef.current) return;
            const focusables = Array.from(
                modalRef.current.querySelectorAll<HTMLElement>(focusableSelector)
            );
            if (focusables.length > 0) {
                focusables[0].focus();
            } else {
                modalRef.current.focus();
            }
        }, 0);

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
                return;
            }

            if (e.key === "Tab" && modalRef.current) {
                const focusables = Array.from(
                    modalRef.current.querySelectorAll<HTMLElement>(focusableSelector)
                );
                if (focusables.length === 0) return;

                const firstElement = focusables[0];
                const lastElement = focusables[focusables.length - 1];

                if (e.shiftKey) {
                    if (
                        document.activeElement === firstElement ||
                        !modalRef.current.contains(document.activeElement)
                    ) {
                        e.preventDefault();
                        lastElement.focus();
                    }
                } else {
                    if (
                        document.activeElement === lastElement ||
                        !modalRef.current.contains(document.activeElement)
                    ) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);

        return () => {
            clearTimeout(timer);
            window.removeEventListener("keydown", handleKeyDown);
            if (
                previousActiveElementRef.current &&
                typeof previousActiveElementRef.current.focus === "function"
            ) {
                previousActiveElementRef.current.focus();
            }
        };
    }, [isOpen, session, onClose]);

    if (!isOpen || !session) return null;

    const { title, description, confirmText } = getAbandonModalContent(session);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/50 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={onClose}
            data-testid="abandon-session-modal-backdrop"
        >
            <div
                ref={modalRef}
                tabIndex={-1}
                className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl border border-muted p-6 space-y-6 sm:p-8 animate-in zoom-in-95 duration-200 focus:outline-none max-h-[90dvh] overflow-y-auto overflow-x-hidden"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="abandon-modal-title"
                aria-describedby="abandon-modal-description"
                data-testid="abandon-session-modal"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
                    aria-label="Close modal"
                >
                    <X className="size-5" />
                </button>

                <div className="flex items-start gap-4 min-w-0">
                    <div className="size-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200 mt-0.5">
                        <AlertTriangle className="size-6" />
                    </div>
                    <div className="space-y-2 flex-1 min-w-0 pr-4">
                        <h2
                            id="abandon-modal-title"
                            className="text-xl font-bold text-foreground font-sans text-wrap"
                        >
                            {title}
                        </h2>
                        <p
                            id="abandon-modal-description"
                            className="text-sm text-muted-foreground leading-relaxed wrap-break-word"
                        >
                            {description}
                        </p>
                    </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-2 border-t border-muted">
                    <Button variant="secondary" onClick={onClose} className="w-full sm:w-auto">
                        Keep Session
                    </Button>
                    <Button variant="danger" onClick={onConfirm} className="w-full sm:w-auto">
                        {confirmText}
                    </Button>
                </div>
            </div>
        </div>
    );
}