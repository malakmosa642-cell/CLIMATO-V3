import { useState } from 'react';
import { KeyRound, ShieldCheck, UserPlus, X } from 'lucide-react';
import { Language } from '../types/climate';

export interface AuthUserSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  organizationId: string;
}

export interface AuthOrgSummary {
  id: string;
  name: string;
  plan_tier?: string;
  planTier?: string;
}

interface AuthModalProps {
  lang: Language;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUserSummary, org: AuthOrgSummary | null) => void;
}

export default function AuthModal({ lang, isOpen, onClose, onSuccess }: AuthModalProps) {
  const isAr = lang === 'ar';
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [sector, setSector] = useState('Agriculture & Exporting');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email: email.trim(), password }
          : {
              email: email.trim(),
              password,
              fullName: fullName.trim(),
              organizationName: organizationName.trim(),
              sector,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          data?.error?.message ||
          (isAr ? 'تعذرت عملية المصادقة. يرجى التحقق من البيانات.' : 'Authentication failed. Check your credentials.');
        setErrorMsg(message);
        return;
      }

      if (data.user) {
        onSuccess(data.user as AuthUserSummary, (data.organization as AuthOrgSummary) || null);
        setPassword('');
        onClose();
      }
    } catch {
      setErrorMsg(isAr ? 'تعذر الاتصال بالخادم.' : 'Network error connecting to authentication service.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="climato-auth-title"
    >
      <div className="glass-panel-elevated w-full max-w-md rounded-2xl border border-[#22FF3A]/35 bg-[#030A05] p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-mono text-[#22FF3A]">
              <ShieldCheck className="w-4 h-4" />
              <span>CLIMATO RBAC · HTTPONLY SESSION</span>
            </div>
            <h2 id="climato-auth-title" className="font-display text-xl font-bold text-white">
              {mode === 'login'
                ? isAr
                  ? 'تسجيل الدخول إلى مساحة العمل'
                  : 'Sign In to Organization Workspace'
                : isAr
                ? 'تسجيل مؤسسة ومساحة عمل جديدة'
                : 'Register New Organization Workspace'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="p-1.5 rounded-lg border border-emerald-950 text-slate-400 hover:text-white hover:border-[#22FF3A]/50 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#020503] border border-emerald-950">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              mode === 'login'
                ? 'bg-[#22FF3A]/15 text-[#22FF3A] border border-[#22FF3A]/40'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{isAr ? 'تسجيل الدخول' : 'Sign In'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg(null);
            }}
            className={`py-2 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
              mode === 'register'
                ? 'bg-[#22FF3A]/15 text-[#22FF3A] border border-[#22FF3A]/40'
                : 'text-slate-400 hover:text-white border border-transparent'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>{isAr ? 'حساب مؤسسة جديد' : 'Create Organization'}</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <>
              <div className="space-y-1">
                <label className="block text-xs text-slate-300">
                  {isAr ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={isAr ? 'مثال: سارة منصور' : 'e.g. Sara Mansour'}
                  className="w-full bg-[#020604] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs text-slate-300">
                    {isAr ? 'اسم المؤسسة' : 'Organization Name'}
                  </label>
                  <input
                    type="text"
                    required
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    placeholder={isAr ? 'شركة الدلتا الزراعية' : 'Delta Agro Holding'}
                    className="w-full bg-[#020604] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs text-slate-300">
                    {isAr ? 'القطاع' : 'Primary Sector'}
                  </label>
                  <select
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full bg-[#020604] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
                  >
                    <option value="Agriculture & Exporting">Agriculture & Exporting</option>
                    <option value="Banking & Climate Risk">Banking & Climate Risk</option>
                    <option value="Real Estate & Urban">Real Estate & Urban</option>
                    <option value="Water & Infrastructure">Water & Infrastructure</option>
                  </select>
                </div>
              </div>
            </>
          )}

          <div className="space-y-1">
            <label className="block text-xs text-slate-300">
              {isAr ? 'البريد الإلكتروني المؤسسي' : 'Corporate Email'}
            </label>
            <input
              type="email"
              required
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="analyst@organization.eg"
              className="w-full bg-[#020604] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs text-slate-300">
              {isAr ? 'كلمة المرور (10 أحرف على الأقل)' : 'Password (min 10 characters)'}
            </label>
            <input
              type="password"
              required
              minLength={mode === 'register' ? 10 : 1}
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#020604] border border-emerald-900 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
            />
          </div>

          {errorMsg && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 rounded-lg bg-[#22FF3A] text-[#020503] text-xs font-bold hover:bg-[#4DFF60] disabled:opacity-60 transition-colors cursor-pointer"
          >
            {submitting
              ? isAr
                ? 'جارٍ التحقق...'
                : 'Authenticating...'
              : mode === 'login'
              ? isAr
                ? 'دخول آمن'
                : 'Sign In Securely'
              : isAr
              ? 'إنشاء مساحة العمل والمصادقة'
              : 'Create Organization & Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
