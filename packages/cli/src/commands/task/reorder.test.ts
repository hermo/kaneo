import { Effect, Layer, Option, Result } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { KaneoApiLayer } from "../../api/kaneo-api.js";
import {
  captureOutput,
  fakeHttpClient,
  json,
  memoryConfigStore,
  type RecordedRequest,
  testSession,
} from "../../testing/test-layers.js";
import { runTaskReorder } from "./reorder.js";

const project = {
  id: "p1",
  workspaceId: "ws_1",
  slug: "kan",
  name: "Kaneo Web",
  icon: null,
  description: null,
  archivedAt: null,
  position: 0,
  lastTaskNumber: 4,
};

const board = (...ids: string[]) =>
  ids.map((id, i) => ({
    id,
    title: id,
    number: Number(id.slice(1)),
    status: "to-do",
    priority: "no-priority",
    startDate: null,
    dueDate: null,
    createdAt: "2026-10-08T10:00:00.000Z",
    assigneeId: null,
    assigneeName: null,
    projectId: "p1",
    position: i + 1,
  }));

function run(
  options: { tasks: string[]; before?: string; after?: string },
  reorderStatus = 200,
) {
  const recorded: RecordedRequest[] = [];
  const tasks = board("t1", "t2", "t3", "t4");
  const inProgress = { ...board("t5")[0], status: "in-progress" };
  const otherProject = { ...board("t6")[0], projectId: "p2" };
  const archived = board("t7")[0];
  const byNumber = [...tasks, inProgress, otherProject, archived];
  const respond = (request: RecordedRequest) => {
    const { pathname } = new URL(request.url);
    const ticket = /by-ticket-id\/KAN-(\d+)$/u.exec(pathname);
    if (ticket) {
      return json({ ...byNumber[Number(ticket[1]) - 1], description: null });
    }
    if (pathname === "/api/project/p1") return json(project);
    if (pathname === "/api/project/p2") return json({ ...project, id: "p2" });
    if (pathname === "/api/task/tasks/p1") {
      return json({
        data: {
          id: "p1",
          name: "Kaneo Web",
          slug: "kan",
          workspaceId: "ws_1",
          columns: [
            { id: "c1", slug: "to-do", name: "To Do", isFinal: false, tasks },
            {
              id: "c2",
              slug: "in-progress",
              name: "In Progress",
              isFinal: false,
              tasks: [inProgress],
            },
          ],
        },
        pagination: { total: 5, page: 1, totalPages: 1 },
      });
    }
    return reorderStatus === 200
      ? json([{ id: "t3", position: 0, status: "to-do" }])
      : json({ message: "Board changed; refresh before reordering" }, 409);
  };
  const out = captureOutput();
  const api = KaneoApiLayer.pipe(
    Layer.provide(
      Layer.mergeAll(
        fakeHttpClient(respond, recorded),
        testSession(),
        memoryConfigStore().layer,
      ),
    ),
  );
  const effect = runTaskReorder({
    tasks: options.tasks,
    before: Option.fromUndefinedOr(options.before),
    after: Option.fromUndefinedOr(options.after),
  }).pipe(Effect.provide(Layer.mergeAll(api, out.layer, testSession())));
  return { recorded, out, result: Effect.runPromise(Effect.result(effect)) };
}

const reorderCall = (recorded: RecordedRequest[]) =>
  recorded.find((request) => request.url.endsWith("/api/task/reorder"));

describe("runTaskReorder", () => {
  it("sends the full column as the snapshot and only the changes", async () => {
    const { recorded, result } = run({ tasks: ["KAN-3"] });
    expect(Result.isSuccess(await result)).toBe(true);
    expect(reorderCall(recorded)?.body).toEqual({
      projectId: "p1",
      expectedTasks: [
        { id: "t1", position: 1, status: "to-do" },
        { id: "t2", position: 2, status: "to-do" },
        { id: "t3", position: 3, status: "to-do" },
        { id: "t4", position: 4, status: "to-do" },
      ],
      tasks: [{ id: "t3", position: 0 }],
    });
  });

  it("places tasks next to an anchor", async () => {
    const { recorded, result } = run({ tasks: ["KAN-1"], after: "KAN-3" });
    expect(Result.isSuccess(await result)).toBe(true);
    expect(reorderCall(recorded)?.body).toMatchObject({
      tasks: [
        { id: "t1", position: 4 },
        { id: "t4", position: 5 },
      ],
    });
  });

  it("sends nothing when the order already matches", async () => {
    const { recorded, result } = run({ tasks: ["KAN-1", "KAN-2"] });
    expect(Result.isSuccess(await result)).toBe(true);
    expect(reorderCall(recorded)).toBeUndefined();
  });

  it("rejects a repeated task before writing", async () => {
    const { recorded, result } = run({ tasks: ["KAN-1", "KAN-1"] });
    const outcome = await result;
    expect(Result.isFailure(outcome)).toBe(true);
    expect(JSON.stringify(outcome)).toContain("more than once");
    expect(reorderCall(recorded)).toBeUndefined();
  });

  it("fails with a re-run hint when the board changed", async () => {
    const outcome = await run({ tasks: ["KAN-3"] }, 409).result;
    expect(Result.isFailure(outcome)).toBe(true);
    const text = JSON.stringify(outcome);
    expect(text).toContain("nothing was changed");
    expect(text).toContain("Run the command again");
    expect(text).not.toContain("refresh");
  });

  it("explains a task-worded error when both --before and --after are given", async () => {
    const { recorded, result } = run({
      tasks: ["KAN-1"],
      before: "KAN-2",
      after: "KAN-3",
    });
    const text = JSON.stringify(await result);
    expect(text).toContain("--before");
    expect(text).not.toContain("column");
    expect(recorded).toHaveLength(0);
  });

  it.each([
    [
      "tasks in two columns",
      { tasks: ["KAN-1", "KAN-5"] },
      "must all be in the same column",
    ],
    [
      "an anchor in another column",
      { tasks: ["KAN-1"], after: "KAN-5" },
      "must all be in the same column",
    ],
    [
      "an archived task",
      { tasks: ["KAN-7"] },
      "must all be in the same column",
    ],
    [
      "tasks in two projects",
      { tasks: ["KAN-1", "KAN-6"] },
      "more than one project",
    ],
  ])("refuses %s before writing", async (_name, options, message) => {
    const { recorded, result } = run(options);
    const outcome = await result;
    expect(Result.isFailure(outcome)).toBe(true);
    expect(JSON.stringify(outcome)).toContain(message);
    expect(reorderCall(recorded)).toBeUndefined();
  });
});
