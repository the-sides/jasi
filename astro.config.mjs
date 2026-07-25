// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	redirects: {
		'/resume': {
			status: 308,
			destination: '/resume.pdf',
		},
		'/invite-bro': {
			status: 302,
			destination: 'https://youtu.be/dQw4w9WgXcQ?si=FIGWNgbGvOqVFwoG',
		},
	},
});
