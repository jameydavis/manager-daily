import bcrypt from "bcryptjs";

export const PASSWORD_MIN_LEN = 8;
export const PASSWORD_MAX_LEN = 128;

export const BCRYPT_ROUNDS = Math.min(
  14,
  Math.max(10, Math.trunc(Number(process.env.BCRYPT_ROUNDS) || 12))
);

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, passwordHash: string): boolean {
  return bcrypt.compareSync(plain, passwordHash);
}
