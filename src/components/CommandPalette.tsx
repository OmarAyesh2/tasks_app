import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, Circle, ContactRound, File as FileIcon, Library, Loader2, Search } from 'lucide-react';
import type { Client, Task, Tool } from '../types';
import type { DriveItem } from './FileBrowser';
import { driveAction } from '../lib/supabase';

export type PaletteCommand = { id: string; label: string; hint?: string; icon: React.ElementType; run: () => void };
type Item = { key: string; group: string; label: string; hint?: string; icon: React.ElementType; tone?: string; run: () => void };

interface CommandPaletteProps {
    workspaceId: string | undefined;
    tasks: Task[];
    clients: Client[];
    tools: Tool[];
    commands: PaletteCommand[];
    onOpenTask: (task: Task) => void;
    onOpenClient: (client: Client) => void;
    onOpenFile: (file: DriveItem) => void;
    onClose: () => void;
}

// prefix matches first, then anywhere in the text
const score = (text: string, q: string) => {
    const i = text.toLowerCase().indexOf(q);
    return i < 0 ? -1 : i === 0 ? 2 : 1;
};
const best = <T,>(list: T[], q: string, text: (x: T) => string, limit: number) =>
    list.map(x => ({ x, s: score(text(x), q) })).filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, limit).map(r => r.x);

