import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createRootRouteWithContext, redirect, useNavigate } from "@tanstack/react-router";

import { fetchMe, signout, type AuthedUser } from "../auth";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async ({ context, location }) => {
    // Allow sign-in/sign-up without a session.
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

function RootLayout() {
  const { data: user } = useQuery<AuthedUser | null>({
    queryKey: ["me"],
    queryFn: fetchMe,
    staleTime: 5 * 60 * 1000,
  });

  if (!user) {
    // Unauthenticated branch (sign-in/sign-up) renders without the sidebar.
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
        <div className="mb-6 text-lg font-semibold">Reel</div>
        <nav className="flex flex-col gap-0.5 text-sm">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/search">Search</NavLink>
          <NavLink to="/items">Library</NavLink>
          <NavLink to="/articles">Articles</NavLink>
          <NavLink to="/references">References</NavLink>
          <NavLink to="/categories">Categories</NavLink>
          <NavLink to="/tags">Tags</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <div className="mt-auto pt-6">
          <UserMenu user={user} />
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}

function UserMenu({ user }: { user: AuthedUser }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleSignout() {
    await signout();
    queryClient.setQueryData(["me"], null);
    navigate({ to: "/sign-in" });
  }

  return (
    <div className="text-sm">
      <div className="mb-1 text-xs text-muted-foreground">Signed in as</div>
      <div className="mb-2 truncate font-medium">{user.username}</div>
      <button
        onClick={handleSignout}
        className="rounded-md border border-sidebar-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      >
        Sign out
      </button>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&.active]:bg-sidebar-accent [&.active]:text-sidebar-accent-foreground"
      activeProps={{ className: "active" }}
    >
      {children}
    </Link>
  );
}
