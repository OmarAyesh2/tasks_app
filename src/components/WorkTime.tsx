import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useWorkspace } from '../context/WorkspaceContext';
import type { WorkspaceMember } from '../context/WorkspaceContext';
import { Loader2, LogIn, LogOut } from 'lucide-react';

interface AttendanceLog {
    id: string;
    user_id: string;
    workspace_id: string;
    check_in_at: string;
    check_out_at: string | null;
}

const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];
const currentYear = new Date().getFullYear();
const years = [currentYear - 1, currentYear, currentYear + 1];

const calculateHours = (inAt: string, outAt: string | null) => {
    if (!outAt) return null;
    const start = new Date(inAt).getTime();
    const end = new Date(outAt).getTime();
    const diffHours = (end - start) / (1000 * 60 * 60);
    return diffHours.toFixed(2);
};

export function WorkTime() {
    const { currentMemberProfile, activeWorkspace } = useWorkspace();
    const [activeLog, setActiveLog] = useState<AttendanceLog | null>(null);
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState(false);

    const [logs, setLogs] = useState<AttendanceLog[]>([]);
    const [selectedYear, setSelectedYear] = useState(currentYear);
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [loadingLogs, setLoadingLogs] = useState(false);
    
    const [targetUserId, setTargetUserId] = useState<string>(currentMemberProfile?.user_id || '');
    const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
    const isOwner = currentMemberProfile?.permission_role === 'owner' || currentMemberProfile?.permission_role === 'admin';

    // Fetch members for owner filter
    useEffect(() => {
        let isMounted = true;
        async function fetchMembers() {
            if (!supabase || !activeWorkspace || !isOwner) return;
            const { data, error } = await supabase
                .from('workspace_members')
                .select('*')
                .eq('workspace_id', activeWorkspace.id)
                .neq('status', 'left')
                .neq('permission_role', 'viewer')
                .not('user_id', 'is', null)
                .order('email', { ascending: true });

            if (error) {
                console.error('Error fetching members:', error);
            } else if (isMounted && data) {
                setWorkspaceMembers(data as WorkspaceMember[]);
            }
        }
        fetchMembers();
        return () => { isMounted = false; };
    }, [activeWorkspace?.id, isOwner]);

    // Ensure targetUserId updates if currentMemberProfile.user_id becomes available after mount
    useEffect(() => {
        if (currentMemberProfile?.user_id && !targetUserId) {
            setTargetUserId(currentMemberProfile.user_id);
        }
    }, [currentMemberProfile?.user_id, targetUserId]);

    useEffect(() => {
        let isMounted = true;

        async function fetchActiveSession() {
            if (!supabase || !currentMemberProfile?.user_id) {
                if (isMounted) setLoading(false);
                return;
            }

            try {
                const { data, error } = await supabase
                    .from('attendance_logs')
                    .select('*')
                    .eq('user_id', currentMemberProfile.user_id)
                    .is('check_out_at', null)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching active session:', error);
                } else if (isMounted) {
                    setActiveLog(data);
                }
            } catch (err) {
                console.error('Failed to fetch active session', err);
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        fetchActiveSession();

        return () => {
            isMounted = false;
        };
    }, [currentMemberProfile?.user_id]);

    useEffect(() => {
        let isMounted = true;
        async function fetchLogs() {
            if (!supabase || !activeWorkspace || !targetUserId) return;
            setLoadingLogs(true);
            try {
                const start = new Date(selectedYear, selectedMonth, 1);
                const end = new Date(selectedYear, selectedMonth + 1, 1);

                const { data, error } = await supabase
                    .from('attendance_logs')
                    .select('*')
                    .eq('workspace_id', activeWorkspace.id)
                    .eq('user_id', targetUserId)
                    .gte('check_in_at', start.toISOString())
                    .lt('check_in_at', end.toISOString())
                    .order('check_in_at', { ascending: false });

                if (error) {
                    console.error('Error fetching logs:', error);
                } else if (isMounted) {
                    setLogs(data || []);
                }
            } catch (err) {
                console.error('Failed to fetch logs:', err);
            } finally {
                if (isMounted) setLoadingLogs(false);
            }
        }
        fetchLogs();
        return () => { isMounted = false; };
    }, [activeWorkspace?.id, targetUserId, selectedYear, selectedMonth, activeLog]);

    const handleClockToggle = async () => {
        if (!supabase || !currentMemberProfile?.user_id || !activeWorkspace) return;
        setToggling(true);

        try {
            if (!activeLog) {
                // Clocking In
                const { data, error } = await supabase
                    .from('attendance_logs')
                    .insert({
                        workspace_id: activeWorkspace.id,
                        user_id: currentMemberProfile.user_id,
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('Error clocking in:', error);
                    alert('Failed to clock in. Please try again.');
                } else if (data) {
                    setActiveLog(data);
                }
            } else {
                // Clocking Out
                const { error } = await supabase
                    .from('attendance_logs')
                    .update({
                        check_out_at: new Date().toISOString(),
                    })
                    .eq('id', activeLog.id);

                if (error) {
                    console.error('Error clocking out:', error);
                    alert('Failed to clock out. Please try again.');
                } else {
                    setActiveLog(null);
                }
            }
        } catch (err) {
            console.error('Failed to toggle clock status', err);
        } finally {
            setToggling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl space-y-6">
            <div className="card-base p-6 border-l-4 border-l-primary">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-text-main dark:text-slate-100 mb-1">
                            Work Time
                        </h2>
                        <p className="text-sm text-text-muted dark:text-slate-400">
                            Track your working hours and attendance in this workspace.
                        </p>
                    </div>

                    <button
                        onClick={handleClockToggle}
                        disabled={toggling}
                        className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                            activeLog
                                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-500/25'
                                : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/25'
                        }`}
                    >
                        {toggling ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Processing...
                            </>
                        ) : activeLog ? (
                            <>
                                <LogOut className="w-5 h-5" />
                                Check Out
                            </>
                        ) : (
                            <>
                                <LogIn className="w-5 h-5" />
                                Check In
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* History Section */}
            <div className="card-base p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="text-lg font-semibold text-text-main dark:text-slate-100">
                        Attendance History
                    </h3>
                    <div className="flex flex-wrap items-center gap-3">
                        {isOwner && workspaceMembers.length > 0 && (
                            <select
                                value={targetUserId}
                                onChange={(e) => setTargetUserId(e.target.value)}
                                className="input-field py-1.5 text-sm min-w-[150px]"
                            >
                                {workspaceMembers.map(member => (
                                    <option key={member.user_id!} value={member.user_id!}>
                                        {member.email} {member.user_id === currentMemberProfile?.user_id ? '(Me)' : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="input-field py-1.5 text-sm w-32"
                        >
                            {months.map((m, i) => (
                                <option key={i} value={i}>{m}</option>
                            ))}
                        </select>
                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="input-field py-1.5 text-sm w-24"
                        >
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {loadingLogs ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary/50" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-8 text-text-muted dark:text-slate-400">
                        No logs found for this period.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead>
                                <tr className="text-text-muted dark:text-slate-400 border-b border-slate-100 dark:border-dark-border">
                                    <th className="pb-3 font-semibold">Date</th>
                                    <th className="pb-3 font-semibold">Clock In</th>
                                    <th className="pb-3 font-semibold">Clock Out</th>
                                    <th className="pb-3 font-semibold text-right">Total Hours</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-dark-border">
                                {logs.map(log => {
                                    const dateObj = new Date(log.check_in_at);
                                    const dateStr = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
                                    const inTime = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                                    const outTime = log.check_out_at ? new Date(log.check_out_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '---';
                                    const hours = calculateHours(log.check_in_at, log.check_out_at);

                                    return (
                                        <tr key={log.id} className="text-text-main dark:text-slate-100 group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            <td className="py-3">{dateStr}</td>
                                            <td className="py-3">{inTime}</td>
                                            <td className="py-3">{outTime}</td>
                                            <td className="py-3 text-right">
                                                {hours ? (
                                                    <span className="font-medium">{hours} hrs</span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary uppercase tracking-wide">
                                                        In Progress
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
