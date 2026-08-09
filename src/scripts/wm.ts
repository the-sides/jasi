/**
 * Floating window manager for the desktop: focus + raise, drag by the
 * groupbar, resize from the right/bottom/corner edges. Windows are absolutely
 * positioned inside #desktop and moved with a transform.
 */

type Mode = 'move' | 'e' | 's' | 'se';

interface Drag {
	win: HTMLElement;
	mode: Mode;
	pointerX: number;
	pointerY: number;
	originX: number;
	originY: number;
	originW: number;
	originH: number;
}

const MIN_WIDTH = 220;
const MIN_HEIGHT = 120;

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), Math.max(min, max));

function place(win: HTMLElement, x: number, y: number) {
	win.dataset.x = String(x);
	win.dataset.y = String(y);
	win.style.transform = `translate(${x}px, ${y}px)`;
}

function initDesktop(desktop: HTMLElement) {
	const windows = () => [...desktop.querySelectorAll<HTMLElement>('[data-window]')];

	let top = 10;
	for (const win of windows()) win.style.zIndex = String(top++);

	function focus(win: HTMLElement) {
		for (const other of windows()) {
			if (other !== win) other.removeAttribute('data-focused');
		}
		win.dataset.focused = 'true';
		if (Number(win.style.zIndex) < top) win.style.zIndex = String(++top);
	}

	let drag: Drag | null = null;

	desktop.addEventListener('pointerdown', (e) => {
		if (e.button !== 0) return;
		const target = e.target as Element;
		const win = target.closest<HTMLElement>('[data-window]');
		if (!win) return;

		focus(win);

		const handle = target.closest<HTMLElement>('[data-resize]');
		const mode = handle ? (handle.dataset.resize as Mode) : target.closest('[data-drag]') ? 'move' : null;
		if (!mode) return;

		drag = {
			win,
			mode,
			pointerX: e.clientX,
			pointerY: e.clientY,
			originX: Number(win.dataset.x ?? 0),
			originY: Number(win.dataset.y ?? 0),
			originW: win.offsetWidth,
			originH: win.offsetHeight,
		};

		desktop.setPointerCapture(e.pointerId);
		document.body.classList.add('select-none');
		if (mode === 'move') win.dataset.dragging = 'true';
		e.preventDefault();
	});

	desktop.addEventListener('pointermove', (e) => {
		if (!drag) return;
		const dx = e.clientX - drag.pointerX;
		const dy = e.clientY - drag.pointerY;
		const { win, mode } = drag;

		if (mode === 'move') {
			place(
				win,
				clamp(drag.originX + dx, 0, desktop.clientWidth - win.offsetWidth),
				clamp(drag.originY + dy, 0, desktop.clientHeight - win.offsetHeight),
			);
			return;
		}

		if (mode === 'e' || mode === 'se') {
			win.style.width = `${clamp(drag.originW + dx, MIN_WIDTH, desktop.clientWidth - drag.originX)}px`;
		}
		if (mode === 's' || mode === 'se') {
			win.style.height = `${clamp(drag.originH + dy, MIN_HEIGHT, desktop.clientHeight - drag.originY)}px`;
		}
	});

	function endDrag(e: PointerEvent) {
		if (!drag) return;
		delete drag.win.dataset.dragging;
		drag = null;
		document.body.classList.remove('select-none');
		if (desktop.hasPointerCapture(e.pointerId)) desktop.releasePointerCapture(e.pointerId);
	}

	desktop.addEventListener('pointerup', endDrag);
	desktop.addEventListener('pointercancel', endDrag);

	// Keep windows on screen, both at startup and when the viewport shrinks.
	function clampAll() {
		for (const win of windows()) {
			place(
				win,
				clamp(Number(win.dataset.x ?? 0), 0, desktop.clientWidth - win.offsetWidth),
				clamp(Number(win.dataset.y ?? 0), 0, desktop.clientHeight - win.offsetHeight),
			);
		}
	}

	clampAll();
	window.addEventListener('resize', clampAll);
}

const desktop = document.getElementById('desktop');
if (desktop) initDesktop(desktop);
