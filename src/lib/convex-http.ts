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

function firstArg<FuncRef extends FunctionReference<"query" | "mutation">>(
  args: OptionalRestArgs<FuncRef>,
): FunctionArgs<FuncRef> {
  return (args[0] ?? {}) as FunctionArgs<FuncRef>;
}

async function callConvex<T>(kind: "query" | "mutation", path: string, args: unknown): Promise<T> {
  const response = await fetch(`${convexUrl}/api/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
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
};
