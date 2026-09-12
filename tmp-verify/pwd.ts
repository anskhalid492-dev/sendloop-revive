import { validatePassword, checkPasswordRules, isPasswordBreached, PASSWORD_MIN_LENGTH } from "../src/lib/password-policy";
console.log("MIN:", PASSWORD_MIN_LENGTH);
for (const p of ["short", "password123", "Passw0rd", "aaaaaaaaaaaaAA1", "Vt7qzLm92xkQrPb#Az", "Password12345"]) {
  const rules = checkPasswordRules(p, {});
  const full = await validatePassword(p, {});
  console.log("PWD", JSON.stringify(p), "| rules:", rules ?? "OK", "| full:", full ?? "OK");
}
console.log("breached('Password123!'):", await isPasswordBreached("Password123!"));
console.log("breached(random):", await isPasswordBreached("Vt7qzLm92xkQrPb#Az"));
