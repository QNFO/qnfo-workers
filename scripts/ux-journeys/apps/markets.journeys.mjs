// markets.q08.org on a phone (live mode, paper money only): the dashboard opens, shows the simulated-money notice and the account line, and one tap runs a tick.
export const name = "markets";
export const liveBase = "https://markets.q08.org";
export const journeys = [
  { id: "paper-dashboard", title: "Open the paper-trading dashboard and run a tick", modes: ["live"],
    async run(u) {
      await u.open("/");
      await u.see("Simulated money only");
      await u.expect(async () => /Equity \$/.test((await u.page.locator("#s").innerText()) || ""), "the account line shows no equity on " + u.page.url());
      await u.tap("Run tick now", { wait: 1500 });
      await u.see("Open positions");
      await u.screen("paper-dashboard");
    } }
];
