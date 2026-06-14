# Linux-Server-Fault-Detection-Diagnose-Using-Log-Classification
Automatically detect Linux server faults from logs, classify the fault type, explain the root cause using an LLM, and provide possible solutions.
# Linux Fault Detective 🔍

**Automatic Linux server fault detection, classification, and LLM-powered root cause analysis.**

Reduces fault diagnosis time from 6–7 hours → minutes.

---

## What it does

1. **Ingests** Linux `/var/log/syslog`, `/var/log/kern.log`, `/var/log/auth.log` (real or simulated)
2. **Classifies** fault type using rule-based pattern matching (zero latency, zero cost)
3. **Diagnoses** root cause using Claude (Anthropic LLM) with structured JSON output
4. **Recommends** immediate remediation steps and prevention strategies

## Supported fault types

| Fault | Severity | Log Source |
|-------|----------|------------|
| Out of Memory (OOM Kill) | Critical | `/var/log/syslog`, `dmesg` |
| Disk Full / I/O Error | Critical | `/var/log/kern.log` |
| Kernel Panic | Critical | `/var/log/kern.log`, `dmesg` |
| SSH Brute Force | Warning | `/var/log/auth.log` |
| CPU Overload / Hung Process | Warning | `/var/log/syslog` |
| Network Interface Down | Critical | `/var/log/syslog` |
| MySQL Crash | Critical | `/var/log/mysql/error.log` |

---

## Quick Start

### 1. Clone
```bash
git clone https://github.com/YOUR_USERNAME/linux-fault-detective.git
cd linux-fault-detective
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set your Anthropic API key
```bash
cp .env.example .env
# Edit .env and add your key:
# VITE_ANTHROPIC_API_KEY=sk-ant-...
```

Get an API key at https://console.anthropic.com

### 4. Run development server
```bash
npm run dev
```

Open http://localhost:5173

---

## Project Structure

```
linux-fault-detective/
├── src/
│   ├── App.jsx                   # Root component
│   ├── components/
│   │   ├── Dashboard.jsx         # Metric cards (faults, rate, critical count)
│   │   ├── LogStream.jsx         # Real-time log display
│   │   ├── FaultList.jsx         # Detected faults panel
│   │   └── DiagnosisPanel.jsx    # LLM root cause output
│   ├── data/
│   │   └── faultScenarios.js     # 7 realistic fault scenarios with log entries
│   └── utils/
│       ├── classifier.js         # Rule-based pre-classifier (fast, offline)
│       └── llmDiagnosis.js       # Anthropic API integration
├── scripts/
│   └── logWatcher.js             # Node.js script for real log file watching
├── docs/
│   └── architecture.md           # System design and flow
└── README.md
```

---

## Real Log Watching (Production Mode)

For real server log analysis, use the included Node.js watcher:

```bash
node scripts/logWatcher.js --log /var/log/syslog --api-key sk-ant-...
```

Options:
```
--log        Path to log file (default: /var/log/syslog)
--api-key    Anthropic API key
--threshold  Min severity to trigger diagnosis (WARN|CRIT, default: WARN)
--output     Output JSON results to file
```

---

## Architecture

```
Log Files
   │
   ▼
Rule-based Classifier  ──→  Fault Category + Confidence
   │
   ▼
Anthropic Claude API  ──→  Root Cause + Remediation Steps (JSON)
   │
   ▼
React Dashboard  ──→  Engineer sees fault + fix in < 60 seconds
```

### Why two-stage?

- **Rule-based first**: Zero latency, zero cost, works offline. Catches obvious faults immediately.
- **LLM second**: Handles novel fault patterns, cross-correlates events, generates human-readable diagnosis.

---

## API Key Security

**Never expose your API key in frontend code for production.**

For production deployment:
1. Run `scripts/logWatcher.js` on the server (Node.js, key stays server-side)
2. Or build a thin backend proxy (Express/FastAPI) that holds the key
3. The React frontend calls your proxy, not Anthropic directly

---

## Extending

### Add a new fault type
Edit `src/data/faultScenarios.js`:
```js
myFault: {
  label: "My Custom Fault",
  severity: "critical",    // "critical" | "warn" | "info"
  category: "My Category",
  logs: [
    { ts: "12:00:00", level: "CRIT", msg: "my fault message" },
    ...
  ],
  keywords: ["fault", "keywords"],
}
```

Then add a matching rule in `src/utils/classifier.js`.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS
- **LLM**: Anthropic Claude (claude-sonnet-4-6)
- **Log watching**: Node.js `fs.watch` / `tail` (production script)
- **Classification**: Rule-based regex (no ML dependency)

---

## License

MIT — use freely, attribution appreciated.
