import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchInstance, normalizeInstanceInput, oauthCallbackUrl } from "../../api/auth";

describe("normalizeInstanceInput", () => {
  it("accepts plain hosts", () => {
    expect(normalizeInstanceInput("mastodon.social")).toEqual({ host: "mastodon.social" });
    expect(normalizeInstanceInput("  Mastodon.Social  ")).toEqual({ host: "mastodon.social" });
  });

  it("strips protocol and paths, including trailing slashes", () => {
    expect(normalizeInstanceInput("https://mastodon.social/")).toEqual({
      host: "mastodon.social",
    });
    expect(normalizeInstanceInput("http://mastodon.social//about")).toEqual({
      host: "mastodon.social",
    });
  });

  it("understands @user@host mentions", () => {
    expect(normalizeInstanceInput("@user@mastodon.social")).toEqual({
      host: "mastodon.social",
      username: "user",
    });
    expect(normalizeInstanceInput("user@mastodon.social")).toEqual({
      host: "mastodon.social",
      username: "user",
    });
  });

  it("keeps ports and rejects invalid input", () => {
    expect(normalizeInstanceInput("localhost:3000")).toEqual({ host: "localhost:3000" });
    expect(normalizeInstanceInput("")).toBeNull();
    expect(normalizeInstanceInput("@@invalido")).toBeNull();
    expect(normalizeInstanceInput("sem-espaco")).toBeNull();
  });
});

describe("fetchInstance", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the input host when the instance reports a different canonical uri", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ uri: "vivaldi.net", title: "Vivaldi Social" }),
      })),
    );

    const info = await fetchInstance("social.vivaldi.net");
    expect(info.uri).toBe("social.vivaldi.net");
    expect(info.title).toBe("Vivaldi Social");
  });
});

describe("oauthCallbackUrl", () => {
  it("reloads the app with the code and state in the query", () => {
    const url = new URL(oauthCallbackUrl("a b&c", "state-1"));
    expect(url.origin).toBe(location.origin);
    expect(url.pathname).toBe(location.pathname);
    expect(url.searchParams.get("code")).toBe("a b&c");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.hash).toBe("");
  });

  it("omits an empty state", () => {
    const url = new URL(oauthCallbackUrl("code"));
    expect(url.searchParams.has("state")).toBe(false);
  });
});
