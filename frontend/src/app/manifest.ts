import type { MetadataRoute } from "next";
import { pwaConfig } from "@/lib/pwa/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: pwaConfig.name,
    short_name: pwaConfig.shortName,
    description: pwaConfig.description,
    start_url: pwaConfig.startUrl,
    scope: pwaConfig.scope,
    display: "standalone",
    orientation: "portrait",
    background_color: pwaConfig.backgroundColor,
    theme_color: pwaConfig.themeColor,
    categories: ["finance", "productivity", "utilities"],
    icons: [
      {
        src: pwaConfig.icons.icon192,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: pwaConfig.icons.icon192,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: pwaConfig.icons.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: pwaConfig.icons.icon512,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: pwaConfig.screenshots.map((screenshot) => ({
      src: screenshot.src,
      sizes: screenshot.sizes,
      type: screenshot.type,
      label: screenshot.label,
    })),
  };
}