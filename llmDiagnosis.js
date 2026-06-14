/**
 * diagnoseWithLLM
 * Sends log data to the Anthropic API and returns structured diagnosis.
 * Uses claude-sonnet-4-6 — fastest, most cost-effective for this use case.
 */
export async function diagnoseWithLLM(scenario) {
  const logDump = scenario.logs
    .map((l) => `[${l.ts}] ${l.level}: ${l.msg}`)
    .join("\n");

  const prompt = `You are a senior Linux SRE performing root cause analysis.

FAULT CATEGORY: ${scenario.category}
FAULT TYPE: ${scenario.label}
SEVERITY: ${scenario.severity.toUpperCase()}

LOG ENTRIES:
${logDump}

Respond ONLY with valid JSON (no markdown fences, no preamble) in this exact structure:
{
  "summary": "One sentence: what happened",
  "root_cause": "2-3 sentences: technical explanation of why this happened",
  "affected_components": ["component1", "component2", "component3"],
  "immediate_steps": [
    "Step with specific command or action",
    "Step with specific command or action",
    "Step with specific command or action",
    "Step with specific command or action"
  ],
  "prevention": "1-2 sentences: how to prevent recurrence",
  "severity_reason": "Why this severity level was assigned",
  "estimated_recovery_minutes": 15
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const raw = data.content
    .map((b) => b.text || "")
    .join("")
    .replace(/```json|```/g, "")
    .trim();

  try {
    return JSON.parse(raw);
  } catch {
    // Fallback: return raw text in a structured wrapper
    return {
      summary: "LLM analysis complete (raw response)",
      root_cause: raw,
      affected_components: [scenario.category],
      immediate_steps: ["Review the logs above", "Contact system administrator"],
      prevention: "Implement monitoring and alerting",
      severity_reason: `Classified as ${scenario.severity}`,
      estimated_recovery_minutes: 30,
    };
  }
}
