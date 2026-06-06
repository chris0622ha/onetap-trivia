import { NextRequest, NextResponse } from "next/server";

export async function GET(_req: NextRequest) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
  const sw = `
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "${apiKey}",
  authDomain: "onetap-trivia.firebaseapp.com",
  databaseURL: "https://onetap-trivia-default-rtdb.firebaseio.com",
  projectId: "onetap-trivia",
  storageBucket: "onetap-trivia.firebasestorage.app",
  messagingSenderId: "986046986694",
  appId: "1:986046986694:web:2a4441bf46965ccbb3dac7",
});

const messaging = firebase.messaging();

// Handle background messages — data-only payload, we show exactly one notification.
// Returning a promise from onBackgroundMessage suppresses FCM's own auto-notification.
messaging.onBackgroundMessage((payload) => {
  const { title, body, url } = payload.data || {};
  if (!title) return;
  return self.registration.showNotification(title, {
    body: body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    vibrate: [100, 50, 100],
    data: { url: url || "/" },
    tag: "trivquic-notif",
    renotify: true,
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
`.trim();

  return new NextResponse(sw, {
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
