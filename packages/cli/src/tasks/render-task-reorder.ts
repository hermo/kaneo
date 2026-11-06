import type { Ui } from "../render/ui.js";

export type TaskReorder = {
  readonly labels: ReadonlyArray<string>;
  readonly where: string;
  readonly changed: boolean;
};

export function renderTaskReorder(ui: Ui, reorder: TaskReorder): string[] {
  const { theme, glyphs } = ui;
  const tasks = reorder.labels.join(", ");
  return [
    "",
    `  ${theme.success(glyphs.tick)} Moved ${theme.strong(tasks)} ${theme.muted(glyphs.separator)} ${reorder.changed ? "" : "already "}${reorder.where}`,
    "",
  ];
}
