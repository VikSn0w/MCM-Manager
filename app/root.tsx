import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;1,100;1,200;1,300;1,400;1,500;1,600;1,700&display=swap",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  const themePrimary = process.env.THEME_PRIMARY || "#f97316";
  const themePrimaryHover = process.env.THEME_PRIMARY_HOVER || "#ea580c";
  const themePrimaryLight = process.env.THEME_PRIMARY_LIGHT || "#fb923c";
  const themePrimaryDark = process.env.THEME_PRIMARY_DARK || "#9a3412";

  return {
    themePrimary,
    themePrimaryHover,
    themePrimaryLight,
    themePrimaryDark,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const rootData = useRouteLoaderData("root") as {
    themePrimary?: string;
    themePrimaryHover?: string;
    themePrimaryLight?: string;
    themePrimaryDark?: string;
  } | undefined;

  const primary = rootData?.themePrimary || "#f97316";
  const hover = rootData?.themePrimaryHover || "#ea580c";
  const light = rootData?.themePrimaryLight || "#fb923c";
  const dark = rootData?.themePrimaryDark || "#9a3412";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        <style dangerouslySetInnerHTML={{__html: `
          :root {
            --color-brand-primary: ${primary};
            --color-brand-primary-hover: ${hover};
            --color-brand-primary-light: ${light};
            --color-brand-primary-dark: ${dark};
          }
        `}} />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
