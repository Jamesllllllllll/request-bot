import { describe, expect, it } from "vitest";
import { buildStreamElementsTipRelayCode } from "~/lib/streamelements/instructions";

describe("StreamElements tip relay instructions", () => {
  it("builds paste-ready Streamer.bot code with the relay URL and expected fields", () => {
    const code = buildStreamElementsTipRelayCode(
      "https://example.com/api/integrations/streamelements/streamer/token-123"
    );

    expect(code).toContain(
      'PostAsync("https://example.com/api/integrations/streamelements/streamer/token-123", content)'
    );
    expect(code).toContain('args.ContainsKey("tipUsername")');
    expect(code).toContain('args.ContainsKey("tipAmount")');
    expect(code).toContain("eventId = deliveryId");
    expect(code).toContain('status = "success"');
    expect(code).toContain('approved = "approved"');
  });

  it("escapes the relay URL for a C# string literal", () => {
    const code = buildStreamElementsTipRelayCode(
      'https://example.com/path?label="quoted"'
    );

    expect(code).toContain(
      'PostAsync("https://example.com/path?label=\\"quoted\\"", content)'
    );
  });
});
