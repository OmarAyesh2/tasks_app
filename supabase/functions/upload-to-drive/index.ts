import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { google } from "npm:googleapis@128.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.97.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type, x-filename, x-filetype, x-workspace-name, x-user-email, x-project-name, x-task-id, x-task-name',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
};

async function getOrCreateFolder(drive: any, folderName: string, parentId: string, exactMatch: boolean = true) {
  const query = exactMatch
    ? `name = '${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    : `name contains '${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const res = await drive.files.list({ q: query, spaces: 'drive', fields: 'files(id, name)' });
  if (res.data.files && res.data.files.length > 0) return res.data.files[0].id;

  const createRes = await drive.files.create({
    requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
    fields: 'id',
  });
  return createRes.data.id;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // verify_jwt also accepts the public anon key, so require a real signed-in user.
  // This client runs as the caller, so RLS decides what they may touch.
  const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401, headers: corsHeaders });
  }

  // Fetch OAuth2 Secrets (Used for both POST and DELETE)
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    return new Response(JSON.stringify({ error: 'Missing OAuth2 configuration' }), { status: 500, headers: corsHeaders });
  }

  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: 'v3', auth });

  // --- HANDLE DELETE REQUEST ---
  if (req.method === 'DELETE') {
    try {
      const { fileId } = await req.json();
      if (!fileId || !/^[\w-]+$/.test(fileId)) {
        return new Response(JSON.stringify({ error: "Missing or invalid fileId parameter" }), { status: 400, headers: corsHeaders });
      }

      // Delete the attachment row as the caller first: RLS only lets task editors do it,
      // so a file nobody may edit is never removed from Drive. (The app's own row delete afterwards is a no-op.)
      const { data: deleted, error: rowError } = await userClient
        .from('task_assets').delete().like('public_url', `%/d/${fileId}/%`).select('id');
      if (rowError) throw rowError;
      if (!deleted || deleted.length === 0) {
        return new Response(JSON.stringify({ error: "Not allowed to delete this file" }), { status: 403, headers: corsHeaders });
      }

      // 404: the file lives in the old (pre-switch) Drive account, which this token can't reach
      await drive.files.delete({ fileId: fileId }).catch((e: any) => { if (e?.code !== 404) throw e; });

      return new Response(JSON.stringify({ success: true, message: "File deleted from Google Drive" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error: any) {
      console.error('Delete from Drive Error:', error);
      return new Response(JSON.stringify({ error: "Google Drive Deletion Failed", details: error.message }), { status: 500, headers: corsHeaders });
    }
  }

  // --- HANDLE POST (UPLOAD) REQUEST ---
  if (req.method === 'POST') {
    try {
      const formData = await req.formData();
      const file = formData.get('file') as File;
      const workspaceName = formData.get('workspaceName') as string;
      const userEmail = formData.get('userEmail') as string;
      const projectName = formData.get('projectName') as string;
      const taskId = formData.get('taskId') as string;
      const taskName = formData.get('taskName') as string;

      if (!file || !workspaceName || !userEmail || !projectName || !taskId || !taskName) {
        return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400, headers: corsHeaders });
      }

      // Only owners/admins/members who can see the task may attach to it.
      const { data: task } = await userClient.from('tasks').select('workspace_id').eq('id', taskId).maybeSingle();
      const { data: canEdit } = task
        ? await userClient.rpc('check_workspace_access', { target_workspace_id: task.workspace_id, allowed_roles: ['owner', 'admin', 'member'] })
        : { data: false };
      if (!canEdit) {
        return new Response(JSON.stringify({ error: "Not allowed to upload to this task" }), { status: 403, headers: corsHeaders });
      }

      const filename = file.name || 'untitled';
      const filetype = file.type || 'application/octet-stream';

      const rootFolderId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID');
      if (!rootFolderId) throw new Error('Missing GOOGLE_DRIVE_ROOT_FOLDER_ID');

      const workspaceFolderId = await getOrCreateFolder(drive, workspaceName, rootFolderId);
      const userFolderId = await getOrCreateFolder(drive, userEmail, workspaceFolderId);
      const projectFolderId = await getOrCreateFolder(drive, projectName, userFolderId);

      const taskFolderName = `${taskName} [${taskId}]`;
      let finalTaskFolderId = null;
      const taskQuery = `name contains '[${taskId}]' and '${projectFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const taskSearchRes = await drive.files.list({ q: taskQuery, fields: 'files(id)' });

      if (taskSearchRes.data.files && taskSearchRes.data.files.length > 0) {
          finalTaskFolderId = taskSearchRes.data.files[0].id;
      } else {
          const createRes = await drive.files.create({
              requestBody: { name: taskFolderName, mimeType: 'application/vnd.google-apps.folder', parents: [projectFolderId] },
              fields: 'id'
          });
          finalTaskFolderId = createRes.data.id;
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);
      const tokenResponse = await auth.getAccessToken();
      const accessToken = tokenResponse.token;

      const boundary = '-------314159265358979323846';
      const delimiter = `\r\n--${boundary}\r\n`;
      const close_delim = `\r\n--${boundary}--`;

      const metadata = { name: filename, parents: [finalTaskFolderId] };
      const metadataPart = new TextEncoder().encode(delimiter + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n');
      const mediaHeader = new TextEncoder().encode(delimiter + `Content-Type: ${filetype}\r\n\r\n`);
      const footer = new TextEncoder().encode(close_delim);

      const bodyBuffer = new Uint8Array(metadataPart.length + mediaHeader.length + buffer.length + footer.length);
      bodyBuffer.set(metadataPart, 0);
      bodyBuffer.set(mediaHeader, metadataPart.length);
      bodyBuffer.set(buffer, metadataPart.length + mediaHeader.length);
      bodyBuffer.set(footer, metadataPart.length + mediaHeader.length + buffer.length);

      const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
          body: bodyBuffer
      });

      if (!uploadRes.ok) throw new Error(`Google Drive API Upload Error: ${await uploadRes.text()}`);
      const uploadData = await uploadRes.json();

      return new Response(JSON.stringify({ url: uploadData.webViewLink, id: uploadData.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (error: any) {
      return new Response(JSON.stringify({ error: "Upload Failed", details: error.message }), { status: 500, headers: corsHeaders });
    }
  }
});
