/* EAlert service worker.
 *
 * Handles emergency push notifications for app-to-app alerts:
 *   - "push" event → show a high-priority notification deep-linking into
 *     the emergency session screen.
 *   - "notificationclick" → focus an existing tab or open the emergency
 *     session.
 *
 * Privacy: the notification payload only carries the session/alert ids —
 * never coordinates, profile details or medical information.
 *
 * No caching is performed here (no fetch handler), so no personal data is
 * ever stored offline by this worker.
 */

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // fall through with empty payload
  }

  const title = data.title || "EAlert Emergency";
  const body = data.body || "Tap to open the emergency session.";
  const sessionId = data.sessionId || null;
  const url = sessionId ? `/emergency/${sessionId}` : "/dashboard";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/logo.svg",
      badge: "/logo.svg",
      tag: sessionId ? `ealert-emergency-${sessionId}` : "ealert-emergency",
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url, sessionId },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(url);
            } catch {
              // navigation can fail on some clients — focus is enough
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
