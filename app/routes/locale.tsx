import { redirect } from "react-router";
import type { Route } from "./+types/locale";
import { localeCookie } from "../utils/locale.server";

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const locale = formData.get("locale")?.toString();
  const redirectTo = formData.get("redirectTo")?.toString() || "/";

  if (locale !== "en" && locale !== "it") {
    return redirect(redirectTo);
  }

  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await localeCookie.serialize(locale),
    },
  });
}

export async function loader() {
  return redirect("/");
}

export default function LocaleRoute() {
  return null;
}
