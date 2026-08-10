import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Safety net: emergency sessions auto-expire after 4h of no activity.
// expireStaleSessions closes the session, stops location/video flags and
// ends any active video room.
crons.interval(
  "expire-emergency-sessions",
  { minutes: 2 },
  internal.emergencySessions.expireStaleSessions,
);

export default crons;
