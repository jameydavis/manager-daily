import { z } from "zod";

const cornerSchema = z.enum(["br", "bl", "tr", "tl"]);
const paletteSchema = z.enum([
  "lavender",
  "ocean",
  "meadow",
  "sunset",
  "berry",
  "honey",
  "arctic",
  "charcoal",
]);

const gameStateSchema = z.object({
  fullness: z.number().min(0).max(100),
  lastFullnessAt: z.string().min(1).max(64),
  tickleCount: z.number().min(0).max(1_000_000),
  feedCount: z.number().min(0).max(1_000_000),
  expired: z.boolean(),
  alertedCute: z.boolean(),
  alertedUrgent: z.boolean(),
});

export const deskPetSyncStateSchema = z.object({
  v: z.literal(1),
  game: gameStateSchema,
  displayName: z.string().max(12),
  corner: cornerSchema,
  palette: paletteSchema,
  uiCollapsed: z.boolean().optional(),
  /** When name/corner/palette last changed; falls back to updatedAt when absent. */
  appearanceUpdatedAt: z.string().min(1).max(64).optional(),
  updatedAt: z.string().min(1).max(64),
});

export type DeskPetSyncState = z.infer<typeof deskPetSyncStateSchema>;

export function parseDeskPetSyncState(raw: unknown): DeskPetSyncState | null {
  const r = deskPetSyncStateSchema.safeParse(raw);
  return r.success ? r.data : null;
}
