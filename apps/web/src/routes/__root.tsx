import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext, redirect, useNavigate } from "@tanstack/react-router";
import {
  ChevronsLeft,
  ChevronsRight,
  FileText,
  Library,
  LogOut,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";

import { fetchMe, signout, type AuthedUser } from "../auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context, location }) => {
    if (location.pathname === "/sign-in" || location.pathname === "/sign-up") {
      return;
    }
    const user = await context.queryClient.fetchQuery({
      queryKey: ["me"],
      queryFn: fetchMe,
      staleTime: 5 * 60 * 1000,
    });
    if (!user) {
      throw redirect({ to: "/sign-in", search: { redirect: location.href } });
    }
  },
  component: RootLayout,
});

const COLLAPSED_KEY = "reel:sidebar-collapsed";

function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(COLLAPSED_KEY) === "1";
  });
  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
}

function RootLayout() {
  const { data: user } = useQuery<AuthedUser | null>({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
  });

  const [collapsed, setCollapsed] = useSidebarCollapsed();

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between px-3 py-4",
            collapsed && "justify-center px-0",
          )}
        >
          {!collapsed && <div className="text-lg font-semibold">Reel</div>}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>

        <nav className={cn("flex flex-col gap-0.5 px-2 text-sm", collapsed && "px-1.5")}>
          <NavLink to="/" icon={<FileText className="size-4" />} label="Articles" collapsed={collapsed} />
          <NavLink to="/items" icon={<Library className="size-4" />} label="Media" collapsed={collapsed} />
        </nav>

        <div className={cn("mt-auto p-3", collapsed && "px-1.5")}>
          <UserMenu user={user} collapsed={collapsed} />
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

function NavLink({
  to,
  icon,
  label,
  collapsed,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
}) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-accent [&.active]:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
      )}
      activeProps={{ className: "active" }}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

function UserMenu({ user, collapsed }: { user: AuthedUser; collapsed: boolean }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const initials = user.username.slice(0, 2).toUpperCase();

  async function handleSignout() {
    await signout();
    queryClient.setQueryData(["me"], null);
    navigate({ to: "/sign-in" });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={collapsed ? user.username : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          collapsed && "justify-center px-0",
        )}
      >
        <Avatar size="sm">
          <AvatarFallback className="bg-accent text-accent-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed && <span className="truncate font-medium">{user.username}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Signed in as {user.username}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="flex w-full items-center gap-2">
            <Settings className="size-4" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleSignout}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
