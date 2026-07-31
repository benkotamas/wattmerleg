import type { DailyWeather, WeatherLocation, WeatherProvider } from "./types";
import { localIsoDate } from "./date";
export async function weatherForLogDate(provider: WeatherProvider, location: WeatherLocation, logDate: string, today = localIsoDate(new Date(), location.timezone)): Promise<DailyWeather | null> {
  const values = logDate < today ? await provider.getHistoricalWeather(location, logDate, logDate) : await provider.getDailyWeather(location, 16);
  return values.find(value => value.date === logDate) ?? null;
}
export async function dailyWeatherWithFallback(provider: WeatherProvider, location: WeatherLocation, manualTemperatureC?: number): Promise<{weather: DailyWeather | null; source: "weather_api"|"manual"|"unavailable"; warning?: string}> {
  try { const weather=(await provider.getDailyWeather(location,1))[0]; if(weather) return {weather,source:"weather_api"}; throw new Error("Nincs napi adat."); }
  catch (error) { if(Number.isFinite(manualTemperatureC)) return {weather:{date:new Date().toISOString().slice(0,10),meanC:manualTemperatureC!,minC:manualTemperatureC!,maxC:manualTemperatureC!},source:"manual",warning:error instanceof Error?error.message:"Időjárási hiba."}; return {weather:null,source:"unavailable",warning:error instanceof Error?error.message:"Időjárási hiba."}; }
}
