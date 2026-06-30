import { LayoutList, CheckSquare, Library, LogOut, Sun, Moon, X, Plus, Folder, Trash2, Users, Clock } from 'lucide-react';
import type { Project } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { WorkspaceSelector } from './WorkspaceSelector';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

type View = 'tasks' | 'completed' | 'tools' | 'members' | 'work_time';

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

export function Sidebar({ currentView, onViewChange, isOpen, onClose, projects, currentProjectId, onProjectSelect, onNewProject, onDeleteProject }: SidebarProps) {
    const { signOut, user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { currentMemberProfile, activeWorkspace } = useWorkspace();
    
    const canManageProjects = currentMemberProfile?.permission_role === 'owner' || currentMemberProfile?.permission_role === 'admin';

    const navItems: { id: View; label: string; icon: React.ElementType }[] = [
        { id: 'tasks', label: 'Tasks', icon: LayoutList },
        { id: 'completed', label: 'Completed', icon: CheckSquare },
        { id: 'tools', label: 'Resources', icon: Library },
        { id: 'members', label: 'Members', icon: Users },
        ...(activeWorkspace?.time_tracking_enabled && currentMemberProfile?.permission_role !== 'viewer' 
            ? [{ id: 'work_time' as View, label: 'Work Time', icon: Clock }] 
            : [])
    ];

    function cn(...inputs: string[]) {
        return twMerge(clsx(inputs));
    }

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
            <div className={cn(
                "h-[100dvh] w-64 glass-sidebar flex flex-col fixed left-0 top-0 transition-transform duration-300 z-50",
                isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
                <div className="p-6 border-b border-slate-200/50 dark:border-dark-border/50">
                    <div className="flex items-center justify-between mb-4">
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent">
                            Workspace
                        </h1>
                        <button
                            onClick={onClose}
                            className="md:hidden p-1 text-text-muted hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <WorkspaceSelector />
                    <p className="text-xs text-text-muted mt-3 truncate">{user?.email}</p>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                    <nav className="p-4 space-y-2 flex-shrink-0">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = currentView === item.id;

                        return (
                            <button
                                key={item.id}
                                onClick={() => onViewChange(item.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden",
                                    isActive
                                        ? "bg-primary/10 text-primary font-medium"
                                        : "text-text-muted hover:bg-slate-50 hover:text-text-main dark:hover:bg-slate-800 dark:hover:text-slate-100"
                                )}
                            >
                                <Icon className={cn("w-5 h-5 transition-colors", isActive ? "text-primary" : "text-text-muted group-hover:text-text-main dark:group-hover:text-slate-100")} />
                                <span className="relative z-10">{item.label}</span>
                            </button>
                        );
                    })}
                    </nav>

                    {/* Projects Section */}
                    <div className="p-4 border-t border-slate-200/50 dark:border-dark-border/50 flex-shrink-0">
                    <div className="flex items-center justify-between mb-2 px-2">
                        <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider">Projects</h2>
                        {canManageProjects && (
                            <button
                                onClick={onNewProject}
                                className="p-1 text-primary hover:bg-primary/10 rounded transition-colors"
                                title="New Project"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                    
                    <div className="space-y-1">
                        <button
                            onClick={() => onProjectSelect(null)}
                            className={cn(
                                "w-full flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-all duration-200",
                                currentProjectId === null
                                    ? "bg-slate-100 dark:bg-slate-800 text-text-main dark:text-slate-100 font-medium"
                                    : "text-text-muted hover:bg-slate-50 hover:text-text-main dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                            )}
                        >
                            <Folder className={cn("w-4 h-4", currentProjectId === null ? "text-primary" : "")} />
                            All Projects
                        </button>

                        {projects.map(project => (
                            <div key={project.id} className="relative group flex items-center">
                                <button
                                    onClick={() => onProjectSelect(project.id)}
                                    className={cn(
                                        "flex-1 flex items-center gap-3 px-4 py-2 rounded-xl text-sm transition-all duration-200 truncate pr-10",
                                        currentProjectId === project.id
                                            ? "bg-primary/10 text-primary font-medium"
                                            : "text-text-muted hover:bg-slate-50 hover:text-text-main dark:hover:bg-slate-800/50 dark:hover:text-slate-200"
                                    )}
                                >
                                    <span className={cn(
                                        "w-2 h-2 rounded-full flex-shrink-0",
                                        currentProjectId === project.id ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
                                    )} />
                                    <span className="truncate">{project.name}</span>
                                </button>
                                {canManageProjects && (
                                    <button
                                        onClick={(e) => onDeleteProject(project.id, e)}
                                        className="absolute right-2 opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
                                        title="Delete Project"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                </div>

                <div className="p-4 border-t border-slate-200/50 dark:border-dark-border/50 space-y-2 flex-shrink-0">
                    <button
                        onClick={toggleTheme}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text-muted hover:bg-slate-50 hover:text-text-main dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-all duration-200"
                    >
                        {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                        {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
                    </button>

                    <button
                        onClick={() => signOut()}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-all duration-200"
                    >
                        <LogOut className="w-5 h-5" />
                        Sign Out
                    </button>
                </div>
            </div>
        </>
    );
}
