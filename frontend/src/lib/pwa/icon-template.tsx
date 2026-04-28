import type { ReactElement } from "react";

type AppIconProps = {
  size: number;
};

const BASE_RADIUS_RATIO = 0.22;
const BORDER_RATIO = 0.018;
const INSET_RATIO = 0.085;

export function AppIcon({ size }: AppIconProps): ReactElement {
  const radius = Math.round(size * BASE_RADIUS_RATIO);
  const inset = Math.round(size * INSET_RATIO);
  const borderWidth = Math.max(3, Math.round(size * BORDER_RATIO));
  const accentSize = Math.round(size * 0.18);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius,
        background:
          "linear-gradient(160deg, #0f766e 0%, #0b4f4b 55%, #17251f 100%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: inset,
          borderRadius: Math.round(radius * 0.82),
          border: `${borderWidth}px solid rgba(255, 248, 237, 0.34)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: Math.round(size * 0.1),
          left: Math.round(size * 0.12),
          width: Math.round(size * 0.72),
          height: Math.round(size * 0.72),
          borderRadius: size,
          background:
            "radial-gradient(circle, rgba(209, 154, 42, 0.95) 0%, rgba(209, 154, 42, 0.18) 42%, rgba(209, 154, 42, 0) 72%)",
          opacity: 0.5,
        }}
      />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff8ed",
          fontSize: Math.round(size * 0.5),
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: -Math.round(size * 0.025),
          textShadow: "0 10px 26px rgba(0, 0, 0, 0.26)",
        }}
      >
        T
      </div>
      <div
        style={{
          position: "absolute",
          right: Math.round(size * 0.16),
          bottom: Math.round(size * 0.16),
          width: accentSize,
          height: accentSize,
          borderRadius: accentSize,
          background: "#d19a2a",
          boxShadow: `0 0 0 ${Math.max(4, Math.round(size * 0.02))}px rgba(255, 248, 237, 0.18)`,
        }}
      />
    </div>
  );
}