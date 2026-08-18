import { createCookie } from "react-router";

export const localeCookie = createCookie("_leasio_locale", {
  path: "/",
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365, // 1 year
});

export async function getLocale(request: Request): Promise<"en" | "it"> {
  const value = await localeCookie.parse(request.headers.get("Cookie"));
  return value === "en" || value === "it" ? value : "it";
}
