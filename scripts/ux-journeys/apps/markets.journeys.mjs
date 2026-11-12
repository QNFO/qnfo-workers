// markets.q08.org on a phone (live mode, paper money only): the dashboard opens, shows the simulated-money notice and the account line, and one tap runs a tick.
export const name = "markets";
export const liveBase = "https://markets.q08.org";
export const journeys = [
  { id: "paper-dashboard", title: "Open the paper-trading dashboard and run a tick", modes: ["live"],
    async run(u) {
      await u.open("/paper");
      await u.see("Simulated money only");
      await u.see("Predictions");
      await u.see("Does the information beat the market?");
      await u.expect(async () => /Equity\s+\$/.test((await u.page.locator("#s").innerText()) || ""), "the account line shows no equity on " + u.page.url());
      await u.tap("Run tick now", { wait: 1500 });
      await u.see("Open positions");
      await u.screen("paper-dashboard");
    } },
  { id: "order-form", title: "See the manual paper order form and its Buy buttons on a phone", modes: ["live"],
    async run(u) {
      await u.open("/paper");
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
    } },
  { id: "forecasts", title: "Read the consequential forecasts on a phone", modes: ["live"],
    async run(u) {
      await u.open("/forecasts");
      await u.see("Forecasts that move money");
      await u.see("Value captured");
      await u.screen("forecasts");
    } },
  { id: "pipeline-to-value", title: "Follow a forecast from its signals to its simulated value on a phone (VALUE-PIPELINE-1)", modes: ["live"],
    async run(u) {
      await u.open("/");
      await u.see("Signals in. Forecasts out. Value measured.");
      await u.see("Edge vs the market");
      await u.open("/track-record");
      await u.see("The pipeline's targets");
      await u.see("Forecast book");
      await u.see("Paper desk");
      await u.expect(async () => await u.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "the track record scrolls sideways on a phone");
      await u.screen("track-record");
    } }
];
