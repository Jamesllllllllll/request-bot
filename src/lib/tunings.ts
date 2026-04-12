import { getUniqueTunings } from "./tuning-summary";

export type TuningId = number;

export type TuningOption = {
  id: TuningId;
  label: string;
};

const knownTuningOptions: TuningOption[] = [
  { id: 1, label: "E Standard" },
  { id: 2, label: "F# Standard" },
  { id: 3, label: "F Standard" },
  { id: 4, label: "Drop D" },
  { id: 5, label: "Eb Standard" },
  { id: 6, label: "Eb Drop Db" },
  { id: 7, label: "D Standard" },
  { id: 8, label: "D Drop C" },
  { id: 9, label: "C# Standard" },
  { id: 10, label: "C# Drop B" },
  { id: 11, label: "C Standard" },
  { id: 12, label: "C Drop Bb" },
  { id: 13, label: "B Standard" },
  { id: 14, label: "B Drop A" },
  { id: 15, label: "Bb Standard" },
  { id: 16, label: "Bb Drop Ab" },
  { id: 17, label: "A Standard" },
  { id: 18, label: "A Drop G" },
  { id: 19, label: "G Standard" },
  { id: 20, label: "Gb Standard" },
  { id: 21, label: "F# Standard" },
  { id: 22, label: "F Standard" },
  { id: 23, label: "EADGCF" },
  { id: 24, label: "DADGBD" },
  { id: 25, label: "DADGAD" },
  { id: 27, label: "EADGBD" },
  { id: 29, label: "EADGAe" },
  { id: 31, label: "EADGBd#" },
  { id: 32, label: "Open D" },
  { id: 33, label: "Open A" },
  { id: 34, label: "Open G" },
  { id: 35, label: "Open E" },
  { id: 36, label: "Open C6" },
  { id: 37, label: "Open C5" },
  { id: 40, label: "Open Dm" },
  { id: 41, label: "Open Em7" },
  { id: 42, label: "Open Db/C#" },
  { id: 43, label: "Custom Tuning" },
  { id: 46, label: "Drop E" },
  { id: 47, label: "Drop F" },
  { id: 48, label: "Drop F#" },
  { id: 49, label: "Ab Standard (G# Standard)" },
  { id: 50, label: "ADADGBe" },
  { id: 51, label: "BDADGC" },
  { id: 52, label: "BDADGBe" },
  { id: 53, label: "B Standard (7 string)" },
  { id: 54, label: "B Standard (5/6 String Bass)" },
  { id: 55, label: "Drop A (7 string)" },
  { id: 56, label: "Open C" },
  { id: 57, label: "Ab Standard" },
  { id: 58, label: "Open F" },
  { id: 59, label: "F# Standard (High)" },
  { id: 60, label: "F Standard (High)" },
  { id: 61, label: "Open B" },
  { id: 62, label: "F Standard (Low)" },
  { id: 63, label: "Octave Standard" },
];

const tuningLabelAliases: Array<{
  label: string;
  ids: TuningId[];
}> = [
  { label: "High F# Standard", ids: [2, 59] },
  { label: "High F Standard", ids: [3, 60] },
  { label: "Low Gb Standard", ids: [20] },
  { label: "Low F Standard", ids: [62] },
  { label: "Octave", ids: [63] },
  { label: "Celtic", ids: [25] },
  { label: "Other", ids: [43] },
];

const tuningOptionById = new Map(
  knownTuningOptions.map((option) => [option.id, option] as const)
);
const tuningOptionOrderById = new Map(
  knownTuningOptions.map((option, index) => [option.id, index] as const)
);
const tuningIdsByNormalizedLabel = new Map<string, TuningId[]>();

for (const option of knownTuningOptions) {
  tuningIdsByNormalizedLabel.set(normalizeTuningLabel(option.label), [
    option.id,
  ]);
}

for (const alias of tuningLabelAliases) {
  tuningIdsByNormalizedLabel.set(normalizeTuningLabel(alias.label), alias.ids);
}

export const allKnownTuningOptions = [...knownTuningOptions];
export const allKnownTuningIds = knownTuningOptions.map((option) => option.id);

