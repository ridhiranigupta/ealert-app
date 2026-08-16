# EAlert — Emergency Alert App

> **Your safety, one tap away.**

EAlert is a full-stack emergency alert application. A user triggers an SOS
with a press-and-hold button, and the app alerts their trusted emergency
contacts — verified contacts through the EAlert app itself (push
notification + live location + live video), and additional contacts via
SMS/email. EAlert also broadcasts a limited "Nearby Emergency" alert to
other EAlert users within a configurable radius (default 5 km) so people
close by can offer help.

The UI is a soft, modern, calming safety-app design: pastel lavender/blue/blush
palette, glassmorphism cards, large rounded corners, and gentle motion —
red is reserved for emergency/SOS actions and warnings.

**Live at:** `/` (landing) → `/auth` (sign in) → `/dashboard` (app)

---

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Authentication](#authentication)
- [Database schema](#database-schema)
- [Backend API overview](#backend-api-overview)
- [Security model](#security-model)
- [Testing](#testing)
- [Deployment](#deployment)
- [Usage examples](#usage-examples)
- [Known limitations](#known-limitations)

---

## Features

Everything below is implemented and lives in this repository. Nothing on
this list is aspirational.

### SOS emergency flow

- **Press-and-hold SOS button** (3 seconds) with a visible progress ring,
  followed by a 3-second countdown that can be cancelled before anything is
  sent (`src/components/sos/SOSFlow.tsx`).
- Alert is sent with the user's **real device coordinates** from the
  browser Geolocation API when available (permission is requested at
  trigger time; the alert can still be sent without coordinates).
- **Idempotent dispatch** — each SOS action carries a client-generated
  `clientAlertId`; retries/double-clicks never create duplicate alerts.
  Server-side rate limiting (one alert per 10 seconds) is a second guard.
- **Honest delivery status** — alerts are never reported "delivered"
  unless a provider actually confirmed it. Without provider credentials,
  recipients are recorded as `queued` with `provider_not_configured` and
  the UI explains exactly what is missing.
- Alert history with per-recipient delivery state (`/alerts`,
  `/alerts/:id`), including per-recipient retry.

### Emergency contacts & verified relationships

- Add up to 10 emergency contacts with name, relationship, phone, email,
  priority, primary flag, active toggle, and notification channels
  (`sms`/`email`/`push`) — `src/convex/emergencyContacts.ts`.
- When a contact's phone/email matches a registered EAlert account, the app
  opens a **contact relationship**: the other user must explicitly
  **accept** the request before anything app-to-app flows
  (`src/convex/relationships.ts`). Phone matching is canonicalized
  (digits-only) so formatting can never hide a registered account.
- Incoming requests appear in the Contacts page with accept/decline.
  Verified contacts receive SOS alerts **through the app** (push + session)
  instead of SMS.

### Emergency sessions

- Every SOS creates one emergency session (`src/convex/emergencySessions.ts`)
  with a lifecycle: `active → responding → resolved / cancelled / expired`
  (auto-expire after 4 h via cron `expire-emergency-sessions`, every 2 min).
- **Live location**: owner can stream real GPS points into the session
  (throttled to one point per 2 s); verified contacts see the live
  coordinates and an "Open in maps" link. Verified contacts responding can
  opt in to sharing their own location with the owner.
- **Responding**: verified contacts can mark "I'm responding" (optionally
  sharing their live location); the owner is notified immediately.
- **Live emergency video (LiveKit)**: the owner can "Start emergency
  video" — the browser requests camera + microphone and publishes real
  tracks to a LiveKit room. Verified contacts can "Join live video" in the
  same room. Tokens are minted server-side, short-lived, scoped to one
  room, and never persisted. See [integrations.md](./integrations.md) for
  LiveKit setup.
- Honest connection UI: `Connecting… / Connected / Reconnecting… /
  Disconnected / Connection failed`; camera/mic toggle and leave controls
  act on the real LiveKit tracks (`src/components/emergency/EmergencyVideoRoom.tsx`).
- Ending the emergency marks the session resolved, ends the video room,
  revokes nearby-helper location access, and notifies verified contacts.

### Nearby Emergency radius broadcast

- When an SOS includes coordinates, EAlert users whose latest known
  location (written **only when they explicitly share a location** — this
  is the discoverability opt-in) falls within the radius receive a limited
  "Nearby Emergency" alert: first name of the sender, distance, emergency
  type, location on a map, and an **"I Can Help"** button
  (`src/convex/emergencyNearby.ts`).
- Radius is server-configurable via `HELPER_RADIUS_KM` (default **5 km**,
  clamped 0.5–50 km). Excludes the owner, disabled/suspended accounts,
  verified contacts (they already get full access), and duplicate
  notifications; caps at the 20 nearest helpers.
- Helpers can see the location **only while the session is active**; exact
  coordinates are never stored on the helper record and responder
  coordinates are cleared when the session ends.
- A responding helper can share their own live location; the owner sees
  helper distance and estimated ETA.

### Push notifications

- **Web Push (VAPID)** for browsers — full RFC 8291 implementation
  (ES256 VAPID auth + aes128gcm payload encryption) using only the Web
  Crypto API; no Node-only dependencies (`src/convex/services/push.ts`).
- **FCM HTTP v1** for Android/iOS/FCM web tokens via a Firebase
  service-account JSON.
- Service worker (`public/sw.js`) shows high-priority notifications that
  deep-link into the emergency session and focuses/navigates the right tab
  on click. It performs **no caching**, so no personal data is ever stored
  offline.
- The browser subscription flow (`src/hooks/use-push.ts`) is only enabled
  when the server reports push configured; the VAPID public key is exposed
  to the browser, the private key never leaves the server.
- Push payloads never contain coordinates or private profile data —
  recipients open the session and fetch authorized data from the backend.

### Location

- Location page (`/location`) with real GPS fixes, "Share my location"
  check-ins, and explicit **location sharing sessions** with a timeout
  (15/30/60 min). Sessions expire and the UI is honest that web tracking
  only continues while the tab is open.

### In-app notifications, profiles, account

- Notification center with unread counts, read/clear actions
  (`/notifications`).
- Safety profile (medical info, blood group, emergency note, family names,
  etc.) — private, owner-only data, and it never leaves that boundary
  (`src/convex/profiles.ts`).
- Onboarding flow (`/setup`), profile page (`/profile`), account deletion
  (cascades all user data), and an activity/audit log per user.

### Admin dashboard

- `/admin` (role-gated): platform stats (users, alerts, delivery success
  rate), user list with search, per-user moderation view, enable/disable
  accounts, promote/demote roles, alert list, activity log, and provider
  integration status (booleans only — never secrets)
  (`src/convex/admin.ts`).

### Landing page- Public landing page (`src/pages/Landing.tsx`) with sticky nav, hero
  ("Your safety, one tap away."), feature cards, a four-step how-it-works
  section, a safety/privacy section, an about/trust strip, and footer —
  every CTA funnels into `/auth` and the authenticated app. Illustrations
  are swappable AI-art placeholders driven by a central registry
  (`src/lib/illustrations.tsx`) that supports image / video / Lottie
  assets without redesigning the page.

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 7 |
| Routing | React Router v7 (imports from `react-router`) |
| Styling | Tailwind CSS v4, shadcn/ui, CSS variables (oklch) |
| Icons | lucide-react |
| Animation | framer-motion |
| Backend & database | Convex (queries/mutations/actions, reactive subscriptions) |
| Auth | Convex Auth — Password, Email OTP (magic code), Anonymous, plus Freebuff federated JWT |
| Real-time video | LiveKit (`livekit-client` WebRTC SDK) |
| Push | Web Push (VAPID) + FCM HTTP v1 |
| SMS / email | Twilio / Resend adapters (plain `fetch`, env-guarded) |
| Package manager | Bun |

---

## Architecture

```
Browser (Vite + React SPA)
  │  Convex client (reactive queries/mutations) + Convex Auth session cookie
  ▼
Convex backend (src/convex/)
  ├─ mutations/queries: alerts, emergencyContacts, relationships,
  │    emergencySessions, emergencyNearby, locations, locationSessions,
  │    notifications, devices, profiles, users, admin, activityLogs
  ├─ services: notify (SMS/email), push (Web Push/FCM), notifications, activity
  ├─ lib: session (auth guards), alertLogic (messages/status), emergencyLogic
  │        (access matrix/geo), videoProvider (LiveKit tokens)
  └─ crons: expire stale emergency sessions every 2 min
  │
  ├──► Twilio (SMS) · Resend (email)      [only when credentials configured]
  ├──► Web Push (VAPID) / FCM HTTP v1     [only when credentials configured]
  └──► LiveKit SFU (WebRTC rooms)          [only when credentials configured]
```

All authorization is enforced **server-side in Convex**. Frontend hiding is
never relied on — every query/mutation re-verifies identity, roles, and
relationships on each call.

---

## Project structure

```
public/
  sw.js                  # push event + notification click handling (no caching)
  manifest.webmanifest   # PWA manifest
src/
  main.tsx               # React entry, router, route guards, error boundaries
  index.css              # Tailwind v4 + design tokens (pastel theme)
  convex/                # Convex backend (see Architecture)
  pages/                 # One file per route (Landing, Auth, Dashboard, …)
  components/
    layout/              # AppShell (sidebar/topbar/bottom nav), RequireAdmin
    sos/                 # SOSFlow (hold-to-trigger, countdown, modal)
    emergency/           # EmergencyVideoRoom (LiveKit client)
    contacts/ alerts/ notifications/ shared/ brand/ ui/  # feature + shadcn primitives
  hooks/                 # use-auth, use-push, use-online, use-mobile
  lib/                   # illustrations registry, format, device info, utils
integrations.md          # LiveKit + VLY integration setup notes
```

---

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (the project's package manager)
- A Convex deployment (dev or cloud). `CONVEX_DEPLOYMENT` /
  `VITE_CONVEX_URL` are provided by the platform.

### Install & run

```bash
bun install
bun convex dev --once        # generate Convex client types (_generated)
bun run dev                  # start the Vite dev server (platform-managed in Freebuff)
```

> In Freebuff Web the dev server and Convex dev process run in managed
> background sessions — do not start/stop them yourself; file edits are
> picked up automatically.

### Verify the build

```bash
bun tsc -b --noEmit          # TypeScript check
bun test                     # unit tests (alertLogic, emergencyLogic, videoProvider)
bun run build                # production build (tsc -b && vite build)
```

---

## Environment variables

### Client (Vite) — `VITE_*`

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_CONVEX_URL` | ✅ (provided) | Convex deployment URL for the client |
| `VITE_EMERGENCY_NUMBER` | ❌ | Regional emergency number shown in the SOS flow (default `911`) |

### Server (Convex) — set in the Keys/API keys UI, never in client code

**Auth**

| Variable | Purpose |
| --- | --- |
| `CONVEX_SITE_URL` | Deployment origin used for OIDC auth discovery |
| `VLY_CONVEX_AUTH_ISSUER` | Issuer for Freebuff federated JWT (default `https://freebuff.com`) |
| `VLY_APP_NAME` | App name shown in email OTP messages |

**SMS (Twilio)** — verified emergency contacts never use SMS; legacy
(unverified) contacts do.

| Variable | Purpose |
| --- | --- |
| `SMS_PROVIDER` | `twilio` (default) |
| `SMS_ACCOUNT_ID` | Twilio Account SID |
| `SMS_AUTH_TOKEN` | Twilio Auth Token (secret) |
| `SMS_FROM_NUMBER` | Twilio sender number |

**Email (Resend)**

| Variable | Purpose |
| --- | --- |
| `EMAIL_PROVIDER` | `resend` (default) |
| `EMAIL_API_KEY` | Resend API key (secret) |
| `EMAIL_FROM` | Sender address (default `EAlert <alerts@ealert.app>`) |

**Push notifications**

| Variable | Purpose |
| --- | --- |
| `PUSH_PROVIDER` | `webpush` (default) |
| `VAPID_PUBLIC_KEY` | Public VAPID key — safe to expose to the browser |
| `VAPID_PRIVATE_KEY` | Private VAPID key — **server-side only, never commit or expose** |
| `VAPID_SUBJECT` | Contact URI for VAPID (default `mailto:alerts@ealert.app`) |
| `FCM_SERVICE_ACCOUNT` | Firebase service-account JSON (for Android/iOS/FCM web tokens) |

Generate a VAPID key pair locally (never commit the private key):

```bash
bunx web-push generate-vapid-keys
```

**Live video (LiveKit)** — see [integrations.md](./integrations.md).

| Variable | Purpose |
| --- | --- |
| `LIVEKIT_URL` | LiveKit server WebSocket URL (e.g. `wss://<project>.livekit.cloud`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret — **server-side only, never expose** |

**Nearby helper radius**

| Variable | Purpose |
| --- | --- |
| `HELPER_RADIUS_KM` | Broadcast radius in km (default `5`, clamped 0.5–50) |

**Reserved (status reported, not yet used for dispatch)**

| Variable | Purpose |
| --- | --- |
| `MAP_PROVIDER` / `MAP_API_KEY` | Map tile provider (reported in provider status) |

> Rules that keep secrets safe: `LIVEKIT_API_SECRET` and
> `VAPID_PRIVATE_KEY` are read **only** from `process.env` inside Convex —
> never from `VITE_*` variables, client args, localStorage, or URL
> parameters. The public keys are the only values ever sent to the browser.

---

## Authentication

Configured in `src/convex/auth.ts` (do not modify
`src/convex/auth.config.ts` / `src/convex/auth.ts`):

- **Password** — email + password sign-up/sign-in (primary flow). New
  accounts are stamped `role: user`, `status: active`.
- **Email OTP** — 6-digit magic code (15 min expiry), also used for
  "forgot password".
- **Anonymous** — instant guest access.
- **Freebuff federated JWT** — lets a signed-in freebuff.com user carry
  their identity into the project.

### Frontend

```tsx
import { useAuth } from "@/hooks/use-auth";

const { isLoading, isAuthenticated, user, signIn, signOut } = useAuth();
```

### Backend

```ts
import { requireUser } from "@/convex/lib/session";

const { userId, user } = await requireUser(ctx);   // throws when signed out/disabled
```

Protected routes use `RequireAuth` (redirects to
`/auth?returnTo=<route>`); `/admin` additionally uses `RequireAdmin`.

---

## Database schema

Defined in `src/convex/schema.ts`. Tables (in addition to Convex Auth's
built-in `users`, `sessions`, `verificationTokens`, `oauthAccounts`):

| Table | Purpose |
| --- | --- |
| `users` | Account row: name, email, phone (canonical digits), `role`, `status`, `lastLoginAt` |
| `profiles` | Private safety profile (medical info, blood group, family names…). Owner-only access |
| `emergencyContacts` | Up to 10 contacts per user: name, phone, channels, priority, primary, active; app pairing (`contactUserId`, `verified`, `relationshipId`) |
| `contactRelationships` | Pending → verified/declined app-to-app relationship between two users |
| `alerts` | One row per emergency event: type, status, coordinates, recipients count, channel, failure reason, nearby-helper count |
| `alertRecipients` | Per-contact delivery record: real status, channel, provider message id, push lifecycle (`pending → sent → opened → active`) |
| `locations` | Location check-ins and SOS coordinates (history) |
| `locationSessions` | Explicit consent-based sharing sessions with timeout |
| `userLocations` | Single upserted "latest known position" per user — the nearby-helper discoverability opt-in |
| `devices` | Push device tokens (never returned raw to the UI) |
| `notifications` | In-app notification center |
| `activityLogs` | Audit trail for security-sensitive actions |
| `emergencySessions` | One per SOS: status lifecycle, location/video flags, responder info, expiry |
| `emergencyLocations` | Authorized live-location points during an active session |
| `videoSessions` | LiveKit room reference + lifecycle (no video bytes stored) |
| `emergencyHelpers` | Nearby-broadcast rows; never stores the emergency's exact coordinates |

---

## Backend API overview

All functions live under `src/convex/` and are consumed via
`import { api } from "@/convex/_generated/api"`.

| Module | Key functions |
| --- | --- |
| `alerts.ts` | `triggerSOS` (idempotent, rate-limited), `listMine`, `getById`, `recentCounts`, `retryRecipient`, `recordCancelledSOS` |
| `emergencyContacts.ts` | `list`, `add`, `update`, `remove`, `setPrimary`, `movePriority`, `sendTest` |
| `relationships.ts` | `inviteByContact`, `respondToInvite`, `myIncomingInvites` (+ `findRegisteredUser` helper) |
| `emergencySessions.ts` | `getSession` (role-aware), `myActiveSession`, `listSessionsForContact`, `updateEmergencyLocation`, `startVideo`, `joinVideo`, `stopVideo`, `markSessionOpened`, `markResponding`, `updateResponderLocation`, `endSession`, `cancelSession` |
| `emergencyNearby.ts` | `myNearbyEmergencies`, `respondNearby`, `shareHelperLocation`, `stopHelperLocation` (+ `helperRadiusMeters`) |
| `locations.ts` | `latest`, `history`, `save` |
| `locationSessions.ts` | `getActiveSession`, `startSession`, `updateSession`, `stopSession` |
| `notifications.ts` | `list`, `unreadCount`, `markRead`, `markAllRead`, `clearAll` |
| `devices.ts` | `registerDevice`, `registerWebSubscription`, `updatePermissionStatus`, `revokeDevice`, `listMyDevices`, `pushStatus` |
| `users.ts` | `currentUser`, `isAdmin`, `updateAccount`, `deleteAccount`, `touchLastLogin` |
| `profiles.ts` | `getProfile`, `isSetupComplete`, `upsertProfile` |
| `admin.ts` | `stats`, `listUsers`, `getUserDetail`, `setUserStatus`, `setUserRole`, `integrationStatus`, `listAlerts`, `listActivity` |
| `system.ts` | `health` (public, provider booleans only) |
| `activityLogs.ts` | `listMine`, `logEvent` |

---

## Security model

- **Server-side authorization on every call.** All queries/mutations start
  from `requireUser` / `requireAdmin`; disabled accounts are rejected.
- **Emergency session access matrix** (`src/convex/lib/emergencyLogic.ts`):

  | Role | Live location | Live video | Recipients | Owner controls |
  | --- | --- | --- | --- | --- |
  | `owner` | ✅ | ✅ | ✅ | ✅ |
  | `verified_contact` | ✅ | ✅ | — | — |
  | `helper_nearby` | ✅ (active session only) | ❌ | ❌ | ❌ |
  | `admin` | ❌ (never precise location) | ❌ | — | — |
  | anyone else | ❌ | ❌ | ❌ | ❌ |

- **Verified contacts are opt-in.** User B must accept User A's request
  before any app-to-app emergency data (push, session, location, video)
  flows. `joinVideo` re-checks the verified relationship **and** that the
  caller is an actual recipient of the alert on every call.
- **Video tokens**: minted server-side (`startVideo` owner-only,
  `joinVideo` verified-recipient-only), HS256 JWT signed with
  `LIVEKIT_API_SECRET`, room-scoped (`emergency-<sessionId>`), short-lived
  (2–6 h), and never persisted. Clients can never choose a room.
- **Privacy by construction**: push payloads never contain coordinates;
  helper records never store exact coordinates; helper location access is
  revoked the moment the session ends; device tokens are masked in all
  list views; admins never see precise live location.
- **Honest delivery**: nothing is ever marked `delivered` without provider
  confirmation; unconfigured providers report `provider_not_configured`.
- **Abuse guards**: SOS rate limit (1 per 10 s), idempotency keys, 10-contact
  cap, phone dedupe, admin safeguards (can't change your own role, can't
  demote the last admin, can't disable your own account).
- **Audit trail**: every security-sensitive action writes an `activityLogs`
  row with action, result, device, and JSON metadata.

---

## Testing

```bash
bun test
```

Unit tests cover the pure logic modules:

- `src/convex/lib/alertLogic.test.ts` — message building, phone
  normalization/validation, idempotency keys, alert status derivation,
  duplicate detection, channel defaults.
- `src/convex/lib/emergencyLogic.test.ts` — session access matrix, radius /
  haversine checks (inside vs outside 5 km), video restriction for
  helpers, verified-contact full access, location revocation on end, ETA,
  distance formatting.
- `src/convex/lib/videoProvider.test.ts` — LiveKit config detection and
  token minting.

---

## Deployment

1. **Backend** — the Convex functions in `src/convex/` deploy to the
   project's Convex deployment (`bunx convex deploy` in a standalone setup;
   managed by the platform in Freebuff Web). `convex.json` points at
   `src/convex/`.
2. **Frontend** — `bun run build` produces a static bundle that can be
   served from any static host. `index.html`, `public/sw.js` and
   `public/manifest.webmanifest` must be served from the site root so the
   service worker registers at `/sw.js`.
3. **Environment** — set server secrets in the deployment's Keys/API keys
   UI (`SMS_*`, `EMAIL_API_KEY`, `VAPID_*`, `FCM_SERVICE_ACCOUNT`,
   `LIVEKIT_*`, `HELPER_RADIUS_KM`). Client vars (`VITE_CONVEX_URL`,
   `VITE_EMERGENCY_NUMBER`) are baked at build time.

---

## Usage examples

### 1. Two-user verified contact flow (the core app-to-app path)

1. User A signs up, completes onboarding (`/setup`), and adds User B as an
   emergency contact by phone number (`/contacts` → Add contact).
2. EAlert detects User B's account and sends them an in-app request.
   User B accepts on their device (`/contacts` → Incoming EAlert requests).
3. Both users enable push notifications from their profile/notification
   settings (browser permission + Web Push subscription).
4. User A triggers SOS (hold the SOS button on `/dashboard` for 3 s,
   confirm the countdown). If coordinates were granted, nearby helpers are
   also alerted.
5. User B receives a push notification deep-linking to
   `/emergency/<sessionId>`, sees the live location, can mark "I'm
   responding" (optionally sharing their location), and can join live
   video if the owner started it.

### 2. Triggering SOS programmatically (Convex)

```ts
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { makeClientAlertId } from "@/convex/lib/alertLogic";

const triggerSOS = useMutation(api.alerts.triggerSOS);

await triggerSOS({
  clientAlertId: makeClientAlertId(), // idempotency: reuse the same key on retry
  lat: 37.7749,
  lng: -122.4194,
  accuracy: 12,
  locationLabel: "Mission District, San Francisco",
});
```

### 3. Reading a session with role-aware data

```ts
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const data = useQuery(api.emergencySessions.getSession, { sessionId });

// data.myRole: "owner" | "verified_contact" | "helper_nearby" | "admin"
// data.latestLocation: only when your role may see it
// data.video / data.videoConfig: only for owner + verified contacts
```

### 4. One-time data repair (maintenance)

```bash
bunx convex run internal/backfill:normalizeUserPhones
```

Normalizes legacy `users.phone` values to canonical digits and backfills
from safety profiles (idempotent; internal-only function).

---

## Known limitations

These are intentional, documented truths of the current implementation:

- **Web location tracking** only continues while the tab is open — browsers
  cannot guarantee background tracking. Location sharing sessions expire
  on a timer, and the UI says so. A future native app can extend this.
- **SMS/email delivery** requires Twilio/Resend credentials; until then,
  recipients are honestly recorded as `queued` (`provider_not_configured`).
- **App-to-app push delivery** requires VAPID keys (web) and/or an FCM
  service account (mobile); the browser subscription flow is disabled
  until push is configured server-side.
- **Live video** requires all three LiveKit variables; otherwise the UI
  shows "Live video is not configured yet" and no video controls appear.
- **Nearby-helper discoverability** is opt-in: only users who have shared
  a location (Location page or an SOS with coordinates) are candidates for
  the radius broadcast. There is no user-blocking feature yet; the radius
  search already excludes the owner, disabled/suspended accounts, verified
  contacts, and duplicates.
- **Push "delivered"** is reserved for a future device-level delivery
  receipt; provider acceptance currently maps to `sent`, opening the
  session maps to `opened`, and responding maps to `active`.

---

*EAlert helps you contact trusted people. In a life-threatening emergency,
always contact your local emergency services first.*
