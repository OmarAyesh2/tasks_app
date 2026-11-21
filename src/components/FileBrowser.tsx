import { useEffect, useId, useRef, useState } from 'react';
import {
    ChevronRight, ClipboardPaste, Copy, Eye, File as FileIcon, FileArchive, FileAudio, FileImage, FileSpreadsheet,
    FileText, FileVideo, FolderOpen, FolderPlus, Loader2, Lock, Palette, Pencil, Scissors, Search, Trash2, Upload, X,
} from 'lucide-react';
import { driveAction, driveUpload } from '../lib/supabase';
import { useWorkspace } from '../context/WorkspaceContext';
import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';
import { FileViewer, type ViewerFile } from './FileViewer';

export type DriveItem = {
    id: string;
    name: string;
    mimeType: string;
    isFolder: boolean;
    size: number | null;
    modifiedTime?: string;
    webViewLink?: string;
    color: string | null;
    isProtected: boolean; // workspace/project folders: managed from the app
    canModify: boolean;   // decided by the server from the caller's role
    canColor: boolean;
    location?: string | null; // search results: the folder it's in
    parentId?: string | null;
};
type Listing = { canEdit: boolean; path: { id: string; name: string }[]; items: DriveItem[] };

// keep the keys in sync with FOLDER_COLORS in supabase/functions/upload-to-drive/index.ts
const FOLDER_COLORS: Record<string, string> = {
    sky: '#7BBBFF', blue: '#3B82F6', lavender: '#B8A9FF', violet: '#8B5CF6', green: '#22C55E',
    yellow: '#F5B83D', orange: '#F97316', red: '#EF4444', pink: '#EC4899', gray: '#94A3B8',
};
const DEFAULT_FOLDER_COLOR = 'sky';

type Filter = 'all' | 'folders' | 'documents' | 'images' | 'videos' | 'audio' | 'other';
const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'folders', label: 'Folders' },
    { id: 'documents', label: 'Documents' },
    { id: 'images', label: 'Images' },
    { id: 'videos', label: 'Videos' },
    { id: 'audio', label: 'Audio' },
    { id: 'other', label: 'Other' },
];

const DOC_TYPES = /pdf|word|document|text\/|sheet|excel|csv|presentation|powerpoint|rtf|opendocument/;
const kindOf = (item: DriveItem): Filter => {
    if (item.isFolder) return 'folders';
    const t = item.mimeType;
    if (t.startsWith('image/')) return 'images';
    if (t.startsWith('video/')) return 'videos';
    if (t.startsWith('audio/')) return 'audio';
    if (DOC_TYPES.test(t)) return 'documents';
    return 'other';
};

// icon + tint per file type, so files are recognisable at a glance
const fileLook = (item: DriveItem) => {
    const t = item.mimeType;
    if (t.startsWith('image/')) return { Icon: FileImage, tone: 'text-emerald-500' };
    if (t.startsWith('video/')) return { Icon: FileVideo, tone: 'text-violet-500' };
    if (t.startsWith('audio/')) return { Icon: FileAudio, tone: 'text-pink-500' };
    if (t.includes('pdf')) return { Icon: FileText, tone: 'text-red-500' };
    if (/sheet|excel|csv/.test(t)) return { Icon: FileSpreadsheet, tone: 'text-green-600' };
    if (/zip|rar|7z|tar|compressed/.test(t)) return { Icon: FileArchive, tone: 'text-amber-500' };
    if (DOC_TYPES.test(t)) return { Icon: FileText, tone: 'text-blue-500' };
    return { Icon: FileIcon, tone: 'text-slate-400' };
};
const extensionOf = (name: string) => {
    const m = name.match(/\.([a-z0-9]{1,5})$/i);
    return m ? m[1].toUpperCase() : '';
};

