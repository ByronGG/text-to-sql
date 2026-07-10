import { describe, expect, it } from "vitest";
import { EVAL_CASES, JOIN_EVAL_CASES, type EvalCase } from "@/lib/eval-cases";

const ALL = [...EVAL_CASES, ...JOIN_EVAL_CASES];

describe("eval-cases data integrity", () => {
  it("has unique case ids", () => {
    const ids = ALL.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every case a non-empty question and note", () => {
    for (const c of ALL) {
      expect(c.question.trim().length).toBeGreaterThan(0);
      expect(c.note.trim().length).toBeGreaterThan(0);
    }
  });

  it("has at least one expected row for every result case", () => {
    for (const c of ALL) {
      if (c.expected.kind === "result") {
        expect(c.expected.rows.length).toBeGreaterThan(0);
      }
    }
  });

  // The comparator's exact-mode match is a *greedy* bijection, which is only
  // correct when the expected values within a case are distinct (no ambiguity
  // over which row satisfies which spec). Guard that invariant in the data.
  it("keeps expected values distinct within each exact-mode case", () => {
    const exactCases = ALL.filter(
      (c): c is EvalCase & { expected: { kind: "result" } } =>
        c.expected.kind === "result" && (c.expected.mode ?? "exact") === "exact",
    );
    for (const c of exactCases) {
      const flattened = c.expected.rows.flatMap((r) => Object.values(r).map(String));
      expect(new Set(flattened).size, `duplicate expected value in "${c.id}"`).toBe(flattened.length);
    }
  });
});
