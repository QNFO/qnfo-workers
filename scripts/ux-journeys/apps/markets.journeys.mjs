// markets.q08.org on a phone (live mode, paper money only): the dashboard opens, shows the simulated-money notice and the account line, and one tap runs a tick.
export const name = "markets";
export const liveBase = "https://markets.q08.org";
export const journeys = [
  { id: "paper-dashboard", title: "Open the paper-trading dashboard and run a tick", modes: ["live"],
    async run(u) {
      await u.open("/");
      await u.see("Simulated money only");
      await u.see("Predictions");
      await u.see("Does the information beat the market?");
      await u.expect(async () => /Equity \$/.test((await u.page.locator("#s").innerText()) || ""), "the account line shows no equity on " + u.page.url());
      await u.tap("Run tick now", { wait: 1500 });
      await u.see("Open positions");
      await u.screen("paper-dashboard");
    } },
  { id: "order-form", title: "See the manual paper order form and its Buy buttons on a phone", modes: ["live"],
    async run(u) {
      await u.open("/");
      await u.see("Order size");
      await u.page.getByRole("button", { name: "Buy YES" }).first().waitFor({ state: "visible", timeout: 15000 }).catch(() => { throw new Error("no Buy YES button on " + u.page.url()); });
      await u.screen("order-form");
    } },
  { id: "whitepaper", title: "Read the white paper on a phone and reach the live evidence", modes: ["live"],
    async run(u) {
      await u.open("/whitepaper");
      await u.see("Where Do LLM Forecasters Have an Edge Over Prediction Markets?");
      await u.see("What this paper does not claim");
      await u.see("References");
      await u.screen("whitepaper");
    } }
];
