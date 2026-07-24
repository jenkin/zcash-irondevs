import type { Metadata } from "next";
import { Cormorant_Garamond, Lora } from "next/font/google";
import { AudioProvider } from "@/lib/audio-context";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: ["400", "600"],
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Heroes of Z10: Ten years of Zcash, annotated",
  description:
    "A decade of Zcash's git history, read as a dynamic co-authorship network.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${lora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AudioProvider>{children}</AudioProvider>
      </body>
    </html>
  );
}
