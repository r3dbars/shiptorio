import { describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const dir = join(import.meta.dir, "../migrations");
const pending = readFileSync(join(import.meta.dir, "../scripts/durability-schema.sql"), "utf8");
function fixture(orphan = false) {
  const db = new Database(":memory:"); db.run("PRAGMA foreign_keys=ON");
  for (const file of readdirSync(dir).filter(f => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir,file), "utf8"));
  db.run("INSERT INTO installations(id,account_login,created_at) VALUES (1,'owner','2026-10-26 01:00:00')");
  db.run("INSERT INTO repos(full_name,installation_id,default_branch,updated_at) VALUES ('owner/repo',?,'main','2026-10-26 02:00:00')", [orphan ? 9 : 1]);
  db.run("INSERT INTO pull_requests(repo,number,title,state) VALUES ('owner/repo',1,'Preserve me','open')");
  return db;
}
describe("D1 forward durability migration", () => {
  it("keeps existing data and timestamps, enforces FK/NOT NULL, and indexes hot lookups", () => {
    const db = fixture();
    try {
      db.transaction(() => db.exec(pending))();
      expect(db.query("SELECT created_at, updated_at FROM repos").get()).toEqual({created_at: "2026-10-26 02:00:00", updated_at: "2026-10-26 02:00:00"});
      expect(() => db.run("INSERT INTO repos(full_name,installation_id) VALUES ('owner/orphan',9)")).toThrow();
      expect(() => db.run("INSERT INTO repos(full_name,installation_id) VALUES (NULL,1)")).toThrow();
      expect(() => db.run("DELETE FROM installations WHERE id=1")).toThrow();
      db.run("INSERT INTO installations(id,account_login) VALUES(1,'renamed') ON CONFLICT(id) DO UPDATE SET account_login=excluded.account_login");
      expect(db.query("SELECT created_at FROM installations").get()).toEqual({created_at: "2026-10-26 01:00:00"});
      expect((db.query("EXPLAIN QUERY PLAN SELECT full_name FROM repos WHERE installation_id=1").all() as {detail: string}[]).some(r=>r.detail.includes("repos_installation"))).toBe(true);
      expect(db.query("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(db.query("PRAGMA integrity_check").get()).toEqual({integrity_check: "ok"});
      db.run("INSERT INTO repos(full_name,installation_id) VALUES ('owner/new',1)");
      db.run("INSERT INTO pull_requests(repo,number,title,state) VALUES ('owner/new',2,'New','open')");
      expect((db.query("SELECT created_at FROM pull_requests WHERE number=2").get() as {created_at: string}).created_at).not.toBe("");
    } finally {db.close();}
  });
  it("rolls back rather than delete orphaned legacy rows", () => {
    const db=fixture(true);
    try {
      expect(() => db.transaction(() => db.exec(pending))()).toThrow();
      expect(db.query("SELECT installation_id FROM repos").get()).toEqual({installation_id: 9});
      expect(db.query("SELECT name FROM sqlite_master WHERE name='repos_durable'").get()).toBeNull();
    } finally {db.close();}
  });
});
