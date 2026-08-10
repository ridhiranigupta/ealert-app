import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import {
  Bell,
  HeartHandshake,
  Home,
  LayoutDashboard,
  LogOut,
  MapPin,
  ScrollText,
  Settings,
  Shield,
  ShieldAlert,
  Siren,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { SOSFlowProvider, SOSQuickTrigger } from "@/components/sos/SOSFlow";
import { ProfileAvatar } from "@/components/shared/ProfileAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { useOnlineStatus } from "@/hooks/use-online";
import { getDeviceInfo } from "@/lib/device";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

const primaryNav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/contacts", label: "Contacts", icon: HeartHandshake },
  { to: "/location", label: "Location", icon: MapPin },
  { to: "/alerts", label: "Alert history", icon: ScrollText },
  { to: "/notifications", label: "Notifications", icon: Bell },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnlineStatus();
  const touchLastLogin = useMutation(api.users.touchLastLogin);
  const logEvent = useMutation(api.activityLogs.logEvent);
  const unread = useQuery(api.notifications.unreadCount);
  const isAdmin = useQuery(api.users.isAdmin);
  const profile = useQuery(api.profiles.getProfile);

  // Audit login once per mount (guarded against StrictMode double-run).
  const loginLoggedRef = useRef(false);
  useEffect(() => {
    if (loginLoggedRef.current) return;
    loginLoggedRef.current = true;
    touchLastLogin({ device: getDeviceInfo() }).catch(() => {});
  }, [touchLastLogin]);

  const handleSignOut = async () => {
    logEvent({ action: "logout", device: getDeviceInfo() }).catch(() => {});
    await signOut();
    navigate("/");
  };

  const nav: NavItem[] = useMemo(() => {
    if (isAdmin) {
      return [...primaryNav, { to: "/admin", label: "Admin", icon: ShieldAlert }];
    }
    return primaryNav;
  }, [isAdmin]);

  const bottomNav: NavItem[] = [
    { to: "/dashboard", label: "Home", icon: Home, end: true },
    { to: "/contacts", label: "Contacts", icon: HeartHandshake },
    { to: "/alerts", label: "Alerts", icon: ScrollText },
    { to: "/profile", label: "Profile", icon: Settings },
  ];

  const firstName = user?.name?.split(/\s+/)[0] ?? "there";
  const showSetupCta =
    profile && !profile.profile?.setupComplete && location.pathname !== "/setup";

  return (
    <SOSFlowProvider>
      <div className="min-h-screen bg-background">
        {/* Ambient background glows */}
        <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-40 left-1/4 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-sky-200/50 blur-3xl" />
          <div className="bg-grid absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
        </div>

        {/* Desktop sidebar */}
        <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl lg:flex">
          <div className="flex h-16 items-center border-b border-sidebar-border px-5">
            <Link to="/dashboard" aria-label="EAlert home">
              <Logo />
            </Link>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Primary">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-violet-100/70 hover:text-foreground",
                    isActive &&
                      "bg-violet-100 text-violet-700 shadow-none",
                  )
                }
              >
                <item.icon className="size-4.5 shrink-0 transition-colors group-hover:text-primary" />
                {item.label}
                {item.to === "/notifications" && (unread ?? 0) > 0 && (
                  <span className="ml-auto flex size-5 items-center justify-center rounded-full bg-rose-500 font-mono text-[10px] font-semibold text-white">
                    {unread}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-violet-100/70"
                  aria-label="Account menu"
                >
                  <ProfileAvatar name={user?.name} image={user?.image} ring index={0} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{user?.name ?? "EAlert user"}</span>
                    <span className="block truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {isAdmin ? "admin" : "member"}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-semibold">{user?.name ?? "Guest"}</p>
                  <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate("/profile")} className="cursor-pointer">
                  <Settings className="mr-2 size-4" />
                  Settings & profile
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/notifications")} className="cursor-pointer">
                  <Bell className="mr-2 size-4" />
                  Notifications
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onSelect={() => navigate("/admin")} className="cursor-pointer">
                    <Shield className="mr-2 size-4" />
                    Admin console
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleSignOut} className="cursor-pointer text-rose-600 focus:text-rose-600">
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-xl lg:hidden">
          <Link to="/dashboard" aria-label="EAlert home">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/notifications"
              className="relative flex size-10 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`Notifications${(unread ?? 0) > 0 ? `, ${unread} unread` : ""}`}
            >
              <Bell className="size-5" />
              {(unread ?? 0) > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-rose-500 font-mono text-[9px] font-semibold text-white">
                  {unread}
                </span>
              )}
            </Link>
            <Link to="/profile" aria-label="Profile">
              <ProfileAvatar name={user?.name} image={user?.image} ring index={1} />
            </Link>
          </div>
        </header>

        {/* Content */}
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12 lg:pl-72 lg:pr-8 lg:pt-8">
          {!online && (
            <div
              role="status"
              className="mb-5 flex items-center gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700"
            >
              <WifiOff className="size-4 shrink-0" />
              <span>
                You're offline — SOS alerts can't be transmitted until your connection returns.
              </span>
            </div>
          )}
          {showSetupCta && (
            <Link
              to="/setup"
              className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-100 to-sky-100 px-4 py-3 text-sm transition-colors hover:border-violet-300"
            >
              <span className="flex items-center gap-2.5">
                <Siren className="size-4 text-violet-600" />
                <span>
                  <span className="font-semibold">Finish setting up your safety profile</span>
                  <span className="ml-2 hidden text-muted-foreground sm:inline">
                    A few quick details make alerts faster.
                  </span>
                </span>
              </span>
              <span className="shrink-0 font-semibold text-violet-600">Continue →</span>
            </Link>
          )}
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/90 backdrop-blur-xl lg:hidden"
          aria-label="Mobile"
        >
          <div className="mx-auto grid max-w-md grid-cols-5 items-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
            {bottomNav.slice(0, 2).map((item) => (
              <MobileLink key={item.to} item={item} />
            ))}
            <div className="flex justify-center">
              <SOSQuickTrigger />
            </div>
            {bottomNav.slice(2).map((item) => (
              <MobileLink key={item.to} item={item} />
            ))}
          </div>
        </nav>
      </div>
    </SOSFlowProvider>
  );
}

function MobileLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-medium text-muted-foreground transition-colors",
          isActive && "text-violet-600",
        )
      }
    >
      <item.icon className="size-5" />
      {item.label}
    </NavLink>
  );
}
