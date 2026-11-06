import { Result } from "effect";
import { InvalidArgument } from "../errors/errors.js";
import { placeMovedTask } from "./place-moved-task.js";

export type ColumnTask = {
  readonly id: string;
  readonly position: number | null;
};

export type Anchor = {
  readonly id: string;
  readonly placement: "before" | "after";
};

export type TaskReorderPlan = {
  readonly order: ReadonlyArray<string>;
  readonly changes: ReadonlyArray<{
    readonly id: string;
    readonly position: number;
  }>;
};

const missing = (what: string) =>
  Result.fail(
    new InvalidArgument({
      message: `${what} is not in this column.`,
      hint: "Archived and planned tasks have no place in a column.",
    }),
  );

/**
 * Moves `ids` to the top of `column`, or next to `anchor`, the way dragging
 * them one after another would: each is placed with the web board's rule and
 * only rows whose position changed are returned. `column` is in server order.
 */
export function planTaskReorder(
  column: ReadonlyArray<ColumnTask>,
  ids: ReadonlyArray<string>,
  anchor?: Anchor,
): Result.Result<TaskReorderPlan, InvalidArgument> {
  const present = new Set(column.map((task) => task.id));
  if (ids.some((id) => !present.has(id))) return missing("A listed task");
  if (anchor && !present.has(anchor.id)) return missing("The anchor task");

  const moving = new Set(ids);
  const working: { id: string; position: number | null }[] = column
    .filter((task) => !moving.has(task.id))
    .map(({ id, position }) => ({ id, position }));
  const anchorIndex = anchor
    ? working.findIndex((task) => task.id === anchor.id)
    : -1;
  const start = !anchor
    ? 0
    : anchor.placement === "before"
      ? anchorIndex
      : anchorIndex + 1;
  ids.forEach((id, offset) => {
    working.splice(start + offset, 0, { id, position: null });
    placeMovedTask(working, start + offset);
  });

  const order = working.map((task) => task.id);
  // Same order means nothing to write, even if a drop would shift positions.
  if (order.every((id, i) => id === column[i]?.id)) {
    return Result.succeed({ order, changes: [] });
  }
  const before = new Map(column.map((task) => [task.id, task.position]));
  return Result.succeed({
    order,
    changes: working.flatMap((task) =>
      before.get(task.id) === task.position
        ? []
        : [{ id: task.id, position: task.position ?? 0 }],
    ),
  });
}
