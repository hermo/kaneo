import { Effect, Option } from "effect";
import { Argument, Command, Flag } from "effect/cli";
import { reorderTasks } from "../../api/task-reorder.js";
import { resolveBulkTasks } from "../../bulk/resolve-bulk-tasks.js";
import { Conflict, InvalidArgument } from "../../errors/errors.js";
import { emit } from "../../output/emit.js";
import { withSpinner } from "../../output/spinner.js";
import { planTaskReorder } from "../../tasks/plan-task-reorder.js";
import { renderTaskReorder } from "../../tasks/render-task-reorder.js";
import { loadBoard } from "../../tasks/load-board.js";
import { ApiLayer } from "../api-layer.js";

export const runTaskReorder = Effect.fn("command.task.reorder")(
  function* (options: {
    readonly tasks: ReadonlyArray<string>;
    readonly before: Option.Option<string>;
    readonly after: Option.Option<string>;
  }) {
    if (Option.isSome(options.before) && Option.isSome(options.after)) {
      return yield* new InvalidArgument({
        message: "Pass only one of --before and --after.",
        hint: "Use --before <task> or --after <task>, or neither to put the tasks first.",
      });
    }
    const placement = Option.isSome(options.before)
      ? { placement: "before" as const, anchor: options.before.value }
      : Option.isSome(options.after)
        ? { placement: "after" as const, anchor: options.after.value }
        : undefined;
    const references = [
      ...options.tasks,
      ...(placement ? [placement.anchor] : []),
    ];
    const { tasks: resolved } = yield* withSpinner("Loading tasks")(
      resolveBulkTasks(references),
    );
    // Duplicates are dropped by the resolver, so a short list means a repeat.
    if (resolved.length !== references.length) {
      return yield* new InvalidArgument({
        message:
          "A task appears more than once, or is also the --before/--after task.",
        hint: "Name each task once, and pick an anchor that is not in the list.",
      });
    }
    const moved = placement ? resolved.slice(0, -1) : resolved;
    const anchor = placement ? resolved.at(-1) : undefined;
    const project = resolved[0]?.project;
    if (!project || resolved.some((task) => task.project.id !== project.id)) {
      return yield* new InvalidArgument({
        message: "These tasks are in more than one project.",
        hint: "Reorder the tasks of one project at a time.",
      });
    }

    const board = yield* withSpinner(`Loading ${project.name}`)(
      loadBoard(
        project.id,
        { sortBy: "position", sortOrder: "asc" },
        Number.MAX_SAFE_INTEGER,
      ),
    );
    const status = board.tasks.find((task) => task.id === moved[0]?.id)?.status;
    const column = board.tasks.filter((task) => task.status === status);
    if (
      status === undefined ||
      resolved.some((task) => column.every((c) => c.id !== task.id))
    ) {
      return yield* new InvalidArgument({
        message:
          "The tasks and the --before/--after task must all be in the same column.",
        hint: "Archived and planned tasks have no column. Use kaneo task status to bring tasks into one column first.",
      });
    }

    const snapshot = column.map((task) => ({
      id: task.id,
      position: task.position ?? null,
      status: task.status,
    }));
    const plan = yield* Effect.fromResult(
      planTaskReorder(
        snapshot,
        moved.map((task) => task.id),
        anchor &&
          placement && { id: anchor.id, placement: placement.placement },
      ),
    );
    const updated =
      plan.changes.length === 0
        ? []
        : yield* withSpinner("Reordering")(
            reorderTasks({
              projectId: project.id,
              expectedTasks: snapshot,
              tasks: plan.changes,
            }).pipe(
              Effect.mapError((error) =>
                error._tag === "Conflict"
                  ? new Conflict({
                      message:
                        "The board changed meanwhile, so nothing was changed. Run the command again.",
                    })
                  : error,
              ),
            ),
          );

    yield* emit(updated, (ui) =>
      renderTaskReorder(ui, {
        labels: moved.map((task) => task.label),
        where: anchor
          ? `${placement?.placement} ${anchor.label}`
          : `at the top of ${project.name}`,
        changed: plan.changes.length > 0,
      }),
    );
  },
);

export const taskReorder = Command.make(
  "reorder",
  {
    tasks: Argument.String("task").pipe(
      Argument.withDescription(
        "Ticket ids such as KAN-12, or task ids, in the order you want",
      ),
      Argument.atLeast(1),
    ),
    before: Flag.String("before").pipe(
      Flag.withDescription("Put them just before this task"),
      Flag.optional,
    ),
    after: Flag.String("after").pipe(
      Flag.withDescription("Put them just after this task"),
      Flag.optional,
    ),
  },
  (options) => runTaskReorder(options),
).pipe(
  Command.withDescription(
    "Move tasks to the top of their column, or before or after another task",
  ),
  Command.provide(ApiLayer),
);
