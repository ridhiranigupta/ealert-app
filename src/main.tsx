import '@vly-ai/integrations';
import { Toaster } from "@/components/ui/sonner";
import { RequireAuth } from "@/components/RequireAuth";
import { RequireAdmin } from "@/components/layout/RequireAdmin";
import { AppShell } from "@/components/layout/AppShell";
import { VlyToolbar } from "../vly-toolbar-readonly.tsx";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import React, { StrictMode, useEffect, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { RotateCw } from "lucide-react";
import "./index.css";

/**
 * Lazy route loader with automatic stale-chunk recovery.
 *
 * Route modules are code-split into separate chunks that the browser fetches
 * on first navigation. If a chunk is unavailable at that moment the dynamic
 * import fails with "Failed to fetch dynamically imported module". Causes:
 *   - dev/preview server briefly unavailable while (re)starting
 *   - stale cached chunk URLs after a rebuild/deploy (old ?v= dep hashes or
 *     old content hashes in production)
 *
 * Recovery — the standard production pattern:
 *   1. Retry the import once immediately (covers transient blips).
 *   2. If it still fails, reload the page once, guarded by sessionStorage so
 *      it can never loop. The reload fetches a fresh index.html whose chunk
 *      URLs are current, recovering from stale hashes / dead caches without
 *      requiring the user to press Ctrl+R.
 *   3. If it fails again after the reload, throw — the RootErrorBoundary
 *      shows its recovery UI (a genuinely unavailable server is an
 *      infrastructure problem no client code can fix).
 *
 * On success the guard is cleared, so any later chunk failure gets its own
 * fresh recovery attempt.
 */
function recoverableLazy<T extends React.ComponentType>(
  loader: () => Promise<{ default: T }>,
) {
  return lazy(() =>
    loader().then(
      (mod) => {
        try {
          sessionStorage.removeItem("ealert-chunk-reload");
        } catch {
          /* storage unavailable — ignore */
        }
        return mod;
      },
      (err: unknown) => {
        console.warn("[route] chunk load failed, retrying…", err);
        return loader().catch((secondErr: unknown) => {
          console.warn("[route] chunk load failed again, reloading once…", secondErr);
          try {
            if (!sessionStorage.getItem("ealert-chunk-reload")) {
              sessionStorage.setItem("ealert-chunk-reload", "1");
              window.location.reload();
            }
          } catch {
            /* storage/reload unavailable — fall through to the boundary */
          }
          throw err;
        });
      },
    ),
  );
}

// Lazy load route components for better code splitting.
// recoverableLazy adds stale-chunk recovery so a transiently unavailable or
// stale route module self-heals instead of permanently breaking navigation.
const Landing = recoverableLazy(() => import("./pages/Landing.tsx"));
const AuthPage = recoverableLazy(() => import("./pages/Auth.tsx"));
const Dashboard = recoverableLazy(() => import("./pages/Dashboard.tsx"));
const Onboarding = recoverableLazy(() => import("./pages/Onboarding.tsx"));
const Contacts = recoverableLazy(() => import("./pages/Contacts.tsx"));
const LocationPage = recoverableLazy(() => import("./pages/LocationPage.tsx"));
const AlertsHistory = recoverableLazy(() => import("./pages/AlertsHistory.tsx"));
const AlertDetail = recoverableLazy(() => import("./pages/AlertDetail.tsx"));
const EmergencySession = recoverableLazy(() => import("./pages/EmergencySession.tsx"));
const NotificationsPage = recoverableLazy(() => import("./pages/NotificationsPage.tsx"));
const Profile = recoverableLazy(() => import("./pages/Profile.tsx"));
const Admin = recoverableLazy(() => import("./pages/Admin.tsx"));
const NotFound = recoverableLazy(() => import("./pages/NotFound.tsx"));

// Simple loading fallback for route transitions
function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-violet-400/30 border-t-violet-400" />
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Loading…
        </div>
      </div>
    </div>
  );
}

/** Silent error boundary — if VlyToolbar crashes it renders nothing instead of
 *  crashing the whole app (e.g. hook errors in WebContainer environment). */
class ToolbarErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(err: Error) {
    console.warn("[VlyToolbar] Caught error, toolbar disabled:", err.message);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

/** Hard guard so runtime errors never leave the preview as a blank page. */
class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string; stack: string }
> {
  state = { hasError: false, message: "", stack: "" };
  static getDerivedStateFromError(error: Error) {
    return {
      hasError: true,
      message: error.message || "Unknown runtime error",
      stack: error.stack || "",
    };
  }
  componentDidCatch(err: Error) {
    console.error("[WebContainer preview] Root crash:", err);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-lg text-center">
            <p className="text-sm font-semibold">Preview runtime error</p>
            <p className="mt-2 text-xs text-muted-foreground break-words">
              {this.state.message}
            </p>
            {this.state.stack && (
              <pre className="mt-3 text-left text-[10px] leading-4 text-muted-foreground/80 max-h-40 overflow-auto rounded border border-border/60 p-2">
                {this.state.stack}
              </pre>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-xs font-semibold text-background transition hover:opacity-90 active:scale-95"
            >
              <RotateCw className="size-3.5" aria-hidden />
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}

/** Authenticated routes share the app shell. */
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ToolbarErrorBoundary>
        <VlyToolbar />
      </ToolbarErrorBoundary>
      <ConvexAuthProvider client={convex}>
        <BrowserRouter>
          <RouteSyncer />
          <Suspense fallback={<RouteLoading />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/auth"
                element={<AuthPage redirectAfterAuth="/dashboard" />}
              />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/setup" element={<Protected><Onboarding /></Protected>} />
              <Route path="/contacts" element={<Protected><Contacts /></Protected>} />
              <Route path="/location" element={<Protected><LocationPage /></Protected>} />
              <Route path="/alerts" element={<Protected><AlertsHistory /></Protected>} />
              <Route path="/alerts/:id" element={<Protected><AlertDetail /></Protected>} />
              <Route path="/emergency/:id" element={<Protected><EmergencySession /></Protected>} />
              <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
              <Route path="/profile" element={<Protected><Profile /></Protected>} />
              <Route
                path="/admin"
                element={
                  <RequireAuth>
                    <RequireAdmin>
                      <AppShell>
                        <Admin />
                      </AppShell>
                    </RequireAdmin>
                  </RequireAuth>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
        <Toaster theme="dark" position="top-center" richColors />
      </ConvexAuthProvider>
    </RootErrorBoundary>
  </StrictMode>,
);