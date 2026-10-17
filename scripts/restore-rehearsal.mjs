import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { localContainer, localSettings } from "../tests/local-env.mjs";

localSettings(); // Refuse hosted backends before exporting or creating anything.
const container = localContainer(),
  target = "musicale_restore_" + randomUUID().replaceAll("-", "").slice(0, 16);
assert.match(target, /^musicale_restore_[a-f0-9]{16}$/);
const directory =
  "tmp/restore-" + new Date().toISOString().replaceAll(":", "-");
mkdirSync(directory, { recursive: true });
function command(args, options = {}) {
  try {
    return execFileSync(
      "docker",
      ["exec", ...(options.input ? ["-i"] : []), container, ...args],
      {
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
        ...options,
      },
    );
  } catch (error) {
    writeFileSync(
      directory + "/private-diagnostic.txt",
      error.stderr ?? "Local database operation failed",
    );
    throw new Error(
      "Local restore rehearsal failed; inspect its ignored private diagnostic file.",
    );
  }
}
const sql = (text, database = "postgres") => {
  assert.ok(database === "postgres" || database === target);
  return command(
    [
      "psql",
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    { input: text, encoding: "utf8" },
  ).trim();
};
const tables = JSON.parse(
  sql(
    "select json_agg(json_build_object('schema',table_schema,'table',table_name) order by table_schema,table_name) from information_schema.tables where table_schema in ('public','auth','supabase_migrations','musicale_legacy') and table_type='BASE TABLE'",
  ),
);
for (const t of tables) {
  assert.match(t.schema, /^[a-z_]+$/);
  assert.match(t.table, /^[a-z_]+$/);
}
const tableQuery =
  "select jsonb_agg(r order by name) from (" +
  tables
    .map(
      (t) =>
        `select '${t.schema}.${t.table}' as name,count(*) as rows,md5(coalesce(string_agg(row_to_json(t)::text,'' order by row_to_json(t)::text),'')) as digest from ${t.schema}.${t.table} t`,
    )
    .join(" union all ") +
  ") r";
const schemaQuery = `select jsonb_build_object(
 'tables',(select jsonb_agg(r order by name) from(select n.nspname||'.'||c.relname as name,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,pg_get_userbyid(c.relowner) as owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','supabase_migrations','musicale_legacy') and c.relkind in('r','v','S'))r),
 'constraints',(select jsonb_agg(r order by name,definition) from(select n.nspname||'.'||c.relname||'.'||k.conname as name,pg_get_constraintdef(k.oid) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','auth','supabase_migrations','musicale_legacy'))r),
 'triggers',(select jsonb_agg(r order by name) from(select n.nspname||'.'||c.relname||'.'||t.tgname as name,pg_get_triggerdef(t.oid) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname in('public','auth','musicale_legacy'))r),
 'sequences',(select jsonb_agg(to_jsonb(r) order by schemaname,sequencename) from pg_sequences r where schemaname in('public','auth','musicale_legacy')),
 'views',(select jsonb_agg(r order by name) from(select n.nspname||'.'||c.relname as name,pg_get_viewdef(c.oid,true) as definition from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='v' and n.nspname='public')r),
 'policies',(select jsonb_agg(to_jsonb(r) order by schemaname,tablename,policyname) from pg_policies r where schemaname in('public','auth','supabase_migrations','musicale_legacy')),
 'grants',(select jsonb_agg((to_jsonb(r)-'table_catalog') order by table_schema,table_name,grantee,privilege_type) from information_schema.role_table_grants r where table_schema in('public','auth','supabase_migrations','musicale_legacy')),
 'functions',(select jsonb_agg(r order by signature) from(select p.oid::regprocedure::text as signature,md5(pg_get_functiondef(p.oid)) as definition,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner,has_function_privilege('anon',p.oid,'execute') as anon,has_function_privilege('authenticated',p.oid,'execute') as authenticated from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','auth','musicale_legacy') and p.prokind='f')r))`;
let created = false;
try {
  const before = JSON.parse(sql(tableQuery)),
    schema = JSON.parse(sql(schemaQuery));
  assert.ok(
    before.find((t) => t.name === "public.votes")?.rows > 0,
    "Run browser voting tests before this rehearsal.",
  );
  assert.ok(before.find((t) => t.name === "auth.users")?.rows > 0);
  const dump = command([
    "pg_dump",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "--format=custom",
    "--no-publications",
    "--schema=public",
    "--schema=auth",
    "--schema=extensions",
    "--schema=supabase_migrations",
    "--schema=musicale_legacy",
  ]);
  writeFileSync(directory + "/database.dump", dump);
  assert.deepEqual(
    JSON.parse(sql(tableQuery)),
    before,
    "Source changed during export; retry from a quiet local database.",
  );
  sql("create database " + target + " template template0");
  created = true;
  sql("drop schema public", target);
  command(
    [
      "pg_restore",
      "-U",
      "supabase_admin",
      "-d",
      target,
      "--exit-on-error",
      "--single-transaction",
    ],
    { input: dump },
  );
  assert.deepEqual(
    JSON.parse(sql(tableQuery, target)),
    before,
    "Restored rows differ.",
  );
  const restoredSchema = JSON.parse(sql(schemaQuery, target));
  writeFileSync(directory + "/schema-before.json", JSON.stringify(schema));
  writeFileSync(
    directory + "/schema-after.json",
    JSON.stringify(restoredSchema),
  );

  assert.ok(
    JSON.stringify(restoredSchema) === JSON.stringify(schema),
    "Restored schema metadata differs; inspect ignored private schema manifests.",
  );
  sql("create publication supabase_realtime for table public.songs", target);
  assert.equal(
    sql(
      "select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='songs'",
      target,
    ),
    "1",
  );
  const voter = JSON.parse(
    sql(
      "select json_build_object('user_id',v.user_id,'matchup_id',v.matchup_id,'song_id',v.selected_song_id) from votes v join daily_matchups m on m.id=v.matchup_id join profiles p on p.user_id=v.user_id where p.role='user' and m.starts_at<=now() and m.ends_at>now() limit 1",
      target,
    ),
  );
  const identity = `set role authenticated;set request.jwt.claim.sub='${voter.user_id}';`;
  assert.equal(
    sql(identity + "select count(*) from profiles", target),
    "1",
    "Restored account must only see its own profile.",
  );
  const duplicate = JSON.parse(
    sql(
      identity +
        `select submit_daily_vote('${voter.matchup_id}','${voter.song_id}')`,
      target,
    ),
  );
  assert.match(duplicate.error, /already voted/);
  let anonymousDenied = false;
  try {
    sql("set role anon;select * from votes", target);
  } catch {
    anonymousDenied = true;
  }
  assert.equal(anonymousDenied, true);
  assert.deepEqual(
    JSON.parse(sql(tableQuery)),
    before,
    "Source rows were changed by restore validation.",
  );
  const report = {
    checked_at: new Date().toISOString(),
    scope: "isolated local logical export and restore; not a hosted restore",
    tables: before.map(({ name, rows }) => ({ name, rows })),
    row_equality: true,
    authorization: true,
    rls_grants_constraints_functions: true,
    auth_rows_preserved: true,
    migration_history_preserved: true,
    duplicate_vote_rejected: true,
    realtime_publication_reconciled: true,
    source_unchanged: true,
  };
  writeFileSync(
    directory + "/report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    "PASS logical backup restored all selected application/auth/migration rows exactly",
  );
  console.log(
    "PASS restored RLS, grants, constraints, functions and duplicate-vote protection",
  );
  console.log(
    "PASS restored identity isolation and reconciled songs-only Realtime publication",
  );
  console.log(
    "PASS source unchanged; private dump and aggregate report retained under " +
      directory,
  );
} finally {
  if (created) sql("drop database " + target + " with (force)");
}
