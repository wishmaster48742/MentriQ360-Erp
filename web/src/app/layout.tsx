import type { Metadata } from "next";

import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Mentriq360 ERP",
  description: "Role-based school ERP for admissions, attendance, academics, results, resources, admit cards, fees, and reporting.",
  applicationName: "Mentriq360 ERP",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.png",
    apple: "/icon-192.png"
  },
  openGraph: {
    title: "Mentriq360 ERP",
    description: "Role-based school ERP for admissions, attendance, academics, fees, operations, and reporting.",
    images: ["/icon-512.png"],
  },
  appleWebApp: {
    capable: true,
    title: "Mentriq360 ERP",
    statusBarStyle: "default"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#2857d8"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className="bg-page antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
