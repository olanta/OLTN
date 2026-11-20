import { describe, expect, it } from "vitest";
import type { Shortcut } from "../../api/types";
import { shortcutRoute } from "../../app/shortcuts";
import {
  addColumn,
  columnId,
  columnNeedsValue,
  columnShortcut,
  moveColumn,
  renameColumn,
  sameColumnTarget,
} from "../columns";

describe("column shortcuts", () => {
  it("builds stable ids for timed and configured columns", () => {
    expect(columnId("home")).toBe("home");
    expect(columnId("hashtag", "masto")).toBe("hashtag:masto");
    expect(columnId("remote-local", "example.social")).toBe("remote-local:example.social");
    expect(columnShortcut("home", "Home")).toMatchObject({
      id: "home",
      type: "home",
      label: "Home",
    });
    expect(columnShortcut("remote-local", "example.social", "example.social")).toMatchObject({
      id: "remote-local:example.social",
      type: "remote-local",
      label: "example.social",
      value: "example.social",
    });
  });

  it("rejects the same timeline target and keeps different hosts", () => {
    const local: Shortcut = { id: "local", type: "local", label: "Local" };
    const remote = columnShortcut("remote-local", "a.example", "a.example");
    const other = columnShortcut("remote-local", "b.example", "b.example");
    expect(sameColumnTarget(local, { ...local, id: "local-2" })).toBe(true);
    expect(addColumn([local], { ...local, id: "local-2" })).toBeNull();
    expect(addColumn([remote], remote)).toBeNull();
    expect(addColumn([remote], other)?.map((shortcut) => shortcut.id)).toEqual([
      "remote-local:a.example",
      "remote-local:b.example",
    ]);
  });

  it("moves and renames one column without touching the others", () => {
    const shortcuts: Shortcut[] = [
      { id: "home", type: "home", label: "Home" },
      { id: "local", type: "local", label: "Local" },
      { id: "federated", type: "federated", label: "Federated" },
    ];
    expect(moveColumn(shortcuts, "local", -1).map((column) => column.id)).toEqual([
      "local",
      "home",
      "federated",
    ]);
    expect(moveColumn(shortcuts, "home", 2).map((column) => column.id)).toEqual([
      "local",
      "federated",
      "home",
    ]);
    expect(moveColumn(shortcuts, "home", -1)).toEqual(shortcuts);
    expect(renameColumn(shortcuts, "local", "  Nearby ")[1].label).toBe("Nearby");
    expect(renameColumn(shortcuts, "local", " ")[1]).toEqual(shortcuts[1]);
  });

  it("knows which timeline types need a value", () => {
    expect(columnNeedsValue("hashtag")).toBe(true);
    expect(columnNeedsValue("list")).toBe(true);
    expect(columnNeedsValue("remote-federated")).toBe(true);
    expect(columnNeedsValue("trending")).toBe(false);
  });
});

describe("remote timeline routes", () => {
  it("opens the matching public page on the chosen instance", () => {
    const base = { id: "x", label: "Remote" };
    expect(
      shortcutRoute({
        ...base,
        id: "remote-local:a.example",
        type: "remote-local",
        value: "a.example",
      }),
    ).toBe("/a.example/p/l");
    expect(
      shortcutRoute({
        ...base,
        id: "remote-federated:a.example",
        type: "remote-federated",
        value: "a.example",
      }),
    ).toBe("/a.example/p");
  });
});
