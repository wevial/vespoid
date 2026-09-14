"use client";

import { getFunctionName } from "convex/server";
import type { FunctionArgs, FunctionReference, FunctionReturnType, OptionalRestArgs } from "convex/server";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!convexUrl) {
  throw new Error("Missing NEXT_PUBLIC_CONVEX_URL environment variable");
}

type ConvexHttpResult<T> =
  | { status: "success"; value: T }
  | { status: "error"; errorMessage?: string; errorData?: unknown };

type AccessTokenResponse = { token?: unknown };

let accessToken: string | undefined;

async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && accessToken) return accessToken;

  const response = await fetch("/api/auth/convex-token", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const payload = await response.json() as AccessTokenResponse;
  if (!response.ok || typeof payload.token !== "string" || payload.token.length === 0) {
    throw new Error("Cloudflare Access authentication is required");
  }

  accessToken = payload.token;
  return accessToken;
}

function firstArg<FuncRef extends FunctionReference<"query" | "mutation" | "action">>(
  args: OptionalRestArgs<FuncRef>,
): FunctionArgs<FuncRef> {
  return (args[0] ?? {}) as FunctionArgs<FuncRef>;
}

async function callConvex<T>(kind: "query" | "mutation" | "action", path: string, args: unknown, retrying = false): Promise<T> {
  const token = await getAccessToken(retrying);
  const response = await fetch(`${convexUrl}/api/${kind}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (response.status === 401 && !retrying) {
    accessToken = undefined;
    return callConvex(kind, path, args, true);
  }
  const payload = (await response.json()) as ConvexHttpResult<T>;
  if (!response.ok || payload.status === "error") {
    throw new Error(payload.status === "error" ? payload.errorMessage ?? `Convex ${kind} failed` : `Convex ${kind} failed`);
  }
  return payload.value;
}

export const convexHttp = {
  query<Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>> {
    return callConvex("query", getFunctionName(query), firstArg(args));
  },
  mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>> {
    return callConvex("mutation", getFunctionName(mutation), firstArg(args));
  },
  action<Action extends FunctionReference<"action">>(
    action: Action,
    ...args: OptionalRestArgs<Action>
  ): Promise<FunctionReturnType<Action>> {
    return callConvex("action", getFunctionName(action), firstArg(args));
  },
};
