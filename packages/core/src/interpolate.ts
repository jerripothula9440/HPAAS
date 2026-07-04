// Deterministic template interpolation — the NON-AI half of message
// generation. The AI writes one template per campaign ("Hi {{name}}...");
// this fills each profile's variables at send time. No LLM calls here.

import type { Features, Profile } from "@hpas/types";

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key: string) => vars[key] ?? "");
}

/** The variable set available to campaign templates, per profile. */
export function variablesForProfile(
  profile: Profile,
  features: Features | undefined,
  extra: Record<string, string> = {}
): Record<string, string> {
  const name = typeof profile.traits.name === "string" ? profile.traits.name.split(" ")[0] : "";
  return {
    name: name || "ji", // warm fallback when the POS had no name
    favorite_item: features?.favoriteItem ?? "your usual favorites",
    category: features?.categoryAffinity ?? "sweets",
    days_since_visit: features ? String(features.recencyDays) : "",
    ...extra,
  };
}
