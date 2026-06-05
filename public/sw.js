importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "PLACEHOLDER_REPLACED_AT_RUNTIME",
  authDomain: "onetap-trivia.firebaseapp.com",
  databaseURL: "https://onetap-trivia-default-rtdb.firebaseio.com",
  projectId: "onetap-trivia",
  storageBucket: "onetap-trivia.firebasestorage.app",
  messagingSenderId: "986046986694",
  appId: "1:986046986694:web:2a4441bf46965ccbb3dac7",
});

const messaging = firebase.messaging();

// webpush.notification is handled by the browser directly — no need to call
// showNotification here. Doing so causes a duplicate "New notification from TrivQuic".
// onBackgroundMessage only fires for data-only messages; for webpush.notification
// messages the browser displays them automatically before this runs.
messaging.onBackgroundMessage((_payload) => {
  // intentionally empty — browser already displayed the notification
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
