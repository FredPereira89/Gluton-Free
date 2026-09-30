export const BASELINE_DATAFORSEO_CAP_USD = 25;
export const BASELINE_LLM_CAP_USD = 15;

export type BaselineSpendKind = "dataforseo" | "llm";
export type SettleSpend = (actualUsd: number) => Promise<void>;
export type ReserveSpend = (maximumUsd: number) => Promise<SettleSpend>;

export class BaselineSpendCapError extends Error {
  constructor(readonly kind: BaselineSpendKind, readonly capUsd: number) {
    super(`Lisbon baseline ${kind} spend ceiling of $${capUsd} would be exceeded`);
    this.name = "BaselineSpendCapError";
  }
}

/** Reserves a worst-case request cost before starting a billable vendor operation. */
export class BaselineSpendBudget {
  private readonly spent: Record<BaselineSpendKind, number>;
  private readonly reserved: Record<BaselineSpendKind, number> = { dataforseo: 0, llm: 0 };

  constructor(initial: Partial<Record<BaselineSpendKind, number>> = {}) {
    this.spent = {
      dataforseo: Math.max(0, initial.dataforseo ?? 0),
      llm: Math.max(0, initial.llm ?? 0),
    };
    this.assertWithin("dataforseo", BASELINE_DATAFORSEO_CAP_USD);
    this.assertWithin("llm", BASELINE_LLM_CAP_USD);
  }

  reserve(kind: BaselineSpendKind): ReserveSpend {
    return async (maximumUsd) => {
      if (!Number.isFinite(maximumUsd) || maximumUsd < 0) throw new Error("Invalid baseline spend reservation");
      const cap = kind === "dataforseo" ? BASELINE_DATAFORSEO_CAP_USD : BASELINE_LLM_CAP_USD;
      if (this.spent[kind] + this.reserved[kind] + maximumUsd > cap + 1e-9) {
        throw new BaselineSpendCapError(kind, cap);
      }
      this.reserved[kind] += maximumUsd;
      let settled = false;
      return async (actualUsd) => {
        if (settled) throw new Error("Baseline spend reservation was already settled");
        settled = true;
        this.reserved[kind] -= maximumUsd;
        if (!Number.isFinite(actualUsd) || actualUsd < 0) throw new Error("Invalid baseline vendor cost");
        this.spent[kind] += actualUsd;
        if (actualUsd > maximumUsd + 1e-9) throw new BaselineSpendCapError(kind, cap);
        this.assertWithin(kind, cap);
      };
    };
  }

  addActual(kind: BaselineSpendKind, actualUsd: number): void {
    if (!Number.isFinite(actualUsd) || actualUsd < 0) throw new Error("Invalid baseline vendor cost");
    this.spent[kind] += actualUsd;
    this.assertWithin(kind, kind === "dataforseo" ? BASELINE_DATAFORSEO_CAP_USD : BASELINE_LLM_CAP_USD);
  }

  totals(): Record<BaselineSpendKind, number> {
    return { ...this.spent };
  }

  private assertWithin(kind: BaselineSpendKind, cap: number): void {
    if (this.spent[kind] + this.reserved[kind] > cap + 1e-9) throw new BaselineSpendCapError(kind, cap);
  }
}
