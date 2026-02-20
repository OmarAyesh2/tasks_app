import type { Task } from '../types';
import { Check, Link as LinkIcon, ExternalLink, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface TaskCardProps {
    task: Task;
    onStatusChange: (task: Task) => void;
    onDelete: () => void;
}

export function TaskCard({ task, onStatusChange, onDelete }: TaskCardProps) {
    function cn(...inputs: string[]) {
        return twMerge(clsx(inputs));
    }

    const isDone = task.status === 'done';

    return (
        <div className="group relative bg-white dark:bg-dark-surface rounded-xl p-5 border border-slate-100 dark:border-dark-border shadow-soft hover:shadow-soft-hover dark:shadow-none dark:hover:bg-slate-800 transition-all duration-300 animate-fade-in pr-10">
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200"
                title="Delete task"
            >
                <Trash2 className="w-4 h-4" />
            </button>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onStatusChange(task)}
                            className={cn(
                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                                isDone
                                    ? "bg-green-500 border-green-500 text-white"
                                    : "border-slate-300 dark:border-slate-600 hover:border-primary text-transparent"
                            )}
                        >
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </button>
                        <h3 className={cn(
                            "text-lg font-medium transition-all duration-200",
                            isDone ? "text-text-muted line-through" : "text-text-main dark:text-slate-200"
                        )}>
                            {task.name}
                        </h3>
                    </div>

                    {task.description && (
                        <p className="text-text-muted text-sm pl-9">{task.description}</p>
                    )}

                    {task.links && task.links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pl-9 pt-1">
                            {task.links.map((link, idx) => (
                                <a
                                    key={idx}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800 text-xs font-medium text-primary hover:bg-primary/10 hover:underline transition-colors border border-slate-100 dark:border-slate-700"
                                >
                                    <LinkIcon className="w-3 h-3" />
                                    {link.name}
                                    <ExternalLink className="w-3 h-3 opacity-50" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
