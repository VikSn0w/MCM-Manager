import { createCookie } from "react-router";

export const localeCookie = createCookie("_leasio_locale", {
  path: "/",
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 60 * 60 * 24 * 365, // 1 year
});

export async function getLocale(request: Request): Promise<"en" | "it"> {
  const header = request.headers.get("Cookie");
  const value = await localeCookie.parse(header);
  if (value === "it" || value === "en") return value;
  
  // Fallback to browser Accept-Language header
  const acceptLang = request.headers.get("Accept-Language");
  if (acceptLang && acceptLang.toLowerCase().includes("it")) {
    return "it";
  }
  return "en";
}
