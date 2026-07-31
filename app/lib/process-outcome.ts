export type ProcessOutcome = "success" | "failure";

interface ProcessOutcomeHandlers {
  onSuccess: () => void;
  onFailure: () => void;
}

export function settleProcessOutcome(
  processedCount: number,
  handlers: ProcessOutcomeHandlers
): ProcessOutcome {
  if (processedCount === 0) {
    handlers.onFailure();
    return "failure";
  }

  handlers.onSuccess();
  return "success";
}
