import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { OwnerQuestion } from "@/lib/api-contract";
import { OwnerQuestions } from "./owner-questions";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const question: OwnerQuestion = {
  id: 9,
  kind: "listing_match",
  source: "tripadvisor",
  prompt: "Which Tripadvisor listing belongs to this Restaurant?",
  candidates: [{
    placeRef: "/Restaurant_Review-g1-d1-Reviews.html",
    name: "Casa do Bacalhau",
    url: "https://www.tripadvisor.com/Restaurant_Review-g1-d1-Reviews.html",
    evidence: { distanceMeters: null, phoneMatch: null, nameSimilarity: 0.91 },
  }],
};

describe("OwnerQuestions", () => {
  it("shows candidate evidence and lets the owner choose or reject all matches", () => {
    const html = renderToStaticMarkup(createElement(OwnerQuestions, { slug: "casa-do-bacalhau", questions: [question] }));
    expect(html).toContain("Casa do Bacalhau");
    expect(html).toContain("Name match 91%");
    expect(html).toContain("Distance unavailable");
    expect(html).toContain("Phone match unavailable");
    expect(html).toContain("Use this listing");
    expect(html).toContain("Neither is the right listing");
  });

  it("shows the proposed Format and lets the owner keep it", () => {
    const formatQuestion: OwnerQuestion = {
      id: 10,
      kind: "format",
      source: "google",
      prompt: "Google categorizes this Restaurant as a seafood restaurant; Reviews suggest tasca. Keep this proposed Format?",
      proposedFormat: "tasca",
      googleCategory: "Seafood restaurant",
    };
    const html = renderToStaticMarkup(createElement(OwnerQuestions, { slug: "casa-do-bacalhau", questions: [formatQuestion] }));
    expect(html).toContain("Proposed Format:");
    expect(html).toContain("Keep proposed Format");
    expect(html).toContain("seafood restaurant");
  });

  it("shows a proposed Change point with an editable date and both owner answers", () => {
    const changeQuestion: OwnerQuestion = {
      id: 11, kind: "change_point", prompt: "Did this Restaurant change around 2025-05-01?",
      proposedKind: "renovated", proposedDate: "2025-05-01", reason: "mentions", mentionCount: 3,
    };
    const html = renderToStaticMarkup(createElement(OwnerQuestions, { slug: "casa-do-bacalhau", questions: [changeQuestion] }));
    expect(html).toContain("Renovated");
    expect(html).toContain('type="date"');
    expect(html).toContain('value="2025-05-01"');
    expect(html).toContain("Confirm and re-judge");
    expect(html).toContain("Reject proposal");
  });
});
