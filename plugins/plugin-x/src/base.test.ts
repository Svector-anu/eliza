/** Verifies ClientBase.init() validates MAX_RETRIES instead of silently skipping authentication on a NaN value. */
import type { IAgentRuntime } from "@elizaos/core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./client/accounts", () => ({
  resolveRequestedXAccountId: vi.fn(() => "default"),
  resolveTwitterAccountConfig: vi.fn(
    async (_runtime: unknown, options: { state?: unknown }) =>
      options.state ?? {},
  ),
}));

vi.mock("./client/auth-providers/factory", () => ({
  createTwitterAuthProvider: vi.fn(() => ({}) as never),
}));

import { ClientBase } from "./base";
import type { TwitterClientState } from "./types";

function makeClient(): ClientBase {
  const runtime = {} as IAgentRuntime;
  const state = {} as TwitterClientState;
  const client = new ClientBase(runtime, state);
  client.getAuthenticatedProfile = vi.fn(async () => ({
    id: "agent",
    username: "agent",
    screenName: "Agent",
    bio: "",
    nicknames: [],
  }));
  (
    client as unknown as { populateTimeline: () => Promise<void> }
  ).populateTimeline = vi.fn(async () => {});
  return client;
}

describe("ClientBase.init MAX_RETRIES validation", () => {
  const originalMaxRetries = process.env.MAX_RETRIES;

  afterEach(() => {
    if (originalMaxRetries === undefined) {
      delete process.env.MAX_RETRIES;
    } else {
      process.env.MAX_RETRIES = originalMaxRetries;
    }
    vi.useRealTimers();
  });

  it("still attempts authentication when MAX_RETRIES is not a valid number", async () => {
    process.env.MAX_RETRIES = "abc";
    const client = makeClient();
    const authenticate = vi.fn(async () => {});
    client.twitterClient.authenticate = authenticate;
    client.twitterClient.isLoggedIn = vi.fn(async () => true);

    await client.init();

    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it("throws instead of silently continuing unauthenticated when MAX_RETRIES is not a valid number and auth keeps failing", async () => {
    vi.useFakeTimers();
    process.env.MAX_RETRIES = "abc";
    const client = makeClient();
    client.twitterClient.authenticate = vi.fn(async () => {
      throw new Error("invalid credentials");
    });
    client.twitterClient.isLoggedIn = vi.fn(async () => false);
    const getAuthenticatedProfile = client.getAuthenticatedProfile as ReturnType<
      typeof vi.fn
    >;

    const initPromise = client.init();
    const assertion = expect(initPromise).rejects.toThrow(
      /Twitter authentication failed/,
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(getAuthenticatedProfile).not.toHaveBeenCalled();
  });

  it("still validates a well-formed MAX_RETRIES value", async () => {
    process.env.MAX_RETRIES = "5";
    const client = makeClient();
    const authenticate = vi.fn(async () => {});
    client.twitterClient.authenticate = authenticate;
    client.twitterClient.isLoggedIn = vi.fn(async () => true);

    await client.init();

    expect(authenticate).toHaveBeenCalledTimes(1);
  });
});
