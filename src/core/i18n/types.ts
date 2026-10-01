export type Language = 'vi' | 'en' | 'de';

export interface LanguageOption {
  code: Language;
  label: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'vi', label: 'Tiếng Việt', flag: 'VI' },
  { code: 'en', label: 'English', flag: 'EN' },
  { code: 'de', label: 'Deutsch', flag: 'DE' }
];
