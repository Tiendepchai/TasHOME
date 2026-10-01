import { create } from 'zustand';
import type { Language } from './types';
import { translations, type TranslationKey } from './translations';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  fetchSettings: () => Promise<void>;
  t: (key: TranslationKey) => string;
}

const STORAGE_KEY = 'tashome-language';

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'vi';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'vi' || saved === 'en' || saved === 'de') {
      return saved;
    }
    const nav = navigator.language.toLowerCase();
    if (nav.startsWith('de')) return 'de';
    if (nav.startsWith('vi')) return 'vi';
    return 'vi';
  } catch {
    return 'vi';
  }
}

export const useLanguageStore = create<LanguageState>((set, get) => ({
  language: getInitialLanguage(),

  setLanguage: (lang: Language) => {
    set({ language: lang });
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch {}

      // Synchronize with server settings atomically
      fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang })
      }).catch(() => {});
    }
  },

  fetchSettings: async () => {
    if (typeof window === 'undefined') return;
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.language === 'vi' || data.language === 'en' || data.language === 'de') {
          set({ language: data.language });
          try {
            localStorage.setItem(STORAGE_KEY, data.language);
          } catch {}
        }
      }
    } catch {}
  },

  t: (key: TranslationKey) => {
    const currentLang = get().language;
    const dict = translations[currentLang] || translations.vi;
    return dict[key] || translations.vi[key] || key;
  }
}));

export const useTranslation = () => {
  const language = useLanguageStore((s) => s.language);
  const setLanguage = useLanguageStore((s) => s.setLanguage);
  const t = useLanguageStore((s) => s.t);

  return { language, setLanguage, t };
};
