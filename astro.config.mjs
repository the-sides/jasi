// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	// Absolute canonical and og:image URLs are built off this.
	site: 'https://jacobsides.com',
	integrations: [sitemap()],
	vite: {
		plugins: [tailwindcss()],
	},
});
