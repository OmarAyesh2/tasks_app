// Workspace file explorer + task attachments, backed by the app's Google Drive.
// Layout in Drive: <app root>/<workspace>/<project>/<task>/files (tasks without a project sit in the workspace folder).
// Every request is checked against the caller's workspace membership, and every file id must live under
// that workspace's folder, so nobody can reach another workspace's files.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { google } from "npm:googleapis@128.0.0";
import { createClient } from "npm:@supabase/supabase-js@2.97.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'content-disposition, content-type',
};
const FOLDER = 'application/vnd.google-apps.folder';

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
// Drive query strings need both \ and ' escaped (backslash first)
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const checkId = (id: unknown) => {
  if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) throw new HttpError(400, 'Invalid id');
  return id;
};
// Created once per warm instance so the Google access token is reused instead of refreshed on every request.
const auth = new google.auth.OAuth2(Deno.env.get('GOOGLE_CLIENT_ID'), Deno.env.get('GOOGLE_CLIENT_SECRET'));
auth.setCredentials({ refresh_token: Deno.env.get('GOOGLE_REFRESH_TOKEN') });
const drive = google.drive({ version: 'v3', auth });

const checkName = (name: unknown) => {
  const s = typeof name === 'string' ? name.trim() : '';
  if (!s || s.length > 255) throw new HttpError(400, 'Enter a name (up to 255 characters)');
  return s;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  // verify_jwt also accepts the public anon key, so require a real signed-in user.
  // This client runs as the caller, so RLS decides what they may read.
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  // verified locally against the project's signing keys (no round trip to the auth server)
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: claimsData } = jwt ? await userClient.auth.getClaims(jwt) : { data: null };
  const userId = claimsData?.claims?.role === 'authenticated' ? claimsData.claims.sub : undefined;
  if (!userId) return json({ error: 'Sign in required' }, 401);
  // Service role: only for writing Drive folder ids and cleaning up task_assets after an authorized delete.
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  if (!Deno.env.get('GOOGLE_REFRESH_TOKEN')) return json({ error: 'Missing OAuth2 configuration' }, 500);

  // ---------- access ----------
  const roleIn = async (ws: string) => {
    const { data } = await userClient.from('workspace_members').select('permission_role')
      .eq('workspace_id', ws).eq('user_id', userId).eq('status', 'active').maybeSingle();
    if (!data) throw new HttpError(403, 'You are not a member of this workspace');
    return data.permission_role as string;
  };
  const canEdit = (role: string) => role !== 'viewer';
  // owners/admins change anything; members only what they uploaded or created
  const canModify = (role: string, item: any) =>
    role === 'owner' || role === 'admin' || (role === 'member' && item.appProperties?.uploaded_by === userId);

  // ---------- drive helpers ----------
  const listChildren = async (parent: string, extra = '') => {
    // shortcut: one page (1000 items) per folder; add paging if a folder can hold more
    const res = await drive.files.list({
      q: `'${parent}' in parents and trashed = false${extra}`,
      fields: 'files(id,name,mimeType,size,modifiedTime,appProperties,webViewLink,parents)',
      orderBy: 'folder,name', pageSize: 1000,
    });
    return res.data.files ?? [];
  };
  const subfolders = (parent: string) => listChildren(parent, ` and mimeType = '${FOLDER}'`);
  const createFolder = async (name: string, parent: string, appProperties: Record<string, string>) =>
    (await drive.files.create({ requestBody: { name, mimeType: FOLDER, parents: [parent], appProperties }, fields: 'id' })).data.id as string;
  const moveItem = (id: string, from: string, to: string) =>
    drive.files.update({ fileId: id, addParents: to, removeParents: from, fields: 'id' });
  const trash = (id: string) => drive.files.update({ fileId: id, requestBody: { trashed: true } });

  // First writer wins; a request that lost the race trashes the folder it just created.
  const claim = async (table: 'workspaces' | 'projects', rowId: string, folderId: string, created: boolean) => {
    const { data } = await admin.from(table).update({ drive_folder_id: folderId }).eq('id', rowId).is('drive_folder_id', null).select('id');
    if (data?.length) return folderId;
    if (created) await trash(folderId);
    const { data: row } = await admin.from(table).select('drive_folder_id').eq('id', rowId).single();
    return row!.drive_folder_id as string;
  };

  const projectsOf = async (ws: string) =>
    ((await admin.from('projects').select('id, name, drive_folder_id').eq('workspace_id', ws)).data ?? []) as
      { id: string; name: string; drive_folder_id: string | null }[];

  const ensureProjectFolder = async (ws: string, root: string, p: { id: string; name: string; drive_folder_id: string | null }) =>
    p.drive_folder_id ?? claim('projects', p.id, await createFolder(p.name, root, { workspace_id: ws, kind: 'project', project_id: p.id }), true);

  const ensureTaskFolder = async (ws: string, parent: string, task: { id: string; name: string }) => {
    const [existing] = await listChildren(parent, ` and mimeType = '${FOLDER}' and appProperties has { key='task_id' and value='${task.id}' }`);
    return existing?.id ?? await createFolder(task.name, parent, { workspace_id: ws, kind: 'task', task_id: task.id, uploaded_by: userId });
  };

  // One-time move from the old layout <workspace>/<email>/<project>/<task> to <workspace>/<project>/<task>.
  const flattenLegacy = async (ws: string, root: string) => {
    const projects = await projectsOf(ws);
    for (const emailDir of (await subfolders(root)).filter(f => f.name?.includes('@'))) {
      for (const projDir of await subfolders(emailDir.id!)) {
        const project = projects.find(p => p.name === projDir.name);
        let target = project?.drive_folder_id ?? (await subfolders(root)).find(f => f.name === projDir.name)?.id ?? null;
        if (!target) {
          await moveItem(projDir.id!, emailDir.id!, root);
          target = projDir.id!;
        } else {
          for (const child of await listChildren(projDir.id!)) await moveItem(child.id!, projDir.id!, target);
          await trash(projDir.id!);
        }
        if (project && !project.drive_folder_id) {
          await drive.files.update({ fileId: target, requestBody: { appProperties: { workspace_id: ws, kind: 'project', project_id: project.id } } });
          project.drive_folder_id = await claim('projects', project.id, target, false);
        }
        // old task folders were named "[<task id>] name" or "name [<task id>]"
        for (const t of await subfolders(target)) {
          const m = t.name?.match(/\[([0-9a-f-]{36})\]/);
          if (m && !t.appProperties?.task_id) {
            await drive.files.update({ fileId: t.id!, requestBody: { name: t.name!.replace(m[0], '').trim() || 'Task', appProperties: { workspace_id: ws, kind: 'task', task_id: m[1] } } });
          }
        }
      }
      if (!(await listChildren(emailDir.id!)).length) await trash(emailDir.id!);
    }
  };

  const ensureRoot = async (ws: string) => {
    const { data: w } = await admin.from('workspaces').select('name, drive_folder_id').eq('id', ws).single();
    if (!w) throw new HttpError(404, 'Workspace not found');
    if (w.drive_folder_id) return w.drive_folder_id as string;
    const appRoot = Deno.env.get('GOOGLE_DRIVE_ROOT_FOLDER_ID')!;
    // Adopt the old name-based folder only when no other workspace has this name, or two workspaces could share files.
    const { count } = await admin.from('workspaces').select('id', { count: 'exact', head: true }).eq('name', w.name);
    const legacy = count === 1
      ? (await listChildren(appRoot, ` and mimeType = '${FOLDER}' and name = '${q(w.name)}'`)).find(f => !f.appProperties?.workspace_id)
      : undefined;
    if (legacy) {
      await drive.files.update({ fileId: legacy.id!, requestBody: { appProperties: { workspace_id: ws, kind: 'root' } } });
      const id = await claim('workspaces', ws, legacy.id!, false);
      if (id === legacy.id) await flattenLegacy(ws, id);
      return id;
    }
    return claim('workspaces', ws, await createFolder(w.name, appRoot, { workspace_id: ws, kind: 'root' }), true);
  };

  // Walks up from an item to the workspace folder; anything that doesn't lead there is out of reach.
  const pathTo = async (id: string, root: string) => {
    const path: any[] = [];
    for (let cur: string | undefined = id, i = 0; cur && i < 30; i++) {
      const { data } = await drive.files.get({ fileId: cur, fields: 'id,name,mimeType,parents,appProperties,trashed,webViewLink' });
      if (data.trashed) break;
      path.unshift(data);
      if (cur === root) return path;
      cur = data.parents?.[0];
    }
    throw new HttpError(404, 'File not found in this workspace');
  };
  const locate = async (ws: string, fileId: unknown) => {
    const root = await ensureRoot(ws);
    const path = await pathTo(checkId(fileId), root);
    return { root, path, item: path[path.length - 1] };
  };
  const locateFolder = async (ws: string, folderId: unknown) => {
    const found = await locate(ws, folderId);
    if (found.item.mimeType !== FOLDER) throw new HttpError(400, 'Not a folder');
    return found;
  };
  const assertModifiable = async (ws: string, root: string, role: string, item: any) => {
    const protectedIds = new Set([root, ...(await projectsOf(ws)).map(p => p.drive_folder_id)]);
    if (protectedIds.has(item.id)) throw new HttpError(403, 'Workspace and project folders are managed from the app');
    if (!canModify(role, item)) throw new HttpError(403, 'You can only change files and folders you added');
  };
  const forgetAttachments = (ws: string, fileId: string) =>
    admin.from('task_assets').delete().eq('workspace_id', ws).like('public_url', `%/d/${fileId}/%`);

  // ---------- upload (explorer folder or task attachment) ----------
  const upload = async (form: FormData) => {
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Missing file');
    const taskId = form.get('taskId');
    let parent: string;
    if (taskId) {
      const { data: task } = await userClient.from('tasks').select('id, name, workspace_id, project_id').eq('id', taskId).maybeSingle();
      const { data: allowed } = task
        ? await userClient.rpc('check_workspace_access', { target_workspace_id: task.workspace_id, allowed_roles: ['owner', 'admin', 'member'] })
        : { data: false };
      if (!task || !allowed) throw new HttpError(403, 'Not allowed to upload to this task');
      const root = await ensureRoot(task.workspace_id);
      const project = task.project_id ? (await projectsOf(task.workspace_id)).find(p => p.id === task.project_id) : undefined;
      const base = project ? await ensureProjectFolder(task.workspace_id, root, project) : root;
      parent = await ensureTaskFolder(task.workspace_id, base, task);
    } else {
      const ws = checkId(form.get('workspaceId'));
      if (!canEdit(await roleIn(ws))) throw new HttpError(403, 'Viewers cannot upload');
      parent = (await locateFolder(ws, form.get('folderId'))).item.id;
    }

    const buffer = new Uint8Array(await file.arrayBuffer());
    const boundary = '-------314159265358979323846';
    const enc = new TextEncoder();
    const head = enc.encode(
      `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
      JSON.stringify({ name: file.name || 'untitled', parents: [parent], appProperties: { uploaded_by: userId } }) +
      `\r\n--${boundary}\r\nContent-Type: ${file.type || 'application/octet-stream'}\r\n\r\n`);
    const tail = enc.encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + buffer.length + tail.length);
    body.set(head, 0);
    body.set(buffer, head.length);
    body.set(tail, head.length + buffer.length);

    const token = (await auth.getAccessToken()).token;
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!res.ok) throw new Error(`Google Drive API Upload Error: ${await res.text()}`);
    const data = await res.json();
    return json({ url: data.webViewLink, id: data.id, name: data.name });
  };

  // ---------- explorer actions (JSON body: { action, workspaceId, ... }) ----------
  const actions: Record<string, (b: any) => Promise<Response>> = {
    list: async ({ workspaceId, folderId }) => {
      const ws = checkId(workspaceId);
      const role = await roleIn(ws); // membership first: nothing below runs for outsiders
      const [root, projects] = await Promise.all([ensureRoot(ws), projectsOf(ws)]);
      const atRoot = !folderId || folderId === root;
      // every project gets its folder the first time someone opens the workspace root
      const projectFolders = atRoot
        ? await Promise.all(projects.map(p => ensureProjectFolder(ws, root, p)))
        : projects.map(p => p.drive_folder_id);
      const target = atRoot ? root : checkId(folderId);
      // fetched together; the children are only returned once the path proves the folder is in this workspace
      const [path, children] = await Promise.all([pathTo(target, root), listChildren(target)]);
      const folder = path[path.length - 1];
      if (folder.mimeType !== FOLDER) throw new HttpError(400, 'Not a folder');
      const protectedIds = new Set([root, ...projectFolders]);
      const items = children.map(f => ({
        id: f.id, name: f.name, mimeType: f.mimeType, isFolder: f.mimeType === FOLDER,
        size: f.size ? Number(f.size) : null, modifiedTime: f.modifiedTime, webViewLink: f.webViewLink,
        isProtected: protectedIds.has(f.id!),
        canModify: !protectedIds.has(f.id!) && canModify(role, f),
      }));
      return json({ canEdit: canEdit(role), path: path.map(p => ({ id: p.id, name: p.name })), items });
    },

    mkdir: async ({ workspaceId, parentId, name }) => {
      const ws = checkId(workspaceId);
      if (!canEdit(await roleIn(ws))) throw new HttpError(403, 'Viewers cannot create folders');
      const { item } = await locateFolder(ws, parentId);
      return json({ id: await createFolder(checkName(name), item.id, { uploaded_by: userId }) });
    },

    rename: async ({ workspaceId, fileId, name }) => {
      const ws = checkId(workspaceId);
      const role = await roleIn(ws);
      const { root, item } = await locate(ws, fileId);
      await assertModifiable(ws, root, role, item);
      await drive.files.update({ fileId: item.id, requestBody: { name: checkName(name) } });
      return json({ ok: true });
    },

    move: async ({ workspaceId, fileId, targetId }) => {
      const ws = checkId(workspaceId);
      const role = await roleIn(ws);
      const { root, item } = await locate(ws, fileId);
      await assertModifiable(ws, root, role, item);
      const { path: targetPath, item: target } = await locateFolder(ws, targetId);
      if (targetPath.some((p: any) => p.id === item.id)) throw new HttpError(400, 'A folder cannot be moved into itself');
      await drive.files.update({ fileId: item.id, addParents: target.id, removeParents: (item.parents ?? []).join(','), fields: 'id' });
      return json({ ok: true });
    },

    copy: async ({ workspaceId, fileId, targetId }) => {
      const ws = checkId(workspaceId);
      if (!canEdit(await roleIn(ws))) throw new HttpError(403, 'Viewers cannot copy files');
      const { item } = await locate(ws, fileId);
      if (item.mimeType === FOLDER) throw new HttpError(400, 'Folders cannot be copied, only files');
      const { item: target } = await locateFolder(ws, targetId);
      const { data } = await drive.files.copy({
        fileId: item.id, fields: 'id',
        requestBody: { name: item.name, parents: [target.id], appProperties: { uploaded_by: userId } },
      });
      return json({ id: data.id });
    },

    delete: async ({ workspaceId, fileId }) => {
      const ws = checkId(workspaceId);
      const role = await roleIn(ws);
      const { root, item } = await locate(ws, fileId);
      await assertModifiable(ws, root, role, item);
      // shortcut: members may only delete empty folders, so they never remove other people's files inside
      if (item.mimeType === FOLDER && role === 'member' && (await listChildren(item.id)).length) {
        throw new HttpError(403, 'Only owners and admins can delete folders that still contain files');
      }
      await trash(item.id); // stays in Drive's trash for 30 days
      await forgetAttachments(ws, item.id);
      return json({ ok: true });
    },

    download: async ({ workspaceId, fileId }) => {
      const ws = checkId(workspaceId);
      await roleIn(ws);
      const { item } = await locate(ws, fileId);
      if (item.mimeType === FOLDER) throw new HttpError(400, 'Folders cannot be downloaded');
      const native = item.mimeType.startsWith('application/vnd.google-apps.'); // Google Docs etc. export as PDF
      const token = (await auth.getAccessToken()).token;
      const src = native
        ? `https://www.googleapis.com/drive/v3/files/${item.id}/export?mimeType=application/pdf`
        : `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`;
      const res = await fetch(src, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new HttpError(502, 'Could not read the file from Drive');
      const name = native ? `${item.name}.pdf` : item.name;
      return new Response(res.body, { // streamed, never held in memory
        headers: {
          ...corsHeaders,
          'Content-Type': native ? 'application/pdf' : (res.headers.get('content-type') ?? 'application/octet-stream'),
          'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        },
      });
    },

    // called right before an owner deletes a workspace
    trashWorkspace: async ({ workspaceId }) => {
      const ws = checkId(workspaceId);
      if ((await roleIn(ws)) !== 'owner') throw new HttpError(403, 'Only the owner can delete the workspace files');
      const { data: w } = await admin.from('workspaces').select('drive_folder_id').eq('id', ws).single();
      if (w?.drive_folder_id) await trash(w.drive_folder_id);
      return json({ ok: true });
    },
  };

  try {
    // --- task attachment delete (task card / task deletion): row first, as the caller, so RLS decides ---
    if (req.method === 'DELETE') {
      const { fileId } = await req.json();
      checkId(fileId);
      const { data: deleted, error } = await userClient
        .from('task_assets').delete().like('public_url', `%/d/${fileId}/%`).select('id');
      if (error) throw error;
      if (!deleted?.length) return json({ error: 'Not allowed to delete this file' }, 403);
      // 404: the file lives in the old (pre-switch) Drive account, which this token can't reach
      await drive.files.delete({ fileId }).catch((e: any) => { if (e?.code !== 404) throw e; });
      return json({ success: true });
    }
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) return await upload(await req.formData());
    const body = await req.json();
    const handler = actions[body?.action];
    if (!handler) throw new HttpError(400, 'Unknown action');
    return await handler(body);
  } catch (e: any) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    if (e?.code === 404) return json({ error: 'File not found' }, 404);
    console.error('Drive function error:', e);
    return json({ error: 'Drive request failed', details: e?.message }, 500);
  }
});
