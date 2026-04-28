import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/pwa/icon-template";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(AppIcon({ size: 192 }), {
    width: 192,
    height: 192,
  });
}