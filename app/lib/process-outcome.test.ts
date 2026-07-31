import { describe, expect, it } from "bun:test";

import { settleProcessOutcome } from "./process-outcome";

describe("settleProcessOutcome", () => {
  it("runs only the failure terminal branch when no output was produced", () => {
    const terminals: string[] = [];

    const outcome = settleProcessOutcome(0, {
      onSuccess: () => terminals.push("success"),
      onFailure: () => terminals.push("failure"),
    });

    expect(outcome).toBe("failure");
    expect(terminals).toEqual(["failure"]);
  });

  it("preserves the success terminal branch for nonempty output", () => {
    const terminals: string[] = [];

    const outcome = settleProcessOutcome(2, {
      onSuccess: () => terminals.push("success"),
      onFailure: () => terminals.push("failure"),
    });

    expect(outcome).toBe("success");
    expect(terminals).toEqual(["success"]);
  });
});
