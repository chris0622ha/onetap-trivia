import { NextRequest, NextResponse } from "next/server";

const DB_URL = "https://onetap-trivia-default-rtdb.firebaseio.com";

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get("uid");
    const key = searchParams.get("key");
    const dur = searchParams.get("dur");
    if (!uid || !key || !dur) return NextResponse.json({ ok: false });

    // Write to Firebase REST API (no auth needed for write since rules allow it)
    await fetch(`${DB_URL}/users/${uid}/loginHistory/${key}/durationMin.json`, {
      method: "PUT",
      body: dur,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false });
  }
}
