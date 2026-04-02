import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import auth from 'auth-astro';

export default defineConfig({
  site: 'https://aidepedia.com',
  integrations: [
    tailwind(),
    auth(),
  ],
  output: 'server',
  adapter: cloudflare(),
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es', 'fr', 'de', 'ja', 'ar', 'he'],
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
