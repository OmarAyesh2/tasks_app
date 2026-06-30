import { useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { ChevronDown, Plus, Loader2, Shield, Briefcase, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

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

    const [isCreating, setIsCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ---------------------------------------------------------------
    // Loading state
    // ---------------------------------------------------------------
    if (loading) {
        return (
            <div className="px-4 py-3 flex items-center gap-2 text-text-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-xs">Loading workspaces…</span>
            </div>
        );
    }

    // ---------------------------------------------------------------
    // Create workspace handler
    // ---------------------------------------------------------------
    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = newName.trim();
        if (!trimmed) return;

        setSubmitting(true);
        try {
            await createWorkspace(trimmed);
            setNewName('');
            setIsCreating(false);
        } finally {
            setSubmitting(false);
        }
    };

    // ---------------------------------------------------------------
    // Delete workspace handler
    // ---------------------------------------------------------------
    const handleDeleteWorkspace = async () => {
        if (!activeWorkspace) return;
        if (window.confirm("Are you sure you want to permanently delete this workspace? This will erase all tasks, projects, and data for everyone.")) {
            try {
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

    // ---------------------------------------------------------------
    // Role badge color
    // ---------------------------------------------------------------
    const roleBadgeClasses: Record<string, string> = {
        owner: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
        member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
        viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400',
    };

    const role = currentMemberProfile?.permission_role ?? 'member';

    return (
        <div className="space-y-3">
            {/* Workspace Dropdown */}
            <div className="relative">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5 px-1">
                    Workspace
                </label>
                <div className="relative">
                    <select
                        value={activeWorkspace?.id ?? ''}
                        onChange={(e) => setActiveWorkspaceById(e.target.value)}
                        disabled={workspaces.length === 0}
                        className="w-full appearance-none bg-white/60 dark:bg-dark-surface/60 border border-slate-200/80 dark:border-dark-border text-text-main dark:text-slate-100 text-sm font-medium py-2 pl-3 pr-9 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer truncate"
                    >
                        {workspaces.length === 0 && (
                            <option value="">No workspaces</option>
                        )}
                        {workspaces.map((ws) => (
                            <option key={ws.id} value={ws.id}>
                                {ws.name}
                            </option>
                        ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-text-muted">
                        <ChevronDown className="w-4 h-4" />
                    </div>
                </div>
            </div>

            {/* Member Info */}
            {currentMemberProfile && (
                <div className="flex items-center gap-2 flex-wrap px-1">
                    {currentMemberProfile.member_title && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                            <Briefcase className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate max-w-[120px]">{currentMemberProfile.member_title}</span>
                        </span>
                    )}
                    <div className="flex items-center gap-1">
                        <span className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wide rounded-md ${role === 'owner' ? 'text-[11px] px-2 py-1' : 'text-[10px] px-1.5 py-0.5'} ${roleBadgeClasses[role]}`}>
                            <Shield className={role === 'owner' ? "w-3 h-3" : "w-2.5 h-2.5"} />
                            {role}
                        </span>
                        {role === 'owner' && (
                            <button
                                onClick={handleDeleteWorkspace}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 rounded-md transition-colors"
                                title="Delete Workspace"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Create Workspace Toggle / Form */}
            {!isCreating ? (
                <button
                    onClick={() => setIsCreating(true)}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-text-muted hover:bg-slate-50 hover:text-text-main dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-all duration-200"
                >
                    <Plus className="w-3.5 h-3.5" />
                    New Workspace
                </button>
            ) : (
                <form onSubmit={handleCreate} className="space-y-2">
                    <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Workspace name…"
                        autoFocus
                        disabled={submitting}
                        className="w-full text-sm px-3 py-2 rounded-xl border border-slate-200 bg-white/50 focus:bg-white focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all outline-none dark:bg-slate-900/50 dark:border-dark-border dark:text-slate-100 dark:focus:bg-dark-surface"
                    />
                    <div className="flex items-center gap-2">
                        <button
                            type="submit"
                            disabled={submitting || !newName.trim()}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 hover:bg-primary-hover active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                        >
                            {submitting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Plus className="w-3.5 h-3.5" />
                            )}
                            Create
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsCreating(false); setNewName(''); }}
                            disabled={submitting}
                            className="text-xs text-text-muted hover:text-text-main dark:hover:text-slate-100 px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}
