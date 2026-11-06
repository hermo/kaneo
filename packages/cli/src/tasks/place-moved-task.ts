// Port of the web board's drag placement (apps/web/src/components/kanban-board/
// place-moved-task.ts), so the CLI writes the same positions a drag does. Keep
// the two in step; place-moved-task.test.ts is the same test as the web one.
type Positioned = { position?: number | null };

// The CLI compiles with noUncheckedIndexedAccess; every index below is in range.
function at(tasks: Positioned[], index: number): Positioned {
  const task = tasks[index];
  if (!task) throw new RangeError(`No task at index ${index}`);
  return task;
}

const SPACING = 1024;
const MAX_SHIFT = 4;

function costAfter(tasks: Positioned[], index: number) {
  let floor = (tasks[index - 1]?.position ?? -1) + 1;
  let cost = 0;
  for (let i = index + 1; i < tasks.length; i++) {
    if ((at(tasks, i).position ?? -1) > floor) break;
    floor += 1;
    cost += 1;
  }
  return cost;
}

function costBefore(tasks: Positioned[], index: number) {
  let ceiling = (at(tasks, index + 1).position as number) - 1;
  if (ceiling < 0) return Number.POSITIVE_INFINITY;
  let cost = 0;
  for (let i = index - 1; i >= 0; i--) {
    const position = at(tasks, i).position;
    if (position != null && position < ceiling) break;
    ceiling -= 1;
    if (ceiling < 0) return Number.POSITIVE_INFINITY;
    cost += 1;
  }
  return cost;
}

function shiftBefore(tasks: Positioned[], index: number) {
  let ceiling = (at(tasks, index + 1).position as number) - 1;
  at(tasks, index).position = ceiling;
  for (let i = index - 1; i >= 0; i--) {
    const position = at(tasks, i).position;
    if (position != null && position < ceiling) break;
    ceiling -= 1;
    at(tasks, i).position = ceiling;
  }
}

function shiftAfter(tasks: Positioned[], index: number) {
  let floor = (tasks[index - 1]?.position ?? -1) + 1;
  at(tasks, index).position = floor;
  for (let i = index + 1; i < tasks.length; i++) {
    if ((at(tasks, i).position ?? -1) > floor) break;
    floor += 1;
    at(tasks, i).position = floor;
  }
}

export function placeMovedTask(tasks: Positioned[], index: number) {
  const low = tasks[index - 1]?.position ?? -1;
  const next = tasks[index + 1]?.position;
  if (next == null) {
    at(tasks, index).position = low + 1;
    return;
  }
  if (next - low > 1) {
    at(tasks, index).position = Math.floor((low + next) / 2);
    return;
  }
  const before = costBefore(tasks, index);
  const after = costAfter(tasks, index);
  if (Math.min(before, after) <= MAX_SHIFT) {
    if (before < after) shiftBefore(tasks, index);
    else shiftAfter(tasks, index);
    return;
  }
  tasks.forEach((task, position) => {
    task.position = (position + 1) * SPACING;
  });
}
