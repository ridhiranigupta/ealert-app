import { format, formatDistanceToNow } from "date-fns";

export function formatTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return format(new Date(ts), "MMM d, yyyy · HH:mm");
}

export function formatRelative(ts: number | null | undefined): string {
  if (!ts) return "—";
  return formatDistanceToNow(new Date(ts), { addSuffix: true });
}

export function formatCoords(lat: number | null | undefined, lng: number | null | undefined): string {
  if (lat == null || lng == null) return "—";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
