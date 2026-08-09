import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { NotificationType } from "../schema";

/** Internal helper — creates an in-app notification row. */
export async function createNotification(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    type: NotificationType;
    title: string;
    body: string;
    linkTo?: string;
  },
) {
  await ctx.db.insert("notifications", {
    userId: args.userId,
    type: args.type,
    title: args.title,
    body: args.body,
    read: false,
    createdAt: Date.now(),
    linkTo: args.linkTo,
  });
}
