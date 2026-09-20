import { mailboxCapacity, canUseWarmup, canAddMailbox } from "../src/lib/billing/gates.server";
for (const w of ["1709f559-c2b1-47c2-9b32-d017673eddcb", "99201135-99e0-44e0-8a22-e143c25c5440"]) {
  console.log(w, JSON.stringify(await mailboxCapacity(w)));
  console.log("  warmup:", JSON.stringify(await canUseWarmup(w)));
  console.log("  addMailbox:", JSON.stringify(await canAddMailbox(w)));
}
