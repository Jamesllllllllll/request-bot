import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type PaginatedTransitionDirection = "forward" | "backward";
export type PaginatedTransitionPhase = "exit" | "enter";

type PaginatedTransitionState = {
  direction: PaginatedTransitionDirection;
  phase: PaginatedTransitionPhase;
};

const ENTER_RESET_DELAY_MS = 220;

export function usePaginatedContentTransition(input: {
  currentPage: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
}) {
  const [transitionState, setTransitionState] =
    useState<PaginatedTransitionState | null>(null);
  const pendingPageRef = useRef<number | null>(null);
  const resetTimeoutRef = useRef<number | null>(null);

  const clearResetTimeout = useCallback(() => {
    if (resetTimeoutRef.current != null) {
      window.clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (
        !Number.isFinite(nextPage) ||
        nextPage < 1 ||
        nextPage === input.currentPage ||
        transitionState !== null
      ) {
        return;
      }

      clearResetTimeout();
      pendingPageRef.current = nextPage;
      setTransitionState({
        direction: nextPage > input.currentPage ? "forward" : "backward",
        phase: "exit",
      });
      input.onPageChange(nextPage);
    },
    [clearResetTimeout, input, transitionState]
  );

  useEffect(() => {
    if (pendingPageRef.current == null || input.isFetching) {
      return;
    }

    pendingPageRef.current = null;
    setTransitionState((current) =>
      current
        ? {
            ...current,
            phase: "enter",
          }
        : null
    );

    clearResetTimeout();
    resetTimeoutRef.current = window.setTimeout(() => {
      setTransitionState(null);
      resetTimeoutRef.current = null;
    }, ENTER_RESET_DELAY_MS);
  }, [clearResetTimeout, input.isFetching]);

  useEffect(() => {
    return () => {
      clearResetTimeout();
    };
  }, [clearResetTimeout]);

  const transitionClassName = useMemo(() => {
    if (!transitionState) {
      return "";
    }

    if (transitionState.phase === "exit") {
      return transitionState.direction === "forward"
        ? "paginated-transition--exit-forward"
        : "paginated-transition--exit-backward";
    }

    return transitionState.direction === "forward"
      ? "paginated-transition--enter-forward"
      : "paginated-transition--enter-backward";
  }, [transitionState]);

  return {
    goToPage,
    isTransitioning: transitionState !== null,
    transitionClassName,
  };
}
