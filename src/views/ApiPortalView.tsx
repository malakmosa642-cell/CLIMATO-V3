import { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Code2,
  Copy,
  Database,
  FileText,
  Gauge,
  KeyRound,
  Play,
  Plus,
  RefreshCw,
  Scale,
  Terminal,
  Trash2,
  Webhook,
} from 'lucide-react';
import type { AuthUserSummary } from '../components/AuthModal';
import SampleDataBanner from '../components/SampleDataBanner';
import {
  API_ENDPOINTS,
  ApiEndpointDoc,
  CodeLanguage,
  MODULE_API_SPECS,
  buildCodeSnippet,
} from '../data/apiPortalDocs';
import { Language, PageRoute, SatelliteConnector } from '../types/climate';

interface ApiPortalViewProps {
  lang: Language;
  connectors: SatelliteConnector[];
  onNavigate: (route: PageRoute) => void;
  authUser?: AuthUserSummary | null;
  onOpenAuth?: () => void;
}

type PortalSection =
  | 'quickstart'
  | 'auth'
  | 'modules'
  | 'reports'
  | 'alerts'
  | 'sandbox'
  | 'ratelimits'
  | 'terms';

interface ApiKeyRow {
  id: string;
  label: string;
  token_value: string;
  environment: string;
  scopes: string;
  rate_limit_rpm: number;
  expires_at?: string | null;
  rotated_from_id?: string | null;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiPortalView({
  lang,
  connectors,
  onNavigate,
  authUser,
  onOpenAuth,
}: ApiPortalViewProps) {
  const isAr = lang === 'ar';
  const [section, setSection] = useState<PortalSection>('sandbox');
  const [activeEndpointId, setActiveEndpointId] = useState<string>('climate-summary');
  const [codeLang, setCodeLang] = useState<CodeLanguage>('python');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Sandbox keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [selectedToken, setSelectedToken] = useState<string>('clm_sbx_demo_9f4a2c81e0b7');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [adminSecretInput, setAdminSecretInput] = useState('');
  const [keyErrorMsg, setKeyErrorMsg] = useState<string | null>(null);
  const [newlyIssuedToken, setNewlyIssuedToken] = useState<{ label: string; token: string } | null>(null);

  // Interactive Sandbox Runner state
  const activeEndpoint: ApiEndpointDoc =
    API_ENDPOINTS.find((e) => e.id === activeEndpointId) || API_ENDPOINTS[0];
  const [pathParams, setPathParams] = useState<Record<string, string>>(
    activeEndpoint.defaultPathParams || {}
  );
  const [queryParams, setQueryParams] = useState<Record<string, string>>(
    activeEndpoint.defaultQuery || {}
  );
  const [requestBody, setRequestBody] = useState<string>(activeEndpoint.defaultBody || '');
  const [customTokenInput, setCustomTokenInput] = useState<string>('clm_sbx_demo_9f4a2c81e0b7');
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{
    status: number;
    latencyMs: number;
    headers: Record<string, string>;
    body: string;
  } | null>(null);

  const buildKeyMgmtHeaders = (extra?: Record<string, string>): Record<string, string> => {
    const h: Record<string, string> = { ...(extra || {}) };
    if (adminSecretInput.trim()) {
      h['X-Climato-Admin-Secret'] = adminSecretInput.trim();
    }
    if (customTokenInput.trim()) {
      h.Authorization = `Bearer ${customTokenInput.trim()}`;
    }
    return h;
  };

  const loadKeys = () => {
    fetch('/api/v1/keys', {
      credentials: 'include',
      headers: buildKeyMgmtHeaders(),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          setApiKeys([]);
          setKeyErrorMsg(d?.error?.message || 'Sign in as org_admin or supply Admin Secret to manage API keys.');
          return;
        }
        setKeyErrorMsg(null);
        const list: ApiKeyRow[] = d.keys || [];
        setApiKeys(list);
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadKeys();
  }, [authUser?.id]);

  const selectEndpoint = (ep: ApiEndpointDoc) => {
    setActiveEndpointId(ep.id);
    setPathParams(ep.defaultPathParams || {});
    setQueryParams(ep.defaultQuery || {});
    setRequestBody(ep.defaultBody || '');
    setRunResult(null);
  };

  const resolveEndpointPath = () => {
    let p = activeEndpoint.path;
    for (const [k, v] of Object.entries(pathParams)) {
      p = p.replace(`{${k}}`, encodeURIComponent(v || ''));
    }
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(queryParams)) {
      if (v !== undefined && v !== '') qs.set(k, v);
    }
    const qStr = qs.toString();
    return qStr ? `${p}?${qStr}` : p;
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1600);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyLabel.trim()) return;
    setCreatingKey(true);
    setKeyErrorMsg(null);
    try {
      const payload: Record<string, unknown> = { label: newKeyLabel.trim() };
      if (expiresInDays.trim()) {
        payload.expiresInDays = Number(expiresInDays);
      }
      const res = await fetch('/api/v1/keys', {
        method: 'POST',
        credentials: 'include',
        headers: buildKeyMgmtHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKeyErrorMsg(data?.error?.message || 'Unable to generate API key.');
        return;
      }
      if (data.key) {
        setNewKeyLabel('');
        setExpiresInDays('');
        setSelectedToken(data.key.token_value);
        setCustomTokenInput(data.key.token_value);
        setNewlyIssuedToken({ label: data.key.label, token: data.key.token_value });
        loadKeys();
      }
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRotateKey = async (id: string) => {
    setKeyErrorMsg(null);
    const res = await fetch(`/api/v1/keys/${id}/rotate`, {
      method: 'POST',
      credentials: 'include',
      headers: buildKeyMgmtHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setKeyErrorMsg(data?.error?.message || 'Unable to rotate key.');
      return;
    }
    if (data.key) {
      setSelectedToken(data.key.token_value);
      setCustomTokenInput(data.key.token_value);
      setNewlyIssuedToken({ label: `${data.key.label} (Rotated)`, token: data.key.token_value });
    }
    loadKeys();
  };

  const handleRevokeKey = async (id: string) => {
    setKeyErrorMsg(null);
    const res = await fetch(`/api/v1/keys/${id}`, {
      method: 'DELETE',
      credentials: 'include',
      headers: buildKeyMgmtHeaders(),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setKeyErrorMsg(data?.error?.message || 'Unable to revoke key.');
      return;
    }
    loadKeys();
  };

  const runSandboxRequest = async () => {
    setRunning(true);
    const resolved = resolveEndpointPath();
    const start = performance.now();
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (customTokenInput.trim()) {
        headers.Authorization = `Bearer ${customTokenInput.trim()}`;
      }
      const init: RequestInit = { method: activeEndpoint.method, headers };
      if (activeEndpoint.method === 'POST' || activeEndpoint.method === 'PATCH') {
        headers['Content-Type'] = 'application/json';
        init.body = requestBody;
      }

      const res = await fetch(resolved, init);
      const latencyMs = Math.round(performance.now() - start);
      const capturedHeaders: Record<string, string> = {};
      ['x-request-id', 'x-climato-engine', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-climato-data-provenance'].forEach(
        (h) => {
          const val = res.headers.get(h);
          if (val) capturedHeaders[h] = val;
        }
      );

      let parsedText = await res.text();
      try {
        parsedText = JSON.stringify(JSON.parse(parsedText), null, 2);
      } catch {
        // leave raw text
      }

      setRunResult({
        status: res.status,
        latencyMs,
        headers: capturedHeaders,
        body: parsedText,
      });
      loadKeys();
    } catch (err) {
      setRunResult({
        status: 0,
        latencyMs: Math.round(performance.now() - start),
        headers: {},
        body: JSON.stringify({ error: String(err) }, null, 2),
      });
    } finally {
      setRunning(false);
    }
  };

  const resolvedPath = resolveEndpointPath();
  const activeSnippet = buildCodeSnippet(
    codeLang,
    activeEndpoint.method,
    resolvedPath,
    customTokenInput || selectedToken,
    requestBody
  );

  const navSections: Array<{ id: PortalSection; label: string; icon: typeof BookOpen }> = [
    { id: 'sandbox', label: isAr ? 'بيئة الاختبار (Sandbox)' : 'Interactive Sandbox', icon: Terminal },
    { id: 'quickstart', label: isAr ? 'البدء السريع والهيكلة' : 'Quickstart & Schema', icon: BookOpen },
    { id: 'auth', label: isAr ? 'المصادقة ومفاتيح API' : 'Authentication & Keys', icon: KeyRound },
    { id: 'modules', label: isAr ? 'نقاط بيانات الوحدات السبع' : '7 Modules Data API', icon: Database },
    { id: 'reports', label: isAr ? 'نقاط تقارير ESG والمناخ' : 'Reporting Endpoints', icon: FileText },
    { id: 'alerts', label: isAr ? 'تنبيهات الإحداثيات و Webhooks' : 'Alerts & Webhooks', icon: Webhook },
    { id: 'ratelimits', label: isAr ? 'حدود المعدل والحصص' : 'Rate Limits & Quotas', icon: Gauge },
    { id: 'terms', label: isAr ? 'شروط خدمة API والمصدرية' : 'Terms of Service', icon: Scale },
  ];

  const webhookVerificationPython = `import hmac, hashlib

def verify_climato_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature_header)`;

  const webhookVerificationJs = `import crypto from 'node:crypto';

export function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  const digest = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(\`sha256=\${digest}\`), Buffer.from(signatureHeader));
}`;

  const renderMethodBadge = (method: string) => {
    const color =
      method === 'GET'
        ? 'text-[#22FF3A] border-[#22FF3A]/40 bg-[#22FF3A]/10'
        : method === 'POST'
        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
        : method === 'PATCH'
        ? 'text-amber-300 border-amber-500/40 bg-amber-500/10'
        : 'text-rose-300 border-rose-500/40 bg-rose-500/10';
    return (
      <span dir="ltr" className={`px-2 py-0.5 rounded border text-[11px] font-mono font-semibold ${color}`}>
        {method}
      </span>
    );
  };

  const renderEndpointCard = (ep: ApiEndpointDoc) => (
    <div key={ep.id} className="glass-panel rounded-2xl p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            {renderMethodBadge(ep.method)}
            <code dir="ltr" className="text-sm font-mono font-semibold text-white">
              {ep.path}
            </code>
          </div>
          <h3 className="font-display text-lg font-bold text-white pt-1">{ep.title[lang]}</h3>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{ep.summary[lang]}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            selectEndpoint(ep);
            setSection('sandbox');
          }}
          className="px-3.5 py-2 rounded-lg bg-[#22FF3A]/15 border border-[#22FF3A]/40 text-[#22FF3A] text-xs font-semibold hover:bg-[#22FF3A]/25 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Play className="w-3.5 h-3.5" />
          <span>{isAr ? 'جرب في بيئة الاختبار' : 'Test in Sandbox'}</span>
        </button>
      </div>

      <div className="text-xs text-slate-400 font-mono">
        {isAr ? 'النطاق المطلوب (Scope): ' : 'Required Scope: '}
        <span className="text-emerald-300">{ep.scope}</span>
      </div>

      {ep.params.length > 0 && (
        <div className="overflow-x-auto border border-emerald-950 rounded-xl">
          <table className="w-full text-xs text-start">
            <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950">
              <tr>
                <th className="py-2.5 px-3 text-start font-medium">{isAr ? 'المعامل' : 'Parameter'}</th>
                <th className="py-2.5 px-3 text-start font-medium">{isAr ? 'الموقع' : 'In'}</th>
                <th className="py-2.5 px-3 text-start font-medium">{isAr ? 'النوع' : 'Type'}</th>
                <th className="py-2.5 px-3 text-start font-medium">{isAr ? 'الوصف' : 'Description'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-emerald-950/60">
              {ep.params.map((p) => (
                <tr key={p.name}>
                  <td className="py-2.5 px-3 font-mono text-[#22FF3A] whitespace-nowrap">
                    {p.name}
                    {p.required && <span className="text-rose-400 ms-1">*</span>}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-slate-400">{p.location}</td>
                  <td className="py-2.5 px-3 font-mono text-slate-300">{p.type}</td>
                  <td className="py-2.5 px-3 text-slate-300">{p.description[lang]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-slate-400">
          {isAr ? 'نموذج الاستجابة (JSON)' : 'Sample Response Payload'}
        </div>
        <pre dir="ltr" className="rounded-xl bg-[#020604] border border-emerald-950 p-4 text-xs font-mono text-emerald-200 overflow-x-auto">
          {ep.sampleResponse}
        </pre>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-2 max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono text-[#22FF3A]">
            <Code2 className="w-4 h-4" />
            <span>REST JSON API · OpenAPI-Aligned · Sandbox Environment</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
            {isAr ? 'بوابة المطورين والوثائق البرمجية الشاملة' : 'Developer API Portal & Integration Documentation'}
          </h1>
          <p className="text-sm sm:text-base text-slate-300">
            {isAr
              ? 'المرجع الكامل لنقاط نهاية الوحدات السبع، وتوليد تقارير ESG، وتنبيهات الإحداثيات، والمصادقة، وحدود المعدل، وبيئة الاختبار الحية.'
              : 'Complete reference for module data access, climate & ESG report generation, coordinate alerts, authentication, rate limits, and live sandbox testing.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('contact')}
          className="px-4 py-2.5 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] whitespace-nowrap self-start cursor-pointer"
        >
          {isAr ? 'طلب ترقية مفاتيح الإنتاج' : 'Request Production API Access'}
        </button>
      </div>

      <SampleDataBanner lang={lang} />

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Documentation Sidebar */}
        <aside className="lg:w-64 shrink-0">
          <div className="glass-panel rounded-xl p-3 space-y-1 sticky top-20">
            <div className="px-3 py-1.5 text-[11px] font-medium text-slate-400">
              {isAr ? 'أقسام التوثيق' : 'API Reference'}
            </div>
            {navSections.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'bg-[#22FF3A]/15 text-[#22FF3A] border border-[#22FF3A]/35'
                      : 'text-slate-300 hover:bg-white/5 hover:text-white border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#22FF3A]' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Portal Content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* 1. INTERACTIVE SANDBOX */}
          {section === 'sandbox' && (
            <div className="space-y-6">
              <div className="glass-panel-elevated rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white">
                      {isAr ? 'بيئة اختبار API الحية (Sandbox Runner)' : 'Interactive API Sandbox Runner'}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isAr
                        ? 'ينفذ طلبات حقيقية ضد خادم Express وقاعدة بيانات SQLite مع التحقق من المفتاح وحدود المعدل.'
                        : 'Executes live requests against the Express backend and SQLite database with real Bearer token and rate-limit header verification.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-[#030A05] border border-emerald-950 rounded-lg">
                    {(['curl', 'python', 'javascript', 'typescript'] as CodeLanguage[]).map((cl) => (
                      <button
                        key={cl}
                        type="button"
                        onClick={() => setCodeLang(cl)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                          codeLang === cl ? 'bg-[#22FF3A]/15 text-[#22FF3A]' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {cl}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Endpoint Selector Tabs */}
                <div className="flex flex-wrap gap-2">
                  {API_ENDPOINTS.map((ep) => (
                    <button
                      key={ep.id}
                      type="button"
                      onClick={() => selectEndpoint(ep)}
                      className={`px-3 py-1.5 rounded-lg border text-xs flex items-center gap-2 transition-colors cursor-pointer ${
                        ep.id === activeEndpoint.id
                          ? 'bg-[#07180B] border-[#22FF3A]/50 text-white'
                          : 'bg-[#030A05] border-emerald-950 text-slate-400 hover:text-white'
                      }`}
                    >
                      {renderMethodBadge(ep.method)}
                      <span className="font-mono text-[11px]">{ep.path}</span>
                    </button>
                  ))}
                </div>

                {/* Request Configuration */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-5 space-y-4">
                    <div className="space-y-1.5">
                      <label className="block text-xs text-slate-300">
                        {isAr ? 'مفتاح المصادقة (Bearer Token)' : 'Authorization Bearer Token'}
                      </label>
                      <input
                        type="text"
                        dir="ltr"
                        value={customTokenInput}
                        onChange={(e) => setCustomTokenInput(e.target.value)}
                        placeholder="clm_sbx_demo_9f4a2c81e0b7"
                        className="w-full bg-[#040B06] border border-emerald-900 rounded-lg px-3 py-2 text-xs font-mono text-[#22FF3A] focus:outline-none focus:border-[#22FF3A]"
                      />
                    </div>

                    {activeEndpoint.params
                      .filter((p) => p.location === 'path' || p.location === 'query')
                      .map((p) => {
                        const isPath = p.location === 'path';
                        const value = isPath ? pathParams[p.name] || '' : queryParams[p.name] || '';
                        return (
                          <div key={p.name} className="space-y-1">
                            <label className="block text-xs font-mono text-slate-300">
                              {p.name} <span className="text-slate-500">({p.location})</span>
                            </label>
                            {p.name === 'connector' ? (
                              <select
                                value={value}
                                onChange={(e) =>
                                  setQueryParams((prev) => ({ ...prev, [p.name]: e.target.value }))
                                }
                                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-white"
                              >
                                {connectors.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.id} — {c.source_name}
                                  </option>
                                ))}
                              </select>
                            ) : p.name === 'moduleId' && isPath ? (
                              <select
                                value={value}
                                onChange={(e) =>
                                  setPathParams((prev) => ({ ...prev, [p.name]: e.target.value }))
                                }
                                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-white"
                              >
                                {MODULE_API_SPECS.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.id} — {m.name[lang]}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                dir="ltr"
                                value={value}
                                onChange={(e) =>
                                  isPath
                                    ? setPathParams((prev) => ({ ...prev, [p.name]: e.target.value }))
                                    : setQueryParams((prev) => ({ ...prev, [p.name]: e.target.value }))
                                }
                                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs font-mono text-white"
                              />
                            )}
                          </div>
                        );
                      })}

                    {(activeEndpoint.method === 'POST' || activeEndpoint.method === 'PATCH') && (
                      <div className="space-y-1.5">
                        <label className="block text-xs text-slate-300">
                          {isAr ? 'جسم الطلب (JSON Body)' : 'JSON Request Body'}
                        </label>
                        <textarea
                          dir="ltr"
                          rows={8}
                          value={requestBody}
                          onChange={(e) => setRequestBody(e.target.value)}
                          className="w-full bg-[#020604] border border-emerald-950 rounded-lg p-3 text-xs font-mono text-emerald-200 focus:outline-none focus:border-[#22FF3A]"
                        />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={runSandboxRequest}
                      disabled={running}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>
                        {running
                          ? isAr ? 'جارٍ التنفيذ...' : 'Sending Request...'
                          : isAr ? 'إرسال طلب اختبار حي' : 'Send Live Sandbox Request'}
                      </span>
                    </button>
                  </div>

                  {/* Multi-language Snippet & Live Response */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-mono">{codeLang.toUpperCase()} Example</span>
                        <button
                          type="button"
                          onClick={() => handleCopy('active-snippet', activeSnippet)}
                          className="inline-flex items-center gap-1 text-[#22FF3A] hover:text-[#4DFF60] cursor-pointer"
                        >
                          {copiedId === 'active-snippet' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedId === 'active-snippet' ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}</span>
                        </button>
                      </div>
                      <pre dir="ltr" className="rounded-xl bg-[#020604] border border-emerald-950 p-4 text-[11px] font-mono text-emerald-200 overflow-x-auto max-h-56">
                        {activeSnippet}
                      </pre>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-white">
                          {isAr ? 'استجابة الخادم الحية' : 'Live HTTP Response'}
                        </span>
                        {runResult && (
                          <div dir="ltr" className="flex items-center gap-3 font-mono tabular-nums">
                            <span className={runResult.status >= 200 && runResult.status < 300 ? 'text-[#22FF3A]' : 'text-rose-300'}>
                              HTTP {runResult.status}
                            </span>
                            <span className="text-slate-400">{runResult.latencyMs} ms</span>
                            {runResult.headers['x-ratelimit-remaining'] && (
                              <span className="text-emerald-300">
                                Remaining: {runResult.headers['x-ratelimit-remaining']}/{runResult.headers['x-ratelimit-limit']}
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {runResult && Object.keys(runResult.headers).length > 0 && (
                        <div dir="ltr" className="rounded-lg bg-[#030A05] border border-emerald-950 px-3 py-2 text-[11px] font-mono text-slate-300 flex flex-wrap gap-x-4 gap-y-1">
                          {Object.entries(runResult.headers).map(([k, v]) => (
                            <span key={k}>
                              <span className="text-slate-500">{k}:</span> <span className="text-amber-300">{v}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      <pre dir="ltr" className="h-64 rounded-xl bg-[#020604] border border-emerald-950 p-4 text-xs font-mono text-emerald-200 overflow-auto">
                        {runResult
                          ? runResult.body
                          : isAr
                          ? '// اضغط على "إرسال طلب اختبار حي" لمعاينة الترويسات والاستجابة الفعلية'
                          : '// Click "Send Live Sandbox Request" to inspect status, rate-limit headers, and JSON body'}
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 2. QUICKSTART & SCHEMA */}
          {section === 'quickstart' && (
            <div className="space-y-6">
              <div className="glass-panel rounded-2xl p-6 space-y-4">
                <h2 className="font-display text-xl font-bold text-white">
                  {isAr ? 'البدء السريع وبنية الاستجابة القياسية' : 'Quickstart & Standard JSON Envelope'}
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {isAr
                    ? 'تتبع جميع نقاط النهاية الإصدار /api/v1 وتعيد ترويسات مصدر البيانات وحدود المعدل في كل استجابة. يتم وسم بيانات البيئة التجريبية صراحةً بالحقل isSampleData: true.'
                    : 'All versioned endpoints live under /api/v1 and return explicit data-provenance headers alongside sliding rate-limit counters. Sandbox records always include isSampleData: true and dataProvenance: "SAMPLE_DEMONSTRATION".'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 space-y-1.5">
                    <div className="text-xs font-medium text-[#22FF3A]">
                      {isAr ? 'عنوان بيئة الاختبار (Sandbox Base URL)' : 'Sandbox Base URL'}
                    </div>
                    <code dir="ltr" className="block text-xs font-mono text-white">
                      {typeof window !== 'undefined' ? window.location.origin : 'https://api.climato.example'}/api/v1
                    </code>
                  </div>
                  <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 space-y-1.5">
                    <div className="text-xs font-medium text-[#22FF3A]">
                      {isAr ? 'وسم مصدر البيانات الإلزامي' : 'Mandatory Provenance Header'}
                    </div>
                    <code dir="ltr" className="block text-xs font-mono text-amber-300">
                      X-Climato-Data-Provenance: SAMPLE_DEMONSTRATION
                    </code>
                  </div>
                </div>

                <div className="overflow-x-auto border border-emerald-950 rounded-xl mt-2">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950">
                      <tr>
                        <th className="py-2.5 px-4 text-start font-medium">{isAr ? 'الرمز' : 'HTTP Code'}</th>
                        <th className="py-2.5 px-4 text-start font-medium">{isAr ? 'المعنى' : 'Meaning'}</th>
                        <th className="py-2.5 px-4 text-start font-medium">{isAr ? 'الإجراء الموصى به' : 'Recommended Handling'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-950/60">
                      {[
                        ['200 / 201', isAr ? 'نجاح العملية' : 'Success / Resource Created', isAr ? 'قراءة الحمولة والتحقق من dataProvenance' : 'Parse JSON payload and inspect dataProvenance'],
                        ['400', isAr ? 'معاملات غير صالحة' : 'Validation Error', isAr ? 'مراجعة إحداثيات lat/lon أو الحقول المطلوبة' : 'Check lat/lon bounds or required JSON fields'],
                        ['401', isAr ? 'مفتاح غير صالح أو ملغى' : 'Unauthorized', isAr ? 'التحقق من ترويسة Bearer API Key' : 'Verify active Bearer token in Authentication tab'],
                        ['404', isAr ? 'المورد أو الوحدة غير موجودة' : 'Not Found', isAr ? 'التأكد من معرف الوحدة أو الموصل' : 'Confirm moduleId, connectorId, or reportId'],
                        ['429', isAr ? 'تجاوز حد المعدل' : 'Rate Limit Exceeded', isAr ? 'الانتظار وفق retryAfterSeconds مع تراجع أسي' : 'Honor retryAfterSeconds with exponential backoff'],
                      ].map(([code, meaning, action]) => (
                        <tr key={code}>
                          <td className="py-2.5 px-4 font-mono text-[#22FF3A]">{code}</td>
                          <td className="py-2.5 px-4 text-white font-medium">{meaning}</td>
                          <td className="py-2.5 px-4 text-slate-300">{action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 3. AUTHENTICATION & SANDBOX KEYS */}
          {section === 'auth' && (
            <div className="space-y-6">
              <div className="glass-panel rounded-2xl p-6 space-y-5">
                <div className="space-y-1.5">
                  <h2 className="font-display text-xl font-bold text-white">
                    {isAr ? 'المصادقة وإدارة مفاتيح Sandbox' : 'Bearer Authentication & Sandbox Key Manager'}
                  </h2>
                  <p className="text-sm text-slate-300">
                    {isAr
                      ? 'أرسل مفتاح API في ترويسة Authorization: Bearer <KEY>. تتطلب إدارة المفاتيح جلسة org_admin / platform_admin أو إدخال X-Climato-Admin-Secret وقت التشغيل.'
                      : 'Pass your scoped API key via Authorization: Bearer <KEY>. Managing keys requires an org_admin/platform_admin session or runtime X-Climato-Admin-Secret.'}
                  </p>
                </div>

                {/* Optional Runtime Admin Secret Input (Memory Only) */}
                <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 flex flex-wrap items-center gap-3">
                  <input
                    type="password"
                    dir="ltr"
                    value={adminSecretInput}
                    onChange={(e) => setAdminSecretInput(e.target.value)}
                    placeholder={
                      isAr
                        ? 'X-Climato-Admin-Secret (اختياري لمدير المنصة)'
                        : 'Optional runtime X-Climato-Admin-Secret'
                    }
                    className="flex-1 min-w-[220px] bg-[#020604] border border-emerald-900 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#22FF3A]"
                  />
                  <button
                    type="button"
                    onClick={loadKeys}
                    className="px-3.5 py-2 rounded-lg border border-emerald-800 text-xs font-medium text-emerald-200 hover:border-[#22FF3A]/50 cursor-pointer"
                  >
                    {isAr ? 'تحديث المفاتيح' : 'Refresh Key Registry'}
                  </button>
                  {!authUser && onOpenAuth && (
                    <button
                      type="button"
                      onClick={onOpenAuth}
                      className="px-3.5 py-2 rounded-lg bg-[#22FF3A]/15 border border-[#22FF3A]/40 text-xs font-semibold text-[#22FF3A] hover:bg-[#22FF3A]/25 cursor-pointer"
                    >
                      {isAr ? 'تسجيل دخول المؤسسة' : 'Sign In Organization'}
                    </button>
                  )}
                </div>

                {keyErrorMsg && (
                  <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                    {keyErrorMsg}
                  </div>
                )}

                {newlyIssuedToken && (
                  <div className="rounded-xl border border-[#22FF3A]/50 bg-[#051509] p-4 space-y-2">
                    <div className="text-xs font-semibold text-[#22FF3A]">
                      {isAr
                        ? 'تحذير أمني: يُعرض هذا المفتاح الكامل مرة واحدة فقط. يتم تخزين بصمة SHA-256 فقط على الخادم.'
                        : 'One-Time Secret Reveal: Save this full token now. Only its SHA-256 digest is stored server-side.'}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                      <span className="text-slate-300">{newlyIssuedToken.label}</span>
                      <div className="flex items-center gap-2">
                        <code dir="ltr" className="text-[#22FF3A] break-all">
                          {newlyIssuedToken.token}
                        </code>
                        <button
                          type="button"
                          onClick={() => handleCopy('new-token', newlyIssuedToken.token)}
                          className="px-2.5 py-1 rounded border border-[#22FF3A]/40 text-[#22FF3A] hover:bg-[#22FF3A]/15 cursor-pointer"
                        >
                          {copiedId === 'new-token' ? (isAr ? 'تم النسخ' : 'Copied') : isAr ? 'نسخ' : 'Copy'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleCreateKey} className="flex flex-wrap gap-3">
                  <input
                    type="text"
                    required
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder={isAr ? 'تسمية المفتاح الجديد (مثال: تكامل مخاطر البنك)' : 'New key label (e.g. Banking Risk Staging)'}
                    className="flex-1 min-w-[200px] bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
                  />
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    placeholder={isAr ? 'الصلاحية بالأيام (اختياري)' : 'Expiry days (optional)'}
                    className="w-40 bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-[#22FF3A]"
                  />
                  <button
                    type="submit"
                    disabled={creatingKey}
                    className="px-4 py-2 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-semibold hover:bg-[#4DFF60] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{creatingKey ? (isAr ? 'جارٍ الإنشاء...' : 'Generating...') : isAr ? 'توليد مفتاح' : 'Generate Key'}</span>
                  </button>
                </form>

                <div className="space-y-2.5">
                  {apiKeys.map((k) => (
                    <div
                      key={k.id}
                      className="rounded-xl border border-emerald-950 bg-[#030A05] p-4 flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-sm font-semibold text-white">{k.label}</div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                          <code dir="ltr" className="text-[#22FF3A]">{k.token_value}</code>
                          <span className="text-slate-500">·</span>
                          <span className="text-slate-400">{k.rate_limit_rpm} req/min</span>
                          <span className="text-slate-500">·</span>
                          <span className="text-emerald-300">{k.scopes}</span>
                          {k.expires_at && (
                            <>
                              <span className="text-slate-500">·</span>
                              <span className="text-amber-300">Exp: {k.expires_at.slice(0, 10)}</span>
                            </>
                          )}
                          {k.rotated_from_id && (
                            <>
                              <span className="text-slate-500">·</span>
                              <span className="text-slate-400">Rotated</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRotateKey(k.id)}
                          title={isAr ? 'تدوير المفتاح' : 'Rotate key'}
                          className="px-2.5 py-1.5 rounded-lg border border-emerald-900 text-xs text-slate-200 hover:border-[#22FF3A]/50 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-[#22FF3A]" />
                          <span>{isAr ? 'تدوير' : 'Rotate'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevokeKey(k.id)}
                          aria-label="Revoke API key"
                          className="p-1.5 rounded-lg border border-emerald-950 text-slate-400 hover:text-rose-300 hover:border-rose-500/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 4. 7 MODULES DATA API & 10 CONNECTORS */}
          {section === 'modules' && (
            <div className="space-y-6">
              {API_ENDPOINTS.filter((e) => e.category === 'modules' || e.category === 'connectors').map(renderEndpointCard)}

              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-emerald-950">
                  <h3 className="font-display text-lg font-bold text-white">
                    {isAr ? 'معرفات الوحدات السبع والمقاييس المتاحة' : 'Module Identifiers & Returned Metric Keys'}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950">
                      <tr>
                        <th className="py-3 px-4 text-start font-medium">moduleId</th>
                        <th className="py-3 px-4 text-start font-medium">{isAr ? 'الوحدة' : 'Module'}</th>
                        <th className="py-3 px-4 text-start font-medium">{isAr ? 'الأقمار الصناعية' : 'Satellite Sources'}</th>
                        <th className="py-3 px-4 text-start font-medium">{isAr ? 'المفاتيح' : 'Metric Keys'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-950/60">
                      {MODULE_API_SPECS.map((m) => (
                        <tr key={m.id}>
                          <td className="py-3 px-4 font-mono text-[#22FF3A] whitespace-nowrap">{m.id}</td>
                          <td className="py-3 px-4 text-white font-medium whitespace-nowrap">{m.name[lang]}</td>
                          <td className="py-3 px-4 text-slate-300">{m.sources}</td>
                          <td className="py-3 px-4 font-mono text-emerald-300">{m.metrics}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="glass-panel rounded-2xl overflow-hidden">
                <div className="p-5 border-b border-emerald-950">
                  <h3 className="font-display text-lg font-bold text-white">
                    {isAr ? 'سجل موصلات الأقمار الصناعية العشرة' : 'Staged Satellite Ingestion Registry (10 Sources)'}
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950">
                      <tr>
                        <th className="py-3 px-4 text-start font-medium">ID</th>
                        <th className="py-3 px-4 text-start font-medium">{isAr ? 'المصدر' : 'Source'}</th>
                        <th className="py-3 px-4 text-start font-medium">{isAr ? 'الدقة المكانية' : 'Resolution'}</th>
                        <th className="py-3 px-4 text-start font-medium">{isAr ? 'الصيغة' : 'Format'}</th>
                        <th className="py-3 px-4 text-start font-medium">{isAr ? 'الحالة' : 'Stage'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-950/60">
                      {connectors.map((c) => (
                        <tr key={c.id}>
                          <td className="py-2.5 px-4 font-mono text-[#22FF3A] whitespace-nowrap">{c.id}</td>
                          <td className="py-2.5 px-4 font-semibold text-white whitespace-nowrap">{c.source_name}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">{c.spatial_resolution}</td>
                          <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">{c.ingestion_format}</td>
                          <td className="py-2.5 px-4 font-mono text-amber-300 whitespace-nowrap">{c.data_provenance_status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 5. REPORTING ENDPOINTS */}
          {section === 'reports' && (
            <div className="space-y-6">
              {API_ENDPOINTS.filter((e) => e.category === 'reports').map(renderEndpointCard)}
              <div className="glass-panel rounded-2xl p-6 space-y-3">
                <div className="flex items-center gap-2">
                  {renderMethodBadge('GET')}
                  <code dir="ltr" className="text-sm font-mono font-semibold text-white">
                    /api/reports/{'{id}'}/export?format=csv|json
                  </code>
                </div>
                <p className="text-xs sm:text-sm text-slate-300">
                  {isAr
                    ? 'يقوم بتدفق حزمة التقرير المُنشأة بصيغة CSV أو JSON مع تضمين وسم SAMPLE_DEMONSTRATION.'
                    : 'Streams the generated disclosure bundle as downloadable CSV or JSON with explicit provenance metadata.'}
                </p>
              </div>
            </div>
          )}

          {/* 6. ALERTS & WEBHOOKS */}
          {section === 'alerts' && (
            <div className="space-y-6">
              {API_ENDPOINTS.filter((e) => e.category === 'alerts').map(renderEndpointCard)}

              <div className="glass-panel rounded-2xl p-6 space-y-4">
                <h3 className="font-display text-lg font-bold text-white">
                  {isAr ? 'التحقق من توقيع إشعارات Webhook (HMAC-SHA256)' : 'Webhook Event Delivery & HMAC-SHA256 Verification'}
                </h3>
                <p className="text-xs sm:text-sm text-slate-300">
                  {isAr
                    ? 'عند تجاوز أي عتبة جغرافية، يوقع الخادم حمولة JSON باستخدام الترويسة X-Climato-Signature.'
                    : 'When a coordinate threshold is breached, CLIMATO dispatches a signed JSON POST event with an X-Climato-Signature header.'}
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono text-[#22FF3A]">Python Verification</div>
                    <pre dir="ltr" className="rounded-xl bg-[#020604] border border-emerald-950 p-4 text-[11px] font-mono text-emerald-200 overflow-x-auto">
                      {webhookVerificationPython}
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-xs font-mono text-[#22FF3A]">JavaScript (Node.js) Verification</div>
                    <pre dir="ltr" className="rounded-xl bg-[#020604] border border-emerald-950 p-4 text-[11px] font-mono text-emerald-200 overflow-x-auto">
                      {webhookVerificationJs}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7. RATE LIMITS & QUOTAS */}
          {section === 'ratelimits' && (
            <div className="glass-panel rounded-2xl p-6 space-y-5">
              <div className="space-y-1.5">
                <h2 className="font-display text-xl font-bold text-white">
                  {isAr ? 'حدود المعدل وسياسات الحصص البرمجية' : 'API Rate Limits, Headers & Quotas'}
                </h2>
                <p className="text-sm text-slate-300">
                  {isAr
                    ? 'تُفرض حدود المعدل عبر نافذة منزلقة مدتها 60 ثانية لكل مفتاح API، مع إعادة الترويسات القياسية في كل استجابة.'
                    : 'Rate limits are enforced per API key over a 60-second sliding window. Every /api/v1 response returns live quota headers.'}
                </p>
              </div>

              <div className="overflow-x-auto border border-emerald-950 rounded-xl">
                <table className="w-full text-xs text-start">
                  <thead className="bg-[#030A05] text-slate-400 border-b border-emerald-950">
                    <tr>
                      <th className="py-3 px-4 text-start font-medium">{isAr ? 'الباقة' : 'Tier'}</th>
                      <th className="py-3 px-4 text-start font-medium">{isAr ? 'الحد بالدقيقة' : 'Requests / Min'}</th>
                      <th className="py-3 px-4 text-start font-medium">{isAr ? 'نطاقات AOI بالطلب' : 'AOI Complexity'}</th>
                      <th className="py-3 px-4 text-start font-medium">{isAr ? 'محاولات Webhook' : 'Webhook Retries'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-950/60">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Explorer Sandbox</td>
                      <td className="py-3 px-4 font-mono text-[#22FF3A]">120 req/min</td>
                      <td className="py-3 px-4 text-slate-300">{isAr ? 'حتى 3 مواقع نموذجية' : 'Up to 3 Sample AOIs'}</td>
                      <td className="py-3 px-4 text-slate-300">{isAr ? 'محاكاة في الواجهة' : 'Sandbox simulation'}</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Sector Pro</td>
                      <td className="py-3 px-4 font-mono text-[#22FF3A]">{isAr ? 'وفق اتفاقية الاشتراك' : 'Contracted RPM quota'}</td>
                      <td className="py-3 px-4 text-slate-300">{isAr ? '25 مضلعاً مخصصاً' : '25 custom polygons'}</td>
                      <td className="py-3 px-4 text-slate-300">{isAr ? 'إعادة محاولة أسية حتى 5 مرات' : 'Exponential backoff (5 retries)'}</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-4 font-semibold text-white">Enterprise & Sovereign</td>
                      <td className="py-3 px-4 font-mono text-emerald-300">{isAr ? 'سعة مخصصة + SLA' : 'Dedicated throughput + SLA'}</td>
                      <td className="py-3 px-4 text-slate-300">{isAr ? '100+ منطقة وشبكات وطنية' : '100+ AOIs & national grids'}</td>
                      <td className="py-3 px-4 text-slate-300">{isAr ? 'طابور أولوية + قائمة انتظار ميتة' : 'Priority queue + DLQ replay'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 space-y-2 text-xs font-mono text-slate-300">
                <div className="text-[#22FF3A] font-semibold">Response Headers Returned on /api/v1/*</div>
                <div>X-RateLimit-Limit: 120</div>
                <div>X-RateLimit-Remaining: 119</div>
                <div>X-RateLimit-Reset: 1794681660</div>
                <div>X-Climato-Data-Provenance: SAMPLE_DEMONSTRATION</div>
              </div>
            </div>
          )}

          {/* 8. TERMS OF SERVICE */}
          {section === 'terms' && (
            <div className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="space-y-1.5">
                <h2 className="font-display text-xl font-bold text-white">
                  {isAr ? 'شروط استخدام واجهة البرمجة وسياسة مصدر البيانات' : 'Developer API Terms of Service & Data Governance'}
                </h2>
                <p className="text-xs text-slate-400">
                  {isAr ? 'تسري على جميع مفاتيح الاختبار ومفاتيح التكامل المؤسسي.' : 'Applies to all Sandbox evaluation keys and contracted B2B API integrations.'}
                </p>
              </div>

              <div className="space-y-4 text-sm text-slate-300 leading-relaxed">
                <div className="border-b border-slate-800 pb-4 space-y-1.5">
                  <h3 className="font-semibold text-white">
                    {isAr ? '1. الفصل الصارم بين البيانات التجريبية والقياسات الحية' : '1. Sandbox vs. Verified Satellite Provenance'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {isAr
                      ? 'الاستجابات الموسومة بـ SAMPLE_DEMONSTRATION مخصصة لتطوير التكامل والاختبار فقط ولا يجوز تقديمها كقياسات علمية أو تقارير تنظيمية مدققة دون تفعيل موصلات الأقمار الصناعية المعتمدة.'
                      : 'Payloads tagged with isSampleData: true and SAMPLE_DEMONSTRATION are strictly for integration engineering and sandbox testing. They must not be represented as verified scientific observations or audited regulatory filings.'}
                  </p>
                </div>

                <div className="border-b border-slate-800 pb-4 space-y-1.5">
                  <h3 className="font-semibold text-white">
                    {isAr ? '2. تراخيص وكالات الفضاء والإسناد العلمي' : '2. Earth Observation Agency Attribution'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {isAr
                      ? 'عند تفعيل المصادر الحية (Sentinel-6 و TROPOMI و MODIS و Landsat و SMAP و GPM و MERRA-2 و ECOSTRESS و GRACE-FO و NASA POWER)، يلتزم العميل بالحفاظ على إسناد المصدر لوكالات ESA و Copernicus و NASA و USGS و JAXA و GFZ.'
                      : 'When credentialed live pipelines are enabled, downstream applications must retain source provenance metadata attributing Copernicus/ESA, NASA EOSDIS/JPL/LaRC, USGS, JAXA, and GFZ.'}
                  </p>
                </div>

                <div className="border-b border-slate-800 pb-4 space-y-1.5">
                  <h3 className="font-semibold text-white">
                    {isAr ? '3. أمن المفاتيح والاستخدام المقبول' : '3. Credential Security & Acceptable Use'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {isAr
                      ? 'تُحفظ مفاتيح API في بيئات الخادم الآمنة ويُحظر تضمين مفاتيح الإنتاج في تطبيقات المتصفح العامة أو مشاركة حصص المعدل بين مؤسسات غير مصرح لها.'
                      : 'Production API keys must be stored server-side and never exposed in public client bundles. Automated scraping designed to bypass per-key rate limits or resell raw unattributed feeds is prohibited.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <h3 className="font-semibold text-white">
                    {isAr ? '4. حدود المسؤولية والامتثال' : '4. Operational Decisions & Regulatory Compliance'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300">
                    {isAr
                      ? 'توفر الواجهة مؤشرات دعم قرار جيومكانية؛ وتظل مسؤولية التقييم الهندسي والائتماني والإفصاح التنظيمي على عاتق المؤسسة المستفيدة ومراجعيها المعتمدين.'
                      : 'API outputs provide geospatial decision-support indicators. Final underwriting, engineering safety, and statutory ESG attestation remain the responsibility of the licensee and accredited auditors.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
