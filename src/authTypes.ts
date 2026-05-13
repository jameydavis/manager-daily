export type AuthUser = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export function authUserDisplayLabel(u: AuthUser): string {
  const n = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return n || u.email;
}
