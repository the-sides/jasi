/**
 * Interaction mode, held as data-mode on <html>.
 *
 * touch   — tapping a window maximizes it into the stage
 * desktop — windows stay where you put them; no auto-maximize
 *
 * Defaults to touch for everyone; we don't sniff the browser for it.
 */

export type Mode = 'desktop' | 'touch';

export const MODE_CHANGE = 'jasi:modechange';

const root = document.documentElement;

export function getMode(): Mode {
	return root.dataset.mode === 'desktop' ? 'desktop' : 'touch';
}

export function setMode(mode: Mode) {
	if (getMode() === mode) return;
	root.dataset.mode = mode;
	window.dispatchEvent(new CustomEvent<Mode>(MODE_CHANGE, { detail: mode }));
}

export function onModeChange(handler: (mode: Mode) => void) {
	window.addEventListener(MODE_CHANGE, (e) => handler((e as CustomEvent<Mode>).detail));
}
