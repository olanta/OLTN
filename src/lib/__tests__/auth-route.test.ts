import { describe, expect, it } from "vitest";
import { authRedirect } from "../auth-route";

describe("authRedirect", () => {
  it("sends anonymous visitors to the login page", () => {
    expect(authRedirect("/settings", "anonymous")).toBe("/login");
    expect(authRedirect("/accounts", "anonymous")).toBe("/login");
    expect(authRedirect("/login", "anonymous")).toBeNull();
  });

  it("lets authenticated users open /login to add another account", () => {
    expect(authRedirect("/login", "authenticated")).toBeNull();
    expect(authRedirect("/accounts", "authenticated")).toBeNull();
  });

  it("does not redirect while the session is loading", () => {
    expect(authRedirect("/", "loading")).toBeNull();
  });
});
