import type { AppRequestContext } from "~/lib/server/request-context";

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: AppRequestContext;
    };
  }
}
