/**
 * Floating window manager for the desktop: focus + raise, drag by the
 * groupbar, resize from the right/bottom/corner edges, and — in touch mode —
 * tap-to-maximize into #stage, an invisible gutter-inset container. Windows
 * are absolutely positioned inside #desktop and moved with a transform.
 *
 * Positions are only ever floored at the origin, never capped: a window that
 * runs past the viewport extends #desktop's scrollable area instead of being
 * pushed back inside it.
 */

import { getMode, onModeChange } from './mode';

type Mode = 'move' | 'e' | 's' | 'se';

interface Geometry {
	x: number;
	y: number;
	w: number;
	h: number;
}

interface Drag {
	win: HTMLElement;
	mode: Mode;
	pointerX: number;
	pointerY: number;
	originX: number;
	originY: number;
	originW: number;
	originH: number;
	moved: boolean;
}

const MIN_WIDTH = 220;
const MIN_HEIGHT = 120;
/** Pointer travel (px) past which a gesture is a drag, not a tap. */
const TAP_SLOP = 4;
/** Keep in sync with the transition in global.css. */
const SNAP_MS = 160;

function place(win: HTMLElement, x: number, y: number) {
	win.dataset.x = String(x);
	win.dataset.y = String(y);
	win.style.transform = `translate(${x}px, ${y}px)`;
}

function apply(win: HTMLElement, g: Geometry) {
	win.style.width = `${g.w}px`;
	win.style.height = `${g.h}px`;
	place(win, g.x, g.y);
}

function geometryOf(win: HTMLElement): Geometry {
	return {
		x: Number(win.dataset.x ?? 0),
		y: Number(win.dataset.y ?? 0),
		w: win.offsetWidth,
		h: win.offsetHeight,
	};
}

function initDesktop(desktop: HTMLElement) {
	const stage = document.getElementById('stage');
	const windows = () => [...desktop.querySelectorAll<HTMLElement>('[data-window]')];

	/**
	 * The area a maximized window fills: the invisible stage, gutters included.
	 * The stage tracks the viewport, so its position is folded back into the
	 * scrolled content — a window maximizes over whatever you are looking at.
	 */
	function stageGeometry(): Geometry {
		const box = (stage ?? desktop).getBoundingClientRect();
		const origin = desktop.getBoundingClientRect();
		return {
			x: Math.round(box.left - origin.left + desktop.scrollLeft),
			y: Math.round(box.top - origin.top + desktop.scrollTop),
			w: Math.round(box.width),
			h: Math.round(box.height),
		};
	}

	/** Animate the next geometry change, then get out of the way of dragging. */
	function snap(win: HTMLElement) {
		win.dataset.snapping = 'true';
		setTimeout(() => delete win.dataset.snapping, SNAP_MS + 40);
	}

	function maximize(win: HTMLElement) {
		win.dataset.restore = JSON.stringify(geometryOf(win));
		win.dataset.maximized = 'true';
		snap(win);
		apply(win, stageGeometry());
	}

	function unmaximize(win: HTMLElement, { animate = true } = {}) {
		if (!win.dataset.maximized) return;
		const restore = win.dataset.restore;
		delete win.dataset.maximized;
		delete win.dataset.restore;
		if (!restore) return;
		if (animate) snap(win);
		apply(win, JSON.parse(restore) as Geometry);
	}

	let top = 10;
	for (const win of windows()) win.style.zIndex = String(top++);

	function focus(win: HTMLElement) {
		for (const other of windows()) {
			if (other !== win) other.removeAttribute('data-focused');
		}
		win.dataset.focused = 'true';
		if (Number(win.style.zIndex) < top) win.style.zIndex = String(++top);
	}

	/** A tap toggles the window between the stage and where it came from. */
	function toggleMaximize(win: HTMLElement) {
		for (const other of windows()) {
			if (other !== win) unmaximize(other);
		}
		if (win.dataset.maximized) unmaximize(win);
		else maximize(win);
	}

	let drag: Drag | null = null;

	desktop.addEventListener('pointerdown', (e) => {
		if (e.button !== 0) return;
		const target = e.target as Element;
		const win = target.closest<HTMLElement>('[data-window]');
		if (!win) return;

		focus(win);

		const handle = target.closest<HTMLElement>('[data-resize]');
		const mode: Mode = handle ? (handle.dataset.resize as Mode) : 'move';

		drag = {
			win,
			mode,
			pointerX: e.clientX,
			pointerY: e.clientY,
			originX: Number(win.dataset.x ?? 0),
			originY: Number(win.dataset.y ?? 0),
			originW: win.offsetWidth,
			originH: win.offsetHeight,
			moved: false,
		};

		desktop.setPointerCapture(e.pointerId);
		e.preventDefault();
	});

	desktop.addEventListener('pointermove', (e) => {
		if (!drag) return;
		const dx = e.clientX - drag.pointerX;
		const dy = e.clientY - drag.pointerY;

		if (!drag.moved) {
			if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return;
			drag.moved = true;
			document.body.classList.add('select-none');
			// Dragging a maximized window pulls it back out of the stage.
			delete drag.win.dataset.maximized;
			delete drag.win.dataset.restore;
			if (drag.mode === 'move') drag.win.dataset.dragging = 'true';
		}

		const { win, mode } = drag;

		if (mode === 'move') {
			place(win, Math.max(0, drag.originX + dx), Math.max(0, drag.originY + dy));
			return;
		}

		if (mode === 'e' || mode === 'se') {
			win.style.width = `${Math.max(MIN_WIDTH, drag.originW + dx)}px`;
		}
		if (mode === 's' || mode === 'se') {
			win.style.height = `${Math.max(MIN_HEIGHT, drag.originH + dy)}px`;
		}
	});

	function endDrag(e: PointerEvent) {
		if (!drag) return;
		const { win, mode, moved } = drag;
		drag = null;

		delete win.dataset.dragging;
		document.body.classList.remove('select-none');
		if (desktop.hasPointerCapture(e.pointerId)) desktop.releasePointerCapture(e.pointerId);

		if (!moved && mode === 'move' && getMode() === 'touch') toggleMaximize(win);
	}

	desktop.addEventListener('pointerup', endDrag);
	desktop.addEventListener('pointercancel', endDrag);

	// Leaving touch mode hands the windows back: with no tap gesture, a
	// maximized window would otherwise be stuck on the stage.
	onModeChange((next) => {
		if (next !== 'desktop') return;
		for (const win of windows()) unmaximize(win);
	});

	// Refit maximized windows to the resized stage. Floating windows are left
	// exactly where they are — a smaller viewport just means more to scroll.
	function reflow() {
		for (const win of windows()) {
			if (win.dataset.maximized) apply(win, stageGeometry());
		}
	}

	window.addEventListener('resize', reflow);
}

const desktop = document.getElementById('desktop');
if (desktop) initDesktop(desktop);
