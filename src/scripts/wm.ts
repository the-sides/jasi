/**
 * Floating window manager for the desktop: focus + raise, drag by the
 * groupbar, resize from the right/bottom/corner edges, and — in touch mode —
 * tap-to-maximize into #stage, an invisible gutter-inset container.
 *
 * Where a window sits is global.css's business, not this file's: windows are
 * laid out as fractions of the layout box and carry no pixel geometry until
 * they are touched. Dragging or resizing one pins it to pixels for good; the
 * rest keep tracking the viewport. Below the stacking breakpoint every window
 * is handed back, because there the stack is the layout.
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
/**
 * The same threshold for a tap on the shield, where the gesture we are telling
 * a tap apart from is a scroll of the whole desktop — and where the pointer is
 * usually a finger, which wanders further than a mouse does.
 */
const SWIPE_SLOP = 12;
/** Keep in sync with the transition in global.css. */
const SNAP_MS = 160;
/** Keep in sync with the stacking media query in global.css. */
const STACK_QUERY = '(max-width: 767px)';
/** How long a shield is held up if the gesture never produces a click. */
const HOLD_MS = 700;

const stacked = window.matchMedia(STACK_QUERY);

/**
 * How a window built after the page loaded is taken into the stack. Set by
 * initDesktop, because the stacking order it joins lives in there.
 */
let adopt: ((win: HTMLElement) => void) | null = null;

function place(win: HTMLElement, x: number, y: number) {
	win.style.transform = `translate(${x}px, ${y}px)`;
}

function apply(win: HTMLElement, g: Geometry) {
	win.style.width = `${g.w}px`;
	win.style.height = `${g.h}px`;
	place(win, g.x, g.y);
}

/** Drop the pixel geometry, handing the window back to the layout in the CSS. */
function unpin(win: HTMLElement) {
	win.style.transform = '';
	win.style.width = '';
	win.style.height = '';
}

function release(win: HTMLElement) {
	delete win.dataset.floating;
	delete win.dataset.maximized;
	delete win.dataset.restore;
	unpin(win);
}

