"use client";

import { Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import Image from "next/image";
import Logo from "@/app/assets/logo.png";
import { useConversion } from "@/context/ConversionContext";

export default function Header() {
    const { requestReset } = useConversion();

    return (
        <header className="sticky top-0 w-full py-3 border-b border-muted bg-white z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between">
                    <button className="flex flex-col cursor-pointer" onClick={requestReset}>
                        <Image priority src={Logo} alt="Logo" height={60} />
                    </button>
                    <div className="flex items-center space-x-4">
                        <Button variant="secondary" onClick={requestReset}>
                            <Plus />
                            New <span className="hidden sm:inline">Conversion</span>
                        </Button>
                    </div>
                </div>
            </div>
        </header>
    );
}