const formatSize = (bytes: number | null) => {
    if (bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};
const formatDate = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

// Two-tone folder: darker back panel with the tab, lighter front panel with a soft highlight.
function FolderGlyph({ color, locked }: { color: string; locked?: boolean }) {
    const gradientId = useId();
    return (
        <div className="relative w-[78%] max-w-[132px]">
            <svg viewBox="0 0 120 96" className="w-full h-auto drop-shadow-[0_8px_16px_rgb(5_15_42/0.18)]" aria-hidden="true">
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
                        <stop offset="1" stopColor="#fff" stopOpacity="0" />
                    </linearGradient>
                </defs>
                <path d="M6 14a8 8 0 0 1 8-8h30l10 10h52a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill={color} />
                <path d="M6 14a8 8 0 0 1 8-8h30l10 10h52a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill="#000" fillOpacity="0.22" />
                <path d="M6 32a8 8 0 0 1 8-8h92a8 8 0 0 1 8 8v50a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill={color} />
                <path d="M6 32a8 8 0 0 1 8-8h92a8 8 0 0 1 8 8v50a8 8 0 0 1-8 8H14a8 8 0 0 1-8-8z" fill={`url(#${gradientId})`} />
            </svg>
            {locked && (
                <span className="absolute bottom-[12%] right-[8%] w-6 h-6 rounded-full bg-white/90 dark:bg-dark-surface/90 text-slate-500 dark:text-slate-300 flex items-center justify-center shadow-sm" title="Project folder">
                    <Lock className="w-3 h-3" />
                </span>
            )}
        </div>
    );
}

const toolButton = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-medium transition-colors disabled:opacity-50';
const ghostButton = `${toolButton} text-text-muted hover:text-text-main hover:bg-slate-900/[0.05] dark:hover:text-slate-100 dark:hover:bg-white/[0.06]`;

interface FileBrowserProps {
    // pick mode: a tap opens folders and picks files; editing is hidden
    onPick?: (item: DriveItem) => void;
}

// Render with key={workspaceId} so switching workspace starts again at that workspace's root.
export function FileBrowser({ onPick }: FileBrowserProps) {
    const { activeWorkspace } = useWorkspace();
    const workspaceId = activeWorkspace?.id;
    const picking = !!onPick;
    // phones/tablets have no double-click: a tap opens
    const [coarsePointer] = useState(() => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches);

    const [folderId, setFolderId] = useState<string | null>(null); // null = workspace root
    const [listing, setListing] = useState<Listing | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [loadedKey, setLoadedKey] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [filter, setFilter] = useState<Filter>('all');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<{ query: string; items: DriveItem[] } | null>(null);
    const [clipboard, setClipboard] = useState<{ item: DriveItem; mode: 'cut' | 'copy' } | null>(null);
    const [naming, setNaming] = useState<{ mode: 'folder' | 'rename'; item?: DriveItem; value: string } | null>(null);
    const [toDelete, setToDelete] = useState<DriveItem | null>(null);
    const [colorMenuOpen, setColorMenuOpen] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [viewing, setViewing] = useState<{ files: ViewerFile[]; index: number } | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);

    // which folder/reload the shown listing belongs to; while they differ, the next folder is loading
    const requestKey = `${folderId}:${reloadKey}`;
    const loading = loadedKey !== requestKey;

    useEffect(() => {
        if (!workspaceId) return;
        let cancelled = false; // ignore a slow response after navigating away
        driveAction<Listing>({ action: 'list', workspaceId, folderId })
            .then(l => { if (!cancelled) { setListing(l); setError(null); setLoadedKey(requestKey); } })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load files'); });
        return () => { cancelled = true; };
    }, [workspaceId, folderId, reloadKey, requestKey]);

    // workspace-wide search, debounced while typing
    const trimmedQuery = query.trim();
    const searchActive = trimmedQuery.length >= 2;
    useEffect(() => {
        if (!workspaceId || trimmedQuery.length < 2) return;
        let cancelled = false;
        const timer = setTimeout(() => {
            driveAction<{ items: DriveItem[] }>({ action: 'search', workspaceId, query: trimmedQuery })
                .then(r => { if (!cancelled) setResults({ query: trimmedQuery, items: r.items }); })
                .catch(() => { if (!cancelled) setResults({ query: trimmedQuery, items: [] }); });
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [workspaceId, trimmedQuery, reloadKey]);
    const searching = searchActive && results?.query !== trimmedQuery;

    const currentId = listing?.path[listing.path.length - 1]?.id;
    const canEdit = !picking && !!listing?.canEdit;
    const sourceItems = searchActive ? (results?.query === trimmedQuery ? results.items : []) : (listing?.items ?? []);
    const shown = filter === 'all' ? sourceItems : sourceItems.filter(i => kindOf(i) === filter);
    const folders = shown.filter(i => i.isFolder);
    const files = shown.filter(i => !i.isFolder);
    const selected = shown.find(i => i.id === selectedId) ?? null;

    // runs a change, then reloads; errors are shown, never swallowed
    const run = async (change: () => Promise<unknown>) => {
        setBusy(true);
        try {
            await change();
            setReloadKey(k => k + 1);
        } catch (e) {
            alert(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setBusy(false);
        }
    };

    const goTo = (id: string | null) => {
        setFolderId(id);
        setSelectedId(null);
        setColorMenuOpen(false);
        setQuery('');
    };

    const openItem = (item: DriveItem) => {
        if (item.isFolder) return goTo(item.id);
        if (onPick) return onPick(item);
        // the viewer steps through the files shown here, in the same order
        setViewing({ files: files.map(f => ({ id: f.id, name: f.name })), index: Math.max(0, files.findIndex(f => f.id === item.id)) });
    };

    const onTileClick = (item: DriveItem) => {
        if (picking || coarsePointer) return openItem(item);
        setSelectedId(item.id);
        setColorMenuOpen(false);
    };

    const uploadFiles = (list: File[]) => {
        if (!list.length || !workspaceId || !currentId) return;
        run(async () => {
            for (const file of list) await driveUpload(workspaceId, currentId, file);
        });
    };

    const paste = () => {
        if (!clipboard || !currentId) return;
        run(async () => {
            await driveAction({ action: clipboard.mode === 'cut' ? 'move' : 'copy', workspaceId, fileId: clipboard.item.id, targetId: currentId });
            if (clipboard.mode === 'cut') setClipboard(null);
        });
    };

    const submitName = (e: React.FormEvent) => {
        e.preventDefault();
        if (!naming || !naming.value.trim()) return;
        const { mode, item, value } = naming;
        setNaming(null);
        run(() => mode === 'folder'
            ? driveAction({ action: 'mkdir', workspaceId, parentId: currentId, name: value })
            : driveAction({ action: 'rename', workspaceId, fileId: item!.id, name: value }));
    };

    const confirmDelete = () => {
        const item = toDelete;
        setToDelete(null);
        if (!item) return;
        if (clipboard?.item.id === item.id) setClipboard(null);
        setSelectedId(null);
        run(() => driveAction({ action: 'delete', workspaceId, fileId: item.id }));
    };

    const setColor = (color: string) => {
        if (!selected) return;
        setColorMenuOpen(false);
        // show the new color right away; the reload after saving confirms it (or reverts on error)
        const recolor = (items: DriveItem[]) => items.map(i => (i.id === selected.id ? { ...i, color } : i));
        setListing(l => l && { ...l, items: recolor(l.items) });
        setResults(r => r && { ...r, items: recolor(r.items) });
        run(() => driveAction({ action: 'setColor', workspaceId, fileId: selected.id, color }));
    };

    // Escape clears the selection, Delete asks to delete it (only when no dialog is open)
    useEffect(() => {
        if (!selected || picking || naming || toDelete || viewing) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement)?.closest('input, textarea')) return;
            if (e.key === 'Escape') { setSelectedId(null); setColorMenuOpen(false); }
            if (e.key === 'Delete' && selected.canModify) setToDelete(selected);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selected, picking, naming, toDelete, viewing]);

    if (error && !listing) {
        return (
            <div className="text-center py-16 space-y-3">
                <p className="text-text-muted dark:text-slate-400">{error}</p>
                <button type="button" onClick={() => { setError(null); setReloadKey(k => k + 1); }} className="text-sm font-medium text-primary hover:underline">
                    Try again
                </button>
            </div>
        );
    }

    if (!listing) {
        return (
            <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
            </div>
        );
    }

    const tile = (item: DriveItem) => {
        const isSelected = selectedId === item.id;
        const isCut = clipboard?.item.id === item.id && clipboard.mode === 'cut';
        const { Icon, tone } = fileLook(item);
        const ext = extensionOf(item.name);
        const meta = searchActive
            ? (item.location ? `in ${item.location}` : '')
            : item.isFolder ? formatDate(item.modifiedTime) : [formatSize(item.size), formatDate(item.modifiedTime)].filter(Boolean).join(' · ');

        return (
            <button
                key={item.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onTileClick(item); }}
                onDoubleClick={(e) => { e.stopPropagation(); openItem(item); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); openItem(item); } }}
                aria-pressed={!picking && !coarsePointer ? isSelected : undefined}
                aria-label={`${item.isFolder ? 'Folder' : 'File'} ${item.name}`}
                title={item.name}
                className={`group flex flex-col items-center gap-1.5 p-3 rounded-2xl text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary ${isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/40 dark:bg-primary/15'
                    : 'hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.05]'} ${isCut ? 'opacity-50' : ''}`}
            >
                <div className="w-full aspect-[5/4] flex items-center justify-center">
                    {item.isFolder ? (
                        <FolderGlyph color={FOLDER_COLORS[item.color ?? DEFAULT_FOLDER_COLOR] ?? FOLDER_COLORS[DEFAULT_FOLDER_COLOR]} locked={item.isProtected} />
                    ) : (
                        <div className="relative w-[64%] max-w-[104px] aspect-[4/5] rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 shadow-[0_8px_16px_-6px_rgb(5_15_42/0.18)] flex items-center justify-center">
                            <Icon className={`w-1/2 h-1/2 ${tone}`} strokeWidth={1.5} />
                            {ext && (
                                <span className="absolute bottom-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tracking-wide bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                    {ext}
                                </span>
                            )}
                        </div>
                    )}
                </div>
                <span className="w-full text-sm font-medium leading-snug text-text-main dark:text-slate-100 line-clamp-2 break-words">
                    {item.name}
                </span>
                {meta && <span className="w-full text-xs text-text-muted truncate">{meta}</span>}
            </button>
        );
    };

    const gridClass = picking
        ? 'grid grid-cols-3 gap-1'
        : 'grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2';

    const nothingShown = !loading && !searching && shown.length === 0;

    return (
        <div
            className={`relative ${picking ? 'space-y-3' : 'space-y-5 min-h-[60vh]'}`}
            onClick={() => { setSelectedId(null); setColorMenuOpen(false); }}
            onDragOver={(e) => {
                if (!canEdit || searchActive || !e.dataTransfer.types.includes('Files')) return;
                e.preventDefault();
                setDragOver(true);
            }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
            onDrop={(e) => {
                if (!dragOver) return;
                e.preventDefault();
                setDragOver(false);
                uploadFiles(Array.from(e.dataTransfer.files));
            }}
        >
            {/* Location + search */}
            <div className="flex flex-wrap items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <nav aria-label="Folder path" className="flex items-center flex-wrap gap-0.5 min-w-0 flex-1">
                    {searchActive ? (
                        <span className="text-lg font-semibold text-text-main dark:text-slate-100 truncate">
                            Results for “{trimmedQuery}”
                        </span>
                    ) : listing.path.map((crumb, i) => {
                        const last = i === listing.path.length - 1;
                        return (
                            <span key={crumb.id} className="flex items-center gap-0.5 min-w-0">
                                {i > 0 && <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />}
                                <button
                                    type="button"
                                    disabled={last}
                                    onClick={() => goTo(i === 0 ? null : crumb.id)}
                                    className={last
                                        ? 'px-2 py-1 text-lg font-semibold text-text-main dark:text-slate-100 truncate max-w-[240px]'
                                        : 'px-2 py-1 rounded-full text-lg text-text-muted hover:text-text-main hover:bg-slate-900/[0.05] dark:hover:text-slate-100 dark:hover:bg-white/[0.06] truncate max-w-[180px] transition-colors'}
                                >
                                    {crumb.name}
                                </button>
                            </span>
                        );
                    })}
                    {(busy || loading || searching) && <Loader2 className="w-4 h-4 ml-2 animate-spin text-primary" aria-label="Loading" />}
                </nav>

                <div className={`relative ${picking ? 'w-full' : 'w-full sm:w-72'}`}>
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setSelectedId(null); }}
                        placeholder="Search in Files"
                        aria-label="Search in Files"
                        className="input-field rounded-full pl-10 pr-9 [&::-webkit-search-cancel-button]:hidden"
                    />
                    {query && (
                        <button
                            type="button"
                            onClick={() => setQuery('')}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-text-muted hover:text-text-main hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.06]"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Filters + actions (actions follow the selection, like Drive) */}
            <div className="flex flex-wrap items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
                <div role="group" aria-label="Filter by type" className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
                    {FILTERS.map(f => (
                        <button
                            key={f.id}
                            type="button"
                            aria-pressed={filter === f.id}
                            onClick={() => { setFilter(f.id); setSelectedId(null); }}
                            className={`h-8 px-3.5 rounded-full text-sm whitespace-nowrap border transition-colors ${filter === f.id
                                ? 'bg-primary text-on-primary border-transparent font-medium'
                                : 'border-slate-200/80 text-text-muted hover:text-text-main hover:bg-slate-900/[0.04] dark:border-white/10 dark:hover:text-slate-100 dark:hover:bg-white/[0.05]'}`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {!picking && (selected ? (
                    <div className="relative flex items-center gap-1 flex-wrap" aria-label={`Actions for ${selected.name}`}>
                        <span className="hidden sm:block max-w-[160px] truncate text-sm font-medium text-text-main dark:text-slate-100 mr-1">{selected.name}</span>
                        <button type="button" onClick={() => openItem(selected)} className={ghostButton}>
                            {selected.isFolder ? <FolderOpen className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            Open
                        </button>
                        {selected.canModify && (
                            <button type="button" onClick={() => setNaming({ mode: 'rename', item: selected, value: selected.name })} className={ghostButton} aria-label="Rename" title="Rename">
                                <Pencil className="w-4 h-4" />
                            </button>
                        )}
                        {selected.canColor && (
                            <span className="relative">
                                <button type="button" onClick={() => setColorMenuOpen(o => !o)} aria-expanded={colorMenuOpen} className={ghostButton} aria-label="Folder color" title="Folder color">
                                    <Palette className="w-4 h-4" />
                                </button>
                                {colorMenuOpen && (
                                    <div role="menu" aria-label="Folder color" className="absolute right-0 top-full mt-2 z-30 w-max p-2.5 rounded-2xl border border-slate-200/80 bg-white/95 dark:border-white/10 dark:bg-dark-surface/95 backdrop-blur-xl shadow-2xl grid grid-cols-5 gap-2 animate-fade-in">
                                        {Object.entries(FOLDER_COLORS).map(([key, hex]) => {
                                            const current = (selected.color ?? DEFAULT_FOLDER_COLOR) === key;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    role="menuitemradio"
                                                    aria-checked={current}
                                                    aria-label={key}
                                                    title={key.charAt(0).toUpperCase() + key.slice(1)}
                                                    onClick={() => setColor(key)}
                                                    className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${current ? 'ring-2 ring-offset-2 ring-primary ring-offset-white dark:ring-offset-dark-surface' : ''}`}
                                                    style={{ backgroundColor: hex }}
                                                />
                                            );
                                        })}
                                    </div>
                                )}
                            </span>
                        )}
                        {selected.canModify && (
                            <button type="button" onClick={() => { setClipboard({ item: selected, mode: 'cut' }); setSelectedId(null); }} className={ghostButton} aria-label="Cut (move)" title="Cut (move)">
                                <Scissors className="w-4 h-4" />
                            </button>
                        )}
                        {canEdit && !selected.isFolder && (
                            <button type="button" onClick={() => { setClipboard({ item: selected, mode: 'copy' }); setSelectedId(null); }} className={ghostButton} aria-label="Copy" title="Copy">
                                <Copy className="w-4 h-4" />
                            </button>
                        )}
                        {selected.canModify && (
                            <button type="button" onClick={() => setToDelete(selected)} className={`${toolButton} text-text-muted hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/20`} aria-label="Delete" title="Delete">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                        <button type="button" onClick={() => setSelectedId(null)} className={ghostButton} aria-label="Clear selection" title="Clear selection">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : canEdit && !searchActive && (
                    <div className="flex items-center gap-2">
                        {clipboard && (
                            <button
                                type="button"
                                onClick={paste}
                                disabled={busy}
                                title={`${clipboard.mode === 'cut' ? 'Move' : 'Copy'} "${clipboard.item.name}" here`}
                                className={`${toolButton} bg-primary/10 text-primary hover:bg-primary/20`}
                            >
                                <ClipboardPaste className="w-4 h-4" />
                                <span className="max-w-[140px] truncate">Paste</span>
                            </button>
                        )}
                        <button type="button" onClick={() => setNaming({ mode: 'folder', value: '' })} disabled={busy} className={`${toolButton} border border-slate-200/80 text-text-main hover:bg-slate-900/[0.04] dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/[0.05]`}>
                            <FolderPlus className="w-4 h-4" />
                            New folder
                        </button>
                        <button type="button" onClick={() => uploadRef.current?.click()} disabled={busy} className="btn-primary inline-flex items-center gap-1.5 h-9 py-0 text-sm disabled:opacity-50">
                            <Upload className="w-4 h-4" />
                            Upload
                        </button>
                        <input ref={uploadRef} type="file" multiple className="hidden" onChange={(e) => { uploadFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
                    </div>
                ))}
            </div>

            {/* Items: dimmed and inert while the next folder loads */}
            <div className={loading ? 'opacity-50 pointer-events-none transition-opacity space-y-6' : 'transition-opacity space-y-6'} aria-busy={loading || searching}>
                {folders.length > 0 && (
                    <section aria-label="Folders">
                        {!picking && <h3 className="px-1 mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Folders</h3>}
                        <div className={gridClass}>{folders.map(tile)}</div>
                    </section>
                )}
                {files.length > 0 && (
                    <section aria-label="Files">
                        {!picking && <h3 className="px-1 mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Files</h3>}
                        <div className={gridClass}>{files.map(tile)}</div>
                    </section>
                )}
                {nothingShown && (
                    <div className="flex flex-col items-center justify-center text-center py-16 gap-3">
                        <div className="w-24 opacity-60"><FolderGlyph color={FOLDER_COLORS.gray} /></div>
                        <p className="text-text-muted dark:text-slate-400 max-w-xs">
                            {searchActive
                                ? 'No files match your search.'
                                : filter !== 'all'
                                    ? 'Nothing of this type here.'
                                    : canEdit ? 'This folder is empty. Drop files here or use Upload.' : 'This folder is empty.'}
                        </p>
                    </div>
                )}
            </div>

            {!picking && !coarsePointer && shown.length > 0 && (
                <p className="text-xs text-text-muted/80 text-center">Click to select · double-click to open</p>
            )}

            {/* drop target overlay */}
            {dragOver && (
                <div className="absolute inset-0 z-20 rounded-3xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[2px] flex items-center justify-center pointer-events-none">
                    <p className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/90 dark:bg-dark-surface/90 text-sm font-medium text-text-main dark:text-slate-100 shadow-soft">
                        <Upload className="w-4 h-4 text-primary" />
                        Drop to upload to {listing.path[listing.path.length - 1]?.name}
                    </p>
                </div>
            )}

            <Modal isOpen={!!naming} onClose={() => setNaming(null)} title={naming?.mode === 'folder' ? 'New Folder' : 'Rename'}>
                <form onSubmit={submitName} className="space-y-4" onClick={(e) => e.stopPropagation()}>
                    <input
                        autoFocus
                        className="input-field w-full"
                        value={naming?.value ?? ''}
                        onChange={e => setNaming(n => n && { ...n, value: e.target.value })}
                        placeholder={naming?.mode === 'folder' ? 'Folder name' : 'New name'}
                        maxLength={255}
                        aria-label="Name"
                    />
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={() => setNaming(null)} className="px-4 py-2 text-text-muted hover:text-text-main dark:text-slate-400 dark:hover:text-slate-100 font-medium transition-colors">
                            Cancel
                        </button>
                        <button type="submit" disabled={!naming?.value.trim()} className="btn-primary disabled:opacity-50">
                            {naming?.mode === 'folder' ? 'Create' : 'Rename'}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                isOpen={!!toDelete}
                onClose={() => setToDelete(null)}
                onConfirm={confirmDelete}
                title={toDelete?.isFolder ? 'Delete Folder' : 'Delete File'}
                message={`Delete "${toDelete?.name}"${toDelete?.isFolder ? ' and everything in it' : ''}? It goes to Drive's trash and is removed from any task it's attached to.`}
            />

            {viewing && workspaceId && (
                <FileViewer workspaceId={workspaceId} files={viewing.files} startIndex={viewing.index} onClose={() => setViewing(null)} />
            )}
        </div>
    );
}
