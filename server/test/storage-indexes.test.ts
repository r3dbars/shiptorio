import { expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = join(import.meta.dir, "../migrations");
const migration = "0017_storage_lookup_indexes.sql";

it("adds reverse lookup indexes idempotently without changing owner order or memberships", () => {
  const db = new Database(":memory:");
  try {
    for (const f of readdirSync(dir).filter(f => f.endsWith(".sql") && f !== migration).sort()) db.exec(readFileSync(join(dir, f), "utf8"));
    db.exec("INSERT INTO signup_resources(login,kind,resource) VALUES ('z-first','factory','owner/repo'),('a-second','factory','owner/repo'),('other','repo','owner/repo')");
    db.exec("INSERT INTO user_installations(user_id,installation_id) VALUES (1,10),(2,10),(2,20)");
    const ownerQuery = "SELECT login FROM signup_resources WHERE kind='factory' AND resource='owner/repo' ORDER BY rowid LIMIT 1";
    const membershipQuery = "SELECT user_id FROM user_installations WHERE installation_id=10 ORDER BY user_id";
    const plan = (sql: string) => (db.query(`EXPLAIN QUERY PLAN ${sql}`).all() as {detail: string}[]).map(r => r.detail).join(" ");
    expect(plan(ownerQuery)).toContain("SCAN signup_resources");
    expect(plan("DELETE FROM user_installations WHERE installation_id=10")).toContain("SCAN user_installations");
    const before = {owner: db.query(ownerQuery).get(), members: db.query(membershipQuery).all()};
    const sql = readFileSync(join(dir, migration), "utf8");
    db.exec(sql); db.exec(sql);
    expect(plan(ownerQuery)).toContain("USING INDEX signup_resources_lookup");
    expect(plan("DELETE FROM user_installations WHERE installation_id=10")).toContain("USING INDEX user_installations_installation");
    expect({owner: db.query(ownerQuery).get(), members: db.query(membershipQuery).all()}).toEqual(before);
    expect(before.owner).toEqual({login: "z-first"});
    db.exec("DELETE FROM user_installations WHERE installation_id=10");
    expect(db.query("SELECT user_id,installation_id FROM user_installations").all()).toEqual([{user_id: 2, installation_id: 20}]);
    expect(db.query("PRAGMA integrity_check").get()).toEqual({integrity_check: "ok"});
  } finally { db.close(); }
});
