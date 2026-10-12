import type { Metadata } from "next";
import { DM_Serif_Display, Inter_Tight } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/Toaster";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { ConversionProvider } from "@/context/ConversionContext";

const dmSerif = DM_Serif_Display({
  variable: "--font-heading-serif",
  subsets: ["latin"],
  weight: "400",
});

const inter = Inter_Tight({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `DocLift`,
  description: "Convert your PDF files to Word documents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        dmSerif.variable,
        "font-sans",
        inter.variable,
      )}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <ConversionProvider>
          <Header />
          {children}
          <Footer />
          <Toaster />
        </ConversionProvider>
      </body>
    </html>
  );
}
