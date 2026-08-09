/**
 * Hacker News in a window.
 *
 * The front page is read from HN's own API and drawn here rather than embedded:
 * news.ycombinator.com answers with X-Frame-Options: DENY, so an iframe of it
 * is a blank window. Drawing it also lets the list wear the terminal palette,
 * which is what the rest of this desktop is wearing.
 */

import { openPane } from './spawn';

const API = 'https://hacker-news.firebaseio.com/v0';
const SITE = 'https://news.ycombinator.com';
const COUNT = 30;

interface Story {
	id: number;
	title?: string;
	url?: string;
	score?: number;
	by?: string;
	descendants?: number;
	time?: number;
}

async function json<T>(path: string): Promise<T> {
	const response = await fetch(`${API}/${path}`);
	if (!response.ok) throw new Error(`${response.status} ${path}`);
	return (await response.json()) as T;
}

/** The host, the way HN prints it beside a title. */
function host(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return '';
	}
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** Coarse relative time — HN rounds the same way. */
function ago(seconds: number): string {
	const minutes = Math.max(0, Math.round((Date.now() / 1000 - seconds) / 60));
	if (minutes < 60) return `${plural(minutes, 'minute')} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${plural(hours, 'hour')} ago`;
	return `${plural(Math.round(hours / 24), 'day')} ago`;
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className: string,
	text?: string
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

/** A link out of the desktop; every one of these leaves for a real browser tab. */
function link(href: string, className: string, text: string): HTMLAnchorElement {
	const anchor = el('a', className, text);
	anchor.href = href;
	anchor.target = '_blank';
	anchor.rel = 'noreferrer';
	return anchor;
}

function row(story: Story, rank: number): HTMLLIElement {
	const item = `${SITE}/item?id=${story.id}`;
	const li = el('li', 'flex gap-2');

	li.append(el('span', 'w-7 shrink-0 text-right text-term-dim tabular-nums', `${rank}.`));

	const body = el('div', 'min-w-0');
	const head = el('p', 'truncate');
	head.append(
		link(story.url ?? item, 'text-term-fg hover:text-term-blue hover:underline', story.title ?? '')
	);

	const from = story.url ? host(story.url) : '';
	if (from) head.append(el('span', 'text-term-dim', ` (${from})`));

	const meta = el('p', 'truncate text-term-dim');
	meta.append(el('span', 'text-term-yellow', plural(story.score ?? 0, 'point')));
	if (story.by) meta.append(document.createTextNode(` by ${story.by}`));
	if (story.time) meta.append(document.createTextNode(` · ${ago(story.time)}`));
	meta.append(document.createTextNode(' · '));
	meta.append(
		link(item, 'hover:text-term-blue hover:underline', plural(story.descendants ?? 0, 'comment'))
	);

	body.append(head, meta);
	li.append(body);
	return li;
}

/** Open the front page in its own window. */
export async function openHackerNews() {
	const pane = openPane('news.ycombinator.com');
	if (!pane) return;

	const view = el(
		'div',
		'h-full overflow-auto bg-term-bg p-2 font-mono text-[13px] leading-snug text-term-fg'
	);
	const status = el('p', 'text-term-dim', 'fetching front page…');
	view.append(status);
	pane.replaceChildren(view);

	try {
		const ids = await json<number[]>('topstories.json');
		const stories = await Promise.all(
			ids.slice(0, COUNT).map((id) => json<Story>(`item/${id}.json`))
		);

		const list = el('ol', 'space-y-2');
		let rank = 0;
		for (const story of stories) {
			if (story) list.append(row(story, ++rank));
		}
		view.replaceChildren(list);
	} catch {
		// A window that says why is better than an empty one. The link still
		// works, which is all the reader wanted in the first place.
		status.textContent = 'could not reach news.ycombinator.com — ';
		status.append(link(SITE, 'text-term-blue hover:underline', SITE));
	}
}
