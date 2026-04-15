import { describe, expect, it } from "vitest";
import { createAbortError, isAbortError, throwIfAborted } from "~/lib/abort";

describe("abort helpers", () => {
  it("creates abort errors with the expected name", () => {
    const error = createAbortError();

    expect(error.name).toBe("AbortError");
    expect(isAbortError(error)).toBe(true);
  });

  it("throws the existing abort reason when available", () => {
    const controller = new AbortController();
    const reason = createAbortError("Cancelled.");

    controller.abort(reason);

    expect(() => throwIfAborted(controller.signal)).toThrow(reason);
  });

  it("throws a default abort error when no error reason is provided", () => {
    const controller = new AbortController();

    controller.abort("cancelled");

    expect(() => throwIfAborted(controller.signal)).toThrowError(
      /operation was aborted/i
    );
  });
});
