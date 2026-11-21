import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Mirrors the task_assets delete rule: owners/admins any file, members only their own uploads.
export function canDeleteFile(uploadedBy: string | null | undefined, role: string | undefined, userId: string | undefined) {
    return role === 'owner' || role === 'admin' || (role === 'member' && !!userId && uploadedBy === userId);
}

export const driveFileId = (publicUrl: string) => publicUrl.match(/\/file\/d\/([^/]+)/)?.[1];

// Deletes an attachment's Google Drive file; the function also removes its task_assets row.
async function deleteDriveAttachment(publicUrl: string) {
    const fileId = driveFileId(publicUrl);
    if (!fileId || !supabase) return { error: null };
    return supabase.functions.invoke('upload-to-drive', { method: 'DELETE', body: { fileId } });
}

const DRIVE_FN = `${supabaseUrl}/functions/v1/upload-to-drive`;

async function driveFetch(body: BodyInit, headers: Record<string, string> = {}) {
    const { data: { session } } = await supabase!.auth.getSession();
    if (!session) throw new Error('Your session expired. Please sign in again.');
    return fetch(DRIVE_FN, {
        method: 'POST',
        body,
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabaseAnonKey, ...headers },
    });
}
const jsonBody = (body: Record<string, unknown>) => [JSON.stringify(body), { 'Content-Type': 'application/json' }] as const;

async function driveJson<T>(res: Response): Promise<T> {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `Drive request failed (${res.status})`);
    return data as T;
}

// File explorer actions: list, mkdir, rename, move, copy, delete, trashWorkspace
export async function driveAction<T = unknown>(body: Record<string, unknown>): Promise<T> {
    return driveJson<T>(await driveFetch(...jsonBody(body)));
}

export async function driveUpload(workspaceId: string, folderId: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('workspaceId', workspaceId);
    form.append('folderId', folderId);
    return driveJson<{ id: string; url: string; name: string }>(await driveFetch(form));
}

// Opens a Drive file through the app, so members without Drive access can see it.
// Images, PDFs, text and media open in a new tab; anything else downloads.
export async function openDriveFile(workspaceId: string, fileId: string, name: string, fallbackUrl?: string) {
    const tab = window.open('', '_blank'); // opened during the click, otherwise browsers block it
    try {
        const res = await driveFetch(...jsonBody({ action: 'download', workspaceId, fileId }));
        // files from before the Drive switch aren't reachable by the app; their Drive link still works for their owner
        if (res.status === 404 && fallbackUrl) {
            if (tab) tab.location.href = fallbackUrl;
            return;
        }
        if (!res.ok) await driveJson(res);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (tab && /^(image|video|audio|text)\/|^application\/pdf$/.test(blob.type)) {
            tab.location.href = url;
        } else {
            tab?.close();
            const a = document.createElement('a');
            a.href = url;
            a.download = name;
            a.click();
        }
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
        tab?.close();
        throw e;
    }
}

// Drive files are not removed by the database cascade, so clear them before deleting their parent.
export async function deleteDriveAttachments(publicUrls: string[]) {
    const results = await Promise.all(publicUrls.map(deleteDriveAttachment));
    results.forEach(({ error }) => { if (error) console.error('Drive file not deleted:', error); });
}
