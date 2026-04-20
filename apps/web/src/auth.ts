import { apiFetch } from "./api";

export interface AuthedUser {
  id: string;
  username: string;
  role: "admin" | "user";
}

export async function fetchMe(): Promise<AuthedUser | null> {
  const { user } = await apiFetch<{ user: AuthedUser | null }>("/auth/me");
  return user;
}

export async function signin(username: string, password: string): Promise<AuthedUser> {
  const { user } = await apiFetch<{ user: AuthedUser }>("/auth/signin", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  return user;
}

export async function signup(
  username: string,
  password: string,
  inviteCode: string,
): Promise<AuthedUser> {
  const { user } = await apiFetch<{ user: AuthedUser }>("/auth/signup", {
    method: "POST",
    body: JSON.stringify({ username, password, inviteCode }),
  });
  return user;
}

export async function signout(): Promise<void> {
  await apiFetch("/auth/signout", { method: "POST" });
}
