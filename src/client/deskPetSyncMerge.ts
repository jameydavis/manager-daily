export type DeskPetSyncTimestamps = {
  localUpdatedAt: string;
  remoteUpdatedAt: string;
  localAppearanceUpdatedAt: string;
  remoteAppearanceUpdatedAt: string;
};

export type DeskPetSyncMergePlan = {
  applyRemoteGame: boolean;
  applyRemoteAppearance: boolean;
  shouldPushLocal: boolean;
};

export type DeskPetAppearanceRevisionPayload = {
  appearanceUpdatedAt?: string;
  updatedAt?: string;
};

export function parseUpdatedAtMs(iso: string): number {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Prefer appearanceUpdatedAt when present; fall back to overall updatedAt. */
export function getAppearanceRevisionFromPayload(payload: DeskPetAppearanceRevisionPayload): string {
  if (typeof payload.appearanceUpdatedAt === "string" && payload.appearanceUpdatedAt) {
    return payload.appearanceUpdatedAt;
  }
  if (typeof payload.updatedAt === "string" && payload.updatedAt) {
    return payload.updatedAt;
  }
  return "";
}

/** Decide how signed-in desk buddy state should merge on load. */
export function planDeskPetSyncMerge(ts: DeskPetSyncTimestamps): DeskPetSyncMergePlan {
  let shouldPushLocal = false;
  let applyRemoteGame = false;
  let applyRemoteAppearance = false;

  if (parseUpdatedAtMs(ts.remoteUpdatedAt) > parseUpdatedAtMs(ts.localUpdatedAt)) {
    applyRemoteGame = true;
  } else if (parseUpdatedAtMs(ts.localUpdatedAt) > parseUpdatedAtMs(ts.remoteUpdatedAt)) {
    shouldPushLocal = true;
  }

  const localAppearanceAt = ts.localAppearanceUpdatedAt;
  const remoteAppearanceAt = ts.remoteAppearanceUpdatedAt;
  if (!localAppearanceAt && remoteAppearanceAt) {
    applyRemoteAppearance = true;
  } else if (parseUpdatedAtMs(remoteAppearanceAt) > parseUpdatedAtMs(localAppearanceAt)) {
    applyRemoteAppearance = true;
  } else if (parseUpdatedAtMs(localAppearanceAt) > parseUpdatedAtMs(remoteAppearanceAt)) {
    shouldPushLocal = true;
  }

  return { applyRemoteGame, applyRemoteAppearance, shouldPushLocal };
}
