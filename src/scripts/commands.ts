/**
 * What can be typed at the desktop's prompt.
 *
 * These are not programs: nothing is printed back, and the shell keeps no
 * transcript. A command is a shortcut that does something to the desktop —
 * for now, opens a site in a window. A line that names nothing does nothing.
 */

import { openHackerNews } from './hn';

interface Command {
	run: () => void;
	/** Other names the same command answers to. */
	aliases?: string[];
}

const COMMANDS: Record<string, Command> = {
	hn: {
		aliases: ['hackernews'],
		run: openHackerNews,
	},
};

const TABLE = new Map<string, Command>();
for (const [name, command] of Object.entries(COMMANDS)) {
	TABLE.set(name, command);
	for (const alias of command.aliases ?? []) TABLE.set(alias, command);
}

/**
 * Run a typed line. Returns whether it was a command — the prompt clears
 * either way, since there is nowhere to report a miss to.
 */
export function run(line: string): boolean {
	const command = TABLE.get(line.trim().toLowerCase());
	if (!command) return false;
	command.run();
	return true;
}
