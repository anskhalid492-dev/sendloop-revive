/**
 * One-time re-encryption of stored provider credentials.
 *
 * Reads every ciphertext column below from the production project, decrypts it
 * with PROVIDER_CREDENTIALS_KEY (old), re-encrypts with
 * PROVIDER_CREDENTIALS_KEY_NEW, writes it back, then verifies the stored value
 * decrypts with the new key and matches the original plaintext.
 *
 * Usage:
 *   bun scripts/reencrypt-provider-credentials.ts --dry-run
 *   bun scripts/reencrypt-provider-credentials.ts --apply
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, getServiceRoleKey } from "../src/integrations/supabase/config";

const OLD = process.env["PROVIDER_CREDENTIALS_KEY"];
const NEW = process.env["PROVIDER_CREDENTIALS_KEY_NEW"];
if (!OLD) throw new Error("PROVIDER_CREDENTIALS_KEY is not set");
if (!NEW) throw new Error("PROVIDER_CREDENTIALS_KEY_NEW is not set");
if (OLD === NEW) throw new Error("Old and new keys are identical — nothing to do");

const derive = (raw: string) => createHash("sha256").update(raw).digest();
const oldKey = derive(OLD);
const newKey = derive(NEW);

function decryptWith(k: Buffer, stored: string): unknown {
  const buf = Buffer.from(stored, "base64");
  const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
}

function encryptWith(k: Buffer, value: unknown): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64");
}

type Target = { table: string; idColumn: string; column: string };

const TARGETS: Target[] = [
  { table: "sending_account_secrets", idColumn: "sending_account_id", column: "credentials_ciphertext" },
  { table: "email_provider_secrets", idColumn: "provider_id", column: "credentials_ciphertext" },
  { table: "integration_secrets", idColumn: "connection_id", column: "credentials_ciphertext" },
  { table: "workspace_ai_keys", idColumn: "id", column: "key_ciphertext" },
  { table: "billing_provider_secrets", idColumn: "id", column: "ciphertext" },
  { table: "marketing_provider_secrets", idColumn: "provider_id", column: "credentials_ciphertext" },
  { table: "webhook_endpoints", idColumn: "id", column: "secret_ciphertext" },
];

const apply = process.argv.includes("--apply");
const url = SUPABASE_URL;
const serviceKey = getServiceRoleKey();
if (!serviceKey) throw new Error("Service role key not available");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log(`Project: ${url}`);
console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);

let total = 0;
let migrated = 0;
let alreadyNew = 0;
const failures: string[] = [];

for (const t of TARGETS) {
  const { data, error } = await db.from(t.table).select(`${t.idColumn}, ${t.column}`);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) {
      console.log(`- ${t.table}: not present, skipped`);
      continue;
    }
    failures.push(`${t.table}: read failed — ${error.message}`);
    continue;
  }
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  console.log(`- ${t.table}: ${rows.length} row(s)`);

  for (const row of rows) {
    const id = row[t.idColumn] as string;
    const stored = row[t.column];
    if (typeof stored !== "string" || stored.length === 0) continue;
    total += 1;

    // Idempotency: skip rows already readable with the new key.
    try {
      decryptWith(newKey, stored);
      alreadyNew += 1;
      console.log(`    ${id}: already encrypted with new key, skipped`);
      continue;
    } catch {
      /* expected for rows still on the old key */
    }

    let plain: unknown;
    try {
      plain = decryptWith(oldKey, stored);
    } catch (e) {
      failures.push(`${t.table}/${id}: cannot decrypt with old key — ${(e as Error).message}`);
      continue;
    }

    const next = encryptWith(newKey, plain);
    if (!apply) {
      console.log(`    ${id}: would re-encrypt (${Object.keys(plain as object).length} field(s))`);
      migrated += 1;
      continue;
    }

    const { error: upErr } = await db
      .from(t.table)
      .update({ [t.column]: next })
      .eq(t.idColumn, id);
    if (upErr) {
      failures.push(`${t.table}/${id}: write failed — ${upErr.message}`);
      continue;
    }

    // Verify from the database, not from memory.
    const { data: check, error: checkErr } = await db
      .from(t.table)
      .select(t.column)
      .eq(t.idColumn, id)
      .maybeSingle();
    if (checkErr || !check) {
      failures.push(`${t.table}/${id}: verification read failed — ${checkErr?.message ?? "no row"}`);
      continue;
    }
    try {
      const round = decryptWith(newKey, (check as Record<string, string>)[t.column]!);
      if (JSON.stringify(round) !== JSON.stringify(plain)) {
        failures.push(`${t.table}/${id}: plaintext mismatch after re-encryption`);
        continue;
      }
    } catch (e) {
      failures.push(`${t.table}/${id}: new key cannot decrypt stored value — ${(e as Error).message}`);
      continue;
    }
    migrated += 1;
    console.log(`    ${id}: re-encrypted and verified`);
  }
}

console.log(`\nCiphertexts found:      ${total}`);
console.log(`Re-encrypted+verified:  ${migrated}`);
console.log(`Already on new key:     ${alreadyNew}`);
console.log(`Failures:               ${failures.length}`);
for (const f of failures) console.log(`  ! ${f}`);
if (failures.length > 0) process.exit(1);
