import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./db.server";
import { RESET_TOKEN_TTL_MS } from "./auth-constants";

/**
 * The emailed token is a 32-byte random value; only its SHA-256 digest is
 * stored. A database leak therefore yields no usable reset links.
 */
function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a reset token for the account, invalidating any tokens already
 * outstanding so that only the newest link works.
 *
 * Returns the raw token to embed in the email — it is never persisted or logged.
 */
export async function createPasswordResetToken(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");

  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  return token;
}

type TokenLookup =
  | { valid: true; userId: string; tokenId: string }
  | { valid: false };

/**
 * Checks a raw token without consuming it — used to decide whether to render
 * the reset form or an "expired link" message.
 */
export async function findValidResetToken(token: string): Promise<TokenLookup> {
  if (!token) return { valid: false };

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    return { valid: false };
  }

  return { valid: true, userId: record.userId, tokenId: record.id };
}

/**
 * Consumes the token and sets the new password.
 *
 * The token is marked used inside the same transaction as the password write,
 * and the update is conditional on it still being unused, so two concurrent
 * submissions of the same link cannot both succeed. Bumping passwordChangedAt
 * invalidates every session issued before now.
 */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ ok: true; userId: string } | { ok: false }> {
  const lookup = await findValidResetToken(token);
  if (!lookup.valid) return { ok: false };

  const passwordHash = await bcrypt.hash(newPassword, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: lookup.tokenId, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });

      // Another request already used this token.
      if (consumed.count === 0) {
        throw new Error("TOKEN_ALREADY_USED");
      }

      await tx.user.update({
        where: { id: lookup.userId },
        data: { password: passwordHash, passwordChangedAt: new Date() },
      });
    });
  } catch {
    return { ok: false };
  }

  return { ok: true, userId: lookup.userId };
}

/** Housekeeping: drop tokens that are spent or long expired. */
export async function purgeStaleResetTokens(): Promise<number> {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        { usedAt: { not: null, lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
  });
  return count;
}
