import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { google } from "npm:googleapis@128.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type, x-filename, x-filetype, x-workspace-name, x-user-email, x-project-name, x-task-id, x-task-name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

async function getOrCreateFolder(drive: any, folderName: string, parentId: string, exactMatch: boolean = true) {
  // If exactMatch is true, we look for name = 'folderName'.
  // If exactMatch is false, we look for name contains 'folderName'.
  const query = exactMatch 
    ? `name = '${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    : `name contains '${folderName.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;

  const res = await drive.files.list({
    q: query,
    spaces: 'drive',
    fields: 'files(id, name)',
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Not found, create it
  const fileMetadata = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
    parents: [parentId]
  };

  const createRes = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id',
  });

  return createRes.data.id;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const workspaceName = formData.get('workspaceName') as string;
    const userEmail = formData.get('userEmail') as string;
    const projectName = formData.get('projectName') as string;
    const taskId = formData.get('taskId') as string;
    const taskName = formData.get('taskName') as string;

    if (!file) return new Response(JSON.stringify({ error: "Missing required parameter: file" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!workspaceName) return new Response(JSON.stringify({ error: "Missing required parameter: workspaceName" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!userEmail) return new Response(JSON.stringify({ error: "Missing required parameter: userEmail" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!projectName) return new Response(JSON.stringify({ error: "Missing required parameter: projectName" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!taskId) return new Response(JSON.stringify({ error: "Missing required parameter: taskId" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    if (!taskName) return new Response(JSON.stringify({ error: "Missing required parameter: taskName" }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const filename = file.name || 'untitled';
    const filetype = file.type || 'application/octet-stream';

    // Initialize Google OAuth2
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const refreshToken = Deno.env.get('GOOGLE_REFRESH_TOKEN');

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Missing OAuth credentials in environment variables');
    }

    const auth = new google.auth.OAuth2(clientId, clientSecret);
    auth.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: 'v3', auth });

    // 1. Resolve or Create Hierarchy
    const rootFolderId = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID');
    if (!rootFolderId) {
      throw new Error('Missing GOOGLE_DRIVE_ROOT_FOLDER_ID environment variable');
    }
    const workspaceFolderId = await getOrCreateFolder(drive, workspaceName, rootFolderId);
    const userFolderId = await getOrCreateFolder(drive, userEmail, workspaceFolderId);
    const projectFolderId = await getOrCreateFolder(drive, projectName, userFolderId);
    
    // For task, we check if a folder contains the Task ID. If not, create it with "[Task ID] Task Name".
    const taskFolderName = `[${taskId}] ${taskName}`;
    const taskFolderId = await getOrCreateFolder(drive, `[${taskId}]`, projectFolderId, false);
    
    // The actual creation if it didn't exist will use the name passed above, but wait, 
    // my getOrCreateFolder creates it with the query string if exactMatch is false.
    // Let me write a custom logic here to be safe:
    let finalTaskFolderId = null;
    const taskQuery = `name contains '[${taskId}]' and '${projectFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const taskSearchRes = await drive.files.list({ q: taskQuery, fields: 'files(id)' });
    
    if (taskSearchRes.data.files && taskSearchRes.data.files.length > 0) {
        finalTaskFolderId = taskSearchRes.data.files[0].id;
    } else {
        const createRes = await drive.files.create({
            requestBody: {
                name: taskFolderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [projectFolderId]
            },
            fields: 'id'
        });
        finalTaskFolderId = createRes.data.id;
    }

    // 2. Upload the file content to the target task folder
    // Extract arrayBuffer from the FormData file object
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    // We can use a PassThrough stream or just buffer for small/medium files.
    // For edge functions, converting ArrayBuffer to a stream is needed for googleapis if using Node APIs, 
    // but googleapis in Deno might accept a buffer directly or string?
    // Let's use a Blob/Buffer trick
    
    // Actually, `googleapis` expects a stream or a string. We can pass a Blob or use a data URI or just use simple multipart via fetch if googleapis complains.
    // In Deno with googleapis, we can pass a standard ReadableStream? Unfortunately `googleapis` is designed for Node Streams.
    // Let's just create a custom fetch to upload it, or try using the Blob directly. 
    // Actually `googleapis` supports passing a Buffer or Readable. Since we have a Uint8Array, we can pass it as a Buffer in Node environments.
    // To be completely safe and avoid Node stream polyfill issues in Deno Deploy, let's use a direct fetch to the Google Drive REST API using the auth token.

    const client = await auth.getClient();
    const accessToken = (await client.getAccessToken()).token;

    // Use multipart upload to Google Drive REST API
    const boundary = '-------314159265358979323846';
    const delimiter = `\r\n--${boundary}\r\n`;
    const close_delim = `\r\n--${boundary}--`;

    const metadata = {
        name: filename,
        parents: [finalTaskFolderId]
    };

    const metadataPart = new TextEncoder().encode(
        delimiter +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        JSON.stringify(metadata) + '\r\n'
    );

    const mediaHeader = new TextEncoder().encode(
        delimiter +
        `Content-Type: ${filetype}\r\n\r\n`
    );

    const footer = new TextEncoder().encode(close_delim);

    // Combine all parts into a single Uint8Array
    const bodyLength = metadataPart.length + mediaHeader.length + buffer.length + footer.length;
    const bodyBuffer = new Uint8Array(bodyLength);
    bodyBuffer.set(metadataPart, 0);
    bodyBuffer.set(mediaHeader, metadataPart.length);
    bodyBuffer.set(buffer, metadataPart.length + mediaHeader.length);
    bodyBuffer.set(footer, metadataPart.length + mediaHeader.length + buffer.length);

    const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: bodyBuffer
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        throw new Error(`Google Drive API Upload Error: ${errorText}`);
    }

    const uploadData = await uploadRes.json();
    
    // By default, uploaded files inherit the permissions of the parent folder, or we might need to make it accessible if needed.
    // Typically the user will share the root "Workspace Name" folder with their team, and permissions inherit.

    return new Response(JSON.stringify({ url: uploadData.webViewLink, id: uploadData.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Upload to Drive Error:', error);
    return new Response(
      JSON.stringify({ 
        error: "Internal Google Drive API Error", 
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
