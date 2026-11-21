import { useEffect, useRef, useState } from 'react';
import { ChevronRight, ClipboardPaste, Copy, Download, File as FileIcon, Folder, FolderPlus, Loader2, Lock, Pencil, Scissors, Trash2, Upload } from 'lucide-react';
import { driveAction, driveUpload, openDriveFile } from '../lib/supabase';
import { useWorkspace } from '../context/WorkspaceContext';
import { ConfirmModal } from './ConfirmModal';
import { Modal } from './Modal';

export type DriveItem = {
    id: string;
    name: string;
    mimeType: string;
    isFolder: boolean;
    size: number | null;
    modifiedTime?: string;
    webViewLink?: string;
    isProtected: boolean; // workspace/project folders: managed from the app
    canModify: boolean;   // decided by the server from the caller's role
};
type Listing = { canEdit: boolean; path: { id: string; name: string }[]; items: DriveItem[] };

const formatSize = (bytes: number | null) => {
    if (bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};

const iconButton = 'p-1.5 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center rounded-md text-slate-400 transition-colors';

interface FileBrowserProps {
    // pick mode: clicking a file returns it instead of opening it, and editing is hidden
    onPick?: (item: DriveItem) => void;
}

// Render with key={workspaceId} so switching workspace starts again at that workspace's root.
export function FileBrowser({ onPick }: FileBrowserProps) {
    const { activeWorkspace } = useWorkspace();
    const workspaceId = activeWorkspace?.id;
    const picking = !!onPick;

    const [folderId, setFolderId] = useState<string | null>(null); // null = workspace root
    const [listing, setListing] = useState<Listing | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [busy, setBusy] = useState(false);
    const [clipboard, setClipboard] = useState<{ item: DriveItem; mode: 'cut' | 'copy' } | null>(null);
    const [naming, setNaming] = useState<{ mode: 'folder' | 'rename'; item?: DriveItem; value: string } | null>(null);
    const [toDelete, setToDelete] = useState<DriveItem | null>(null);
    const uploadRef = useRef<HTMLInputElement>(null);

    // which folder/reload the shown listing belongs to; while they differ, the next folder is loading
    const requestKey = `${folderId}:${reloadKey}`;
    const [loadedKey, setLoadedKey] = useState<string | null>(null);
    const loading = loadedKey !== requestKey;

    useEffect(() => {
        if (!workspaceId) return;
        let cancelled = false; // ignore a slow response after navigating away
        driveAction<Listing>({ action: 'list', workspaceId, folderId })
            .then(l => { if (!cancelled) { setListing(l); setError(null); setLoadedKey(requestKey); } })
            .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load files'); });
        return () => { cancelled = true; };
    }, [workspaceId, folderId, reloadKey, requestKey]);

    const currentId = listing?.path[listing.path.length - 1]?.id;
    const canEdit = !picking && !!listing?.canEdit;

    // runs a change, then reloads the folder; errors are shown, never swallowed
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

    const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = '';
        if (!files.length || !workspaceId || !currentId) return;
        run(async () => {
            for (const file of files) await driveUpload(workspaceId, currentId, file);
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
        run(() => driveAction({ action: 'delete', workspaceId, fileId: item.id }));
    };

    const openItem = (item: DriveItem) => {
        if (item.isFolder) return setFolderId(item.id);
        if (onPick) return onPick(item);
        if (workspaceId) openDriveFile(workspaceId, item.id, item.name).catch(e => alert(e.message));
    };

    if (error) {
        return (
            <div className="text-center py-12 bg-white/50 dark:bg-dark-surface/50 rounded-2xl border border-dashed border-slate-300 dark:border-dark-border space-y-3">
                <p className="text-text-muted dark:text-slate-400">{error}</p>
                <button type="button" onClick={() => { setError(null); setReloadKey(k => k + 1); }} className="text-sm font-medium text-primary hover:underline">
                    Try again
                </button>
            </div>
        );
    }

    if (!listing) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
            </div>
        );
    }

    return (
        <div className="bg-white/50 dark:bg-dark-surface/50 rounded-2xl border border-slate-200 dark:border-dark-border">
            {/* Breadcrumbs + toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 border-b border-slate-200 dark:border-dark-border">
                <nav aria-label="Folder path" className="flex items-center flex-wrap gap-1 min-w-0 text-sm">
                    {listing.path.map((crumb, i) => {
                        const last = i === listing.path.length - 1;
                        return (
                            <span key={crumb.id} className="flex items-center gap-1 min-w-0">
                                {i > 0 && <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />}
                                <button
                                    type="button"
                                    disabled={last}
                                    onClick={() => setFolderId(i === 0 ? null : crumb.id)}
                                    className={last
                                        ? 'font-semibold text-text-main dark:text-slate-100 truncate max-w-[200px]'
                                        : 'text-text-muted hover:text-primary truncate max-w-[160px] transition-colors'}
                                >
                                    {crumb.name}
                                </button>
                            </span>
                        );
                    })}
                    {(busy || loading) && <Loader2 className="w-4 h-4 ml-2 animate-spin text-primary" aria-label="Loading" />}
                </nav>

                {canEdit && (
                    <div className="flex items-center gap-2">
                        {clipboard && (
                            <button
                                type="button"
                                onClick={paste}
                                disabled={busy}
                                title={`${clipboard.mode === 'cut' ? 'Move' : 'Copy'} "${clipboard.item.name}" here`}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                            >
                                <ClipboardPaste className="w-4 h-4" />
                                <span className="max-w-[140px] truncate">Paste {clipboard.item.name}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setNaming({ mode: 'folder', value: '' })}
                            disabled={busy}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-dark-border text-text-main dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                            <FolderPlus className="w-4 h-4" />
                            New folder
                        </button>
                        <button
                            type="button"
                            onClick={() => uploadRef.current?.click()}
                            disabled={busy}
                            className="btn-primary inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
                        >
                            <Upload className="w-4 h-4" />
                            Upload
                        </button>
                        <input ref={uploadRef} type="file" multiple className="hidden" onChange={handleUpload} />
                    </div>
                )}
            </div>

            {/* Items (dimmed and inert while the next folder loads) */}
            <div className={loading ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'} aria-busy={loading}>
            {listing.items.length === 0 ? (
                <p className="text-center py-12 text-sm text-text-muted dark:text-slate-400">
                    {canEdit ? 'This folder is empty. Upload files or create a folder.' : 'This folder is empty.'}
                </p>
            ) : (
                <ul className="divide-y divide-slate-100 dark:divide-dark-border">
                    {listing.items.map(item => (
                        <li key={item.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <button
                                type="button"
                                onClick={() => openItem(item)}
                                className="flex-1 min-w-0 flex items-center gap-3 py-1.5 text-left"
                                title={item.isFolder ? `Open ${item.name}` : picking ? `Attach ${item.name}` : `Open ${item.name}`}
                            >
                                {item.isFolder
                                    ? <Folder className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                    : <FileIcon className="w-5 h-5 text-indigo-500 flex-shrink-0" />}
                                <span className="truncate text-sm text-text-main dark:text-slate-200">{item.name}</span>
                                {item.isProtected && <Lock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-label="Project folder" />}
                                {clipboard?.item.id === item.id && clipboard.mode === 'cut' && (
                                    <span className="text-xs text-primary flex-shrink-0">cut</span>
                                )}
                            </button>

                            <span className="hidden sm:block w-20 text-right text-xs text-text-muted flex-shrink-0">{formatSize(item.size)}</span>
                            <span className="hidden md:block w-24 text-right text-xs text-text-muted flex-shrink-0">
                                {item.modifiedTime ? new Date(item.modifiedTime).toLocaleDateString() : ''}
                            </span>

                            {picking ? (
                                !item.isFolder && (
                                    <button type="button" onClick={() => onPick(item)} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex-shrink-0">
                                        Attach
                                    </button>
                                )
                            ) : (
                                <div className="flex items-center flex-shrink-0">
                                    {!item.isFolder && (
                                        <button type="button" onClick={() => openItem(item)} aria-label={`Download ${item.name}`} title="Open / download" className={`${iconButton} hover:text-primary hover:bg-primary/10`}>
                                            <Download className="w-4 h-4" />
                                        </button>
                                    )}
                                    {item.canModify && (
                                        <button type="button" onClick={() => setNaming({ mode: 'rename', item, value: item.name })} aria-label={`Rename ${item.name}`} title="Rename" className={`${iconButton} hover:text-primary hover:bg-primary/10`}>
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                    )}
                                    {item.canModify && (
                                        <button type="button" onClick={() => setClipboard({ item, mode: 'cut' })} aria-label={`Cut ${item.name}`} title="Cut (move)" className={`${iconButton} hover:text-primary hover:bg-primary/10`}>
                                            <Scissors className="w-4 h-4" />
                                        </button>
                                    )}
                                    {canEdit && !item.isFolder && (
                                        <button type="button" onClick={() => setClipboard({ item, mode: 'copy' })} aria-label={`Copy ${item.name}`} title="Copy" className={`${iconButton} hover:text-primary hover:bg-primary/10`}>
                                            <Copy className="w-4 h-4" />
                                        </button>
                                    )}
                                    {item.canModify && (
                                        <button type="button" onClick={() => setToDelete(item)} aria-label={`Delete ${item.name}`} title="Delete" className={`${iconButton} hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20`}>
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            </div>

            <Modal isOpen={!!naming} onClose={() => setNaming(null)} title={naming?.mode === 'folder' ? 'New Folder' : 'Rename'}>
                <form onSubmit={submitName} className="space-y-4">
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
        </div>
    );
}
