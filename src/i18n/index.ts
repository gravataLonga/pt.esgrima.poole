import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';
import ptPT from './pt-PT.json';

/**
 * O idioma inicial é `en` — é o que a app mostra, sem detetar o idioma do telemóvel. O pt-PT fica
 * carregado como recurso, à espera da funcionalidade de troca de idioma; até lá não é alcançável.
 */
export const defaultLanguage = 'en';

export const resources = {
  en: { translation: en },
  'pt-PT': { translation: ptPT },
} as const;

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member -- `i18n.use` é a API da instância.
  void i18n.use(initReactI18next).init({
    resources,
    lng: defaultLanguage,
    fallbackLng: defaultLanguage,
    interpolation: { escapeValue: false },
  });
}

export default i18n;
