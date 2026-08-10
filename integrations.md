# VLY Integrations

First-order integrations for AI, email, and payments with automatic usage billing through VLY integration keys.

## Environment Variables

The following environment variables are automatically set during project creation:

- `VLY_INTEGRATION_KEY`: Your unique integration key (format: `sk_*`)
- `VLY_INTEGRATION_BASE_URL`: The base URL for the integration gateway (default: `https://integrations.freebuff.com/`)

## Installation

The `@vly-ai/integrations` package is already included in package.json.

## Usage in Convex Actions

```typescript
"use node";

import { vly } from '../lib/vly-integrations';
import { action } from "./_generated/server";

export const generateAIResponse = action({
  handler: async (ctx, args) => {
    // AI Completions
    const completion = await freebuff.com.completion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ],
      temperature: 0.7,
      maxTokens: 150
    });
    
    return completion;
  }
});
```

## Available Features

### AI Integration
```typescript
// Create completion
const completion = await freebuff.com.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [...],
  temperature: 0.7,
  maxTokens: 150
});

// Stream completion
await freebuff.com.streamCompletion(
  request,
  (chunk: string) => console.log(chunk)
);

// Generate embeddings
const embeddings = await freebuff.com.embeddings("Your text here");
```

### Email Integration
```typescript
// Send email
const emailResult = await vly.email.send({
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
});

// Send batch emails
const batchResult = await vly.email.sendBatch([...emails]);
```

### Payments Integration
```typescript
// Create payment intent
const paymentIntent = await vly.payments.createPaymentIntent({
  amount: 2000, // $20.00 in cents
  currency: 'usd',
  description: 'Premium subscription',
  customer: {
    email: 'customer@example.com'
  }
});

// Create subscription
const subscription = await vly.payments.createSubscription({...});

// Create checkout session
const session = await vly.payments.createCheckoutSession({...});
```

## Error Handling

All methods return an ApiResponse object:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
```

Example error handling:

```typescript
const result = await freebuff.com.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
```

## Important Notes

1. The integration key (`VLY_INTEGRATION_KEY`) is automatically injected during project creation
2. All API calls are automatically billed to your deployment based on usage
3. Must be used in Convex actions with `"use node"` directive
4. The integration key should never be exposed to the client

## Checking Integration Status

To verify the integration is properly configured:

```typescript
const hasIntegration = !!process.env.VLY_INTEGRATION_KEY;
if (!hasIntegration) {
  console.error("VLY integration key not found");
}
```

---

# Emergency Live Video (LiveKit)

EAlert's real-time emergency video calls use **LiveKit** (WebRTC SFU). The
sender's browser captures the real camera/microphone, publishes tracks to a
LiveKit room, and verified emergency contacts join the same room to see and
hear the sender in real time.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `LIVEKIT_URL` | ✅ | LiveKit server WebSocket URL, e.g. `wss://<project>.livekit.cloud`. |
| `LIVEKIT_API_KEY` | ✅ | LiveKit Cloud API key (project settings → Keys). |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit Cloud API secret. **Server-side only — never expose to the browser.** |

## Where to get the credentials

1. Create a project at <https://cloud.livekit.io> (LiveKit Cloud; free tier available).
2. Go to **Project Settings → Keys**.
3. Generate an API key + secret pair.
4. Copy the **WebSocket URL** (usually `wss://<project>.livekit.cloud`) as `LIVEKIT_URL`.
5. Paste all three values into the project's Keys/API keys UI (`LIVEKIT_URL`,
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).

## Security rules

- Tokens are generated **server-side** in `src/convex/emergencySessions.ts`
  (`startVideo` / `joinVideo`) using Web Crypto (HS256 JWT).
- `LIVEKIT_API_SECRET` is read only from `process.env` inside Convex — it is
  never sent to the browser, stored in localStorage, or embedded in client code.
- `startVideo` is restricted to the emergency session owner; `joinVideo` is
  restricted to the owner plus verified emergency contacts (server-side
  relationship + recipient checks on every call).
- Tokens are short-lived (2–6 h), scoped to one room, and never persisted.
- Room names are derived server-side from the emergency session id
  (`emergency-<sessionId>`); clients can't choose arbitrary rooms.
- The emergency video automatically ends when the session is ended, expires,
  or the owner stops it.

## Honest unconfigured state

If the three LiveKit variables are missing, the UI shows:

> Live video is not configured yet. Please configure the LiveKit server.

No fake "connected" or "delivered" status is ever shown.

## Client SDK

`livekit-client` (npm) is the real WebRTC client used by
`src/components/emergency/EmergencyVideoRoom.tsx`. It is prebundled in
`vite.config.ts` (`optimizeDeps.include`) so the preview dev server never
re-optimizes it at runtime.
