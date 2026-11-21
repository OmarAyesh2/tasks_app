import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileQuestion, Loader2, Music, X } from 'lucide-react';
import { driveAction, downloadDriveFile } from '../lib/supabase';

export type ViewerFile = { id: string; name: string; fallbackUrl?: string };
type Preview = { url: string; mimeType: string } | { error: string };
const isText = (t: string) => t.startsWith('text/') || t === 'application/json';
const TEXT_LIMIT = 500_000; // shortcut: long text files show their first 500k characters; download for the rest

interface FileViewerProps {
    workspaceId: string;
    files: ViewerFile[];
    startIndex: number;
    onClose: () => void;
}

// Full-screen preview. Files load from a short-lived signed link, so Drive stays private;
// Google Docs and Office files arrive as PDF snapshots.
export function FileViewer({ workspaceId, files, startIndex, onClose }: FileViewerProps) {
    const [index, setIndex] = useState(startIndex);
    const [previews, setPreviews] = useState<Record<string, Preview>>({});
    const [loadedId, setLoadedId] = useState<string | null>(null);
    const [failedId, setFailedId] = useState<string | null>(null);
    const [zoomed, setZoomed] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [texts, setTexts] = useState<Record<string, string>>({});
    const requested = useRef(new Set<string>());
    const closeRef = useRef<HTMLButtonElement>(null);

    const file = files[index];
    const preview = previews[file.id];
    const hasPrev = index > 0;
    const hasNext = index < files.length - 1;

    // links for this file and its neighbours, so stepping through feels instant
    useEffect(() => {
        for (const f of [files[index], files[index + 1], files[index - 1]]) {
            if (!f || requested.current.has(f.id)) continue;
            requested.current.add(f.id);
            driveAction<{ url: string; mimeType: string }>({ action: 'preview', workspaceId, fileId: f.id })
                .then(p => setPreviews(s => ({ ...s, [f.id]: p })))
                .catch(e => setPreviews(s => ({ ...s, [f.id]: { error: e instanceof Error ? e.message : 'Could not open this file' } })));
        }
    }, [index, files, workspaceId]);

    // text files are read and shown in a panel, styled like the app
    useEffect(() => {
        if (!preview || 'error' in preview || !isText(preview.mimeType) || texts[file.id] !== undefined) return;
        let cancelled = false;
        fetch(preview.url)
            .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.text(); })
            .then(t => { if (!cancelled) setTexts(s => ({ ...s, [file.id]: t.slice(0, TEXT_LIMIT) })); })
            .catch(() => { if (!cancelled) setFailedId(file.id); });
        return () => { cancelled = true; };
    }, [preview, file.id, texts]);

    const go = (step: number) => {
        setIndex(i => Math.min(files.length - 1, Math.max(0, i + step)));
        setZoomed(false);
    };

    // keys: Escape closes, arrows step; the explorer underneath doesn't see them
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !(e.target as HTMLElement)?.closest('video, audio')) {
                go(e.key === 'ArrowLeft' ? -1 : 1);
            } else return;
            e.stopPropagation();
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    });

    // focus the dialog, lock page scroll, and give focus back on close
    useEffect(() => {
        const before = document.activeElement as HTMLElement | null;
        const overflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => { document.body.style.overflow = overflow; before?.focus?.(); };
    }, []);

    const download = async () => {
        setDownloading(true);
        try { await downloadDriveFile(workspaceId, file.id, file.name); }
        catch (e) { alert(e instanceof Error ? e.message : 'Download failed'); }
        finally { setDownloading(false); }
    };

    const onReady = () => setLoadedId(file.id);
    const onFail = () => setFailedId(file.id);
    const failed = failedId === file.id;

    let content: React.ReactNode = null;
    let waiting = !preview;
    if (preview && 'error' in preview) {
        const missing = /not found/i.test(preview.error);
        content = (
            <Notice
                title={missing ? 'This file isn’t in the app’s Drive' : 'Couldn’t open this file'}
                text={missing ? 'It was uploaded before the Drive switch.' : preview.error}
                action={missing && file.fallbackUrl ? (
                    <a href={file.fallbackUrl} target="_blank" rel="noopener noreferrer" className={pillButton}>
                        <ExternalLink className="w-4 h-4" /> Open in Google Drive
                    </a>
                ) : null}
            />
        );
    } else if (preview && failed) {
        content = <Notice title="Couldn’t load the preview" text="You can still download the file." action={<DownloadButton onClick={download} busy={downloading} />} />;
    } else if (preview) {
        const t = preview.mimeType;
        waiting = loadedId !== file.id;
        if (t.startsWith('image/')) {
            content = (
                <div className={zoomed ? 'w-full h-full overflow-auto' : 'contents'}>
                    <img
                        key={preview.url}
                        src={preview.url}
                        alt={file.name}
                        onLoad={onReady}
                        onError={onFail}
                        onClick={() => setZoomed(z => !z)}
                        className={zoomed
                            ? 'max-w-none cursor-zoom-out'
                            : 'max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-zoom-in select-none'}
                    />
                </div>
            );
        } else if (t.startsWith('video/')) {
            content = (
                <video key={preview.url} src={preview.url} controls autoPlay playsInline onLoadedData={onReady} onError={onFail}
                    className="max-w-full max-h-full rounded-lg shadow-2xl bg-black" />
            );
        } else if (t.startsWith('audio/')) {
            content = (
                <div className="w-full max-w-md flex flex-col items-center gap-6">
                    <span className="w-28 h-28 rounded-3xl bg-gradient-to-br from-primary to-accent text-on-primary flex items-center justify-center shadow-glow">
                        <Music className="w-12 h-12" />
                    </span>
                    <audio key={preview.url} src={preview.url} controls autoPlay onCanPlay={onReady} onError={onFail} className="w-full" />
                </div>
            );
        } else if (isText(t)) {
            const text = texts[file.id];
            waiting = text === undefined;
            content = text === undefined ? null : (
                <pre className="w-full h-full max-w-4xl overflow-auto rounded-xl border border-white/10 bg-white/[0.04] p-5 text-sm leading-relaxed font-mono text-white/90 whitespace-pre-wrap break-words">{text}</pre>
            );
        } else if (t === 'application/pdf') {
            content = (
                <iframe key={preview.url} src={preview.url} title={file.name} onLoad={onReady}
                    className="w-full h-full max-w-5xl rounded-xl bg-white shadow-2xl" />
            );
        } else {
            waiting = false;
            content = <Notice title="No preview for this file type" text="Download it to open it on your device." action={<DownloadButton onClick={download} busy={downloading} />} />;
        }
    }

    // portalled: a dragged task card has a transform, which would trap a fixed overlay inside it
    return createPortal(
        <div role="dialog" aria-modal="true" aria-label={`Preview of ${file.name}`}
            className="fixed inset-0 z-[100] flex flex-col bg-[#01080f]/90 backdrop-blur-md text-white animate-fade-in">
            {/* top bar */}
            <div className="flex items-center gap-2 px-3 sm:px-5 py-3 flex-shrink-0">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={file.name}>{file.name}</p>
                    {files.length > 1 && <p className="text-xs text-white/60">{index + 1} of {files.length}</p>}
                </div>
                <button type="button" onClick={download} disabled={downloading} aria-label="Download" title="Download" className={iconButton}>
                    {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                </button>
                <button ref={closeRef} type="button" onClick={onClose} aria-label="Close preview" title="Close (Esc)" className={iconButton}>
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* content; clicking the empty backdrop closes */}
            <div className="relative flex-1 min-h-0 flex items-center justify-center px-3 sm:px-16 pb-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
                {content}
                {waiting && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none" aria-live="polite">
                        <Loader2 className="w-8 h-8 animate-spin text-white/70" />
                        <span className="sr-only">Loading preview</span>
                    </div>
                )}
                {hasPrev && (
                    <button type="button" onClick={() => go(-1)} aria-label="Previous file" className={`${navButton} left-2 sm:left-4`}>
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                )}
                {hasNext && (
                    <button type="button" onClick={() => go(1)} aria-label="Next file" className={`${navButton} right-2 sm:right-4`}>
                        <ChevronRight className="w-6 h-6" />
                    </button>
                )}
            </div>
        </div>,
        document.body,
    );
}

const iconButton = 'w-11 h-11 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-50';
const navButton = 'absolute top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/10 backdrop-blur text-white transition-colors';
const pillButton = 'inline-flex items-center gap-2 h-10 px-4 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-sm font-medium transition-colors disabled:opacity-50';

function DownloadButton({ onClick, busy }: { onClick: () => void; busy: boolean }) {
    return (
        <button type="button" onClick={onClick} disabled={busy} className={pillButton}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download
        </button>
    );
}

function Notice({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
    return (
        <div className="max-w-sm text-center flex flex-col items-center gap-3">
            <FileQuestion className="w-12 h-12 text-white/50" />
            <p className="text-base font-medium">{title}</p>
            <p className="text-sm text-white/60">{text}</p>
            {action}
        </div>
    );
}
