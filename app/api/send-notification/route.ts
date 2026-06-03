import { NextRequest, NextResponse } from "next/server";

// Firebase Admin SDK via REST (no admin SDK needed)
const FCM_URL = "https://fcm.googleapis.com/fcm/send";

export async function POST(req: NextRequest) {
  try {
    const { token, title, body, url } = await req.json();
    if (!token || !title) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    const serverKey = process.env.FIREBASE_SERVER_KEY;
    if (!serverKey) return NextResponse.json({ error: "No server key" }, { status: 500 });

    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify({
        to: token,
        data: { title, body, url: url || "/" },
        notification: { title, body },
      }),
    });

    const result = await res.json();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
