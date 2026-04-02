import { rtlLanguages } from './config';

export function getDirection(language: string): 'ltr' | 'rtl' {
  return rtlLanguages.includes(language) ? 'rtl' : 'ltr';
}

export function isRtl(language: string): boolean {
  return rtlLanguages.includes(language);
}

// CSS classes for RTL support
export function getDirectionClasses(language: string): {
  dir: 'ltr' | 'rtl';
  class: string;
} {
  const dir = getDirection(language);
  return {
    dir,
    class: dir === 'rtl' ? 'rtl' : 'ltr',
  };
}

// Helper to mirror CSS values (e.g., margin-left becomes margin-right)
export function mirrorCssValue(property: string): string {
  const mirrorMap: Record<string, string> = {
    'margin-left': 'margin-right',
    'margin-right': 'margin-left',
    'padding-left': 'padding-right',
    'padding-right': 'padding-left',
    'border-left': 'border-right',
    'border-right': 'border-left',
    'left': 'right',
    'right': 'left',
    'text-align-left': 'text-align-right',
    'text-align-right': 'text-align-left',
  };

  return mirrorMap[property] || property;
}

// Tailwind RTL utility classes
export const rtlUtilities = `
  /* RTL utilities */
  .ltr\\:ml-auto.rtl\\:mr-auto { margin-left: auto; }
  .ltr\\:mr-auto.rtl\\:ml-auto { margin-right: auto; }
  
  [dir="rtl"] .rtl\\:mr-4 { margin-right: 1rem; }
  [dir="rtl"] .rtl\\:ml-4 { margin-left: 1rem; }
  [dir="rtl"] .rtl\\:text-right { text-align: left; }
  [dir="rtl"] .rtl\\:text-left { text-align: right; }
  [dir="rtl"] .rtl\\:float-left { float: right; }
  [dir="rtl"] .rtl\\:float-right { float: left; }
  
  [dir="ltr"] .ltr\\:ml-4 { margin-left: 1rem; }
  [dir="ltr"] .ltr\\:mr-4 { margin-right: 1rem; }
  [dir="ltr"] .ltr\\:text-right { text-align: right; }
  [dir="ltr"] .ltr\\:text-left { text-align: left; }
`;
