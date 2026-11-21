import { useEffect, useState } from 'react';
import { History, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

type Entry = { id: string; actor_email: string | null; summary: string; created_at: string };

const timeAgo = (iso: string) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

// Who changed what on a task; loaded only when opened. The database writes the entries.
export function TaskActivity({ taskId }: { taskId: string }) {
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<Entry[] | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        supabase!.from('task_activity').select('id, actor_email, summary, created_at')
            .eq('task_id', taskId).order('created_at', { ascending: false }).limit(50)
            .then(({ data, error: err }) => {
                if (cancelled) return;
                if (err) setError(true);
                else setEntries(data as Entry[]);
            });
        return () => { cancelled = true; };
    }, [open, taskId]);

    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                className="inline-flex items-center gap-1.5 text-xs text-text-muted dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors"
            >
                <History className="w-3.5 h-3.5" />
                Activity
            </button>

            {open && (
                <div className="mt-2 border-t border-slate-100 dark:border-dark-border pt-3">
                    {error ? (
                        <p className="text-xs text-red-500">Couldn't load the activity.</p>
                    ) : entries === null ? (
                        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-primary/50" /></div>
                    ) : entries.length === 0 ? (
                        <p className="text-xs text-text-muted">No activity recorded yet. Changes from now on show up here.</p>
                    ) : (
                        <ol className="relative space-y-3 pl-4 border-l border-slate-200 dark:border-white/10">
                            {entries.map(e => (
                                <li key={e.id} className="relative text-xs leading-relaxed">
                                    <span className="absolute -left-[1.2rem] top-1.5 w-2 h-2 rounded-full bg-primary/60 ring-4 ring-white dark:ring-dark-surface" aria-hidden="true" />
                                    <span className="font-medium text-text-main dark:text-slate-200">{e.actor_email?.split('@')[0] ?? 'System'}</span>{' '}
                                    <span className="text-text-muted dark:text-slate-400">{e.summary}</span>
                                    <time dateTime={e.created_at} title={new Date(e.created_at).toLocaleString()} className="block text-[11px] text-text-muted/80">{timeAgo(e.created_at)}</time>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </div>
    );
}
