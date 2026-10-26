import { expect, it } from "bun:test";
import { appManifest } from "../src/auth";

it("registers the mine with separate read access for check runs and legacy commit statuses", () => {
  const manifest = appManifest("https://shiptorio.com");
  expect(manifest.public).toBe(false);
  expect(manifest.default_permissions).toEqual({ contents: "write", pull_requests: "write", issues: "write", checks: "read", statuses: "read", metadata: "read" });
  expect(manifest.default_events).toEqual(["issues", "issue_comment", "pull_request", "pull_request_review", "check_suite", "check_run", "push", "repository"]);
  expect(manifest.hook_attributes.url).toBe("https://shiptorio.com/webhooks/github");
  expect(manifest.redirect_url).toBe("https://shiptorio.com/setup/callback");
  expect(manifest.callback_urls).toEqual(["https://shiptorio.com/auth/callback"]);
});

it("sends a player back to the repo picker after they install the App", () => {
  const manifest = appManifest("https://shiptorio.com");
  expect(manifest.setup_url).toBe("https://shiptorio.com/github/installed");
  expect(manifest.setup_on_update).toBe(true);
});
