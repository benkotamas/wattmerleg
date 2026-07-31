export interface WeatherLocation { latitude: number; longitude: number; timezone: string; }
export interface DailyWeather { date: string; meanC: number; minC: number; maxC: number; }
export interface CurrentWeather { temperatureC: number; observedAt: string; }
export interface WeatherProvider { getCurrentWeather(location: WeatherLocation): Promise<CurrentWeather>; getDailyWeather(location: WeatherLocation, days?: number): Promise<DailyWeather[]>; getHistoricalWeather(location: WeatherLocation, start: string, end: string): Promise<DailyWeather[]>; }
