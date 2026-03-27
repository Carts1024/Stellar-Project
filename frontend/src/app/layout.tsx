import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Talambag",
  description: "Transparent pooled contributions on Soroban.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
