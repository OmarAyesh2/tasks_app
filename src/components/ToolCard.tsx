import type { Tool } from '../types';
import { ArrowUpRight, Trash2, Pencil } from 'lucide-react';

interface ToolCardProps {
    tool: Tool;
    onEdit: () => void;
    onDelete: () => void;
}

export function ToolCard({ tool, onEdit, onDelete }: ToolCardProps) {
    const getFavicon = (url: string) => {
        try {
            const domain = new URL(url).hostname;
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
        } catch {
            return '';
        }
    };

    return (
        <a
            href={tool.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block relative bg-white dark:bg-dark-surface rounded-2xl p-6 border border-slate-100 dark:border-dark-border shadow-soft hover:shadow-soft-hover dark:shadow-none dark:hover:bg-slate-800 transition-all duration-300 animate-fade-in"
        >
            <div className="absolute bottom-4 right-4 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10">
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 rounded-lg transition-colors"
                    title="Edit tool"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete tool"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
            <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center overflow-hidden group-hover:scale-110 transition-transform duration-300">
                    <img
                        src={getFavicon(tool.link)}
                        alt={tool.name}
                        className="w-8 h-8 object-contain"
                        onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://www.google.com/s2/favicons?domain=google.com&sz=64'; // Fallback
                        }}
                    />
                </div>
                <div className="p-2 rounded-full bg-slate-50 dark:bg-slate-800 text-text-muted group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                    <ArrowUpRight className="w-4 h-4" />
                </div>
            </div>

            <h3 className="text-lg font-semibold text-text-main dark:text-slate-100 group-hover:text-primary transition-colors mb-2">
                {tool.name}
            </h3>

            {tool.description && (
                <p className="text-sm text-text-muted line-clamp-2">
                    {tool.description}
                </p>
            )}
        </a>
    );
}
