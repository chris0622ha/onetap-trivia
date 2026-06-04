import { NextRequest, NextResponse } from "next/server";

const PROJECT_ID = "onetap-trivia";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;

function toBase64Url(str: string): string {
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(): Promise<string> {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${payload}`;
  const pemKey = key.private_key.replace(/\\n/g, "\n");
  const keyData = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
  const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(signingInput));
  const sig = toBase64Url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${signingInput}.${sig}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (tokenData.error) throw new Error(`OAuth: ${tokenData.error} - ${tokenData.error_description}`);
  return tokenData.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { token, title, body, url, sender } = await req.json();
    if (!token || !title) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return NextResponse.json({ error: "No service account" }, { status: 500 });

    const accessToken = await getAccessToken();

    // Append sender username to body if provided
    const finalBody = sender ? `${body} -${sender}` : body;

    const res = await fetch(FCM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        message: {
          token,
          // Only webpush notification — no top-level notification to avoid duplicates
          webpush: {
            notification: {
              title,
              body: finalBody,
              icon: "/favicon.ico",
              badge: "/favicon.ico",
              vibrate: [100, 50, 100],
            },
            fcm_options: { link: url || "/" },
          },
        },
      }),
    });

    const result = await res.json();
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
