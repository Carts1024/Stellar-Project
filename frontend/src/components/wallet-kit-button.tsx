"use client";

import { useEffect, useRef } from "react";
import { mountWalletKitButton } from "@/lib/wallet-kit";

export function WalletKitButton() {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const currentContainer = containerRef.current;

    if (!currentContainer) {
      return;
    }

    const containerElement: HTMLElement = currentContainer;

    let isDisposed = false;

    async function renderButton() {
      try {
        await mountWalletKitButton(containerElement);
        if (isDisposed) {
          containerElement.replaceChildren();
        }
      } catch {
        containerElement.replaceChildren();
      }
    }

    void renderButton();

    return () => {
      isDisposed = true;
      containerElement.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} className="wallet-kit-button-slot" />;
}