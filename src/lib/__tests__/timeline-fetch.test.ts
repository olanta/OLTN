import { describe, expect, it } from "vitest";
import type { RestClient } from "../../api/types";
import {
  fetchStatusPage,
  fetchTimelineUpdate,
  timelineSupportsUpdates,
} from "../../components/feed/timeline-fetch";

function clientWithHome(calls: Record<string, unknown>[]): RestClient {
  return {
    v1: {
      timelines: {
        home: {
          list: async (params: Record<string, unknown>) => {
            calls.push(params);
            return [];
          },
        },
      },
    },
  } as unknown as RestClient;
}

describe("fetchStatusPage", () => {
  it("asks the API for media-only home pages", async () => {
    const calls: Record<string, unknown>[] = [];
    await fetchStatusPage({ type: "home", onlyMedia: true }, 30, null, {
      client: clientWithHome(calls),
      instance: "example.test",
    });
    expect(calls).toEqual([{ limit: 30, maxId: undefined, onlyMedia: true }]);
  });

  it("keeps the regular home timeline unfiltered", async () => {
    const calls: Record<string, unknown>[] = [];
    await fetchStatusPage({ type: "home" }, 20, "42", {
      client: clientWithHome(calls),
      instance: "example.test",
    });
    expect(calls).toEqual([{ limit: 20, maxId: "42", onlyMedia: false }]);
  });
});

describe("fetchTimelineUpdate", () => {
  it("uses sinceId and compares against the first item on screen", async () => {
    const calls: Record<string, unknown>[] = [];
    const client = {
      v1: {
        timelines: {
          home: {
            list: async (params: Record<string, unknown>) => {
              calls.push(params);
              return [{ id: "3" }];
            },
          },
        },
      },
    } as unknown as RestClient;

    expect(
      await fetchTimelineUpdate({ type: "home" }, "2", {
        client,
        instance: "example.test",
      }),
    ).toBe(true);
    expect(calls).toEqual([{ limit: 1, sinceId: "2", onlyMedia: false }]);
  });

  it("treats a server that ignores sinceId as up to date", async () => {
    const client = {
      v1: {
        timelines: {
          public: {
            list: async () => [{ id: "9" }],
          },
        },
      },
    } as unknown as RestClient;

    expect(
      await fetchTimelineUpdate({ type: "public", local: true }, "9", {
        client,
        instance: "example.test",
      }),
    ).toBe(false);
  });

  it("only polls timelines that support update checks", () => {
    expect(timelineSupportsUpdates({ type: "home" })).toBe(true);
    expect(timelineSupportsUpdates({ type: "public" })).toBe(true);
    expect(timelineSupportsUpdates({ type: "tag", tag: "masto" })).toBe(true);
    expect(timelineSupportsUpdates({ type: "list", listId: "7" })).toBe(true);
    expect(timelineSupportsUpdates({ type: "bookmarks" })).toBe(false);
    expect(timelineSupportsUpdates({ type: "favourites" })).toBe(false);
    expect(timelineSupportsUpdates({ type: "trending" })).toBe(false);
  });
});
