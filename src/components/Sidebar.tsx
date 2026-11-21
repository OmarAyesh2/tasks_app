import { LayoutList, CheckSquare, Library, LogOut, Sun, Moon, X, Plus, Layers, FolderOpen, Trash2, Users, Clock, ContactRound } from 'lucide-react';
import type { Project } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { WorkspaceSelector } from './WorkspaceSelector';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

type View = 'tasks' | 'completed' | 'tools' | 'members' | 'work_time' | 'clients' | 'files';

interface SidebarProps {
    currentView: View;
    onViewChange: (view: View) => void;
    isOpen?: boolean;
    onClose?: () => void;
    projects: Project[];
    currentProjectId: string | null;
    onProjectSelect: (id: string | null) => void;
    onNewProject: () => void;
    onDeleteProject: (projectId: string, e: React.MouseEvent) => void;
}

// a stable color per project, so each one is easy to spot in the list
const PROJECT_DOTS = ['bg-primary', 'bg-accent', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-sky-400'];

function cn(...inputs: string[]) {
    return twMerge(clsx(inputs));
}

export function Sidebar({ currentView, onViewChange, isOpen, onClose, projects, currentProjectId, onProjectSelect, onNewProject, onDeleteProject }: SidebarProps) {
    const { signOut, user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { currentMemberProfile, activeWorkspace } = useWorkspace();

    const canManageProjects = currentMemberProfile?.permission_role === 'owner' || currentMemberProfile?.permission_role === 'admin';

    const navItems: { id: View; label: string; icon: React.ElementType }[] = [
        { id: 'tasks', label: 'Tasks', icon: LayoutList },
        { id: 'completed', label: 'Completed', icon: CheckSquare },
        { id: 'tools', label: 'Resources', icon: Library },
        { id: 'files', label: 'Files', icon: FolderOpen },
        { id: 'members', label: 'Members', icon: Users },
        ...(activeWorkspace?.time_tracking_enabled && currentMemberProfile?.permission_role !== 'viewer'
            ? [{ id: 'work_time' as View, label: 'Work Time', icon: Clock }]
            : []),
        ...(activeWorkspace?.enable_client_tracker
            ? [{ id: 'clients' as View, label: 'Clients', icon: ContactRound }]
            : [])
    ];

    const projectRow = (active: boolean) => cn(
        "w-full flex items-center gap-3 pl-3 pr-9 py-2 rounded-xl text-sm text-left transition-colors duration-200",
        active
            ? "bg-primary/10 text-text-main font-medium dark:bg-white/[0.07] dark:text-slate-100"
            : "text-text-muted hover:bg-slate-100/70 hover:text-text-main dark:hover:bg-white/[0.04] dark:hover:text-slate-100"
    );

    return (
        <>
            {/* Mobile Backdrop */}
            <div
                className={cn(
                    "fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300 md:hidden",
                    isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
                onClick={onClose}
            />

            {/* Sidebar */}
            <aside className={cn(
                "h-[100dvh] w-64 glass-sidebar flex flex-col fixed left-0 top-0 transition-transform duration-300 z-50",
                isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
                {/* Brand + workspace */}
                <div className="px-4 pt-5 pb-4 space-y-4 flex-shrink-0">
                    <div className="flex items-center justify-between px-1">
                        <h1 className="flex items-center gap-2.5 text-lg font-semibold tracking-wide text-text-main dark:text-slate-100">
                            <img src="/logo.svg" alt="" className="w-8 h-8" />
                            Workspace
                        </h1>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close menu"
                            className="md:hidden p-2 -mr-2 text-text-muted hover:bg-slate-100 dark:hover:bg-white/[0.06] rounded-full transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <WorkspaceSelector />
                </div>

                {/* Main navigation */}
                <nav aria-label="Main" className="px-3 space-y-1 flex-shrink-0">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentView === item.id;

                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onViewChange(item.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={cn(
                                    "w-full flex items-center gap-3 p-1 pr-4 rounded-full transition-colors duration-200 group",
                                    isActive
                                        ? "bg-primary/10 text-text-main font-medium dark:bg-white/[0.06] dark:text-slate-100"
                                        : "text-text-muted hover:bg-slate-100/70 hover:text-text-main dark:hover:bg-white/[0.04] dark:hover:text-slate-100"
                                )}
                            >
                                {/* round icon badge; the active one gets the brand gradient and glow */}
                                <span className={cn(
                                    "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200",
                                    isActive
                                        ? "bg-gradient-to-br from-primary to-accent text-on-primary shadow-glow"
                                        : "bg-slate-100 text-text-muted group-hover:text-text-main dark:bg-white/[0.06] dark:group-hover:text-slate-100"
                                )}>
                                    <Icon className="w-4 h-4" />
                                </span>
                                <span className="text-sm">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* Projects: takes all remaining height and scrolls on its own */}
                <section aria-labelledby="sidebar-projects" className="mt-4 mx-3 pt-4 border-t border-slate-200/70 dark:border-white/10 flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center justify-between px-3 mb-2">
                        <h2 id="sidebar-projects" className="text-[11px] font-semibold text-text-muted uppercase tracking-wider">Projects</h2>
                        {canManageProjects && (
                            <button
                                type="button"
                                onClick={onNewProject}
                                aria-label="New project"
                                title="New project"
                                className="p-1.5 -mr-1.5 text-primary hover:bg-primary/10 rounded-full transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5 pb-2">
                        <button
                            type="button"
                            onClick={() => onProjectSelect(null)}
                            aria-current={currentProjectId === null ? 'true' : undefined}
                            className={projectRow(currentProjectId === null)}
                        >
                            <Layers className={cn("w-4 h-4 flex-shrink-0", currentProjectId === null ? "text-primary" : "")} />
                            All projects
                        </button>

                        {projects.map((project, i) => {
                            const isActive = currentProjectId === project.id;
                            return (
                                <div key={project.id} className="relative group">
                                    <button
                                        type="button"
                                        onClick={() => onProjectSelect(project.id)}
                                        aria-current={isActive ? 'true' : undefined}
                                        className={projectRow(isActive)}
                                    >
                                        <span className={cn(
                                            "w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform",
                                            PROJECT_DOTS[i % PROJECT_DOTS.length],
                                            isActive ? "scale-110 ring-4 ring-primary/15" : ""
                                        )} />
                                        <span className="truncate">{project.name}</span>
                                    </button>
                                    {canManageProjects && (
                                        <button
                                            type="button"
                                            onClick={(e) => onDeleteProject(project.id, e)}
                                            aria-label={`Delete project ${project.name}`}
                                            title="Delete project"
                                            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}

                        {projects.length === 0 && (
                            <p className="px-3 py-2 text-xs text-text-muted">
                                {canManageProjects ? 'No projects yet. Use + to add one.' : 'No projects yet.'}
                            </p>
                        )}
                    </div>
                </section>

                {/* Account */}
                <div className="mx-3 py-3 border-t border-slate-200/70 dark:border-white/10 flex items-center gap-2 flex-shrink-0">
                    <span className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/[0.08] text-text-main dark:text-slate-100 text-xs font-semibold uppercase flex items-center justify-center flex-shrink-0">
                        {user?.email?.charAt(0) ?? '?'}
                    </span>
                    <span className="flex-1 min-w-0 text-xs text-text-muted truncate" title={user?.email}>{user?.email}</span>
                    <button
                        type="button"
                        onClick={toggleTheme}
                        aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
                        title={theme === 'light' ? 'Dark mode' : 'Light mode'}
                        className="p-2 rounded-full text-text-muted hover:text-text-main hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                    >
                        {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => signOut()}
                        aria-label="Sign out"
                        title="Sign out"
                        className="p-2 rounded-full text-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </aside>
        </>
    );
}
