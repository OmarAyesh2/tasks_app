import { LayoutList, CheckSquare, Wrench, LogOut, Sun, Moon, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

type View = 'tasks' | 'completed' | 'tools';

interface SidebarProps {
    currentView: View;
    onViewChange: (view: View) => void;
    isOpen?: boolean;
    onClose?: () => void;
}

export function Sidebar({ currentView, onViewChange, isOpen, onClose }: SidebarProps) {
    const { signOut, user } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const navItems = [
        { id: 'tasks', label: 'Tasks', icon: LayoutList },
        { id: 'completed', label: 'Completed', icon: CheckSquare },
        { id: 'tools', label: 'Tools', icon: Wrench },
    ] as const;

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
                "h-screen w-64 glass-sidebar flex flex-col fixed left-0 top-0 transition-transform duration-300 z-50",
                isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
            )}>
                <div className="p-6 border-b border-slate-200/50 dark:border-dark-border/50 flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent">
                            Workspace
                        </h1>
                        <p className="text-xs text-text-muted mt-1 truncate max-w-[150px]">{user?.email}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="md:hidden p-1 text-text-muted hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
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

                <div className="p-4 border-t border-slate-200/50 dark:border-dark-border/50 space-y-2">
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
