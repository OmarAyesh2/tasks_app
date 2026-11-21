import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Missing Supabase environment variables. Please check your .env file.');
}

export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

// Deletes an attachment's Google Drive file; the function also removes its task_assets row.
export async function deleteDriveAttachment(publicUrl: string) {
    const fileId = publicUrl.match(/\/file\/d\/([^/]+)/)?.[1];
    if (!fileId || !supabase) return { error: null };
    return supabase.functions.invoke('upload-to-drive', { method: 'DELETE', body: { fileId } });
}

// Drive files are not removed by the database cascade, so clear them before deleting their parent.
export async function deleteDriveAttachments(publicUrls: string[]) {
    const results = await Promise.all(publicUrls.map(deleteDriveAttachment));
    results.forEach(({ error }) => { if (error) console.error('Drive file not deleted:', error); });
}
