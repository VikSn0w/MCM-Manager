import { createCookieSessionStorage, redirect } from "react-router";
import { prisma } from "./db.server";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error(
    "SESSION_SECRET is not set. Refusing to start with a predictable session secret."
  );
}

const storage = createCookieSessionStorage({
  cookie: {
    name: "_leasio_session",
    secure: process.env.NODE_ENV === "production",
    secrets: [sessionSecret],
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    httpOnly: true,
  },
});

export async function createUserSession(userId: string, redirectTo: string) {
  const session = await storage.getSession();
  session.set("userId", userId);
  // Issued-at stamp, compared against User.passwordChangedAt so that resetting
  // a password invalidates sessions minted before the reset.
  session.set("iat", Date.now());
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await storage.commitSession(session),
    },
  });
}

/**
 * True when the session predates the account's last password change.
 *
 * Sessions created before this mechanism existed carry no "iat" and are
 * grandfathered in rather than logging the whole user base out at once; they
 * age out naturally within the 30-day cookie lifetime.
 */
function isSessionStale(issuedAt: unknown, passwordChangedAt: Date): boolean {
  if (typeof issuedAt !== "number") return false;
  return issuedAt < passwordChangedAt.getTime();
}

export function getUserSession(request: Request) {
  return storage.getSession(request.headers.get("Cookie"));
}

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
};

/**
 * One resolved user per request.
 *
 * A single page is a layout loader plus a route loader, and each of those may
 * call getUserId, getUser and requireAdmin. Without this every call was its own
 * round trip — four identical user lookups per admin page, each costing the
 * full database latency. The cache is keyed on the Request object, so it lives
 * exactly as long as the request does and never leaks between visitors.
 */
const userByRequest = new WeakMap<Request, Promise<AuthenticatedUser | null>>();

function loadUser(request: Request): Promise<AuthenticatedUser | null> {
  const cached = userByRequest.get(request);
  if (cached) return cached;

  const pending = (async (): Promise<AuthenticatedUser | null> => {
    const session = await getUserSession(request);
    const userId = session.get("userId");
    if (!userId || typeof userId !== "string") return null;

    try {
      // Fetches the session-validity stamp together with the profile, so the
      // staleness check costs nothing extra.
      const account = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          passwordChangedAt: true,
        },
      });
      if (!account) return null;
      if (isSessionStale(session.get("iat"), account.passwordChangedAt)) return null;

      const { passwordChangedAt, ...user } = account;
      return user;
    } catch (error) {
      return null;
    }
  })();

  userByRequest.set(request, pending);
  return pending;
}

export async function getUserId(request: Request): Promise<string | null> {
  const user = await loadUser(request);
  return user?.id ?? null;
}

export async function getUser(request: Request) {
  return loadUser(request);
}

export async function requireUserId(
  request: Request,
  redirectTo: string = "/login"
) {
  const userId = await getUserId(request);
  if (!userId) {
    throw redirect(redirectTo);
  }
  return userId;
}

export async function requireUser(request: Request) {
  const user = await loadUser(request);
  if (!user) {
    throw logout(request);
  }
  return user;
}

export async function requireAdmin(request: Request) {
  const user = await requireUser(request);
  if (user.role !== "ADMIN") {
    throw redirect("/");
  }
  return user;
}

export async function logout(request: Request) {
  const session = await getUserSession(request);
  return redirect("/", {
    headers: {
      "Set-Cookie": await storage.destroySession(session),
    },
  });
}
