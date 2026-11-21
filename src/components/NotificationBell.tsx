import { useEffect, useRef, useState } from 'react';
import { AlarmClock, Bell, CalendarClock, CheckCheck, MessageSquare, UserPlus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';

type Notification = {
    id: string;
    workspace_id: string;
    task_id: string | null;
    type: 'assigned' | 'comment' | 'due_today' | 'overdue';
    actor_email: string | null;
    title: string;
    body: string | null;
    read_at: string | null;
    created_at: string;
};

const LOOK = {
    assigned: { Icon: UserPlus, tone: 'text-primary bg-primary/10' },
    comment: { Icon: MessageSquare, tone: 'text-accent bg-accent/10' },
    due_today: { Icon: CalendarClock, tone: 'text-amber-500 bg-amber-500/10' },
    overdue: { Icon: AlarmClock, tone: 'text-red-500 bg-red-500/10' },
};

const who = (email: string | null) => email?.split('@')[0] ?? 'Someone';
const headline = (n: Notification) => ({
    assigned: `${who(n.actor_email)} assigned you a task`,
    comment: `${who(n.actor_email)} commented`,
    due_today: 'Due today',
    overdue: 'Overdue',
})[n.type];

const timeAgo = (iso: string) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

interface NotificationBellProps {
    onOpenTask: (workspaceId: string, taskId: string) => void;
}

// Bell with unread count; new notifications arrive live. Shows all workspaces, newest first.
export function NotificationBell({ onOpenTask }: NotificationBellProps) {
    const { user } = useAuth();
    const { workspaces } = useWorkspace();
    const [items, setItems] = useState<Notification[]>([]);
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const userId = user?.id;

    useEffect(() => {
        if (!userId || !supabase) return;
        let cancelled = false;
        supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(30)
            .then(({ data }) => { if (!cancelled && data) setItems(data as Notification[]); });
        const channel = supabase.channel(`notifications:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
                (payload) => setItems(list => [payload.new as Notification, ...list.filter(n => n.id !== payload.new.id)].slice(0, 30)))
            .subscribe();
        return () => { cancelled = true; supabase?.removeChannel(channel); };
    }, [userId]);

    // close on outside click or Escape
    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
    }, [open]);

    const unread = items.filter(n => !n.read_at).length;

    const markRead = (ids: string[]) => {
        if (!ids.length) return;
        const now = new Date().toISOString();
        setItems(list => list.map(n => ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n));
        supabase!.from('notifications').update({ read_at: now }).in('id', ids)
            .then(({ error }) => { if (error) console.error('Could not mark notifications read:', error); });
    };

    const openItem = (n: Notification) => {
        markRead(n.read_at ? [] : [n.id]);
        setOpen(false);
        if (n.task_id) onOpenTask(n.workspace_id, n.task_id);
    };

    const workspaceName = (id: string) => workspaces.find(w => w.id === id)?.name;
    const showWorkspace = new Set(items.map(n => n.workspace_id)).size > 1;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
                className="relative w-11 h-11 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-slate-900/[0.05] dark:hover:text-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            >
                <Bell className="w-5 h-5" />
                {unread > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-[18px] text-center">
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div role="dialog" aria-label="Notifications"
                    className="absolute left-0 fold:left-auto fold:right-0 md:left-auto md:right-0 top-full mt-2 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200/80 bg-white/95 dark:border-white/10 dark:bg-dark-surface/95 backdrop-blur-xl shadow-2xl animate-fade-in overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200/70 dark:border-white/10">
                        <h2 className="text-sm font-semibold text-text-main dark:text-slate-100">Notifications</h2>
                        {unread > 0 && (
                            <button type="button" onClick={() => markRead(items.filter(n => !n.read_at).map(n => n.id))}
                                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                            </button>
                        )}
                    </div>

                    <ul className="max-h-[min(28rem,70vh)] overflow-y-auto">
                        {items.length === 0 && (
                            <li className="px-4 py-10 text-center text-sm text-text-muted">
                                You're all caught up. Assignments, comments and due dates show up here.
                            </li>
                        )}
                        {items.map(n => {
                            const { Icon, tone } = LOOK[n.type];
                            return (
                                <li key={n.id}>
                                    <button type="button" onClick={() => openItem(n)}
                                        className="w-full flex gap-3 px-4 py-3 text-left hover:bg-slate-100/70 dark:hover:bg-white/[0.04] transition-colors">
                                        <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tone}`}>
                                            <Icon className="w-4 h-4" />
                                        </span>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm text-text-main dark:text-slate-100">{headline(n)}</span>
                                            <span className="block text-sm font-medium text-text-main dark:text-slate-100 truncate">{n.title}</span>
                                            {n.body && <span className="block text-xs text-text-muted line-clamp-2 mt-0.5">“{n.body}”</span>}
                                            <span className="block text-xs text-text-muted mt-1">
                                                {timeAgo(n.created_at)}
                                                {showWorkspace && workspaceName(n.workspace_id) ? ` · ${workspaceName(n.workspace_id)}` : ''}
                                            </span>
                                        </span>
                                        {!n.read_at && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" aria-label="Unread" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
