"use client";

import { appConfig } from "@/lib/config";
import type { TxFeedback } from "@/lib/types";

type FeedbackBannerProps = {
  feedback: TxFeedback;
};

export function FeedbackBanner({ feedback }: FeedbackBannerProps) {
  if (feedback.state === "idle") return null;

  function explorerLink(hash?: string) {
    if (!hash) return null;
    return `${appConfig.explorerUrl}/tx/${hash}`;
  }

  return (
    <section className={`feedback-card ${feedback.state}`}>
      <div>
        <h2>{feedback.title}</h2>
        {feedback.detail ? <p>{feedback.detail}</p> : null}
      </div>
      {feedback.hash ? (
        <a
          href={explorerLink(feedback.hash) ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="inline-link"
        >
          View transaction
        </a>
      ) : null}
    </section>
  );
}
