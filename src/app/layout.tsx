import type { Metadata, Viewport } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { PwaInit } from "@/components/pwa-init";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-heading",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorkShare Web",
  description: "Desktop overview for WorkShare projects and team operations.",
  applicationName: "WorkShare",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/workshare-logo.png", sizes: "1024x1024", type: "image/png" }],
    apple: [{ url: "/workshare-logo.png", sizes: "1024x1024", type: "image/png" }],
    shortcut: ["/workshare-logo.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WorkShare",
  },
};

export const viewport: Viewport = {
  themeColor: "#5a78a8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de">
      <body className={`${manrope.variable} ${spaceGrotesk.variable}`}>
        <PwaInit />
        {children}
      </body>
    </html>
  );
}
