// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	// Absolute canonical and og:image URLs are built off this.
	site: 'https://jacobsides.com',
	integrations: [
		// The gag redirect is noindex, so keep it out of the sitemap too.
		sitemap({ filter: (page) => !page.includes('/invite-bro') }),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
