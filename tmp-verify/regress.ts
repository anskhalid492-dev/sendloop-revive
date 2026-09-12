import { assertPublicUrl, BlockedUrlError } from "../src/lib/ssrf-guard.server";
import { validatePassword, PASSWORD_MIN_LENGTH } from "../src/lib/password-policy";

const bad = ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8080/x", "http://10.0.0.5/hook", "file:///etc/passwd", "http://localhost/x", "http://[::1]/x"];
for (const u of bad) {
  try { await assertPublicUrl(u); console.log("SSRF FAIL (allowed):", u); }
  catch (e) { console.log("SSRF blocked:", u, "->", e instanceof BlockedUrlError ? "BlockedUrlError" : (e as Error).name); }
}
try { await assertPublicUrl("https://webhook.site/abc"); console.log("SSRF public allowed: https://webhook.site/abc"); }
catch (e) { console.log("SSRF FAIL (public blocked):", (e as Error).message); }

console.log("MIN_LENGTH:", PASSWORD_MIN_LENGTH);
for (const p of ["short", "password123", "Passw0rd", "aaaaaaaaaaaaAA1", "Vt7qzLm92xkQrPb#Az"]) {
  const r = await validatePassword(p, {});
  console.log("PWD", JSON.stringify(p), "ok=", r.ok, r.ok ? "" : r.errors?.[0] ?? r.message ?? "");
}
