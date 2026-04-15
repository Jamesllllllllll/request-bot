export function serializeErrorForLog(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      type: typeof error,
      value: String(error),
    };
  }

  const serializedCause = (() => {
    const cause = error.cause;

    if (cause instanceof Error) {
      return {
        name: cause.name,
        message: cause.message,
        stack: cause.stack,
      };
    }

    if (cause !== undefined) {
      return cause;
    }

    return undefined;
  })();

  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    cause: serializedCause,
  };
}

export function createRequestStageTimer() {
  const stageDurations: Record<string, number> = {};

  return {
    stageDurations,
    async measure<T>(stage: string, operation: () => Promise<T>) {
      const startedAt = Date.now();

      try {
        return await operation();
      } finally {
        stageDurations[stage] = Date.now() - startedAt;
      }
    },
  };
}

export function registerAbortTrace(signal: AbortSignal, onAbort: () => void) {
  if (signal.aborted) {
    onAbort();
    return () => {};
  }

  const handleAbort = () => {
    onAbort();
  };

  signal.addEventListener("abort", handleAbort, { once: true });

  return () => {
    signal.removeEventListener("abort", handleAbort);
  };
}