function initDesktop(desktop: HTMLElement) {
	const stage = document.getElementById('stage');
	const windows = () => [...desktop.querySelectorAll<HTMLElement>('[data-window]')];

	/**
	 * An element's box in the desktop's own coordinates, scroll folded back in —
	 * the frame every geometry here is written in.
	 */
	function contentRect(el: Element): Geometry {
		const box = el.getBoundingClientRect();
		const origin = desktop.getBoundingClientRect();
		return {
			x: Math.round(box.left - origin.left + desktop.scrollLeft),
			y: Math.round(box.top - origin.top + desktop.scrollTop),
			w: Math.round(box.width),
			h: Math.round(box.height),
		};
	}

	/**
	 * The area a maximized window fills: the invisible stage, gutters included.
	 * The stage tracks the viewport, so its position is folded back into the
	 * scrolled content — a window maximizes over whatever you are looking at.
	 */
	function stageGeometry(): Geometry {
		return contentRect(stage ?? desktop);
	}

	/** Animate the next geometry change, then get out of the way of dragging. */
	function snap(win: HTMLElement) {
		win.dataset.snapping = 'true';
		setTimeout(() => delete win.dataset.snapping, SNAP_MS + 40);
	}

	function maximize(win: HTMLElement) {
		// Only a window that was already pinned has somewhere of its own to go
		// back to; the rest return to the layout box they came from.
		if (win.dataset.floating) win.dataset.restore = JSON.stringify(contentRect(win));
		win.dataset.maximized = 'true';
		snap(win);
		apply(win, stageGeometry());
	}

	function unmaximize(win: HTMLElement, { animate = true } = {}) {
		if (!win.dataset.maximized) return;
		const restore = win.dataset.restore;
		delete win.dataset.maximized;
		delete win.dataset.restore;
		if (animate) snap(win);
		if (restore) apply(win, JSON.parse(restore) as Geometry);
		else unpin(win);
	}

	/**
	 * Keep an unfocused window's shield up for the rest of the gesture. Focus
	 * alone would drop it mid-click, and the click would land inside the frame
	 * it was covering — one tap would both raise the window and follow a link.
	 */
	function hold(win: HTMLElement) {
		win.dataset.holding = 'true';
		const drop = () => delete win.dataset.holding;
		desktop.addEventListener('click', drop, { capture: true, once: true });
		setTimeout(drop, HOLD_MS);
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
	/** A press on the shield, still undecided between a tap and a scroll. */
	let tap: { win: HTMLElement; id: number; x: number; y: number } | null = null;

	desktop.addEventListener('pointerdown', (e) => {
		// Nothing is captured for a shield press, so its pointerup can be lost
		// outside the desktop. A new press is the last word on the old one.
		tap = null;
		if (e.button !== 0) return;
		const target = e.target as Element;
		const win = target.closest<HTMLElement>('[data-window]');
		if (!win) return;

		const shielded = target.closest('[data-shield]') !== null;
		focus(win);
		if (shielded) hold(win);

		// A stacked window has nowhere to be dragged to, and a press on the
		// shield is spent raising the window. Either way the gesture ends here —
		// no capture and no preventDefault, so touch scrolling still works.
		if (stacked.matches || shielded) {
			// In touch mode the press also has a window to maximize. Nothing is
			// captured, so the gesture may yet turn out to be a scroll: hold the
			// origin and decide on pointerup.
			if (shielded && !stacked.matches && getMode() === 'touch') {
				tap = { win, id: e.pointerId, x: e.clientX, y: e.clientY };
			}
			return;
		}

		const handle = target.closest<HTMLElement>('[data-resize]');
		const mode: Mode = handle ? (handle.dataset.resize as Mode) : 'move';
		const origin = contentRect(win);

		drag = {
			win,
			mode,
			pointerX: e.clientX,
			pointerY: e.clientY,
			originX: origin.x,
			originY: origin.y,
			originW: origin.w,
			originH: origin.h,
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
			// Pin it: a window the user has moved keeps its own geometry from
			// here, rather than being re-placed as the viewport changes.
			drag.win.dataset.floating = 'true';
			apply(drag.win, { x: drag.originX, y: drag.originY, w: drag.originW, h: drag.originH });
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

	/** A press on the shield that stayed put was a tap: put the window up. */
	function endTap(e: PointerEvent) {
		if (!tap || e.pointerId !== tap.id) return;
		const { win, x, y } = tap;
		tap = null;
		if (Math.abs(e.clientX - x) > SWIPE_SLOP || Math.abs(e.clientY - y) > SWIPE_SLOP) return;
		toggleMaximize(win);
	}

	desktop.addEventListener('pointerup', (e) => {
		endTap(e);
		endDrag(e);
	});

	// A cancelled pointer is the browser taking the gesture over for a scroll —
	// which is the answer to what the press was, so the tap is dropped.
	desktop.addEventListener('pointercancel', (e) => {
		tap = null;
		endDrag(e);
	});

	// Leaving touch mode hands the windows back: with no tap gesture, a
	// maximized window would otherwise be stuck on the stage.
	onModeChange((next) => {
		if (next !== 'desktop') return;
		for (const win of windows()) unmaximize(win);
	});

	// Narrowing to the stack takes every window back off the user: the stack is
	// a single column in source order, and a window pinned to pixels would sit
	// outside it. Widening again leaves them with the fluid layout they now have.
	stacked.addEventListener('change', (e) => {
		if (e.matches) for (const win of windows()) release(win);
	});

	// Refit maximized windows to the resized stage. Floating windows are left
	// exactly where they are — a smaller viewport just means more to scroll.
	function reflow() {
		if (stacked.matches) return;
		for (const win of windows()) {
			if (win.dataset.maximized) apply(win, stageGeometry());
		}
	}

	window.addEventListener('resize', reflow);

	adopt = (win) => {
		win.style.zIndex = String(++top);
		focus(win);
	};
}

const desktop = document.getElementById('desktop');
if (desktop) initDesktop(desktop);

/**
 * Put a window built at runtime onto the desktop: topmost, focused and scrolled
 * to. Nothing else about it is special — it carries the same chrome and the
 * same fractional placement as the windows the page was served with, so it
 * drags, resizes and stacks like any of them.
 */
export function openWindow(win: HTMLElement) {
	if (!desktop || !adopt) return;
	desktop.append(win);
	adopt(win);
	win.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
