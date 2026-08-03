export function shouldLoadStatisticsData(active: boolean, loadedKey: string, requestedKey: string): boolean { return active && requestedKey.length > 1 && loadedKey !== requestedKey; }
