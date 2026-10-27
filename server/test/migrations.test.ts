import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Many PRs add D1 migrations in parallel. Deploy applies every unapplied file in name order, so two
// files sharing a number (or a gap) means two PRs raced. Fail CI so the later PR renumbers before merge.
import { Database } from "bun:sqlite";

const files = readdirSync(join(import.meta.dir, "..", "migrations")).filter((f) => f.endsWith(".sql")).sort();

describe("D1 migrations", () => {
  it("are named NNNN_name.sql", () => {
    for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
  });
  it("have unique, gapless numbers starting at 0001", () => {
    const nums = files.map((f) => Number(f.slice(0, 4)));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
});


it("owner migration upgrades old limits idempotently and clears only the owner run flag", () => {
  const db = new Database(":memory:");
  const dir = join(import.meta.dir, "..", "migrations");
  try {
    const ownerMigration = files.find(f => f.endsWith('_owner_quotas.sql'))!;
    for (const file of files.filter(f => f < ownerMigration)) db.exec(readFileSync(join(dir, file), "utf8"));
    db.exec("INSERT INTO signup_allowlist(login,approved_by,updated_at,enabled,spark_calls_daily,spark_tokens_daily) VALUES('r3dbars','admin',0,0,0,0)");
    db.exec("INSERT INTO signup_abuse(scope,reason,updated_at) VALUES('runs:r3dbars','daily run quota',0),('runs:guest','daily run quota',0)");
    const sql = readFileSync(join(dir, ownerMigration), 'utf8');
    db.exec(sql); db.exec(sql);
    expect(db.query("SELECT enabled,factories,repos,runs_daily,spark_calls_daily,spark_tokens_daily FROM signup_allowlist WHERE login='r3dbars'").get()).toEqual({ enabled: 1, factories: 99999, repos: 99999, runs_daily: 200, spark_calls_daily: null, spark_tokens_daily: null });
    expect(db.query("SELECT scope FROM signup_abuse").all()).toEqual([{ scope: 'runs:guest' }]);
    db.exec("DELETE FROM signup_allowlist WHERE login='r3dbars'");
    db.exec(sql);
    expect(db.query("SELECT runs_daily FROM signup_allowlist WHERE login='r3dbars'").get()).toEqual({ runs_daily: 200 });
  } finally { db.close(); }
});
