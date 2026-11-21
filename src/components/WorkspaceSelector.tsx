import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { Check, ChevronsUpDown, Plus, Loader2, Trash2 } from 'lucide-react';
import { supabase, driveAction } from '../lib/supabase';

// Compact switcher: one card for the current workspace; switching, creating and deleting
// live in its menu so they don't take sidebar space (and delete is never one stray click away).
export function WorkspaceSelector() {
    const {
        workspaces,
        activeWorkspace,
        currentMemberProfile,
        loading,
        setActiveWorkspaceById,
        createWorkspace,
        refreshWorkspaces,
    } = useWorkspace();

    const [menuOpen, setMenuOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // close on outside click or Escape
    useEffect(() => {
        if (!menuOpen) return;
        const onDown = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false);
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    if (loading) {
        return (
            <div className="px-3 py-3 flex items-center gap-2 text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading workspaces…</span>
            </div>
        );
    }

    const closeMenu = () => {
        setMenuOpen(false);
        setIsCreating(false);
        setNewName('');
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newName.trim();
        if (!trimmed) return;

        setSubmitting(true);
        try {
            await createWorkspace(trimmed);
            closeMenu();
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteWorkspace = async () => {
        if (!activeWorkspace) return;
        setMenuOpen(false);
        if (window.confirm(`Permanently delete "${activeWorkspace.name}"? This erases all its tasks, projects, files and data for everyone.`)) {
            try {
                // the database cascade can't reach Drive, so trash the workspace's folder first
                await driveAction({ action: 'trashWorkspace', workspaceId: activeWorkspace.id });

                const { error } = await supabase!.from('workspaces').delete().eq('id', activeWorkspace.id);
                if (error) throw error;

                localStorage.removeItem('tasks_app_active_workspace_id');
                await refreshWorkspaces();
            } catch (error) {
                console.error('Error deleting workspace:', error);
                alert("Failed to delete workspace. Please try again.");
            }
        }
    };

    const role = currentMemberProfile?.permission_role ?? 'member';
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
    const subtitle = currentMemberProfile?.member_title ? `${roleLabel} · ${currentMemberProfile.member_title}` : roleLabel;

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="w-full flex items-center gap-3 p-2 rounded-2xl text-left border border-slate-200/80 bg-white/60 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] transition-colors"
            >
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent text-on-primary flex items-center justify-center flex-shrink-0 text-sm font-semibold uppercase">
                    {activeWorkspace?.name.charAt(0) ?? '?'}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-text-main dark:text-slate-100 truncate">
                        {activeWorkspace?.name ?? 'No workspace'}
                    </span>
                    {activeWorkspace && <span className="block text-xs text-text-muted truncate">{subtitle}</span>}
                </span>
                <ChevronsUpDown className="w-4 h-4 text-text-muted flex-shrink-0" />
            </button>

            {menuOpen && (
                <div
                    role="menu"
                    className="absolute left-0 right-0 top-full mt-2 z-50 p-1.5 rounded-2xl border border-slate-200/80 bg-white/95 dark:border-white/10 dark:bg-dark-surface/95 backdrop-blur-xl shadow-2xl animate-fade-in"
                >
                    <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Workspaces</p>
                    <div className="max-h-56 overflow-y-auto">
                        {workspaces.map((ws) => {
                            const isActive = ws.id === activeWorkspace?.id;
                            return (
                                <button
                                    key={ws.id}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={isActive}
                                    onClick={() => { setActiveWorkspaceById(ws.id); closeMenu(); }}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-left text-text-main dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                                >
                                    <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/[0.08] text-xs font-semibold uppercase flex items-center justify-center flex-shrink-0">
                                        {ws.name.charAt(0)}
                                    </span>
                                    <span className="flex-1 truncate">{ws.name}</span>
                                    {isActive && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                </button>
                            );
                        })}
                    </div>

                    <div className="my-1.5 h-px bg-slate-200/80 dark:bg-white/10" />

                    {isCreating ? (
                        <form onSubmit={handleCreate} className="p-1.5 space-y-2">
                            <input
                                type="text"
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Workspace name…"
                                aria-label="New workspace name"
                                autoFocus
                                disabled={submitting}
                                className="input-field text-sm py-1.5"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    disabled={submitting || !newName.trim()}
                                    className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-on-primary text-xs font-medium px-3 py-2 rounded-full hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:pointer-events-none"
                                >
                                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                    Create
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setIsCreating(false); setNewName(''); }}
                                    disabled={submitting}
                                    className="text-xs text-text-muted hover:text-text-main dark:hover:text-slate-100 px-3 py-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    ) : (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => setIsCreating(true)}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-text-main dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                        >
                            <Plus className="w-4 h-4 text-primary" />
                            New workspace
                        </button>
                    )}

                    {role === 'owner' && activeWorkspace && !isCreating && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={handleDeleteWorkspace}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                            <span className="truncate">Delete "{activeWorkspace.name}"</span>
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
