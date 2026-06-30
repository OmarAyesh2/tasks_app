import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '../context/WorkspaceContext';
import { supabase } from '../lib/supabase';
import {
    Loader2,
    Mail,
    Send,
    Shield,
    UserPlus,
    Users,
    Briefcase,
    CheckCircle2,
    Clock,
    LogOut,
} from 'lucide-react';
import type { WorkspaceMember, WorkspaceRole } from '../context/WorkspaceContext';

export function MemberManagement() {
    const {
        activeWorkspace,
        currentMemberProfile,
        inviteUser,
        leaveWorkspace,
        refreshWorkspaces,
        setActiveWorkspace,
    } = useWorkspace();

    // ---------------------------------------------------------------
    // Member list state
    // ---------------------------------------------------------------
    const [members, setMembers] = useState<WorkspaceMember[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(true);

    // ---------------------------------------------------------------
    // Invite form state
    // ---------------------------------------------------------------
    const [email, setEmail] = useState('');
    const [role, setRole] = useState<WorkspaceRole>('member');
    const [title, setTitle] = useState('');
    const [sending, setSending] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    const isAdmin =
        currentMemberProfile?.permission_role === 'owner' ||
        currentMemberProfile?.permission_role === 'admin';

    const isOwner = currentMemberProfile?.permission_role === 'owner';

    // ---------------------------------------------------------------
    // Time tracking toggle
    // ---------------------------------------------------------------
    const [updatingTracking, setUpdatingTracking] = useState(false);

    const handleToggleTimeTracking = async () => {
        if (!activeWorkspace) return;
        setUpdatingTracking(true);
        const newState = !activeWorkspace.time_tracking_enabled;
        
        console.log(`[Time Tracking] Toggling for workspace ID: ${activeWorkspace.id}`);
        console.log(`[Time Tracking] Target state: ${newState}`);

        try {
            const { data, error } = await supabase!
                .from('workspaces')
                .update({ time_tracking_enabled: newState })
                .eq('id', activeWorkspace.id)
                .select();
            
            console.log(`[Time Tracking] Update response data:`, data);
            
            if (error) throw error;
            
            if (data && data[0]) {
                setActiveWorkspace(data[0] as typeof activeWorkspace);
            } else {
                await refreshWorkspaces();
            }
        } catch (error) {
            console.error('Error toggling time tracking:', error);
            alert('Failed to update time tracking setting.');
        } finally {
            setUpdatingTracking(false);
        }
    };

    // ---------------------------------------------------------------
    // Fetch members
    // ---------------------------------------------------------------
    const fetchMembers = useCallback(async () => {
        if (!supabase || !activeWorkspace) {
            setMembers([]);
            setLoadingMembers(false);
            return;
        }

        setLoadingMembers(true);
        try {
            const { data, error } = await supabase
                .from('workspace_members')
                .select('*')
                .eq('workspace_id', activeWorkspace.id)
                .neq('status', 'left')
                .order('status', { ascending: true })
                .order('permission_role', { ascending: true });

            if (error) {
                console.error('Error fetching members:', error);
                return;
            }

            setMembers((data ?? []) as WorkspaceMember[]);
        } finally {
            setLoadingMembers(false);
        }
    }, [activeWorkspace]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    // ---------------------------------------------------------------
    // Handle invite submit
    // ---------------------------------------------------------------
    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) return;

        setSending(true);
        setFeedback(null);
        try {
            const ok = await inviteUser(trimmedEmail, role, title.trim());
            if (ok) {
                setFeedback({ type: 'success', message: `Invitation sent to ${trimmedEmail}` });
                setEmail('');
                setTitle('');
                setRole('member');
                await fetchMembers();
            } else {
                setFeedback({ type: 'error', message: 'Failed to send invitation. Please try again.' });
            }
        } finally {
            setSending(false);
        }
    };

    // ---------------------------------------------------------------
    // Role badge helper
    // ---------------------------------------------------------------
    const roleBadge = (r: WorkspaceRole) => {
        const map: Record<WorkspaceRole, string> = {
            owner: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
            admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
            member: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-700/40 dark:text-slate-400',
        };
        return (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md ${map[r]}`}>
                <Shield className="w-2.5 h-2.5" />
                {r}
            </span>
        );
    };

    const statusBadge = (status: WorkspaceMember['status']) => {
        if (status === 'active') {
            return (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" />
                    Active
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                <Clock className="w-3 h-3" />
                Invited
            </span>
        );
    };

    // ---------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------
    if (!activeWorkspace) {
        return (
            <div className="text-center py-12 text-text-muted dark:text-slate-400">
                <p>Select a workspace to manage members.</p>
            </div>
        );
    }

    return (
        <div className="max-w-3xl space-y-8">
            {/* Owner Feature Toggles */}
            {isOwner && (
                <div className="card-base p-6 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Clock className="w-5 h-5 text-primary" />
                            <h2 className="text-lg font-semibold text-text-main dark:text-slate-100">
                                Enable Employee Time Tracking
                            </h2>
                        </div>
                        <p className="text-sm text-text-muted dark:text-slate-400">
                            Allow team members to log hours spent on workspace tasks.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleToggleTimeTracking}
                        disabled={updatingTracking}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 ${
                            activeWorkspace.time_tracking_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                        } ${updatingTracking ? 'opacity-50 cursor-not-allowed' : ''}`}
                        role="switch"
                        aria-checked={!!activeWorkspace.time_tracking_enabled}
                    >
                        <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                activeWorkspace.time_tracking_enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                    </button>
                </div>
            )}

            {/* Invite Form — only for owners/admins */}
            {isAdmin && (
                <div className="card-base p-6">
                    <div className="flex items-center gap-2 mb-5">
                        <UserPlus className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-text-main dark:text-slate-100">
                            Invite Team Member
                        </h2>
                    </div>

                    <form onSubmit={handleInvite} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="input-field pl-10"
                                    placeholder="colleague@company.com"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Role */}
                            <div>
                                <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">
                                    Permission Level
                                </label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as WorkspaceRole)}
                                    className="input-field"
                                >
                                    <option value="admin">Admin</option>
                                    <option value="member">Member</option>
                                    <option value="viewer">Viewer</option>
                                </select>
                            </div>

                            {/* Title */}
                            <div>
                                <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">
                                    Job Title
                                </label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="input-field"
                                    placeholder="e.g. Graphic Designer"
                                />
                            </div>
                        </div>

                        {/* Feedback */}
                        {feedback && (
                            <div className={`text-sm px-3 py-2 rounded-lg ${
                                feedback.type === 'success'
                                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                    : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800'
                            }`}>
                                {feedback.message}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={sending || !email.trim()}
                                className="btn-primary flex items-center gap-2"
                            >
                                {sending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                                Send Invite
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Members List */}
            <div className="card-base overflow-hidden">
                <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100 dark:border-dark-border">
                    <Users className="w-5 h-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-main dark:text-slate-100">
                        Workspace Members
                    </h2>
                    <span className="ml-auto text-xs text-text-muted bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {members.length}
                    </span>
                </div>

                {loadingMembers ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
                    </div>
                ) : members.length === 0 ? (
                    <div className="text-center py-10 text-text-muted dark:text-slate-400">
                        <p>No members found in this workspace.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-dark-border">
                        {members.map((member) => (
                            <li
                                key={member.id}
                                className="px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                            >
                                {/* Avatar circle */}
                                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                    <span className="text-sm font-semibold text-primary uppercase">
                                        {member.email?.charAt(0) ?? '?'}
                                    </span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-text-main dark:text-slate-100 truncate">
                                        {member.email}
                                    </p>
                                    {member.member_title && (
                                        <p className="text-xs text-text-muted dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                            <Briefcase className="w-3 h-3 flex-shrink-0" />
                                            {member.member_title}
                                        </p>
                                    )}
                                </div>

                                {/* Badges */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {statusBadge(member.status)}
                                    {roleBadge(member.permission_role)}
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Leave Workspace */}
            {!isOwner && (
                <div className="card-base p-6 border-red-100 dark:border-red-900/30">
                    <div className="flex items-center gap-2 mb-2 text-red-600 dark:text-red-400">
                        <LogOut className="w-5 h-5" />
                        <h2 className="text-lg font-semibold">Leave Workspace</h2>
                    </div>
                    <p className="text-sm text-text-muted dark:text-slate-400 mb-4">
                        You will lose access to all tasks, resources, and projects in this workspace.
                    </p>
                    <button
                        onClick={async () => {
                            if (window.confirm('Are you sure you want to leave this workspace? This action cannot be undone.')) {
                                await leaveWorkspace();
                            }
                        }}
                        className="px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 dark:text-red-400 rounded-lg font-medium transition-colors"
                    >
                        Leave Workspace
                    </button>
                </div>
            )}
        </div>
    );
}
