/**
 * classifyFault
 * Rule-based pre-classifier that runs before the LLM.
 * Fast, zero-latency, zero-cost. Adds confidence signal to LLM prompt.
 */

const RULES = [
  {
    name: "OOM Kill",
    patterns: [/Out of memory/i, /oom_kill/i, /page allocation failure/i],
    severity: "critical",
    category: "Memory Exhaustion",
  },
  {
    name: "Disk Full",
    patterns: [/No space left on device/i, /EXT4-fs error/i, /I\/O error/i, /diskfull/i],
    severity: "critical",
    category: "Disk / Storage Failure",
  },
  {
    name: "Kernel Panic",
    patterns: [/kernel panic/i, /NULL pointer dereference/i, /Oops:/i],
    severity: "critical",
    category: "Kernel Crash",
  },
  {
    name: "SSH Brute Force",
    patterns: [/Failed password/i, /invalid user/i],
    severity: "warn",
    category: "Security Breach Attempt",
  },
  {
    name: "Process Hang",
    patterns: [/blocked for more than/i, /hung_task/i, /kworker.*blocked/i],
    severity: "warn",
    category: "CPU / Process Hang",
  },
  {
    name: "Network Down",
    patterns: [/NIC Link is Down/i, /Hardware Unit Hang/i, /tx_timeout/i],
    severity: "critical",
    category: "Network Interface Failure",
  },
  {
    name: "Database Crash",
    patterns: [/InnoDB: Assertion/i, /mysqld.*ABRT/i, /code=killed/i],
    severity: "critical",
    category: "Database Engine Crash",
  },
];

export function classifyFault(scenario) {
  const allMessages = scenario.logs.map((l) => l.msg).join(" ");
  let matched = null;
  let confidence = 0;

  for (const rule of RULES) {
    const hits = rule.patterns.filter((p) => p.test(allMessages)).length;
    const score = hits / rule.patterns.length;
    if (score > confidence) {
      confidence = score;
      matched = rule;
    }
  }

  return {
    label: scenario.label,
    category: matched?.category ?? scenario.category,
    severity: matched?.severity ?? scenario.severity,
    confidence: Math.round((confidence || 0.5) * 100),
    ruleMatched: matched?.name ?? "unknown",
  };
}
