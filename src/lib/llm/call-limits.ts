import { InvalidToolInputError } from "ai";

/**
 * Limits for one-shot model calls behind a button (quick actions, Ask AI). Found
 * in real-model testing (2026-09-25): a model can degenerate into an endless tool
 * argument and keep the UI waiting for minutes, so every such call gets a deadline.
 */
export function withDeadline(signal: AbortSignal, ms: number): AbortSignal {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

/** A message for the user when a one-shot call fails, or null if it isn't one we explain. */
export function explainCallError(error: unknown, ms: number): string | null {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return `The model took longer than ${Math.round(ms / 1000)} s. Try again, or choose a faster model.`;
  }
  if (InvalidToolInputError.isInstance(error)) {
    return "The model's reply was malformed. Try again.";
  }
  return null;
}
