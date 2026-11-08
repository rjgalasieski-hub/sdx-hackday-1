import { NextResponse } from "next/server";
import { getProfile, saveProfile, type Profile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getProfile());
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Partial<Profile>;
    const profile = await saveProfile(body);
    return NextResponse.json({ ok: true, profile });
  } catch (err) {
    console.error("[profile] save failed:", err);
    return NextResponse.json({ ok: false, error: "Could not save your setup. Try again." }, { status: 400 });
  }
}
