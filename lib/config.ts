export const ENERGY_CONFIG = {
  annualDiscountLimitKwh: 2523,
  discountedPriceHufPerKwh: 36,
  marketPriceHufPerKwh: 70.1,
  exportPriceHufPerKwh: 5,
  annualClosingMonth: 8,
  annualClosingDay: 4,
} as const;

export const DEFAULT_TARIFF_SETTINGS = {
  discounted_limit_kwh: ENERGY_CONFIG.annualDiscountLimitKwh,
  discounted_price_ft: ENERGY_CONFIG.discountedPriceHufPerKwh,
  market_price_ft: ENERGY_CONFIG.marketPriceHufPerKwh,
  feed_in_price_ft: ENERGY_CONFIG.exportPriceHufPerKwh,
  annual_closing_month: ENERGY_CONFIG.annualClosingMonth,
  annual_closing_day: ENERGY_CONFIG.annualClosingDay,
  heating_season_start_month: 10,
  heating_season_start_day: 1,
  heating_season_end_month: 4,
  heating_season_end_day: 30,
};
