export const pwaConfig = {
  name: "Talambag",
  shortName: "Talambag",
  description: "Transparent pooled contributions on Soroban.",
  backgroundColor: "#f7f2e8",
  themeColor: "#0f766e",
  manifestPath: "/manifest.webmanifest",
  offlinePath: "/offline",
  startUrl: "/",
  scope: "/",
  icons: {
    apple: "/icons/apple-touch-icon.png",
    icon192: "/icons/icon-192.png",
    icon512: "/icons/icon-512.png",
  },
  screenshots: [
    {
      src: "/screenshots/dashboard-overview.png",
      sizes: "1904x900",
      type: "image/png",
      label: "Talambag dashboard overview",
    },
    {
      src: "/screenshots/pool-page.png",
      sizes: "1904x897",
      type: "image/png",
      label: "Talambag pool page",
    },
  ],
} as const;

export type PwaIconPath = (typeof pwaConfig.icons)[keyof typeof pwaConfig.icons];