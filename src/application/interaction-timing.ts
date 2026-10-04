export type TimedInteraction = "proposal" | "recipe" | "adaptive";
type Phase = "llmMs" | "validationMs" | "operationMs";

export interface InteractionTiming {
  interaction: TimedInteraction;
  outcome: "ok" | "failed";
  totalMs: number;
  llmMs: number | null;
  validationMs: number | null;
  operationMs: number | null;
}

export type TimingReporter = (timing: InteractionTiming) => void;

/** Contains only fixed labels and elapsed times, never prompts, results or errors. */
export const logInteractionTiming: TimingReporter = (timing) => {
  const duration = (value: number | null) => value === null ? "n/a" : `${value.toFixed(2)}ms`;
  console.error(`[timing] ${timing.interaction} ${timing.outcome} total=${duration(timing.totalMs)} llm=${duration(timing.llmMs)} parse/validate=${duration(timing.validationMs)} app/domain=${duration(timing.operationMs)}`);
};

/** Monotonic measurements. Reporting is optional and cannot affect the result. */
export class InteractionTimer {
  private readonly startedAt: number;
  private readonly phases: Record<Phase, number | null> = { llmMs: null, validationMs: null, operationMs: null };

  constructor(
    private readonly interaction: TimedInteraction,
    private readonly report?: TimingReporter,
    private readonly now = () => performance.now(),
  ) {
    this.startedAt = this.now();
  }

  async request<T>(operation: () => Promise<T>): Promise<T> {
    const startedAt = this.now();
    try {
      return await operation();
    } finally {
      this.phases.llmMs = this.now() - startedAt;
    }
  }

  measure<T>(phase: Exclude<Phase, "llmMs">, operation: () => T): T {
    const startedAt = this.now();
    try {
      return operation();
    } finally {
      this.phases[phase] = this.now() - startedAt;
    }
  }

  finish(succeeded: boolean): void {
    const timing: InteractionTiming = { interaction: this.interaction, outcome: succeeded ? "ok" : "failed",
      totalMs: this.now() - this.startedAt, ...this.phases };
    try { this.report?.(timing); } catch { /* Diagnostics must not change application behavior. */ }
  }
}
