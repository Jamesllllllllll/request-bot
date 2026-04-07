export function getUniqueTunings(
  tunings: Array<string | null | undefined>
): string[] {
  const uniqueTunings: string[] = [];
  const seenTunings = new Set<string>();

  for (const tuning of tunings) {
    if (!tuning) {
      continue;
    }

    for (const part of tuning.split("|")) {
      const trimmed = part.trim();
      if (!trimmed) {
        continue;
      }

      const normalized = trimmed.toLowerCase();
      if (seenTunings.has(normalized)) {
        continue;
      }

      seenTunings.add(normalized);
      uniqueTunings.push(trimmed);
    }
  }

  return uniqueTunings;
}

export function formatCompactTuningSummary(
  tunings: Array<string | null | undefined>
) {
  const uniqueTunings = getUniqueTunings(tunings);
  const firstTuning = uniqueTunings[0];

  if (!firstTuning) {
    return undefined;
  }

  return uniqueTunings.length > 1
    ? `${firstTuning} +${uniqueTunings.length - 1}`
    : firstTuning;
}
