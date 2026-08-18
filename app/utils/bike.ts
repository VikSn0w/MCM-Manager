/**
 * Display helpers for individual bikes. Shared by loaders and components, so
 * this file must stay free of server-only imports.
 */

type NameableBike = {
  alias?: string | null;
  raceNumber?: number | null;
  model?: { name?: string | null } | null;
};

/**
 * Human label for one physical bike, e.g. "Stoner 27".
 *
 * Falls back through alias, race number, and finally the model name, so a bike
 * the back office has not nicknamed yet still renders something meaningful.
 */
export function bikeDisplayName(bike: NameableBike): string {
  const alias = bike.alias?.trim();
  const race = typeof bike.raceNumber === "number" ? bike.raceNumber : null;

  if (alias && race !== null) return `${alias} ${race}`;
  if (alias) return alias;
  if (race !== null) return `#${race}`;
  return bike.model?.name?.trim() || "Ohvale GP";
}

/** Short badge form: the race number alone when there is one. */
export function bikeRaceBadge(bike: NameableBike): string | null {
  return typeof bike.raceNumber === "number" ? `#${bike.raceNumber}` : null;
}
