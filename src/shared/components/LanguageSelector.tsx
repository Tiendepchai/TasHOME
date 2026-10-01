import React, { useState, useRef, useEffect, useId } from 'react';
import { useTranslation, SUPPORTED_LANGUAGES, type Language } from '@/core/i18n';
import { Languages, ChevronDown, Check } from 'lucide-react';

interface LanguageSelectorProps {
  compact?: boolean;
  className?: string;
}

// 100% vector SVG flags for cross-platform visual consistency
const VietnamFlag: React.FC = () => (
  <svg
    viewBox="0 0 30 20"
    className="w-5 h-3.5 rounded-[3px] shadow-sm shrink-0 border border-red-500/30 overflow-hidden"
    aria-hidden="true"
  >
    <rect width="30" height="20" fill="#DA251D" />
    <polygon
      fill="#FFFF00"
      points="15,4 16.35,8.15 20.71,8.15 17.18,10.71 18.53,14.85 15,12.29 11.47,14.85 12.82,10.71 9.29,8.15 13.65,8.15"
    />
  </svg>
);

const UKFlag: React.FC = () => (
  <svg
    viewBox="0 0 30 20"
    className="w-5 h-3.5 rounded-[3px] shadow-sm shrink-0 border border-blue-500/30 overflow-hidden"
    aria-hidden="true"
  >
    <rect width="30" height="20" fill="#012169" />
    <path d="M0 0 L30 20 M30 0 L0 20" stroke="#FFFFFF" strokeWidth="4" />
    <path d="M0 0 L30 20 M30 0 L0 20" stroke="#C8102E" strokeWidth="1.5" />
    <path d="M15 0 v20 M0 10 h30" stroke="#FFFFFF" strokeWidth="6.5" />
    <path d="M15 0 v20 M0 10 h30" stroke="#C8102E" strokeWidth="3.8" />
  </svg>
);

const GermanyFlag: React.FC = () => (
  <svg
    viewBox="0 0 30 20"
    className="w-5 h-3.5 rounded-[3px] shadow-sm shrink-0 border border-zinc-700/40 overflow-hidden"
    aria-hidden="true"
  >
    <rect width="30" height="20" fill="#FFCE00" />
    <rect width="30" height="13.34" fill="#DD0000" />
    <rect width="30" height="6.67" fill="#000000" />
  </svg>
);

const FlagIcon: React.FC<{ code: Language }> = ({ code }) => {
  switch (code) {
    case 'vi':
      return <VietnamFlag />;
    case 'en':
      return <UKFlag />;
    case 'de':
      return <GermanyFlag />;
    default:
      return null;
  }
};

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  compact = false,
  className = ''
}) => {
  const { language, setLanguage, t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const menuId = useId();
  const buttonId = useId();

  const currentOption =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) || SUPPORTED_LANGUAGES[0];

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  // Synchronize focus when menu opens
  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
      return;
    }

    const activeIdx = SUPPORTED_LANGUAGES.findIndex((l) => l.code === language);
    const initialIndex = activeIdx >= 0 ? activeIdx : 0;
    setFocusedIndex(initialIndex);
    itemRefs.current[initialIndex]?.focus();
  }, [isOpen, language]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
      return;
    }

    if (e.key === 'Tab') {
      setIsOpen(false);
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = (focusedIndex + 1) % SUPPORTED_LANGUAGES.length;
      setFocusedIndex(nextIndex);
      itemRefs.current[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = (focusedIndex - 1 + SUPPORTED_LANGUAGES.length) % SUPPORTED_LANGUAGES.length;
      setFocusedIndex(prevIndex);
      itemRefs.current[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      setFocusedIndex(0);
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      const lastIndex = SUPPORTED_LANGUAGES.length - 1;
      setFocusedIndex(lastIndex);
      itemRefs.current[lastIndex]?.focus();
    }
  };

  const handleSelect = (code: Language) => {
    setLanguage(code);
    setIsOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      className={`relative inline-block text-left ${className}`}
    >
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        id={buttonId}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={`${t('language')}: ${currentOption.label} (${currentOption.flag})`}
        className={`group min-h-[40px] px-2.5 py-1.5 rounded-xl border transition-all active:scale-95 cursor-pointer flex items-center gap-2 select-none outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
          isOpen
            ? 'bg-zinc-800/90 border-amber-500/40 text-zinc-100 shadow-sm shadow-amber-500/10'
            : 'bg-zinc-900/90 hover:bg-zinc-800/80 border-zinc-800/80 hover:border-zinc-700 text-zinc-300 hover:text-zinc-100'
        }`}
      >
        {/* Translate Icon */}
        <Languages
          className={`w-4 h-4 transition-colors ${
            isOpen ? 'text-amber-400' : 'text-zinc-400 group-hover:text-amber-400'
          }`}
          aria-hidden="true"
        />

        {/* Current Language Short Code */}
        <span className="font-mono font-bold text-xs uppercase tracking-wider text-zinc-200">
          {currentOption.flag}
        </span>

        {/* Small Chevron */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 transition-transform duration-200 ease-out ${
            isOpen ? 'rotate-180 text-amber-400' : 'group-hover:text-zinc-200'
          }`}
          aria-hidden="true"
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <ul
          id={menuId}
          role="listbox"
          aria-labelledby={buttonId}
          aria-activedescendant={
            focusedIndex >= 0 ? `lang-option-${SUPPORTED_LANGUAGES[focusedIndex]?.code}` : undefined
          }
          className="absolute right-0 top-full mt-2 w-52 p-1.5 bg-zinc-900/95 backdrop-blur-md border border-zinc-800/90 rounded-xl shadow-2xl shadow-black/80 z-50 flex flex-col gap-1 focus:outline-none"
        >
          {SUPPORTED_LANGUAGES.map((lang, index) => {
            const isSelected = language === lang.code;
            return (
              <li key={lang.code} role="presentation">
                <button
                  ref={(el) => {
                    itemRefs.current[index] = el;
                  }}
                  id={`lang-option-${lang.code}`}
                  role="option"
                  type="button"
                  aria-selected={isSelected}
                  tabIndex={focusedIndex === index ? 0 : -1}
                  onClick={() => handleSelect(lang.code)}
                  className={`w-full min-h-[40px] px-2.5 py-1.5 rounded-lg text-left transition-all cursor-pointer flex items-center gap-2.5 outline-none select-none ${
                    isSelected
                      ? 'bg-amber-500/10 text-amber-400 font-medium'
                      : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 focus:bg-zinc-800/70 focus:text-zinc-100'
                  }`}
                >
                  {/* Flag SVG */}
                  <FlagIcon code={lang.code} />

                  {/* Short Code */}
                  <span
                    className={`font-mono text-xs font-bold w-6 shrink-0 ${
                      isSelected ? 'text-amber-400' : 'text-zinc-400'
                    }`}
                  >
                    {lang.flag}
                  </span>

                  {/* Full Label */}
                  <span className="text-xs truncate flex-1">{lang.label}</span>

                  {/* Checkmark Indicator */}
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-auto" aria-hidden="true" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
