import { authMailDevFallbackEnabled, sendTemporaryPasswordEmail } from "./authMail.js";
import { authUserDisplayLabel } from "./authTypes.js";
import {
  deleteSessionsForUser,
  findUserWithHashByEmail,
  findUserWithHashById,
  updateUserPasswordHash,
} from "./db.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { generateTemporaryPassword } from "./tempPassword.js";

const GENERIC_RESET_SENT =
  "If an account exists for that email, we sent a temporary password. Check your inbox and spam folder.";

export type PasswordResetRequestResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Always returns a user-safe message when `ok` is true (no email enumeration). */
export async function requestPasswordReset(email: string): Promise<PasswordResetRequestResult> {
  const row = findUserWithHashByEmail(email);
  if (!row) {
    return { ok: true, message: GENERIC_RESET_SENT };
  }

  const temporaryPassword = generateTemporaryPassword();
  const displayName = authUserDisplayLabel({
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
  });

  const mail = await sendTemporaryPasswordEmail({
    to: row.email,
    temporaryPassword,
    displayName,
  });

  if (!mail.ok) {
    if (authMailDevFallbackEnabled()) {
      console.info(
        `[daily-dashboard] Password reset for ${row.email} (SMTP not configured). Temporary password: ${temporaryPassword}`
      );
    } else {
      return {
        ok: false,
        message: mail.error ?? "Could not send the reset email. Try again later.",
      };
    }
  }

  updateUserPasswordHash(row.id, hashPassword(temporaryPassword));
  deleteSessionsForUser(row.id);
  return { ok: true, message: GENERIC_RESET_SENT };
}

export type ChangePasswordResult = { ok: true } | { ok: false; message: string };

export function changeUserPassword(
  userId: number,
  currentPassword: string,
  newPassword: string
): ChangePasswordResult {
  const row = findUserWithHashById(userId);
  if (!row) {
    return { ok: false, message: "Account not found." };
  }
  if (!verifyPassword(currentPassword, row.password_hash)) {
    return { ok: false, message: "Current password is incorrect." };
  }
  if (verifyPassword(newPassword, row.password_hash)) {
    return { ok: false, message: "Choose a password different from your current one." };
  }
  updateUserPasswordHash(userId, hashPassword(newPassword));
  return { ok: true };
}
