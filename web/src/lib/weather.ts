import { TZ } from "./time";

export const DEFAULT_LAT = 32.7757;
export const DEFAULT_LON = -117.0719;

export type Weather = {
  source: "open-meteo" | "demo";
  location: string;
  tempF: number;
  highF: number;
  lowF: number;
  precipChance: number;
  conditions: string;
  wear: string;
  windMph?: number;
};

// WMO weather interpretation codes -> plain words
const WMO: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorms",
  96: "Thunderstorms with hail",
  99: "Thunderstorms with hail",
};

export function describeWmo(code: number | undefined): string {
  if (code === undefined || code === null) return "Clear";
  return WMO[code] ?? "Mixed conditions";
}

export function wearSuggestion(nowF: number, highF: number, lowF: number, precip: number, windMph = 0): string {
  const morning = Math.min(nowF, lowF + 4);
  let base: string;
  if (highF >= 88) base = "Shorts and a t-shirt, and drink water, it's a hot one";
  else if (highF >= 80 && morning >= 60) base = "Shorts and a t-shirt";
  else if (highF < 55) base = "Real jacket and warm layers all day";
  else if (morning < 60 && highF >= 68) base = "Hoodie for the morning, t-shirt by noon";
  else if (highF < 65) base = "Hoodie or a light jacket all day";
  else if (morning < 62) base = "Light layer this morning, t-shirt weather later";
  else base = "T-shirt weather all day";

  const extras: string[] = [];
  if (precip >= 50) extras.push("bring a rain jacket or umbrella");
  else if (precip >= 30) extras.push("maybe toss an umbrella in your bag");
  if (windMph >= 18) extras.push("it's windy, so a windbreaker helps");
  return extras.length ? `${base}, and ${extras.join(", and ")}.` : `${base}.`;
}

function demoWeather(location: string): Weather {
  return {
    source: "demo",
    location,
    tempF: 61,
    highF: 72,
    lowF: 57,
    precipChance: 0,
    conditions: "Foggy",
    wear: wearSuggestion(61, 72, 57, 0, 6),
    windMph: 6,
  };
}

export async function getWeather(lat = DEFAULT_LAT, lon = DEFAULT_LON): Promise<Weather> {
  const isDefault = Math.abs(lat - DEFAULT_LAT) < 0.01 && Math.abs(lon - DEFAULT_LON) < 0.01;
  const location = isDefault ? "San Diego" : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  try {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
    url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code");
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("wind_speed_unit", "mph");
    url.searchParams.set("timezone", TZ);
    url.searchParams.set("forecast_days", "1");

    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const j = await res.json();

    const tempF = Math.round(j.current.temperature_2m);
    const highF = Math.round(j.daily.temperature_2m_max[0]);
    const lowF = Math.round(j.daily.temperature_2m_min[0]);
    const precipChance = Math.round(j.daily.precipitation_probability_max?.[0] ?? 0);
    const windMph = Math.round(j.current.wind_speed_10m ?? 0);
    if (![tempF, highF, lowF].every(Number.isFinite)) throw new Error("bad weather payload");

    return {
      source: "open-meteo",
      location,
      tempF,
      highF,
      lowF,
      precipChance,
      conditions: describeWmo(j.current.weather_code),
      wear: wearSuggestion(tempF, highF, lowF, precipChance, windMph),
      windMph,
    };
  } catch (err) {
    console.error("[weather] falling back to demo:", err);
    return demoWeather(location);
  }
}
