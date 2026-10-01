import React from 'react';
import { useTranslation, SUPPORTED_LANGUAGES, type Language } from '@/core/i18n';
import { Languages } from 'lucide-react';

export const LanguageSelector: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { language, setLanguage } = useTranslation();

  return (
    <div
      role="group"
      aria-label="Chọn ngôn ngữ giao diện / Language selector"
      className="flex items-center bg-zinc-900/90 p-1 rounded-xl border border-zinc-800/80"
    >
      <div className="pl-2 pr-1 text-zinc-500 hidden sm:flex items-center" aria-hidden="true">
        <Languages className="w-3.5 h-3.5" />
      </div>

      <div className="flex items-center gap-0.5">
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isActive = language === lang.code;
          return (
            <button
              key={lang.code}
              type="button"
              onClick={() => setLanguage(lang.code)}
              aria-pressed={isActive}
              aria-label={`Ngôn ngữ: ${lang.label} (${lang.flag})`}
              title={lang.label}
              className={`min-w-[34px] min-h-[34px] px-2 rounded-lg text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center ${
                isActive
                  ? 'bg-amber-500 text-zinc-950 shadow-sm shadow-amber-500/20'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
              }`}
            >
              {lang.flag}
            </button>
          );
        })}
      </div>
    </div>
  );
};
