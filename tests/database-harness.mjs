import { localContainer } from "./local-env.mjs";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

export const user = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const asUser = (n, text) =>
  `begin;set local role authenticated;set local request.jwt.claim.sub='${user(n)}';${text};commit;`;
export const day = "(now() at time zone 'UTC')::date";
export const createDay = (offset, a = "respect-aretha", b = "god-only-knows") =>
  `insert into daily_matchups(matchup_day,song_a_id,song_b_id,starts_at,ends_at) values(${day}+${offset},'${a}','${b}',(${day}+${offset})::timestamp at time zone 'UTC',(${day}+${offset}+1)::timestamp at time zone 'UTC')`;
export const migrations = () =>
  readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();

// Only owned disposable databases in the local Musicale container are accepted.
export function databaseHarness(label) {
  if (!/^[a-z]+$/.test(label)) throw new Error("Use a simple local test label");
  const container = localContainer(),
    database = `musicale_test_${label}_${process.pid}`;
  function sql(text, db = database) {
    if (db !== database && db !== "postgres")
      throw new Error("Use only this harness's disposable database");
    return new Promise((resolve, reject) => {
      const child = spawn("docker", [
        "exec",
        "-i",
        container,
        "psql",
        "-X",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        db,
      ]);
      let out = "",
        err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(err.trim()));
        // Vote failures return an error object so the durable request budget commits.
        for (const line of out.trim().split("\n")) {
          try {
            const data = JSON.parse(line);
            if (data?.error) return reject(new Error(data.error));
          } catch {}
        }
        resolve(out.trim());
      });
      child.stdin.end(text);
    });
  }

  async function create() {
    await sql(`create database ${database}`, "postgres");
    await sql(`create schema auth;create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to anon,authenticated;
      grant execute on function auth.uid() to anon,authenticated;
      alter default privileges in schema public grant all on tables to anon,authenticated;
      alter default privileges in schema public grant all on sequences to anon,authenticated;`);
  }
  async function migrate(files = migrations()) {
    await sql(`create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
      revoke all on schema supabase_migrations from public,anon,authenticated;
      alter table supabase_migrations.schema_migrations enable row level security;
      revoke all on supabase_migrations.schema_migrations from public,anon,authenticated;`);
    for (const file of files) {
      const source = readFileSync(`supabase/migrations/${file}`, "utf8");
      const [version, ...parts] = file.replace(/\.sql$/, "").split("_");
      const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
      await sql(source);
      await sql(
        `insert into supabase_migrations.schema_migrations values(${literal(version)},${literal(parts.join("_"))},array[${literal(source)}])`,
      );
    }
  }
  function close() {
    execFileSync(
      "docker",
      [
        "exec",
        container,
        "psql",
        "-X",
        "-q",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-c",
        `drop database if exists ${database} with (force)`,
      ],
      { stdio: "pipe" },
    );
  }
  return { database, sql, create, migrate, close };
}
