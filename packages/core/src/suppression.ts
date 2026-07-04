// The suppression layer. Mandatory, shared, tenant-agnostic: EVERY
// enrollment passes through applySuppression before a campaign is created.
// Checks, in order:
//   1. tenant preference — is this campaign type enabled at all?
//   2. global opt-out list
//   3. frequency cap — max messages per customer per rolling week
// There is no bypass parameter by design.

import type { CampaignType, Features, Profile, Tenant } from "@hpas/types";
import {
  countRecentMessages,
  getOptedOutPhones,
  getPreference,
  getProfilesByIds,
} from "@hpas/db";

export interface SuppressionResult {
  /** Profiles that may be enrolled, with their profile rows resolved. */
  eligible: Array<{ features: Features; profile: Profile }>;
  suppressed: Array<{ profileId: string; reason: string }>;
  /** True when the whole campaign type is disabled for the tenant. */
  campaignTypeDisabled: boolean;
}

export async function applySuppression(
  tenant: Tenant,
  campaignType: CampaignType,
  audience: Features[]
): Promise<SuppressionResult> {
  const pref = await getPreference(tenant.id, campaignType);
  if (pref && !pref.enabled) {
    return {
      eligible: [],
      suppressed: audience.map((f) => ({
        profileId: f.profileId,
        reason: `campaign type "${campaignType}" disabled by tenant preference`,
      })),
      campaignTypeDisabled: true,
    };
  }
  const maxPerWeek = pref?.maxPerCustomerPerWeek ?? 1;

  const profileIds = audience.map((f) => f.profileId);
  const [profiles, optedOut, recentCounts] = await Promise.all([
    getProfilesByIds(tenant.id, profileIds),
    getOptedOutPhones(tenant.id),
    countRecentMessages(tenant.id, profileIds, 7),
  ]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const eligible: SuppressionResult["eligible"] = [];
  const suppressed: SuppressionResult["suppressed"] = [];

  for (const features of audience) {
    const profile = profileById.get(features.profileId);
    if (!profile) {
      suppressed.push({ profileId: features.profileId, reason: "profile not found" });
      continue;
    }
    if (optedOut.has(profile.phone)) {
      suppressed.push({ profileId: profile.id, reason: "opted out" });
      continue;
    }
    if ((recentCounts.get(profile.id) ?? 0) >= maxPerWeek) {
      suppressed.push({
        profileId: profile.id,
        reason: `frequency cap (${maxPerWeek}/week) reached`,
      });
      continue;
    }
    eligible.push({ features, profile });
  }

  return { eligible, suppressed, campaignTypeDisabled: false };
}
