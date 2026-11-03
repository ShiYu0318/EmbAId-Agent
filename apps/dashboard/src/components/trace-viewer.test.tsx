import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TraceViewer } from "@/components/trace-viewer";
import { I18nProvider } from "@/lib/i18n";
import type { RetrievalTrace } from "@/lib/api/types";

const baseTrace: RetrievalTrace = {
  original_query: "退貨政策是什麼",
  rewritten_query: "貴公司的退貨政策內容",
  cache_hit: false,
  cache_similarity: null,
  vector_hits: [{ chunk_id: "chunk_a", document_id: "doc_a", score: 0.82, rank: 0 }],
  lexical_hits: [{ chunk_id: "chunk_b", document_id: "doc_b", score: 0.4, rank: 0 }],
  fused_hits: [
    {
      chunk_id: "chunk_a",
      document_id: "doc_a",
      rrf_score: 0.031,
      score: 0.82,
      vector_rank: 0,
      lexical_rank: null,
      trust_score: 1,
      is_stale: false,
    },
  ],
  reranked_hits: [{ chunk_id: "chunk_a", document_id: "doc_a", rerank_score: 0.91 }],
  confidence_score: 0.91,
  confidence_threshold: 0.35,
  answered: true,
  refusal_reason: null,
  timings_ms: { embed: 12.4, rerank: 30.1 },
};

function renderTrace(trace: RetrievalTrace) {
  // The assertions read the Traditional Chinese copy; pin it instead of following the browser.
  window.localStorage.setItem("embaid.locale", "zh-TW");
  return render(
    <I18nProvider>
      <TraceViewer trace={trace} />
    </I18nProvider>,
  );
}

describe("TraceViewer", () => {
  it("renders the original and rewritten queries", () => {
    renderTrace(baseTrace);
    expect(screen.getByText("退貨政策是什麼")).toBeInTheDocument();
    expect(screen.getByText("貴公司的退貨政策內容")).toBeInTheDocument();
  });

  it("shows an answered decision above threshold", () => {
    renderTrace(baseTrace);
    expect(screen.getByText("已回答")).toBeInTheDocument();
    expect(screen.getByText("高於門檻")).toBeInTheDocument();
  });

  it("shows a refusal below threshold", () => {
    renderTrace({
      ...baseTrace,
      answered: false,
      confidence_score: 0.1,
      refusal_reason: "no relevant content",
    });
    expect(screen.getByText("已拒答")).toBeInTheDocument();
    expect(screen.getByText("低於門檻")).toBeInTheDocument();
  });

  it("renders per-stage timings", () => {
    renderTrace(baseTrace);
    expect(screen.getByText("embed")).toBeInTheDocument();
    expect(screen.getByText("rerank")).toBeInTheDocument();
  });
});
