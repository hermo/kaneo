import { Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { planTaskReorder } from "./plan-task-reorder.js";

const task = (id: string, position: number | null) => ({
  id,
  position,
  status: "to-do",
});
const dense = (...ids: string[]) => ids.map((id, i) => task(id, i + 1));
const plan = (...args: Parameters<typeof planTaskReorder>) =>
  Result.getOrThrow(planTaskReorder(...args));

// Expected values follow the web board's drag: each moved task is placed with
// placeMovedTask, and only rows whose position changed are written.
describe("planTaskReorder", () => {
  const board = dense("a", "b", "c", "d");

  it("drops one task at the top like a drag: only that row is written", () => {
    expect(plan(board, ["c"])).toEqual({
      order: ["c", "a", "b", "d"],
      changes: [{ id: "c", position: 0 }],
    });
  });

  it("places a block at the top one task after another; a row that lands where it was is not written", () => {
    expect(plan(board, ["c", "a"])).toEqual({
      order: ["c", "a", "b", "d"],
      changes: [{ id: "c", position: 0 }],
    });
  });

  it("shifts the next row when a drop has no gap, like a drag", () => {
    expect(plan(board, ["a"], { id: "c", placement: "after" })).toEqual({
      order: ["b", "c", "a", "d"],
      changes: [
        { id: "a", position: 4 },
        { id: "d", position: 5 },
      ],
    });
  });

  it("lands in a gap without touching its neighbours", () => {
    const gapped = [task("a", 1), task("b", 10), task("c", 20)];
    expect(plan(gapped, ["c"], { id: "a", placement: "after" })).toEqual({
      order: ["a", "c", "b"],
      changes: [{ id: "c", position: 5 }],
    });
  });

  it("appends a block after the last task", () => {
    expect(plan(board, ["a", "b"], { id: "d", placement: "after" })).toEqual({
      order: ["c", "d", "a", "b"],
      changes: [
        { id: "a", position: 5 },
        { id: "b", position: 6 },
      ],
    });
  });

  it("places before an anchor, shifting the shorter side", () => {
    expect(plan(board, ["d"], { id: "b", placement: "before" })).toEqual({
      order: ["a", "d", "b", "c"],
      changes: [
        { id: "a", position: 0 },
        { id: "d", position: 1 },
      ],
    });
  });

  it("writes nothing when the order already matches", () => {
    expect(plan(board, ["a", "b"])).toEqual({
      order: ["a", "b", "c", "d"],
      changes: [],
    });
  });

  it("gives an unpositioned task its first position and leaves nulls alone", () => {
    const nulls = [task("a", null), task("b", null)];
    expect(plan(nulls, ["b"])).toEqual({
      order: ["b", "a"],
      changes: [{ id: "b", position: 0 }],
    });
  });

  it("orders tasks that never had distinct positions", () => {
    const ties = [
      task("t0", 0),
      task("t1", 0),
      task("t2", 0),
      task("t3", null),
    ];
    expect(plan(ties, ["t1"])).toEqual({
      order: ["t1", "t0", "t2", "t3"],
      changes: [
        { id: "t0", position: 1 },
        { id: "t2", position: 2 },
        { id: "t3", position: 3 },
      ],
    });
  });

  it("spaces out a long dense column once, as the web board does", () => {
    const long = Array.from({ length: 40 }, (_, i) => task(`t${i}`, i));
    const result = plan(long, ["t39"]);
    expect(result.order[0]).toBe("t39");
    expect(result.changes).toHaveLength(40);
    expect(result.changes.slice(0, 3)).toEqual([
      { id: "t39", position: 1024 },
      { id: "t0", position: 2048 },
      { id: "t1", position: 3072 },
    ]);
  });

  it("rejects tasks that are not in the column", () => {
    const missing = planTaskReorder(board, ["x"]);
    expect(Result.isFailure(missing) && missing.failure.message).toBe(
      "A listed task is not in this column.",
    );
    expect(
      Result.isFailure(
        planTaskReorder(board, ["a"], { id: "x", placement: "after" }),
      ),
    ).toBe(true);
  });
});
