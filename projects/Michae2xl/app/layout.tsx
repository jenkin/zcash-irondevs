import type { Metadata } from "next";
import { Cormorant_Garamond, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const assetPath = (path: string) => `${BASE_PATH}${path}`;

const display = Cormorant_Garamond({
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
  metadataBase: new URL("https://michae2xl.github.io"),
  title: "From Iron to Code | Zcash, 2013–2026",
  description:
    "An interactive history from Zerocoin to Ironwood, told through the machines, people and protocols that shaped Zcash.",
  icons: {
    icon: assetPath("/favicon.svg"),
    shortcut: assetPath("/favicon.svg"),
  },
  openGraph: {
    title: "From Iron to Code",
    description: "From Zerocoin to Ironwood: the Zcash story, 2013–2026.",
    images: [
      {
        url: assetPath("/machine-evolution.png"),
        width: 1909,
        height: 824,
        alt: "Writing machines evolving from a cast-iron typewriter to a compact coding keyboard",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "From Iron to Code",
    description: "From Zerocoin to Ironwood: the Zcash story, 2013–2026.",
    images: [assetPath("/machine-evolution.png")],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href={assetPath("/ironwood-finale.png")} />
      </head>
      <body className={`${display.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