export function normalizeTuningLabel(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function parseTuningIds(
  values: Array<number | string | null | undefined>
): TuningId[] {
  const normalized = new Set<TuningId>();

  for (const value of values) {
    if (typeof value === "number") {
      if (Number.isInteger(value) && value > 0) {
        normalized.add(value);
      }
      continue;
    }

    const trimmed = value?.trim();
    if (!trimmed) {
      continue;
    }

    const numericValue = Number(trimmed);
    if (Number.isInteger(numericValue) && numericValue > 0) {
      normalized.add(numericValue);
      continue;
    }

    const ids = tuningIdsByNormalizedLabel.get(normalizeTuningLabel(trimmed));
    if (!ids) {
      continue;
    }

    for (const id of ids) {
      normalized.add(id);
    }
  }

  return [...normalized].sort(compareTuningIds);
}

export function parseStoredTuningIds(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parseTuningIds(parsed) : [];
  } catch {
    return [];
  }
}

export function serializeStoredTuningIds(ids: Array<number | string>) {
  return JSON.stringify(parseTuningIds(ids));
}

export function compareTuningIds(left: TuningId, right: TuningId) {
  const leftOrder = tuningOptionOrderById.get(left);
  const rightOrder = tuningOptionOrderById.get(right);

  if (leftOrder != null && rightOrder != null) {
    return leftOrder - rightOrder;
  }

  if (leftOrder != null) {
    return -1;
  }

  if (rightOrder != null) {
    return 1;
  }

  return left - right;
}

export function getTuningOptionById(
  id: TuningId | null | undefined,
  fallbackLabel?: string | null | undefined
) {
  if (id == null) {
    return null;
  }

  const known = tuningOptionById.get(id);
  if (known) {
    return known;
  }

  const label = fallbackLabel?.trim();
  return label ? { id, label } : null;
}

function collectFallbackTuningLabels(
  input: TuningFields
): Map<TuningId, string> {
  const labels = new Map<TuningId, string>();
  const register = (
    id: number | null | undefined,
    label: string | null | undefined
  ) => {
    if (id == null) {
      return;
    }

    const trimmed = label?.trim();
    if (!trimmed || labels.has(id)) {
      return;
    }

    labels.set(id, trimmed);
  };

  register(input.leadTuningId, input.leadTuningName);
  register(input.rhythmTuningId, input.rhythmTuningName);
  register(input.bassTuningId, input.bassTuningName);

  for (const label of getUniqueTunings([input.tuningSummary])) {
    const ids = tuningIdsByNormalizedLabel.get(normalizeTuningLabel(label));
    if (!ids || ids.length !== 1) {
      continue;
    }

    register(ids[0], label);
  }

  return labels;
}

export type TuningFields = {
  tuningSummary?: string | null;
  leadTuningId?: number | null;
  leadTuningName?: string | null;
  rhythmTuningId?: number | null;
  rhythmTuningName?: string | null;
  bassTuningId?: number | null;
  bassTuningName?: string | null;
  altLeadTuningId?: number | null;
  altRhythmTuningId?: number | null;
  altBassTuningId?: number | null;
  bonusLeadTuningId?: number | null;
  bonusRhythmTuningId?: number | null;
  bonusBassTuningId?: number | null;
};

export function getTuningIdsFromFields(input: TuningFields) {
  return parseTuningIds([
    input.leadTuningId,
    input.rhythmTuningId,
    input.bassTuningId,
    input.altLeadTuningId,
    input.altRhythmTuningId,
    input.altBassTuningId,
    input.bonusLeadTuningId,
    input.bonusRhythmTuningId,
    input.bonusBassTuningId,
  ]);
}

export function getTuningOptionsFromFields(
  input: TuningFields
): TuningOption[] {
  const fallbackLabels = collectFallbackTuningLabels(input);
  return getTuningIdsFromFields(input)
    .map((id) => getTuningOptionById(id, fallbackLabels.get(id)))
    .filter((option): option is TuningOption => option !== null);
}

export function getTuningSummaryFromFields(input: TuningFields) {
  const labels = getTuningOptionsFromFields(input).map(
    (option) => option.label
  );
  return labels.length > 0 ? labels.join(" | ") : undefined;
}

export function getTuningIdsFromSong(input: {
  tuningIds?: Array<number | null | undefined> | null | undefined;
  tuning?: string | null | undefined;
}) {
  if (Array.isArray(input.tuningIds) && input.tuningIds.length > 0) {
    return parseTuningIds(input.tuningIds);
  }

  return parseTuningIds(getUniqueTunings([input.tuning]));
}
