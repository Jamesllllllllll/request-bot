import { expect, test } from "@playwright/test";

test("home page renders primary CTA", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("main").getByRole("link", { name: "Sign in with Twitch" })
  ).toBeVisible();
});
