import { useState, useEffect, useRef } from "react";
import Dashboard from "./components/Dashboard";
import LogStream from "./components/LogStream";
import FaultList from "./components/FaultList";
import DiagnosisPanel from "./components/DiagnosisPanel";
import { FAULT_SCENARIOS } from "./data/faultScenarios";
import { classifyFault } from "./utils/classifier";
import { diagnoseWithLLM } from "./utils/llmDiagnosis";

export default function App() {
  const [logs, setLogs] = useState([]);
  const [faults, setFaults] = useState([]);
  const [activeDiagnosis, setActiveDiagnosis] = useState(null);
  const [diagnosisState, setDiagnosisState] = useState("idle"); // idle | loading | done | error
  const [selectedFault, setSelectedFault] = useState("");
  const [metrics, setMetrics] = useState({ total: 0, critical: 0, rate: 0 });

  const injectFault = async () => {
    if (!selectedFault) return;
    const scenario = FAULT_SCENARIOS[selectedFault];
    if (!scenario) return;

    // Stream logs in
    setLogs((prev) => [...scenario.logs.map((l) => ({ ...l, id: Date.now() + Math.random() })), ...prev].slice(0, 200));

    // Classify fault
    const classified = classifyFault(scenario);
    const newFault = { ...classified, id: Date.now(), timestamp: new Date().toLocaleTimeString() };
    setFaults((prev) => [newFault, ...prev]);

    setMetrics((m) => ({
      total: m.total + 1,
      critical: m.critical + (scenario.severity === "critical" ? 1 : 0),
      rate: Math.floor(Math.random() * 80) + 100,
    }));

    // Run LLM diagnosis
    setDiagnosisState("loading");
    setActiveDiagnosis(null);

    try {
      const result = await diagnoseWithLLM(scenario);
      setActiveDiagnosis(result);
      setDiagnosisState("done");
    } catch (err) {
      setDiagnosisState("error");
      setActiveDiagnosis({ error: err.message });
    }
  };

  const clearAll = () => {
    setLogs([]);
    setFaults([]);
    setActiveDiagnosis(null);
    setDiagnosisState("idle");
    setMetrics({ total: 0, critical: 0, rate: 0 });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-mono">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-3">
        <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center text-black font-bold text-sm">LF</div>
        <div>
          <h1 className="text-sm font-semibold text-white">Linux Fault Detective</h1>
          <p className="text-xs text-gray-500">Real-time log analysis · LLM-powered root cause diagnosis</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-gray-400">Live</span>
        </div>
      </header>

      <main className="p-6 space-y-4">
        <Dashboard metrics={metrics} />

        <div className="flex gap-3">
          <select
            value={selectedFault}
            onChange={(e) => setSelectedFault(e.target.value)}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="">— choose fault scenario —</option>
            {Object.entries(FAULT_SCENARIOS).map(([key, s]) => (
              <option key={key} value={key}>{s.label}</option>
            ))}
          </select>
          <button
            onClick={injectFault}
            disabled={!selectedFault}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded font-medium transition-colors"
          >
            ⚡ Inject &amp; Diagnose
          </button>
          <button
            onClick={clearAll}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded transition-colors"
          >
            Clear
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <LogStream logs={logs} />
          <FaultList faults={faults} />
        </div>

        <DiagnosisPanel state={diagnosisState} diagnosis={activeDiagnosis} />
      </main>
    </div>
  );
}
