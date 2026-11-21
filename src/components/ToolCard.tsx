import { useState } from 'react';
import type { Tool } from '../types';
import { ArrowUpRight, Trash2, Pencil } from 'lucide-react';

interface ToolCardProps {
    tool: Tool;
    onEdit: () => void;
    onDelete: () => void;
}

const hostOf = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
};

export function ToolCard({ tool, onEdit, onDelete }: ToolCardProps) {
    const host = hostOf(tool.link);
    const [iconFailed, setIconFailed] = useState(!host);

    return (
        // The title link is stretched over the whole card, so the card opens the resource
        // while Edit/Delete stay real buttons (not nested inside the link).
        <article className="card-base group relative flex flex-col p-5 animate-fade-in focus-within:border-primary/50">
            <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.06] border border-slate-200/70 dark:border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {iconFailed ? (
                        <span className="text-lg font-semibold uppercase text-primary">{tool.name.charAt(0)}</span>
                    ) : (
                        <img
                            src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
                            alt=""
                            className="w-7 h-7 object-contain"
                            onError={() => setIconFailed(true)}
                        />
                    )}
                </div>

                <div className="flex-1 min-w-0 pt-0.5">
                    {tool.category && (
                        <span className="inline-block max-w-full truncate text-[11px] font-semibold uppercase tracking-wider text-accent">
                            {tool.category}
                        </span>
                    )}
                    <h3 className="text-base font-semibold leading-snug tracking-[-0.01em] text-text-main dark:text-slate-100">
                        <a
                            href={tool.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="outline-none after:absolute after:inset-0 after:rounded-2xl group-hover:text-primary transition-colors"
                        >
                            {tool.name}
                        </a>
                    </h3>
                </div>

                {/* above the stretched link; always visible on touch, on hover/focus on desktop */}
                <div className="relative z-10 flex items-center -mr-1.5 -mt-1 md:absolute md:top-3 md:right-3 md:m-0 md:p-0.5 md:rounded-full md:bg-white/90 md:dark:bg-dark-surface/95 md:backdrop-blur md:shadow-soft md:z-10 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    <button
                        type="button"
                        onClick={onEdit}
                        aria-label={`Edit ${tool.name}`}
                        title="Edit"
                        className="p-2 rounded-full text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onDelete}
                        aria-label={`Delete ${tool.name}`}
                        title="Delete"
                        className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {tool.description && (
                <p className="mt-3 text-sm leading-relaxed text-text-muted line-clamp-2">
                    {tool.description}
                </p>
            )}

            <div className="mt-auto pt-4 flex items-center justify-between gap-3 text-xs text-text-muted">
                <span className="truncate">{host}</span>
                <span className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-100 dark:bg-white/[0.06] group-hover:bg-primary group-hover:text-on-primary transition-colors duration-200">
                    <ArrowUpRight className="w-4 h-4" />
                </span>
            </div>
        </article>
    );
}
