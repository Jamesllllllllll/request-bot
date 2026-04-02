import { describe, expect, it } from "vitest";
import { getServerTranslation } from "~/lib/i18n/server";
import { getVipTokenAutomationDetails } from "~/lib/vip-token-automation";

describe("getVipTokenAutomationDetails", () => {
  it("keeps the minimum cheer line directly after the cheer conversion rule", () => {
    const details = getVipTokenAutomationDetails({
      autoGrantVipTokensForCheers: true,
      cheerBitsPerVipToken: 200,
      cheerMinimumTokenPercent: 25,
      autoGrantVipTokensForStreamElementsTips: true,
      streamElementsTipAmountPerVipToken: 5,
      autoGrantVipTokensForSharedSubRenewalMessage: true,
    });

    expect(details.earningRules).toEqual([
      "Shared sub renewal message = 1 VIP token",
      "Cheer 200 bits = 1 VIP token",
      "Minimum cheer: 50 bits = 0.25 VIP tokens.",
      "StreamElements tip $5 = 1 VIP token",
    ]);
  });

  it("can localize VIP token automation details for non-English website locales", () => {
    const { locale, t } = getServerTranslation("es", "extension");
    const details = getVipTokenAutomationDetails(
      {
        autoGrantVipTokensForCheers: true,
        cheerBitsPerVipToken: 200,
        cheerMinimumTokenPercent: 25,
        autoGrantVipTokensForStreamElementsTips: true,
        streamElementsTipAmountPerVipToken: 5,
        autoGrantVipTokensForSharedSubRenewalMessage: true,
      },
      {
        locale,
        translate: (key, options) => t(key, options),
      }
    );

    expect(details.earningRules).toEqual([
      "Mensaje compartido de renovación de suscripción = 1 token VIP",
      "Cheer de 200 bits = 1 token VIP",
      "Cheer mínimo: 50 bits = 0,25 tokens VIP.",
      "Propina de StreamElements de 5 US$ = 1 token VIP",
    ]);
  });
});
