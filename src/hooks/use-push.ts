import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useState } from "react";

export type PushPermission = "unsupported" | "default" | "denied" | "granted";

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Explicit ArrayBuffer backing so the result satisfies BufferSource
  // (PushManager.subscribe applicationServerKey) across TS DOM lib versions.
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Browser Web Push registration. This is the web half of app-to-app
 * emergency delivery: the browser subscribes (VAPID public key from the
 * server, never a secret) and stores the subscription server-side. Actual
 * delivery only happens when VAPID keys are configured server-side; until
 * then the UI says so honestly.
 */
export function usePushNotifications() {
  const pushStatus = useQuery(api.devices.pushStatus);
  const registerWebSubscription = useMutation(api.devices.registerWebSubscription);
  const updatePermissionStatus = useMutation(api.devices.updatePermissionStatus);

  const [permission, setPermission] = useState<PushPermission>(() =>
    typeof Notification === "undefined"
      ? "unsupported"
      : (Notification.permission as PushPermission),
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supported =
    typeof Notification !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof PushManager !== "undefined";

  // Keep the permission state in sync when the user changes it in the
  // browser settings and returns to the tab.
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    const sync = () => setPermission(Notification.permission as PushPermission);
    window.addEventListener("focus", sync);
    return () => window.removeEventListener("focus", sync);
  }, []);

  // Detect an existing subscription on mount.
  useEffect(() => {
    if (!supported || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistration("/sw.js")
      .then((reg) => reg?.pushManager.getSubscription() ?? null)
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch(() => {});
  }, [supported]);

  const enable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!supported) throw new Error("Push notifications are not supported by this browser.");
      if (!pushStatus?.configured || !pushStatus.vapidPublicKey) {
        throw new Error(
          "Push delivery isn't configured on the server yet. Add VAPID public/private keys in the project settings to enable app-to-app alerts.",
        );
      }

      const perm = await Notification.requestPermission();
      setPermission(perm as PushPermission);
      if (perm !== "granted") {
        await updatePermissionStatus({ status: perm, pushEnabled: false });
        throw new Error(
          "Notifications are blocked. Allow them in your browser settings, then try again.",
        );
      }

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(pushStatus.vapidPublicKey),
        });
      }

      const subscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: bytesToBase64Url(new Uint8Array(sub.getKey("p256dh") ?? new Uint8Array(0))),
          auth: bytesToBase64Url(new Uint8Array(sub.getKey("auth") ?? new Uint8Array(0))),
        },
      };
      await registerWebSubscription({
        subscription,
        notificationPermissionStatus: "granted",
      });
      await updatePermissionStatus({ status: "granted", pushEnabled: true });
      setSubscribed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable push notifications.");
    } finally {
      setBusy(false);
    }
  }, [supported, pushStatus, registerWebSubscription, updatePermissionStatus]);

  const disable = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      if (!supported) return;
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await updatePermissionStatus({
        status: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
        pushEnabled: false,
      });
      setSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable push notifications.");
    } finally {
      setBusy(false);
    }
  }, [supported, updatePermissionStatus]);

  return {
    supported,
    permission,
    subscribed,
    busy,
    error,
    enable,
    disable,
    serverConfigured: Boolean(pushStatus?.configured),
  };
}
