import { NextRequest, NextResponse } from "next/server";

const PROJECT_ID = "onetap-trivia";
const FCM_URL = `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`;
const DB = "https://onetap-trivia-default-rtdb.firebaseio.com";

function toBase64Url(str: string): string {
  return btoa(str).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}

async function getAccessToken(): Promise<string> {
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg:"RS256", typ:"JWT" }));
  const payload = toBase64Url(JSON.stringify({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/firebase https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }));
  const sigInput = `${header}.${payload}`;
  const pem = key.private_key.replace(/\\n/g,"\n");
  const keyData = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g,"");
  const bin = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const ck = await crypto.subtle.importKey("pkcs8", bin.buffer,
    { name:"RSASSA-PKCS1-v1_5", hash:"SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", ck, new TextEncoder().encode(sigInput));
  const jwt = `${sigInput}.${toBase64Url(String.fromCharCode(...new Uint8Array(sig)))}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST", headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await tokenRes.json();
  if (data.error) throw new Error(`OAuth: ${data.error} - ${data.error_description}`);
  return data.access_token;
}

export async function POST(req: NextRequest) {
  try {
    const { token, title, body, url, sender } = await req.json();
    if (!token || !title) return NextResponse.json({ error:"Missing fields" }, { status:400 });
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return NextResponse.json({ error:"No service account" }, { status:500 });

    const accessToken = await getAccessToken();
    const finalBody = sender ? `${body} -${sender}` : body;

    // Send FCM push
    const res = await fetch(FCM_URL, {
      method:"POST",
      headers:{"Content-Type":"application/json", Authorization:`Bearer ${accessToken}`},
      body: JSON.stringify({
        message: {
          token,
          webpush: {
            notification: { title, body: finalBody, icon:"/favicon.ico", badge:"/favicon.ico", vibrate:[100,50,100] },
            fcm_options: { link: url || "/" },
          },
        },
      }),
    });
    const result = await res.json();

    // Log to Firebase using access token (has firebase scope)
    const logKey = `${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    await fetch(`${DB}/notifHistory/${logKey}.json?access_token=${accessToken}`, {
      method:"PUT",
      body: JSON.stringify({
        title, body: finalBody, sender: sender||"system",
        success: !result.error,
        error: result.error?.message || null,
        ts: Date.now(),
        sentAt: new Date().toLocaleString(),
      }),
      headers:{"Content-Type":"application/json"},
    });

    return NextResponse.json(result);
  } catch(e: any) {
    return NextResponse.json({ error: e.message }, { status:500 });
  }
}
