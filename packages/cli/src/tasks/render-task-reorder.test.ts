import { describe, expect, it } from "vite-plus/test";
import { makeUi } from "../render/ui.js";
import { renderTaskReorder } from "./render-task-reorder.js";

const ui = makeUi({
  color: 0,
  unicode: true,
  hyperlinks: false,
  animate: false,
  columns: 80,
});

describe("renderTaskReorder", () => {
  it("says where the tasks went", () => {
    const text = renderTaskReorder(ui, {
      labels: ["KAN-3", "KAN-1"],
      where: "before KAN-2",
      changed: true,
    }).join("\n");
    expect(text).toContain("Moved KAN-3, KAN-1");
    expect(text).toContain("before KAN-2");
    expect(text).not.toContain("already");
  });

  it("says when nothing had to move, like column move", () => {
    const text = renderTaskReorder(ui, {
      labels: ["KAN-1"],
      where: "at the top of Kaneo Web",
      changed: false,
    }).join("\n");
    expect(text).toContain("Moved KAN-1");
    expect(text).toContain("already at the top of Kaneo Web");
  });
});
