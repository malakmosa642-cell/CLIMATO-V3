import { useState } from 'react';
import { CheckCircle2, Send } from 'lucide-react';
import { MODULES, SECTORS } from '../data/bilingualContent';
import { Language, ModuleId } from '../types/climate';

interface ContactDemoViewProps {
  lang: Language;
  initialPlan?: string;
}

export default function ContactDemoView({ lang, initialPlan = 'Sector Pro' }: ContactDemoViewProps) {
  const isAr = lang === 'ar';
  const [fullName, setFullName] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [sector, setSector] = useState(SECTORS[0].title.en);
  const [planInterest, setPlanInterest] = useState(initialPlan);
  const [modulesInterested, setModulesInterested] = useState<ModuleId[]>(['delta-risk', 'esg-reporting']);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ referenceId: string; createdAt: string } | null>(null);

  const toggleMod = (id: ModuleId) => {
    setModulesInterested((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/demo-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          workEmail,
          organization,
          sector,
          planInterest,
          modulesInterested,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');
      setReceipt({ referenceId: data.referenceId, createdAt: data.createdAt });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2 max-w-2xl">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-white">
          {isAr ? 'طلب عرض مؤسسي أو استشارة تكامل' : 'Request a B2B Demo or Custom Report Scoping'}
        </h1>
        <p className="text-sm sm:text-base text-slate-300">
          {isAr
            ? 'حدد قطاع مؤسستك والوحدات المطلوبة لإعداد جلسة عرض متخصصة أو عرض سعر مخصص.'
            : 'Share your sector, priority modules, and geographic scope to schedule an architectural walkthrough or custom B2B proposal.'}
        </p>
      </div>

      {receipt ? (
        <div className="glass-panel-elevated rounded-2xl p-8 space-y-4">
          <div className="flex items-center gap-3 text-emerald-300">
            <CheckCircle2 className="w-6 h-6 text-[#22FF3A]" />
            <h2 className="font-display text-xl font-bold text-white">
              {isAr ? 'تم استلام طلبك بنجاح' : 'Demo Request Recorded'}
            </h2>
          </div>
          <p className="text-sm text-slate-300 leading-relaxed">
            {isAr
              ? 'تم حفظ تفاصيل طلبك في قاعدة بيانات المنصة للمراجعة وتنسيق العرض.'
              : 'Your scoping details have been persisted in the platform database for review.'}
          </p>
          <div className="rounded-xl bg-[#030A05] border border-emerald-950 p-4 font-mono text-xs text-slate-200 space-y-1">
            <div>
              {isAr ? 'الرقم المرجعي:' : 'Reference ID:'} <strong className="text-[#22FF3A]">{receipt.referenceId}</strong>
            </div>
            <div>
              {isAr ? 'المؤسسة:' : 'Organization:'} {organization}
            </div>
            <div>
              {isAr ? 'الباقة المطلوبة:' : 'Plan Interest:'} {planInterest}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setReceipt(null);
              setFullName('');
              setWorkEmail('');
              setOrganization('');
              setNotes('');
            }}
            className="px-4 py-2 rounded-lg border border-emerald-900 text-xs font-medium text-slate-200 hover:border-[#22FF3A]/50 cursor-pointer"
          >
            {isAr ? 'إرسال طلب آخر' : 'Submit Another Request'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="glass-panel-elevated rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'الاسم الكامل *' : 'Full Name *'}
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#22FF3A]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'البريد الإلكتروني المؤسسي *' : 'Work Email *'}
              </label>
              <input
                type="email"
                required
                value={workEmail}
                onChange={(e) => setWorkEmail(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#22FF3A]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'اسم الجهة / الشركة *' : 'Organization *'}
              </label>
              <input
                type="text"
                required
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#22FF3A]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'القطاع *' : 'Sector *'}
              </label>
              <select
                value={sector}
                onChange={(e) => setSector(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
              >
                {SECTORS.map((s) => (
                  <option key={s.id} value={s.title.en}>
                    {s.title[lang]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                {isAr ? 'مسار الاشتراك / التقرير' : 'Subscription / Deliverable'}
              </label>
              <select
                value={planInterest}
                onChange={(e) => setPlanInterest(e.target.value)}
                className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-[#22FF3A]"
              >
                <option value="Sector Pro">Sector Pro</option>
                <option value="Enterprise & Sovereign">Enterprise & Sovereign</option>
                <option value="Paid Custom Report">Paid Custom ESG / Climate Report</option>
                <option value="API Access Agreement">Developer API Access</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-300">
              {isAr ? 'الوحدات ذات الأولوية' : 'Priority Intelligence Modules'}
            </div>
            <div className="flex flex-wrap gap-2">
              {MODULES.map((m) => {
                const selected = modulesInterested.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMod(m.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                      selected
                        ? 'bg-[#22FF3A]/15 border-[#22FF3A]/50 text-[#22FF3A]'
                        : 'bg-[#030A05] border-emerald-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.shortTitle[lang]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              {isAr ? 'نطاق الإحداثيات أو المتطلبات الإضافية' : 'Geographic Scope / Technical Notes'}
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isAr
                  ? 'اذكر المحافظات أو المواقع المطلوب مراقبتها أو معايير الإفصاح المستهدفة...'
                  : 'Describe target regions, AOI polygon count, or required satellite/API cadence...'
              }
              className="w-full bg-[#030A05] border border-emerald-950 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#22FF3A]"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-xs text-rose-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-3 rounded-lg bg-[#22FF3A] text-[#020503] text-sm font-semibold hover:bg-[#4DFF60] disabled:opacity-60 transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>
              {submitting
                ? isAr ? 'جارٍ الإرسال...' : 'Submitting...'
                : isAr ? 'إرسال طلب العرض المؤسسي' : 'Submit Demo Request'}
            </span>
          </button>
        </form>
      )}
    </div>
  );
}
