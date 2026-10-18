import { test as base } from "@playwright/test";
export { expect } from "@playwright/test";
export type {
  Page,
  BrowserContext,
  Route,
  APIRequestContext,
} from "@playwright/test";

// Existing mode tests represent a listener who already passed the entry screen.
// First-visit tests opt out so the actual gate is exercised without stored acknowledgement.
export const test = base.extend<{ entryAcknowledged: boolean }>({
  entryAcknowledged: [true, { option: true }],
  context: async ({ context, entryAcknowledged }, use) => {
    if (entryAcknowledged)
      await context.addInitScript(() =>
        sessionStorage.setItem("musicale-entry-session-v1", "yes"),
      );
    await use(context);
  },
});

export const firstVisit = test.extend({ entryAcknowledged: false });
