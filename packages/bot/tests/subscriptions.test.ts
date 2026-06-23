import test from "node:test";
import assert from "node:assert/strict";
import { collectMissingSubscriptionTeamIds } from "../src/utils/subscriptions";

test("collectMissingSubscriptionTeamIds keeps only untracked variants", () => {
  const variants = ["team-a-primary", "team-a-alt", "team-a-academy"];
  const existing = ["team-a-alt"];

  const result = collectMissingSubscriptionTeamIds(variants, existing);

  assert.deepEqual(result, ["team-a-primary", "team-a-academy"]);
});
