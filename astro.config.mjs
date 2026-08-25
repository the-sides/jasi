// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	// Absolute canonical and og:image URLs are built off this.
	site: 'https://jacobsides.com',
	redirects: {
		'/invite-bro': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
	},
	integrations: [
		sitemap({
			// The joke route is not a real page; keep it out of the sitemap.
			filter: (page) => !page.endsWith('/invite-bro/'),
		}),
	],
	vite: {
		plugins: [tailwindcss()],
	},
});
