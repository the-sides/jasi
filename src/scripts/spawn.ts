/**
 * Opening a window after the page has loaded.
 *
 * The chrome is not built here: index.astro renders one empty Window into a
 * <template> and this clones it, so a spawned window is the same markup as
 * every other window on the desktop — one component still owns what a window
 * looks like, and the clone drags, resizes and stacks like the rest.
 */

import { openWindow } from './wm';

const TEMPLATE_ID = 'window-template';

/** Size of a spawned window, in fractions of the layout box. */
const W = 0.62;
const H = 0.72;

/**
 * Spawned windows deal themselves out in a cascade from the top left, the same
 * habit the work windows have, so a second one does not land exactly on the
 * first. The run wraps rather than walking off the layout box.
 */
const STEP = 0.05;
const STEPS = 5;
const START_X = 0.1;
const START_Y = 0.06;

let opened = 0;

/** Fractions are written into CSS custom properties; keep them short. */
const round = (n: number) => Math.round(n * 1e4) / 1e4;

function chrome(): HTMLElement | null {
	const template = document.getElementById(TEMPLATE_ID);
	if (!(template instanceof HTMLTemplateElement)) return null;
	const win = template.content.firstElementChild?.cloneNode(true);
	return win instanceof HTMLElement ? win : null;
}

/**
 * Open an empty window and hand back the pane inside it for the caller to
 * fill. Null if the page carries no chrome to clone.
 */
export function openPane(title: string): HTMLElement | null {
	const win = chrome();
	if (!win) return null;

	const strip = win.querySelector('[data-title]');
	if (strip) strip.textContent = title;

	const offset = (opened++ % STEPS) * STEP;
	win.style.setProperty('--fx', String(round(START_X + offset)));
	win.style.setProperty('--fy', String(round(START_Y + offset)));
	win.style.setProperty('--fw', String(W));
	win.style.setProperty('--fh', String(H));

	openWindow(win);
	return win.querySelector<HTMLElement>('[data-body]');
}
