/* Route guard shared by boot and the shell. */

export type RouteAuth = "loading" | "anonymous" | "authenticated";

/** Anonymous visitors are sent to the login page. Authenticated users may stay
    on `/login` to add another account to the multi-account switcher. */
export function authRedirect(path: string, auth: RouteAuth): string | null {
  return auth === "anonymous" && path !== "/login" ? "/login" : null;
}
