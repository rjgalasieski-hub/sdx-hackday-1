import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_LAT, DEFAULT_LON, getWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

function num(v: string | null, fallback: number): number {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  const lat = num(req.nextUrl.searchParams.get("lat"), DEFAULT_LAT);
  const lon = num(req.nextUrl.searchParams.get("lon"), DEFAULT_LON);
  return NextResponse.json(await getWeather(lat, lon));
}
