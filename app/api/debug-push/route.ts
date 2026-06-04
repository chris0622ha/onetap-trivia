import { NextRequest, NextResponse } from "next/server";

const PROJECT_ID = "onetap-trivia";

async function getAccessToken(): Promise<{ token: string | null; error: string | null }> {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) return { token: null, error: "No FIREBASE_SERVICE_ACCOUNT_KEY env var" };
    const key = JSON.parse(raw);
    const now = Math.floor(Date.now() / 1000);
    const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
    const payload = btoa(JSON.stringify({
      iss: key.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now, exp: now + 3600,
    })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
    const signingInput = `${header}.${payload}`;
    const pemKey = key.private_key.replace(/\\n/g, "\n");
    const keyData = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, "");
    const binaryKey = Uint8Array.from(atob(keyData), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey("pkcs8", binaryKey.buffer,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
    const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey,
      new TextEncoder().encode(signingInput));
    const sig = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
    const jwt = `${signingInput}.${sig}`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const tokenData = await tokenRes.json();
    if (tokenData.error) return { token: null, error: `OAuth error: ${tokenData.error} - ${tokenData.error_description}` };
    return { token: tokenData.access_token, error: null };
  } catch (e: any) {
    return { token: null, error: e.message };
  }
}

export async function GET(_req: NextRequest) {
  const checks: Record<string, any> = {};
  checks.hasServiceAccountKey = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  checks.hasVapidKey = !!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
  checks.hasApiKey = !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  const { token, error } = await getAccessToken();
  checks.jwtAuth = token ? "✅ Got access token" : `❌ Failed: ${error}`;

  if (token) {
    const testRes = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ message: { token: "INVALID_TEST_TOKEN", notification: { title: "test", body: "test" } } }),
    });
    const testData = await testRes.json();
    checks.fcmEndpoint = testData.error?.status === "INVALID_ARGUMENT"
      ? "✅ FCM reachable (invalid token expected)"
      : `Response: ${JSON.stringify(testData).slice(0, 200)}`;
  }

  return NextResponse.json(checks);
}

