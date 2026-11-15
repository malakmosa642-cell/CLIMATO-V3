import { Info } from 'lucide-react';
import { Language } from '../types/climate';
import { UI_COPY } from '../data/bilingualContent';

export default function SampleDataBanner({ lang }: { lang: Language }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-950/25 px-4 py-2.5 flex items-start sm:items-center gap-2.5 text-xs text-amber-200">
      <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5 sm:mt-0" />
      <p className="leading-relaxed">
        <span className="font-semibold text-amber-100">
          {lang === 'ar' ? 'إفصاح مصدر البيانات: ' : 'Data Provenance Notice: '}
        </span>
        {UI_COPY.dataBanner.label[lang]}
      </p>
    </div>
  );
}