// Ctrl/⌘+K search across tasks, clients, resources and the workspace's files, plus "go to" commands.
export function CommandPalette({ workspaceId, tasks, clients, tools, commands, onOpenTask, onOpenClient, onOpenFile, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [files, setFiles] = useState<{ query: string; items: DriveItem[] } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const listId = useId();

    const q = query.trim().toLowerCase();

    // files live in Drive, so they're searched on the server (debounced)
    useEffect(() => {
        if (!workspaceId || q.length < 2) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            driveAction<{ items: DriveItem[] }>({ action: 'search', workspaceId, query: q })
                .then(r => { if (!cancelled) setFiles({ query: q, items: r.items.filter(i => !i.isFolder) }); })
                .catch(() => { if (!cancelled) setFiles({ query: q, items: [] }); });
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [workspaceId, q]);
    const filesLoading = q.length >= 2 && files?.query !== q;

    const taskItem = (t: Task): Item => ({
        key: `t:${t.id}`, group: 'Tasks', label: t.name,
        hint: t.status === 'done' ? 'Done' : t.status === 'in_progress' ? 'In progress' : t.due_date ? `Due ${new Date(t.due_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : undefined,
        icon: t.status === 'done' ? CheckCircle2 : Circle, tone: t.status === 'done' ? 'text-emerald-500' : 'text-primary',
        run: () => onOpenTask(t),
    });

    const items: Item[] = q
        ? [
            ...best(commands, q, c => c.label, 4).map(c => ({ key: `c:${c.id}`, group: 'Go to', label: c.label, hint: c.hint, icon: c.icon, run: c.run })),
            ...best(tasks, q, t => `${t.name} ${t.description ?? ''}`, 6).map(taskItem),
            ...best(clients, q, c => `${c.name} ${c.email ?? ''} ${c.phone ?? ''}`, 4).map(c => ({
                key: `cl:${c.id}`, group: 'Clients', label: c.name, hint: c.email ?? c.phone ?? undefined, icon: ContactRound, tone: 'text-teal-500', run: () => onOpenClient(c),
            })),
            ...best(tools, q, t => `${t.name} ${t.category ?? ''} ${t.link}`, 4).map(t => ({
                key: `r:${t.id}`, group: 'Resources', label: t.name, hint: t.category ?? undefined, icon: Library, tone: 'text-accent',
                run: () => window.open(t.link, '_blank', 'noopener,noreferrer'),
            })),
            ...(files?.query === q ? files.items.slice(0, 6) : []).map(f => ({
                key: `f:${f.id}`, group: 'Files', label: f.name, hint: f.location ?? undefined, icon: FileIcon, tone: 'text-amber-500', run: () => onOpenFile(f),
            })),
        ]
        : [
            ...commands.map(c => ({ key: `c:${c.id}`, group: 'Go to', label: c.label, hint: c.hint, icon: c.icon, run: c.run })),
            ...tasks.filter(t => t.status !== 'done').slice(0, 5).map(taskItem),
        ];

    const current = Math.min(active, Math.max(0, items.length - 1));

    useEffect(() => { inputRef.current?.focus(); }, []);
    useEffect(() => {
        listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [current, items.length]);

    const choose = (item: Item | undefined) => {
        if (!item) return;
        onClose();
        item.run();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (Math.min(i, items.length - 1) + 1) % Math.max(1, items.length)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (Math.min(i, items.length - 1) - 1 + items.length) % Math.max(1, items.length)); }
        else if (e.key === 'Enter') { e.preventDefault(); choose(items[current]); }
        else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };

    let lastGroup = '';
    return createPortal(
        <div className="fixed inset-0 z-[90] flex items-start justify-center px-3 pt-[12vh] bg-black/40 backdrop-blur-sm animate-fade-in" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-xl rounded-2xl border border-slate-200/80 bg-white/95 dark:border-white/10 dark:bg-dark-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 border-b border-slate-200/70 dark:border-white/10">
                    <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                        onKeyDown={onKeyDown}
                        placeholder="Search tasks, clients, resources and files…"
                        role="combobox"
                        aria-expanded="true"
                        aria-controls={listId}
                        aria-activedescendant={items[current] ? `${listId}-${current}` : undefined}
                        aria-autocomplete="list"
                        className="flex-1 h-14 bg-transparent outline-none text-base text-text-main dark:text-slate-100 placeholder:text-text-muted"
                    />
                    {filesLoading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" aria-label="Searching files" />}
                    <kbd className="hidden sm:block text-[11px] font-medium text-text-muted border border-slate-200 dark:border-white/10 rounded-md px-1.5 py-0.5">Esc</kbd>
                </div>

                <ul ref={listRef} id={listId} role="listbox" aria-label="Results" className="max-h-[min(26rem,60vh)] overflow-y-auto p-2">
                    {items.length === 0 && (
                        <li className="px-3 py-10 text-center text-sm text-text-muted">
                            {filesLoading ? 'Searching…' : `No results for “${query.trim()}”`}
                        </li>
                    )}
                    {items.map((item, i) => {
                        const header = item.group !== lastGroup ? item.group : null;
                        lastGroup = item.group;
                        const Icon = item.icon;
                        return (
                            <li key={item.key} role="presentation">
                                {header && <p className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">{header}</p>}
                                <div
                                    id={`${listId}-${i}`}
                                    role="option"
                                    aria-selected={i === current}
                                    onMouseMove={() => setActive(i)}
                                    onClick={() => choose(item)}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer ${i === current ? 'bg-primary/10 dark:bg-white/[0.07]' : ''}`}
                                >
                                    <Icon className={`w-4 h-4 flex-shrink-0 ${item.tone ?? 'text-text-muted'}`} />
                                    <span className="flex-1 min-w-0 truncate text-sm text-text-main dark:text-slate-100">{item.label}</span>
                                    {item.hint && <span className="text-xs text-text-muted truncate max-w-[40%]">{item.hint}</span>}
                                    {i === current && <ArrowRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
                                </div>
                            </li>
                        );
                    })}
                </ul>

                <div className="hidden sm:flex items-center gap-4 px-4 py-2.5 border-t border-slate-200/70 dark:border-white/10 text-[11px] text-text-muted">
                    <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> to move</span>
                    <span><Kbd>Enter</Kbd> to open</span>
                    <span className="ml-auto">Press <Kbd>?</Kbd> for all shortcuts</span>
                </div>
            </div>
        </div>,
        document.body,
    );
}

export function Kbd({ children }: { children: React.ReactNode }) {
    return <kbd className="inline-block min-w-[1.4rem] text-center text-[11px] font-medium border border-slate-200 dark:border-white/15 rounded-md px-1.5 py-0.5 bg-white/60 dark:bg-white/[0.04]">{children}</kbd>;
}
