"use client";

import { useEffect, useState } from "react";
import { Settings, Zap } from "lucide-react";

type SettingsResponse = {
  configured: boolean;
  baseUrl: string;
  isActive: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string | null;
};

export default function CourierSettingsForm() {
  const [loading, setLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState("https://app.slm.team/slm/API");
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [lastTest, setLastTest] = useState<{ at: string | null; ok: boolean | null; message: string | null }>({
    at: null,
    ok: null,
    message: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/courier-manager/settings");
      if (cancelled) return;
      if (res.ok) {
        const data = (await res.json()) as SettingsResponse;
        setBaseUrl(data.baseUrl);
        setConfigured(data.configured);
        setLastTest({ at: data.lastTestAt, ok: data.lastTestOk, message: data.lastTestMessage });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage(null);

    const res = await fetch("/api/courier-manager/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl, apiKey }),
    });
    const data = (await res.json()) as { ok?: boolean; error?: string };
    setSaving(false);

    if (!res.ok || !data.ok) {
      setSaveMessage({ type: "err", text: data.error ?? "Nu am putut salva setarile." });
      return;
    }

    setSaveMessage({ type: "ok", text: "Setari salvate." });
    setConfigured(true);
    setApiKey("");
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);

    const res = await fetch("/api/courier-manager/test-connection", { method: "POST" });
    const data = (await res.json()) as { ok: boolean; message: string };
    setTesting(false);
    setTestResult(data);
    setLastTest({ at: new Date().toISOString(), ok: data.ok, message: data.message });
  }

  if (loading) {
    return <div className="stack" />;
  }

  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <Settings size={16} /> Courier Manager
        </div>

        <form onSubmit={handleSave}>
          <div className="form-row">
            <div className="field">
              <label htmlFor="cmBaseUrl">URL de baza</label>
              <input
                id="cmBaseUrl"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cmApiKey">
                Cheie API {configured && <span className="muted">(configurata — lasa gol ca sa o pastrezi)</span>}
              </label>
              <input
                id="cmApiKey"
                type="password"
                placeholder={configured ? "••••••••••••••••" : "Cheia primita de la Courier Manager"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>

          {saveMessage && <div className={`auth-msg ${saveMessage.type === "err" ? "err" : "ok"}`}>{saveMessage.text}</div>}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button className="btn primary" type="submit" disabled={saving}>
              {saving ? "Se salveaza..." : "Salveaza"}
            </button>
            <button className="btn ghost" type="button" onClick={handleTest} disabled={testing || !configured}>
              <Zap size={14} /> {testing ? "Se testeaza..." : "Testeaza conexiunea"}
            </button>
          </div>
        </form>

        {testResult && (
          <div className={`auth-msg ${testResult.ok ? "ok" : "err"}`} style={{ marginTop: 12 }}>
            {testResult.message}
          </div>
        )}

        {!testResult && lastTest.message && (
          <div className="hint" style={{ marginTop: 12 }}>
            Ultimul test {lastTest.at ? `(${new Date(lastTest.at).toLocaleString("ro-RO")})` : ""}:{" "}
            <span className={lastTest.ok ? "strong" : "strong"}>{lastTest.message}</span>
          </div>
        )}
      </div>
    </div>
  );
}
