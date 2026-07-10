import { describe, expect, it } from "vitest";
import { addCard, moveCard, removeById, type PinnedCard } from "@/lib/dashboard-store";

const card = (id: string): PinnedCard => ({
  id,
  question: `q${id}`,
  interpretation: "",
  sql: "SELECT 1",
  result: { columns: [], rows: [], rowCount: 0, truncated: false },
});

const ids = (list: PinnedCard[]) => list.map((c) => c.id);

describe("addCard", () => {
  it("appends a new card", () => {
    expect(ids(addCard([card("a")], card("b")))).toEqual(["a", "b"]);
  });

  it("is idempotent — a card already pinned is not added twice", () => {
    const list = [card("a")];
    expect(addCard(list, card("a"))).toBe(list);
  });
});

describe("removeById", () => {
  it("removes the matching card", () => {
    expect(ids(removeById([card("a"), card("b")], "a"))).toEqual(["b"]);
  });

  it("is a no-op for an unknown id", () => {
    expect(ids(removeById([card("a")], "z"))).toEqual(["a"]);
  });
});

describe("moveCard", () => {
  const list = [card("a"), card("b"), card("c")];

  it("moves a card earlier", () => {
    expect(ids(moveCard(list, "b", -1))).toEqual(["b", "a", "c"]);
  });

  it("moves a card later", () => {
    expect(ids(moveCard(list, "b", 1))).toEqual(["a", "c", "b"]);
  });

  it("is a no-op past the start", () => {
    expect(moveCard(list, "a", -1)).toBe(list);
  });

  it("is a no-op past the end", () => {
    expect(moveCard(list, "c", 1)).toBe(list);
  });

  it("is a no-op for an unknown id", () => {
    expect(moveCard(list, "z", 1)).toBe(list);
  });

  it("does not mutate the input", () => {
    const original = [...list];
    moveCard(list, "b", 1);
    expect(list).toEqual(original);
  });
});
