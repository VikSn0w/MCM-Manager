/**
 * Shared between server actions and the forms that render the rules, so this
 * file must stay free of server-only imports.
 */

/** Minimum length for any password the app accepts. */
export const MIN_PASSWORD_LENGTH = 8;

/** How long a password reset link stays valid. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/** The same TTL in whole minutes, for user-facing copy. */
export const RESET_TOKEN_TTL_MINUTES = Math.round(RESET_TOKEN_TTL_MS / 60000);
