# System Architecture

## Overview

Linux Fault Detective uses a two-stage pipeline to minimize both latency and cost.

```
┌─────────────────────────────────────────────────────┐
│                  Log Sources                         │
│  /var/log/syslog  kern.log  auth.log  mysql/error   │
└──────────────────┬──────────────────────────────────┘
                   │ tail / inotify
                   ▼
┌─────────────────────────────────────────────────────┐
│           Rule-based Classifier (Stage 1)            │
│                                                      │
│  Regex patterns → Fault category + Severity         │
│  Latency: <1ms | Cost: $0                           │
│                                                      │
│  Rules: OOM, Disk, Kernel, SSH, CPU, Network, DB    │
└──────────────────┬──────────────────────────────────┘
                   │ Only when fault detected
                   ▼
┌─────────────────────────────────────────────────────┐
│           LLM Diagnosis (Stage 2)                    │
│                                                      │
│  Claude Sonnet — receives last 20 log lines +       │
│  fault context → returns structured JSON:           │
│                                                      │
│  • summary        • root_cause                      │
│  • immediate_steps (with specific commands)         │
│  • prevention     • estimated_recovery_minutes      │
│                                                      │
│  Latency: 2–8s | Cost: ~$0.001 per diagnosis        │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              React Dashboard                         │
│                                                      │
│  Live log stream | Fault list | Diagnosis panel     │
│  Engineer sees root cause + fix in < 60 seconds    │
└─────────────────────────────────────────────────────┘
```

## Stage 1: Rule-based Classifier

**Why rules first?**
- Zero latency: engineer sees fault classification immediately
- Zero LLM cost on high-frequency noise
- Works fully offline
- Provides fault category as context to improve LLM prompt quality

**How rules work:**
Each rule has N regex patterns. A fault is detected when ≥1 pattern matches a log line. The rule with the highest pattern-match ratio wins.

## Stage 2: LLM Diagnosis

**When triggered:**
Only when Stage 1 detects a fault above the severity threshold (default: WARN).

**Deduplication:**
The same fault type won't trigger LLM diagnosis more than once per 60 seconds. Prevents thrashing on storms of correlated errors.

**Prompt design:**
The prompt sends:
1. Fault category and severity (from Stage 1)
2. The last 20 log lines (rolling window)
3. Explicit JSON output schema with field descriptions

**Output:**
Structured JSON with:
- `summary`: one-sentence human-readable description
- `root_cause`: technical explanation (2–3 sentences)
- `affected_components`: list of system components involved
- `immediate_steps`: numbered list of concrete actions (with commands)
- `prevention`: long-term fix strategy
- `severity_reason`: why this severity was assigned
- `estimated_recovery_minutes`: time estimate

## Production Deployment

### Option A: Node.js watcher on server (recommended)
API key stays on server. React frontend is read-only display.

```
Server:
  node scripts/logWatcher.js → writes to /tmp/faults.json
  (or sends to a webhook)

React app:
  Polls /tmp/faults.json or receives webhook events
```

### Option B: Backend proxy
```
React → POST /api/diagnose (your Express server)
Your Express → Anthropic API (API key is server env var)
Anthropic → diagnosis JSON → your Express → React
```

### Option C: Demo mode (this repo default)
React calls Anthropic API directly from the browser.
Only safe for demos — exposes API key in browser.
Suitable for: local dev, internal tools, proof of concept.
