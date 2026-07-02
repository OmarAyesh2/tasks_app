import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  created_at: string;
  time_tracking_enabled?: boolean;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string | null;
  email: string;
  permission_role: WorkspaceRole;
  member_title: string | null;
  status: 'invited' | 'active' | 'left';
}

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface WorkspaceContextType {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  currentMemberProfile: WorkspaceMember | null;
  loading: boolean;
  setActiveWorkspace: (workspace: Workspace) => void;
  setActiveWorkspaceById: (id: string) => void;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  inviteUser: (email: string, role: WorkspaceRole, title: string) => Promise<boolean>;
  acceptPendingInvites: () => Promise<void>;
  leaveWorkspace: () => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'active_workspace_id';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace | null>(null);
  const [currentMemberProfile, setCurrentMemberProfile] = useState<WorkspaceMember | null>(null);
  const [loading, setLoading] = useState(true);

  // Track whether we have done the initial fetch so that the auth listener
  // doesn't double-fire on mount.
  const initialised = useRef(false);

  // -------------------------------------------
  // Fetch workspaces for the current user
  // -------------------------------------------
  const fetchWorkspaces = useCallback(async (): Promise<Workspace[]> => {
    if (!supabase) return [];

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('workspace_members')
      .select('workspace_id, workspaces ( id, name, created_at, time_tracking_enabled )')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching workspaces:', error);
      return [];
    }

    // Each row contains a nested `workspaces` object from the join.
    const fetched: Workspace[] = (data ?? [])
      .map((row: Record<string, unknown>) => row.workspaces as Workspace | null)
      .filter((ws): ws is Workspace => ws !== null);

    return fetched;
  }, []);

  // -------------------------------------------
  // Select a workspace and persist the choice
  // -------------------------------------------
  const setActiveWorkspace = useCallback((workspace: Workspace) => {
    setActiveWorkspaceState(workspace);
    try {
      localStorage.setItem(STORAGE_KEY, workspace.id);
    } catch {
      // localStorage may be unavailable (e.g. in private mode)
    }
  }, []);

  // -------------------------------------------
  // Fetch the current user's member profile
  // for the active workspace
  // -------------------------------------------
  const fetchMemberProfile = useCallback(async (workspaceId: string) => {
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCurrentMemberProfile(null);
      return;
    }

    const { data, error } = await supabase
      .from('workspace_members')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single();

    if (error) {
      console.error('Error fetching member profile:', error);
      setCurrentMemberProfile(null);
      return;
    }

    setCurrentMemberProfile(data as WorkspaceMember);
  }, []);

  // -------------------------------------------
  // Accept pending invitations for the current user
  // -------------------------------------------
  const acceptPendingInvites = useCallback(async () => {
    if (!supabase) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const { data: pending, error: fetchError } = await supabase
      .from('workspace_members')
      .select('id')
      .eq('email', user.email)
      .eq('status', 'invited');

    if (fetchError || !pending || pending.length === 0) return;

    const ids = pending.map((row: { id: string }) => row.id);

    const { error: updateError } = await supabase
      .from('workspace_members')
      .update({
        user_id: user.id,
        status: 'active' as const,
        joined_at: new Date().toISOString(),
      })
      .in('id', ids);

    if (updateError) {
      console.error('Error accepting pending invites:', updateError);
    }
  }, []);

  // -------------------------------------------
  // Full load / reload sequence
  // -------------------------------------------
  const loadWorkspaces = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Accept any pending invites before fetching workspaces so newly
      // accepted workspaces appear immediately.
      await acceptPendingInvites();

      const fetched = await fetchWorkspaces();
      setWorkspaces(fetched);

      if (fetched.length === 0) {
        setActiveWorkspaceState(null);
        setCurrentMemberProfile(null);
        return;
      }

      // Determine which workspace to activate
      let savedId: string | null = null;
      try {
        savedId = localStorage.getItem(STORAGE_KEY);
      } catch {
        // ignore
      }

      const saved = savedId ? fetched.find((ws) => ws.id === savedId) : undefined;
      const target = saved ?? fetched[0];

      setActiveWorkspaceState(target);
      try {
        localStorage.setItem(STORAGE_KEY, target.id);
      } catch {
        // ignore
      }

      await fetchMemberProfile(target.id);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fetchWorkspaces, fetchMemberProfile, acceptPendingInvites]);

  // -------------------------------------------
  // Re-fetch member profile when active workspace changes
  // -------------------------------------------
  useEffect(() => {
    if (activeWorkspace) {
      fetchMemberProfile(activeWorkspace.id);
    } else {
      setCurrentMemberProfile(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspace?.id]);

  // -------------------------------------------
  // Initial load
  // -------------------------------------------
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    if (!initialised.current) {
      initialised.current = true;
      loadWorkspaces();
    }
  }, [loadWorkspaces]);

  // -------------------------------------------
  // Auth state listener
  // -------------------------------------------
  useEffect(() => {
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        // Run silently if already initialized to prevent layout flashes on tab focus
        loadWorkspaces(initialised.current);
      } else if (event === 'SIGNED_OUT') {
        setWorkspaces([]);
        setActiveWorkspaceState(null);
        setCurrentMemberProfile(null);
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch {
          // ignore
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [loadWorkspaces]);

  // -------------------------------------------
  // Create a new workspace
  // -------------------------------------------
  const createWorkspace = useCallback(async (name: string): Promise<Workspace | null> => {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('workspaces')
      .insert({ name })
      .select()
      .single();

    if (error) {
      console.error('Error creating workspace:', error);
      return null;
    }

    const newWorkspace = data as Workspace;

    // Refresh the full workspace list so the membership row (created by the
    // backend trigger/function) is included.
    await loadWorkspaces();

    // Automatically switch to the newly created workspace.
    setActiveWorkspace(newWorkspace);

    return newWorkspace;
  }, [loadWorkspaces, setActiveWorkspace]);

  // -------------------------------------------
  // Invite a user to the active workspace
  // -------------------------------------------
  const inviteUser = useCallback(async (
    email: string,
    role: WorkspaceRole,
    title: string,
  ): Promise<boolean> => {
    if (!supabase || !activeWorkspace) return false;

    const { error } = await supabase
      .from('workspace_members')
      .upsert({
        workspace_id: activeWorkspace.id,
        email,
        permission_role: role,
        member_title: title || null,
        status: 'active' as const,
      }, { onConflict: 'workspace_id,email' });

    if (error) {
      console.error('Error inviting user:', error);
      return false;
    }

    return true;
  }, [activeWorkspace]);

  // -------------------------------------------
  // Leave the active workspace
  // -------------------------------------------
  const leaveWorkspace = useCallback(async () => {
    if (!supabase || !activeWorkspace) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', activeWorkspace.id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error leaving workspace:', error);
      return;
    }

    await loadWorkspaces();
  }, [activeWorkspace, loadWorkspaces]);

  // -------------------------------------------
  // Expose a manual refresh for consumers
  // -------------------------------------------
  const refreshWorkspaces = useCallback(async () => {
    await loadWorkspaces();
  }, [loadWorkspaces]);

  // -------------------------------------------
  // Render
  // -------------------------------------------
  // -------------------------------------------
  // Select a workspace by ID (convenience for UI selects)
  // -------------------------------------------
  const setActiveWorkspaceById = useCallback((id: string) => {
    const target = workspaces.find((ws) => ws.id === id);
    if (target) {
      setActiveWorkspace(target);
    }
  }, [workspaces, setActiveWorkspace]);

  const value: WorkspaceContextType = {
    workspaces,
    activeWorkspace,
    currentMemberProfile,
    loading,
    setActiveWorkspace,
    setActiveWorkspaceById,
    createWorkspace,
    inviteUser,
    acceptPendingInvites,
    leaveWorkspace,
    refreshWorkspaces,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWorkspace(): WorkspaceContextType {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
