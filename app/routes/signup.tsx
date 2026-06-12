import { useState } from "react";
import { Form, Link, redirect, useActionData, useNavigation, useLoaderData, useLocation } from "react-router";
import type { Route } from "./+types/signup";
import bcrypt from "bcryptjs";
import { prisma } from "../utils/db.server";
import { createUserSession } from "../utils/auth.server";
import { getLocale } from "../utils/locale.server";
import { translations, type Locale } from "../utils/translations";
import { UserPlus, Flag, AlertTriangle, ChevronRight } from "lucide-react";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/dashboard";
  const locale = await getLocale(request);
  return { locale, redirectTo };
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");
  const redirectTo = formData.get("redirectTo")?.toString() || "/dashboard";

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof confirmPassword !== "string"
  ) {
    return { error: "Invalid form fields." };
  }

  if (password !== confirmPassword) {
    return { error: "Passwords do not match." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  // Check if email already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { error: "Email is already registered." };
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Create user (first user gets ADMIN role just in case, but standard is CUSTOMER)
  const usersCount = await prisma.user.count();
  const role = usersCount === 0 ? "ADMIN" : "CUSTOMER";

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: passwordHash,
      role,
    },
  });

  return createUserSession(user.id, redirectTo);
}

export default function Signup() {
  const { locale, redirectTo } = useLoaderData<typeof loader>();
  const t = translations[locale as Locale];

  const actionData = useActionData() as { error?: string } | undefined;
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const location = useLocation();
  const currentPath = location.pathname + location.search;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden font-sans text-white">
      {/* Language Switcher in top corner */}
      <div className="absolute top-6 right-6 z-20">
        <Form method="post" action="/locale" className="inline-flex">
          <input type="hidden" name="redirectTo" value={currentPath} />
          <button 
            type="submit" 
            name="locale" 
            value={locale === "en" ? "it" : "en"}
            className="text-xs font-extrabold uppercase text-slate-400 hover:text-orange-500 border border-slate-800 hover:border-orange-500/25 bg-slate-900/40 rounded-xl px-3 py-2 transition-all flex items-center space-x-1 outline-none cursor-pointer"
          >
            <span>{locale === "en" ? "🇮🇹 IT" : "🇬🇧 EN"}</span>
          </button>
        </Form>
      </div>

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-950/20 via-slate-950 to-slate-950 pointer-events-none" />
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
      
      {/* Carbon grid lines overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="inline-block bg-white px-8 py-5 rounded-2xl shadow-xl border border-slate-200 mb-6 transition-transform hover:scale-[1.02]">
          <img src="/logoleasio.png" alt="Leasio" className="h-10 mx-auto object-contain" />
        </div>
        <h2 className="text-center text-2xl sm:text-3xl font-extrabold text-white tracking-tight uppercase">
          {t.createProfile}
        </h2>
        <p className="mt-2 text-center text-sm text-slate-400">
          Or{" "}
          <Link to={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} className="font-medium text-orange-500 hover:text-orange-400 transition-colors">
            {t.signinExisting}
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 py-8 px-6 shadow-2xl rounded-2xl sm:px-10">
          
          {actionData?.error && (
            <div className="mb-6 bg-red-950/40 border border-red-500/30 rounded-xl p-4 flex items-start space-x-3 text-red-200">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm">{actionData.error}</p>
            </div>
          )}

          <Form method="post" className="space-y-6">
            <input type="hidden" name="redirectTo" value={redirectTo} />
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                {t.fullname}
              </label>
              <div className="mt-2 relative">
                <input
                  id="name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  placeholder="Valentino Rossi"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner placeholder-slate-600 transition-all text-sm outline-none"
                />
              </div>
            </div>

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
                  placeholder="vr46@leasio.com"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner placeholder-slate-600 transition-all text-sm outline-none"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-slate-300 uppercase tracking-wider">
                {t.password}
              </label>
              <div className="mt-2 relative">
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="••••••••"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner placeholder-slate-600 transition-all text-sm outline-none"
                />
              </div>
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
                  placeholder="••••••••"
                  className="w-full bg-slate-950/80 border border-slate-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-white rounded-xl py-3 px-4 shadow-inner placeholder-slate-600 transition-all text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="terms"
                name="terms"
                type="checkbox"
                required
                className="h-4.5 w-4.5 rounded bg-slate-950 border-slate-800 text-orange-500 focus:ring-orange-500/30"
              />
              <label htmlFor="terms" className="ml-2.5 block text-sm text-slate-400">
                {locale === "en" ? "I accept the Leasio " : "Accetto i "}
                <a href="#" className="text-orange-500 hover:text-orange-400 font-semibold underline decoration-orange-500/30">
                  {t.safetyRegulations}
                </a>
              </label>
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
                    <span>{t.buttonPreparingProfile}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-1.5">
                    <span>{t.buttonCompleteSignup}</span>
                    <ChevronRight className="h-4.5 w-4.5" />
                  </div>
                )}
              </button>
            </div>
          </Form>

          {/* Footer badge */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 flex justify-center items-center space-x-2 text-xs text-slate-500 uppercase tracking-widest">
            <Flag className="h-4.5 w-4.5 text-slate-600" />
            <span>{t.fimBadge}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
