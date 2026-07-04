// Hold-out control assignment: a random slice of every enrolled audience
// is flagged is_control and NEVER sent to, but tracked identically. The
// messaged-vs-control comparison is what proves campaigns actually work.

export const DEFAULT_HOLDOUT_RATIO = 0.17; // within the requested 15-20% band

export function assignHoldout<T>(
  audience: T[],
  ratio: number = DEFAULT_HOLDOUT_RATIO
): { treatment: T[]; control: T[] } {
  // Fisher-Yates shuffle on a copy, then slice.
  const shuffled = [...audience];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  // At least 1 control once the audience is big enough to spare one.
  const controlCount =
    audience.length >= 5 ? Math.max(1, Math.round(audience.length * ratio)) : 0;
  return {
    control: shuffled.slice(0, controlCount),
    treatment: shuffled.slice(controlCount),
  };
}
