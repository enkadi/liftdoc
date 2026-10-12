"use client";

import { useState, useId, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AccordionItemProps {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  className,
  headerClassName,
  contentClassName,
}: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const id = useId();
  const headerId = `accordion-header-${id}`;
  const panelId = `accordion-panel-${id}`;

  return (
    <div
      className={cn(
        "rounded-xl border border-primary bg-card overflow-hidden transition-all",
        className,
      )}
    >
      <h3>
        <button
          id={headerId}
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            "flex w-full items-center justify-between p-4 text-left font-medium text-foreground transition-all hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer",
            headerClassName,
          )}
        >
          <span className="text-sm sm:text-base font-semibold">{title}</span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
              isOpen && "rotate-180 text-primary",
            )}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0 pointer-events-none",
        )}
      >
        <div className="overflow-hidden">
          <div
            className={cn(
              "p-4 pt-1 text-sm text-muted-foreground border-t border-border/50",
              contentClassName,
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface AccordionProps {
  children: ReactNode;
  className?: string;
}

export default function Accordion({ children, className }: AccordionProps) {
  return <div className={cn("space-y-3", className)}>{children}</div>;
}
