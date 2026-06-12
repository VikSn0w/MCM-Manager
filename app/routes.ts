import { type RouteConfig, index, route, layout } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("signup", "routes/signup.tsx"),
  route("logout", "routes/logout.tsx"),
  route("book", "routes/book.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("locale", "routes/locale.tsx"),
  route("order/:id", "routes/order.tsx"),
  route("academy", "routes/academy.tsx"),

  // Admin panel wrapped in layouts
  layout("routes/admin/layout.tsx", [
    route("admin", "routes/admin/dashboard.tsx"),
    route("admin/bookings", "routes/admin/bookings.tsx"),
    route("admin/bikes", "routes/admin/bikes.tsx"),
    route("admin/tariffs", "routes/admin/tariffs.tsx"),
    route("admin/calendar", "routes/admin/calendar.tsx"),
    route("admin/championships", "routes/admin/championships.tsx"),
    route("admin/lessons", "routes/admin/lessons.tsx"),
    route("admin/settings", "routes/admin/settings.tsx"),
  ]),
] satisfies RouteConfig;

