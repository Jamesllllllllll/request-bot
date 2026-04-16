import {
  compareTuningIds,
  getTuningOptionById,
  parseTuningIds,
  type TuningOption,
} from "~/lib/tunings";

export type SearchFilterOptionsResponse = {
  catalogTotal: number;
  tunings: TuningOption[];
  years: number[];
};

export type SearchFilterOptionsWireResponse = {
  catalogTotal?: number;
  tunings: Array<TuningOption | string>;
  years: number[];
};

export function normalizeSearchFilterOptionsResponse(
  input: SearchFilterOptionsWireResponse | null
): SearchFilterOptionsResponse {
  if (!input) {
    return {
      catalogTotal: 0,
      tunings: [],
      years: [],
    };
  }

  const tuningOptionsById = new Map<number, TuningOption>();

  for (const option of input.tunings ?? []) {
    if (
      option &&
      typeof option === "object" &&
      typeof option.id === "number" &&
      typeof option.label === "string"
    ) {
      tuningOptionsById.set(option.id, option);
      continue;
    }

    if (typeof option !== "string") {
      continue;
    }

    for (const tuningId of parseTuningIds([option])) {
      const normalizedOption = getTuningOptionById(tuningId, option);
      if (normalizedOption) {
        tuningOptionsById.set(normalizedOption.id, normalizedOption);
      }
    }
  }

  return {
    catalogTotal:
      typeof input.catalogTotal === "number" &&
      Number.isFinite(input.catalogTotal)
        ? input.catalogTotal
        : 0,
    tunings: [...tuningOptionsById.values()].sort((left, right) =>
      compareTuningIds(left.id, right.id)
    ),
    years: Array.isArray(input.years) ? input.years : [],
  };
}
