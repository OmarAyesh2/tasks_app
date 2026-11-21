import { useEffect, useState } from 'react';
import { File as FileIcon, Folder, Loader2, Trash2 } from 'lucide-react';
import { supabase, deleteDriveAttachment, canDeleteFile } from '../lib/supabase';
import { useWorkspace } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';
import { ConfirmModal } from './ConfirmModal';
import { groupFiles, type BrowserFile } from '../lib/groupFiles';

export function FileBrowser() {
    const { activeWorkspace, currentMemberProfile } = useWorkspace();
    const { user } = useAuth();
    const [files, setFiles] = useState<BrowserFile[]>([]);
    const [loading, setLoading] = useState(true);
    const [toDelete, setToDelete] = useState<BrowserFile | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Only this workspace's files: filtered here, and enforced by the task_assets RLS policies.
    useEffect(() => {
        let cancelled = false; // ignore a slow response after switching workspace
        (async () => {
            if (!supabase || !activeWorkspace) return;
            const { data, error } = await supabase
                .from('task_assets')
                .select('*, tasks(name, projects(name))')
                .eq('workspace_id', activeWorkspace.id)
                .order('created_at', { ascending: false });
            if (cancelled) return;
            if (error) console.error('Error loading files:', error);
            setFiles((data as BrowserFile[] | null) ?? []);
            setLoading(false);
        })();
        return () => { cancelled = true; };
    }, [activeWorkspace]);

    const confirmDelete = async () => {
        if (!toDelete || !supabase) return;
        setDeleting(true);
        const { error } = await deleteDriveAttachment(toDelete.public_url);
        // no-op when the function already removed the row; covers links that aren't Drive files
        if (!error) await supabase.from('task_assets').delete().eq('id', toDelete.id);
        setDeleting(false);
        if (error) {
            alert('Could not delete the file. Please try again.');
            return;
        }
        setFiles(prev => prev.filter(f => f.id !== toDelete.id));
        setToDelete(null);
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
            </div>
        );
    }

    if (files.length === 0) {
        return (
            <div className="text-center py-12 bg-white/50 dark:bg-dark-surface/50 rounded-2xl border border-dashed border-slate-300 dark:border-dark-border">
                <p className="text-text-muted dark:text-slate-400">No files yet. Files you attach to tasks will show up here.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {groupFiles(files).map(group => (
                <section key={group.key}>
                    <h2 className="flex items-center gap-2 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
                        <Folder className="w-4 h-4" />
                        {group.label}
                    </h2>
                    <div className="space-y-4">
                        {[...group.tasks.entries()].map(([taskKey, task]) => (
                            <div key={taskKey} className="bg-white/50 dark:bg-dark-surface/50 rounded-2xl border border-slate-200 dark:border-dark-border p-4">
                                <h3 className="font-medium text-text-main dark:text-slate-100 mb-2 truncate">{task.label}</h3>
                                <ul className="divide-y divide-slate-100 dark:divide-dark-border">
                                    {task.files.map(f => (
                                        <li key={f.id} className="flex items-center gap-3 py-2">
                                            <FileIcon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                                            <a
                                                href={f.public_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex-1 min-w-0 truncate text-sm text-text-main dark:text-slate-200 hover:text-primary transition-colors"
                                            >
                                                {f.file_name}
                                            </a>
                                            {f.created_at && (
                                                <span className="text-xs text-text-muted flex-shrink-0">
                                                    {new Date(f.created_at).toLocaleDateString()}
                                                </span>
                                            )}
                                            {canDeleteFile(f.uploaded_by, currentMemberProfile?.permission_role, user?.id) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setToDelete(f)}
                                                    aria-label={`Delete ${f.file_name}`}
                                                    className="p-1.5 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center text-slate-400 hover:text-red-500 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            <ConfirmModal
                isOpen={!!toDelete}
                onClose={() => setToDelete(null)}
                onConfirm={confirmDelete}
                isLoading={deleting}
                title="Delete File"
                message={`Delete "${toDelete?.file_name}" from Google Drive? This cannot be undone.`}
            />
        </div>
    );
}
