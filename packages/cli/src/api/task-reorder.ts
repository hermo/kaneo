import { Effect, Schema } from "effect";
import { KaneoApi } from "./kaneo-api.js";

export const ReorderedTask = Schema.Struct({
  id: Schema.String,
  position: Schema.Number,
  status: Schema.String,
});

const ReorderedTaskList = Schema.Array(ReorderedTask);

export const reorderTasks = Effect.fnUntraced(function* (body: {
  readonly projectId: string;
  readonly expectedTasks: ReadonlyArray<{
    readonly id: string;
    readonly position: number | null;
    readonly status: string;
  }>;
  readonly tasks: ReadonlyArray<{
    readonly id: string;
    readonly position: number;
  }>;
}) {
  const api = yield* KaneoApi;
  return yield* api.request("POST", "/api/task/reorder", ReorderedTaskList, {
    body,
  });
});
