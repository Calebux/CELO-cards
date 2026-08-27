export const SEASON_PLANS = {
  weekly:  { days: 7,  priceWei: "500000000000000000",    priceCelo: "0.5",  priceGdollar: "100000000000000000000",   priceGdollarDisplay: "100",   priceUsdt: "500000",    label: "7 Days"  },
  monthly: { days: 30, priceWei: "1500000000000000000",   priceCelo: "1.5",  priceGdollar: "200000000000000000000",   priceGdollarDisplay: "200",   priceUsdt: "1500000",   label: "30 Days" },
  season:  { days: 90, priceWei: "3500000000000000000",   priceCelo: "3.5",  priceGdollar: "7000000000000000000000",  priceGdollarDisplay: "7000",  priceUsdt: "3500000",   label: "90 Days" },
} as const;

export type SeasonPlan = keyof typeof SEASON_PLANS;
