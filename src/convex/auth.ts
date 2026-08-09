// Convex Auth providers for EAlert:
//  - "password"   email + password sign up / sign in (primary flow)
//  - "email-otp"  magic-code sign in (also used for "forgot password")
//  - "anonymous"  instant guest access

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { Value } from "convex/values";
import { emailOtp } from "./auth/emailOtp";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(
        params,
      ): Record<string, Value> & { email: string } {
        const email = String(params.email ?? "").toLowerCase().trim();
        // Only stamp default role/status when a NEW account is created so we
        // never clobber an existing user's role (e.g. admin) on sign-in.
        // (Undefined profile values are stripped by Convex on write.)
        if (params.flow === "signUp") {
          return {
            email,
            name: params.name as string,
            phone: params.phone as string,
            role: "user",
            status: "active",
          };
        }
        return { email };
      },
    }),
    emailOtp,
    Anonymous,
  ],
});
