import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import cloudflare from '@astrojs/cloudflare';
import auth from 'auth-astro';

export default defineConfig({
  site: 'https://aidepedia.com',
  integrations: [tailwind(), auth()],
  output: 'server',
  adapter: cloudflare(),
  vite: {
    build: {
      rollupOptions: {
        external: ['@aws-sdk/client-s3', 'child_process', 'fs/promises', 'stream', 'path', 'util']
      }
    },
    ssr: {
      external: ['@aws-sdk/client-s3', 'child_process', 'fs/promises', 'stream', 'path', 'util']
    }
  }
});
