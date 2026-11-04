import type { Metadata } from "next";
import Script from "next/script";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Ten Years of Zcash · Co-authorship Network",
  description:
    "A decade of Zcash development as a dynamic co-authorship network, animated, interactive, built from the git history of the ecosystem.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${mono.variable} h-full antialiased`}>
      <body className="h-full overflow-hidden">
        {/* apply a saved theme before paint so light mode never flashes dark */}
        <Script id="theme-init" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem('ironwood-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
