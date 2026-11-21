import { useEffect, useId, useRef } from 'react';
import { Loader2, X } from 'lucide-react';
import { createPortal } from 'react-dom';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    // pinned under the scrolling body, so actions are always visible on long forms
    footer?: React.ReactNode;
    size?: 'md' | 'lg';
    // ask before Escape / backdrop / X throw away unsaved input
    confirmClose?: boolean;
}

export function Modal({ isOpen, onClose, title, children, footer, size = 'md', confirmClose = false }: ModalProps) {
    const titleId = useId();
    const panelRef = useRef<HTMLDivElement>(null);

    const requestClose = () => {
        if (!confirmClose || window.confirm('Discard your changes?')) onClose();
    };
    // the keydown listener always calls the latest version (it changes with confirmClose / onClose)
    const requestCloseRef = useRef(requestClose);
    useEffect(() => { requestCloseRef.current = requestClose; });

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') requestCloseRef.current();
            // Ctrl/Cmd+Enter saves the form inside this modal, from any field
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                panelRef.current?.querySelector('form')?.requestSubmit();
            }
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.style.overflow = 'unset';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-950/30 dark:bg-black/50 backdrop-blur-sm transition-opacity"
                onClick={requestClose}
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`relative w-full ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} bg-white/95 dark:bg-dark-surface/90 backdrop-blur-2xl rounded-3xl shadow-2xl dark:shadow-[0_24px_80px_-12px_rgb(123_187_255/0.25)] animate-fade-in border border-slate-200/70 dark:border-white/10 max-h-[90vh] flex flex-col`}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-dark-border flex-shrink-0">
                    <h2 id={titleId} className="text-xl font-semibold text-text-main dark:text-slate-100">{title}</h2>
                    <button
                        type="button"
                        onClick={requestClose}
                        aria-label="Close"
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text-main dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-5 py-4 overflow-y-auto flex-1">
                    {children}
                </div>
                {footer && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-dark-border flex-shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Footer for form modals: error, Cancel and a submit button tied to the form by id (it sits outside the <form>).
export function ModalActions({ formId, onCancel, submitLabel, loading, error }: {
    formId: string;
    onCancel: () => void;
    submitLabel: string;
    loading: boolean;
    error?: string | null;
}) {
    return (
        <div className="space-y-2">
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            <div className="flex items-center gap-3">
                <span className="hidden sm:block text-xs text-text-muted dark:text-slate-500">
                    {isMac ? '⌘' : 'Ctrl'}+Enter to save
                </span>
                <div className="flex gap-3 ml-auto">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="px-4 py-2 text-text-muted hover:text-text-main dark:text-slate-400 dark:hover:text-slate-100 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button type="submit" form={formId} disabled={loading} className="btn-primary flex items-center gap-2 disabled:opacity-60">
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
