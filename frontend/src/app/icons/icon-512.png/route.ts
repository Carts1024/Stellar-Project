import { ImageResponse } from "next/og";
import { AppIcon } from "@/lib/pwa/icon-template";

export const runtime = "edge";

export function GET() {
  return new ImageResponse(AppIcon({ size: 512 }), {
    width: 512,
    height: 512,
  });
}