import { Form, Link, useActionData, useNavigation, useLoaderData } from "react-router";
import type { Route } from "./+types/forgot-password";
import { prisma } from "../utils/db.server";
import { getLocale } from "../utils/locale.server";
import { translations, type Locale } from "../utils/translations";
import { createPasswordResetToken } from "../utils/password-reset.server";
import { RESET_TOKEN_TTL_MINUTES } from "../utils/auth-constants";
import { sendPasswordResetEmail } from "../utils/email.server";
import { checkRateLimit, getClientIp } from "../utils/rate-limit.server";
import { Flag, AlertTriangle, ChevronRight, MailCheck } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const locale = await getLocale(request);
  return { locale };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = formData.get("email");

  if (typeof email !== "string") {
    return { error: "Campi del modulo non validi." };
  }

  const normalisedEmail = email.trim().toLowerCase();

  // Throttle before touching the database, so this endpoint cannot be used to
  // probe for registered addresses or to spray reset mail at a victim.
  const rate = checkRateLimit(`reset:${getClientIp(request)}`, 5, 15 * 60 * 1000);
  if (!rate.allowed) {
    return {
      error: `Troppe richieste di reimpostazione. Riprova tra ${Math.ceil(rate.retryAfterSeconds / 60)} minuti.`,
    };
  }

  const user = await prisma.user.findUnique({
    where: { email: normalisedEmail },
    select: { id: true, email: true, name: true },
  });

  // Only send when the account exists, but always report the same outcome:
  // a differing response would disclose who has an account here.
  if (user) {
    const token = await createPasswordResetToken(user.id);
    const resetUrl = new URL(
      `/reset-password?token=${encodeURIComponent(token)}`,
      request.url
    ).toString();

    try {
      await sendPasswordResetEmail(
        user.email,
        user.name,
        resetUrl,
        RESET_TOKEN_TTL_MINUTES
      );
    } catch (err) {
      console.error("[RESET] Failed to send password reset email:", err);
    }
  }

  return { sent: true };
}

export default function ForgotPassword() {
  const { locale } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const actionData = useActionData() as { error?: string; sent?: boolean } | undefined;
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
          {t.forgotPasswordTitle}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400 px-4">
          {t.forgotPasswordSubtitle}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/60 border border-slate-800/80 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">

          {actionData?.sent ? (
            <div className="space-y-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                <MailCheck className="h-7 w-7 text-green-500" />
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {t.forgotPasswordSent}
              </p>
              <Link
                to="/login"
                className="inline-flex justify-center items-center py-3 px-6 rounded-xl text-sm font-bold uppercase tracking-wider text-white bg-slate-800 hover:bg-slate-700 transition-all"
              >
                {t.backToLogin}
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
                <div>
                  <label htmlFor="email" className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                    {t.emailAddress}
                  </label>
                  <div className="mt-2 relative">
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      placeholder="nome@esempio.it"
                      className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner placeholder-slate-600 transition-all text-sm outline-none"
                    />
                  </div>
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
                        <span>{t.sendingResetLink}</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-1.5">
                        <span>{t.sendResetLink}</span>
                        <ChevronRight className="h-4.5 w-4.5" />
                      </div>
                    )}
                  </button>
                </div>
              </Form>

              <p className="mt-6 text-center text-sm text-slate-400">
                <Link to="/login" className="font-medium text-orange-500 hover:text-orange-400 transition-colors">
                  {t.backToLogin}
                </Link>
              </p>
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
