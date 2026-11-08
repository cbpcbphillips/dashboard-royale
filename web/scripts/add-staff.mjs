#!/usr/bin/env node
// Create a staff account line for STAFF_ACCOUNTS (and a fresh AUTH_SECRET if you need one).
// Usage:  node scripts/add-staff.mjs you@casino.com "Your Name"
// It asks for the password (not echoed) and prints the line to append. The password itself is never stored.
import { randomBytes, scryptSync } from "node:crypto";
import { stdin, stdout } from "node:process";

const [email, name = email] = process.argv.slice(2);
if (!email) {
  console.log('Usage: node scripts/add-staff.mjs you@casino.com "Your Name"');
  console.log(`New AUTH_SECRET (if you need one): ${randomBytes(32).toString("hex")}`);
  process.exit(0);
}

function ask(q) {
  return new Promise((resolve) => {
    stdout.write(q);
    let s = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    stdin.on("data", function on(ch) {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", on); stdout.write("\n"); resolve(s);
      } else if (ch === "\u0003") process.exit(1);
      else if (ch === "\u007f" || ch === "\b") s = s.slice(0, -1);
      else s += ch;
    });
  });
}

const pw = await ask("Password (not shown): ");
if (pw.length < 10) { console.error("Use at least 10 characters."); process.exit(1); }
const salt = randomBytes(16);
const hash = scryptSync(pw, salt, 64);
console.log("\nAppend to STAFF_ACCOUNTS (separate accounts with ;):");
console.log(`${email.toLowerCase()}|${name}|${salt.toString("hex")}|${hash.toString("hex")}`);
console.log(`\nNew AUTH_SECRET (only if you don't have one yet): ${randomBytes(32).toString("hex")}`);
