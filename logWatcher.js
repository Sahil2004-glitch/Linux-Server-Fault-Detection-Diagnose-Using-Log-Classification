#!/usr/bin/env node
/**
 * logWatcher.js — Production log watcher for Linux Fault Detective
 *
 * Watches a live log file, detects fault patterns, and calls Claude
 * for root cause analysis. Run this on the server (API key stays server-side).
 *
 * Usage:
 *   node scripts/logWatcher.js --log /var/log/syslog --api-key sk-ant-...
 *
 * Requires: Node.js 18+ (built-in fetch)
 */

const fs = require("fs");
const readline = require("readline");
const path = require("path");

// ─── Config ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : def;
};

const LOG_FILE   = getArg("log", "/var/log/syslog");
const API_KEY    = getArg("api-key", process.env.ANTHROPIC_API_KEY);
const THRESHOLD  = getArg("threshold", "WARN");
const OUTPUT     = getArg("output", null);

if (!API_KEY) {
  console.error("❌  No API key. Set --api-key or ANTHROPIC_API_KEY env var.");
  process.exit(1);
}

// ─── Fault detection rules ────────────────────────────────────────────────────
const RULES = [
  { name: "OOM Kill",          patterns: [/Out of memory/i, /oom_kill/i],             severity: "critical" },
  { name: "Disk Full",         patterns: [/No space left on device/i, /EXT4-fs error/i], severity: "critical" },
  { name: "Kernel Panic",      patterns: [/kernel panic/i, /NULL pointer dereference/i], severity: "critical" },
  { name: "SSH Brute Force",   patterns: [/Failed password.*ssh2/i],                  severity: "warn" },
  { name: "Process Hang",      patterns: [/blocked for more than \d+ seconds/i],      severity: "warn" },
  { name: "Network Down",      patterns: [/NIC Link is Down/i, /Hardware Unit Hang/i], severity: "critical" },
  { name: "Database Crash",    patterns: [/InnoDB: Assertion/i, /code=killed.*ABRT/i], severity: "critical" },
];

const SEVERITY_ORDER = { info: 0, warn: 1, critical: 2 };
const MIN_SEVERITY   = SEVERITY_ORDER[THRESHOLD.toLowerCase()] ?? 1;

// ─── State ────────────────────────────────────────────────────────────────────
const buffer = [];           // Rolling window of recent log lines
const MAX_BUFFER = 50;
const diagnosedRecently = new Set(); // Deduplicate — don't diagnose same fault twice in 60s
const results = [];

// ─── Log parsing ─────────────────────────────────────────────────────────────
function parseLine(line) {
  // Handles both syslog and journald formats
  const match = line.match(/^(\w{3}\s+\d+\s[\d:]+)\s+\S+\s+(.*)/);
  if (!match) return { ts: new Date().toISOString(), msg: line };
  return { ts: match[1], msg: match[2] };
}

function classifyLine(msg) {
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(msg))) {
      return rule;
    }
  }
  return null;
}

// ─── LLM diagnosis ───────────────────────────────────────────────────────────
async function callClaude(faultName, severity, logContext) {
  const prompt = `You are a Linux SRE. Analyze these logs and respond ONLY in JSON (no markdown):

FAULT TYPE: ${faultName}
SEVERITY: ${severity.toUpperCase()}

LOGS:
${logContext}

{
  "summary": "...",
  "root_cause": "...",
  "immediate_steps": ["...", "...", "..."],
  "prevention": "...",
  "estimated_recovery_minutes": 0
}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`API ${resp.status}: ${await resp.text()}`);

  const data = await resp.json();
  const raw = data.content.map((b) => b.text || "").join("").replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

// ─── Process a line ───────────────────────────────────────────────────────────
async function processLine(line) {
  const { ts, msg } = parseLine(line);
  buffer.push({ ts, msg });
  if (buffer.length > MAX_BUFFER) buffer.shift();

  const rule = classifyLine(msg);
  if (!rule) return;
  if (SEVERITY_ORDER[rule.severity] < MIN_SEVERITY) return;

  // Deduplicate: skip if same fault in last 60s
  if (diagnosedRecently.has(rule.name)) return;
  diagnosedRecently.add(rule.name);
  setTimeout(() => diagnosedRecently.delete(rule.name), 60_000);

  console.log(`\n⚠️  [${new Date().toISOString()}] FAULT DETECTED: ${rule.name} (${rule.severity.toUpperCase()})`);
  console.log(`   Trigger: ${msg.slice(0, 80)}...`);
  console.log("   Calling Claude for diagnosis...");

  try {
    const context = buffer.slice(-20).map((l) => `[${l.ts}] ${l.msg}`).join("\n");
    const diagnosis = await callClaude(rule.name, rule.severity, context);

    console.log(`\n📋 DIAGNOSIS — ${rule.name}`);
    console.log(`   Summary: ${diagnosis.summary}`);
    console.log(`   Root Cause: ${diagnosis.root_cause}`);
    console.log(`   Steps:`);
    (diagnosis.immediate_steps || []).forEach((s, i) => console.log(`     ${i + 1}. ${s}`));
    console.log(`   Recovery: ~${diagnosis.estimated_recovery_minutes} min`);
    console.log(`   Prevention: ${diagnosis.prevention}`);

    const result = { fault: rule.name, severity: rule.severity, ts: new Date().toISOString(), ...diagnosis };
    results.push(result);

    if (OUTPUT) {
      fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
    }
  } catch (err) {
    console.error(`   LLM error: ${err.message}`);
  }
}

// ─── Watch the log file ───────────────────────────────────────────────────────
function watchFile(filePath) {
  console.log(`\n🔍 Linux Fault Detective`);
  console.log(`   Watching: ${filePath}`);
  console.log(`   Threshold: ${THRESHOLD}`);
  console.log(`   Press Ctrl+C to stop.\n`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌  File not found: ${filePath}`);
    process.exit(1);
  }

  // Tail the file: start at current end, watch for new lines
  const stat = fs.statSync(filePath);
  let position = stat.size;

  fs.watch(filePath, { persistent: true }, () => {
    const newStat = fs.statSync(filePath);
    if (newStat.size <= position) return; // File truncated or unchanged

    const stream = fs.createReadStream(filePath, { start: position, end: newStat.size });
    const rl = readline.createInterface({ input: stream });

    rl.on("line", (line) => {
      if (line.trim()) processLine(line);
    });

    position = newStat.size;
  });
}

watchFile(LOG_FILE);
