import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LayoutShell } from "@/components/layout-shell";
import { pwaConfig } from "@/lib/pwa/constants";

export const metadata: Metadata = {
  applicationName: pwaConfig.name,
  title: {
    default: pwaConfig.name,
    template: `%s | ${pwaConfig.shortName}`,
  },
  description: pwaConfig.description,
  manifest: pwaConfig.manifestPath,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: pwaConfig.shortName,
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    apple: [
      {
        url: pwaConfig.icons.apple,
        sizes: "180x180",
        type: "image/png",
      },
    ],
    icon: [
      {
        url: pwaConfig.icons.icon192,
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: pwaConfig.icons.icon512,
        sizes: "512x512",
        type: "image/png",
      },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: pwaConfig.themeColor,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <LayoutShell>{children}</LayoutShell>
      </body>
    </html>
  );
}
