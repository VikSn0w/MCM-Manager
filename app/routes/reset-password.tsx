import { Form, Link, useActionData, useNavigation, useLoaderData } from "react-router";
import type { Route } from "./+types/reset-password";
import { getLocale } from "../utils/locale.server";
import { translations, type Locale } from "../utils/translations";
import { findValidResetToken, resetPasswordWithToken } from "../utils/password-reset.server";
import { MIN_PASSWORD_LENGTH } from "../utils/auth-constants";
import { createUserSession } from "../utils/auth.server";
import { Flag, AlertTriangle, ChevronRight, ShieldCheck, XCircle } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") || "";
  const locale = await getLocale(request);

  const lookup = await findValidResetToken(token);

  // The token is only checked here, never echoed back into the page beyond the
  // hidden field that submits it.
  return { locale, token, tokenValid: lookup.valid };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const token = formData.get("token");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (
    typeof token !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return { error: "Campi del modulo non validi." };
  }

  if (password !== confirmPassword) {
    return { error: "Le password non coincidono." };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `La password deve avere almeno ${MIN_PASSWORD_LENGTH} caratteri.` };
  }

  const result = await resetPasswordWithToken(token, password);

  if (!result.ok) {
    return { error: "Questo link non è valido o è scaduto. Richiedine uno nuovo." };
  }

  // Signing in here mints a session stamped after the password change, so the
  // fresh cookie survives while any pre-reset session is rejected.
  return createUserSession(result.userId, "/dashboard");
}

export default function ResetPassword() {
  const { locale, token, tokenValid } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const actionData = useActionData() as { error?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans text-white">

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/20 via-slate-950 to-slate-950 pointer-events-none" />

      {/* Carbon grid lines overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="inline-block mb-6 transition-transform hover:scale-[1.02]">
          <img src="/images/logo.webp" alt="MCM Racing School" className="h-10 mx-auto object-contain" />
        </div>
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-white tracking-tight uppercase">
          {t.resetPasswordTitle}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400 px-4">
          {tokenValid ? t.resetPasswordSubtitle : t.resetLinkInvalidTitle}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/60 border border-slate-800/80 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">

          {!tokenValid ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <XCircle className="h-7 w-7 text-red-500" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {t.resetLinkInvalidBody}
              </p>
              <Link
                to="/forgot-password"
                className="inline-flex justify-center items-center py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 transition-all"
              >
                {t.requestNewLink}
              </Link>
            </div>
          ) : (
            <>
              {actionData?.error && (
                <div className="mb-6 bg-red-950/40 border border-red-500/30 rounded-xl p-4 flex items-start space-x-3 text-red-200">
                  <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm">{actionData.error}</p>
                </div>
              )}

              <Form method="post" className="space-y-6">
                <input type="hidden" name="token" value={token} />

                <div>
                  <label htmlFor="password" className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    {t.newPassword}
                  </label>
                  <div className="mt-2 relative">
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner placeholder-slate-600 transition-all text-sm outline-none"
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    {t.passwordMinHint.replace("{n}", String(MIN_PASSWORD_LENGTH))}
                  </p>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    {t.confirmPassword}
                  </label>
                  <div className="mt-2 relative">
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={MIN_PASSWORD_LENGTH}
                      placeholder="••••••••"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner placeholder-slate-600 transition-all text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-start space-x-2.5 bg-slate-950/60 border border-slate-800 rounded-xl p-3.5">
                  <ShieldCheck className="h-4.5 w-4.5 text-orange-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {t.resetSignsOutOthers}
                  </p>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full flex justify-center items-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg shadow-orange-600/20 text-sm font-bold uppercase tracking-wider text-white bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        <span>{t.updatingPassword}</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <span>{t.updatePassword}</span>
                        <ChevronRight className="h-4.5 w-4.5" />
                      </div>
                    )}
                  </button>
                </div>
              </Form>
            </>
          )}

          {/* Footer badge */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 flex justify-center items-center space-x-2 text-xs text-slate-400 uppercase tracking-wider">
            <Flag className="h-4.5 w-4.5 text-slate-600" />
            <span>{t.fimBadge}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
