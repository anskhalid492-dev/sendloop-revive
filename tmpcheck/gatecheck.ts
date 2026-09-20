import { mailboxCapacity, canUseWarmup, canAddMailbox, requireMailboxCapacity } from "../src/lib/billing/gates.server";
for (const w of ["2c6f066c-8bb4-476d-8346-ce3f876b9610","60420bb7-a48c-4dbb-b489-5e678906b14e","1709f559-c2b1-47c2-9b32-d017673eddcb"]) {
  console.log(w, JSON.stringify(await mailboxCapacity(w)), "warmup:", JSON.stringify(await canUseWarmup(w)));
  try { await requireMailboxCapacity(w); console.log("  add mailbox: allowed"); }
  catch (e) { console.log("  add mailbox refused:", (e as Error).message); }
}
