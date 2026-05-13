import { z } from "zod";
import { PASSWORD_MAX_LEN, PASSWORD_MIN_LEN } from "./passwords.js";

export const atlassianSiteSchema = z
  .string()
  .trim()
  .min(1, "Enter your Jira Cloud site URL.")
  .transform((s) => s.replace(/\/$/, ""))
  .pipe(
    z
      .string()
      .url("Use a full URL, e.g. https://your-company.atlassian.net")
      .refine((u) => u.startsWith("https://"), "Use an https:// URL.")
      .refine((u) => {
        try {
          return new URL(u).hostname.toLowerCase().endsWith(".atlassian.net");
        } catch {
          return false;
        }
      }, "Must be your Jira Cloud host (…atlassian.net).")
  );

export const signupBodySchema = z.object({
  email: z.string().trim().email("Enter a valid email.").max(254),
  password: z
    .string()
    .min(PASSWORD_MIN_LEN, `Password must be at least ${PASSWORD_MIN_LEN} characters.`)
    .max(PASSWORD_MAX_LEN, `At most ${PASSWORD_MAX_LEN} characters.`)
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/\d/, "Include at least one number."),
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  atlassianSite: atlassianSiteSchema,
  atlassianApiToken: z
    .string()
    .trim()
    .min(20, "API token looks too short.")
    .max(300, "API token is too long."),
  jiraBoardId: z.preprocess(
    (v) => (typeof v === "string" ? v.trim() : v),
    z.coerce
      .number({ invalid_type_error: "Board id must be a number." })
      .int("Board id must be a whole number.")
      .positive("Board id must be greater than zero.")
  ),
});

export const loginBodySchema = z.object({
  email: z.string().trim().email("Enter a valid email.").max(254),
  password: z.string().min(1, "Password is required."),
});
