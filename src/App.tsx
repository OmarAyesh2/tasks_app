import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useWorkspace } from './context/WorkspaceContext';
import type { WorkspaceMember } from './context/WorkspaceContext';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { TaskCard } from './components/TaskCard';
import { ToolCard } from './components/ToolCard';
import { ClientCard } from './components/ClientCard';
import { AddTaskModal } from './components/AddTaskModal';
import { AddToolModal } from './components/AddToolModal';
import { AddProjectModal } from './components/AddProjectModal';
import { ClientModal } from './components/ClientModal';
import { ConfirmModal } from './components/ConfirmModal';
import { MemberManagement } from './components/MemberManagement';
import { WorkTime } from './components/WorkTime';
import { Plus, Loader2, Menu, List, Columns3, Search, LayoutList, CheckSquare, CalendarDays, Library, FolderOpen, Users, Clock, ContactRound, Keyboard } from 'lucide-react';
import { supabase, deleteDriveAttachments, canDeleteFile, taskAccess } from './lib/supabase';
import { FileBrowser } from './components/FileBrowser';
import { NotificationBell } from './components/NotificationBell';
import { CalendarView } from './components/CalendarView';
import { KanbanBoard } from './components/KanbanBoard';
import { CommandPalette, Kbd, type PaletteCommand } from './components/CommandPalette';
import { FileViewer } from './components/FileViewer';
import { Modal } from './components/Modal';
import type { DriveItem } from './components/FileBrowser';
import type { Task, Tool, Project, Client } from './types';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableTaskCardProps {
  task: Task;
  members: WorkspaceMember[];
  onStatusChange: (task: Task) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
  onEdit: () => void;
  onDelete: () => void;
  focused?: boolean;
}

function SortableTaskCard(props: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TaskCard
        {...props}
        isDragging={isDragging}
        dragHandleProps={listeners}
      />
    </div>
  );
}

function Dashboard() {
  if (!supabase) return null;

  const { user, loading: authLoading } = useAuth();
  const { activeWorkspace, currentMemberProfile, loading: workspaceLoading, setActiveWorkspaceById } = useWorkspace();
  const [currentView, setCurrentView] = useState<'tasks' | 'completed' | 'calendar' | 'tools' | 'members' | 'work_time' | 'clients' | 'files'>('tasks');
  const [selectedMemberFilter, setSelectedMemberFilter] = useState<string>('all');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [toolToEdit, setToolToEdit] = useState<Tool | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [clientToEdit, setClientToEdit] = useState<Client | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null); // opened from a notification
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [viewingFile, setViewingFile] = useState<DriveItem | null>(null); // opened from search
  const [taskLayout, setTaskLayout] = useState<'list' | 'board'>(() => {
    try { return localStorage.getItem('task_layout') === 'board' ? 'board' : 'list'; } catch { return 'list'; }
  });
  const changeTaskLayout = (layout: 'list' | 'board') => {
    setTaskLayout(layout);
    try { localStorage.setItem('task_layout', layout); } catch { /* private mode: just don't remember */ }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const fetchTools = async () => {
    if (!user) return;
    try {
      const { data: toolsData } = await supabase!
        .from('tools')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (toolsData) setTools(toolsData as Tool[]);
    } catch (error) {
      console.error('Error fetching tools:', error);
    }
  };

  const fetchClients = async () => {
    if (!activeWorkspace) {
      setClients([]);
      return;
    }

    try {
      const { data } = await supabase!
        .from('clients')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      if (data) setClients(data as Client[]);
    } catch (error) {
      console.error('Error fetching clients:', error);
    }
  };

  const fetchData = async () => {
    if (!activeWorkspace) {
      setTasks([]);
      setProjects([]);
      setMembers([]);
      setClients([]);
      setIsInitialLoad(false);
      return;
    }

    try {
      // Fetch tasks with attached tools via junction table
      const { data: tasksData } = await supabase!
        .from('tasks')
        .select(`
          *,
          task_tools (
            tool_id,
            tools (*)
          ),
          task_assets (*),
          clients ( id, name )
        `)
        .eq('workspace_id', activeWorkspace.id)
        .order('sort_order', { ascending: true });

      if (tasksData) {
        const enriched = tasksData.map((t: any) => ({
          ...t,
          tools: (t.task_tools ?? []).map((jt: any) => jt.tools).filter(Boolean),
          assets: t.task_assets ?? [],
          client: t.clients ?? null,
        }));
        // Remove the raw junction keys
        enriched.forEach((t: any) => {
          delete t.task_tools;
          delete t.task_assets;
          delete t.clients;
        });
        setTasks(enriched as Task[]);
      }

      // Tools are fetched separately (account-wide)

      // Fetch projects
      const { data: projectsData } = await supabase!
        .from('projects')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .order('created_at', { ascending: false });

      // Fetch members
      const { data: membersData } = await supabase!
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', activeWorkspace.id)
        .eq('status', 'active');


      if (projectsData) setProjects(projectsData as Project[]);
      if (membersData) setMembers(membersData as WorkspaceMember[]);

      // Fetch clients (only if feature flag is on)
      if (activeWorkspace.enable_client_tracker) {
        await fetchClients();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsInitialLoad(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchTools();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user, activeWorkspace?.id]);

  // Realtime live sync
  useEffect(() => {
    if (!supabase || !activeWorkspace || !user) return;

    const debounceRef_rt: { current: ReturnType<typeof setTimeout> | null } = { current: null };
    const debouncedFetch = () => {
      if (debounceRef_rt.current) clearTimeout(debounceRef_rt.current);
      debounceRef_rt.current = setTimeout(() => fetchData(), 500);
    };

    const channel = supabase
      .channel(`workspace-${activeWorkspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `workspace_id=eq.${activeWorkspace.id}` }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects', filter: `workspace_id=eq.${activeWorkspace.id}` }, debouncedFetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `workspace_id=eq.${activeWorkspace.id}` }, debouncedFetch)
      .subscribe();

    return () => {
      supabase?.removeChannel(channel);
      if (debounceRef_rt.current) clearTimeout(debounceRef_rt.current);
    };
  }, [activeWorkspace?.id, user]);

  // Guard: if client tracker is disabled, redirect away from clients view
  useEffect(() => {
    if (currentView === 'clients' && !activeWorkspace?.enable_client_tracker) {
      setCurrentView('tasks');
    }
  }, [currentView, activeWorkspace?.enable_client_tracker]);

  // from a notification: switch workspace if needed, clear filters that could hide the task, then scroll to it
  const handleOpenTask = async (workspaceId: string, taskId: string) => {
    if (workspaceId !== activeWorkspace?.id) setActiveWorkspaceById(workspaceId);
    const { data } = await supabase!.from('tasks').select('status').eq('id', taskId).maybeSingle();
    if (!data) {
      alert('This task no longer exists.');
      return;
    }
    setCurrentProjectId(null);
    setSelectedMemberFilter('all');
    changeTaskLayout('list');
    setCurrentView(data.status === 'done' ? 'completed' : 'tasks');
    setFocusTaskId(taskId);
    setTimeout(() => setFocusTaskId(id => (id === taskId ? null : id)), 6000);
  };

  // keyboard shortcuts: Ctrl/⌘+K or / search, N new task, ? list, G then a letter to switch page
  useEffect(() => {
    let gPressedAt = 0;
    const pages: Record<string, typeof currentView> = { t: 'tasks', d: 'completed', c: 'calendar', r: 'tools', f: 'files', m: 'members' };
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(open => !open);
        return;
      }
      // never while typing or while a dialog is open
      const target = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || target.closest('input, textarea, select, [contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
      const key = e.key.toLowerCase();
      if (pages[key] && Date.now() - gPressedAt < 1000) {
        e.preventDefault();
        gPressedAt = 0;
        setCurrentView(pages[key]);
      } else if (key === 'g') {
        gPressedAt = Date.now();
      } else if (e.key === '/') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (key === 'n' && currentMemberProfile && currentMemberProfile.permission_role !== 'viewer') {
        e.preventDefault();
        setTaskToEdit(null);
        setIsTaskModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentMemberProfile]);

  const handleTaskStatusChange = async (task: Task) => {
    handleTaskUpdate(task.id, { status: task.status === 'done' ? 'to_do' : 'done' });
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...updates } : t
    ));

    // Strip virtual properties that don't belong in the tasks table
    const dbUpdates = { ...updates };
    delete dbUpdates.assets;

    // If there's nothing left to update in the DB, return early
    if (Object.keys(dbUpdates).length === 0) return;

    const { error } = await supabase!
      .from('tasks')
      .update(dbUpdates)
      .eq('id', taskId);

    // finishing a repeating task makes the database create the next one; load it
    if (!error && updates.status === 'done' && tasks.find(t => t.id === taskId)?.recurrence) fetchData();

    if (error) {
      console.error('Error updating task:', error);
      fetchData(); // Revert
    }
  };

  // Delete Confirmation State
  const [deleteConfig, setDeleteConfig] = useState<{
    isOpen: boolean;
    type: 'task' | 'tool' | 'project';
    item: Task | Tool | Project | null;
  }>({
    isOpen: false,
    type: 'task',
    item: null,
  });

  const uniqueCategories = ['All', ...Array.from(new Set(tools.map(t => t.category).filter(Boolean) as string[])).sort()];

  // Files the current user may delete along with the task being deleted (kept files stay in the Files page)
  const [deleteTaskFiles, setDeleteTaskFiles] = useState(false);
  const deletableTaskFiles = deleteConfig.type === 'task'
    ? ((deleteConfig.item as Task | null)?.assets ?? []).filter(a => canDeleteFile(a.uploaded_by, currentMemberProfile?.permission_role, user?.id))
    : [];

  const handleDeleteTask = (task: Task) => {
    setDeleteTaskFiles(false);
    setDeleteConfig({
      isOpen: true,
      type: 'task',
      item: task,
    });
  };

  const handleDeleteTool = (tool: Tool) => {
    setDeleteConfig({
      isOpen: true,
      type: 'tool',
      item: tool,
    });
  };

  const confirmDelete = async () => {
    const { type, item } = deleteConfig;
    if (!item || !supabase) return;

    // Optimistic update
    if (type === 'task') {
      setTasks(tasks.filter(t => t.id !== item.id));
      setDeleteConfig(prev => ({ ...prev, isOpen: false })); // Close immediately for smooth UX

      if (deleteTaskFiles) await deleteDriveAttachments(deletableTaskFiles.map(a => a.public_url));

      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', item.id);

      if (error) {
        console.error('Error deleting task:', error);
        fetchData(); // Revert
      }
    } else if (type === 'project') {
      const remainingProjects = projects.filter(p => p.id !== item.id);
      setProjects(remainingProjects);
      if (currentProjectId === item.id) {
        setCurrentProjectId(remainingProjects.length > 0 ? remainingProjects[0].id : null);
      }
      setDeleteConfig(prev => ({ ...prev, isOpen: false }));

      const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', item.id);

      if (error) {
        console.error('Error deleting project:', error);
        fetchData(); // Revert
      }
    } else {
      setTools(tools.filter(t => t.id !== item.id));
      setDeleteConfig(prev => ({ ...prev, isOpen: false }));

      const { error } = await supabase
        .from('tools')
        .delete()
        .eq('id', item.id);

      if (error) {
        console.error('Error deleting resource:', error);
        fetchData(); // Revert
      }
    }
  };

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setDeleteConfig({
      isOpen: true,
      type: 'project',
      item: projects.find(p => p.id === projectId) ?? null,
    });
  };

  if (authLoading || workspaceLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  // project + member filters, shared by the task lists and the calendar
  const matchesFilters = (t: Task) => {
    if (currentProjectId && t.project_id !== currentProjectId) return false;
    if (selectedMemberFilter === 'me') return t.assigned_to_member === currentMemberProfile?.id;
    if (selectedMemberFilter !== 'all') return t.assigned_to_member === selectedMemberFilter;
    return true;
  };
  const filteredTasks = tasks.filter(t => matchesFilters(t) && (currentView === 'tasks' ? t.status !== 'done' : t.status === 'done'));

  const role = currentMemberProfile?.permission_role;
  const modKey = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
  const paletteCommands: PaletteCommand[] = [
    { id: 'tasks', label: 'Tasks', hint: 'G T', icon: LayoutList, run: () => setCurrentView('tasks') },
    { id: 'completed', label: 'Completed', hint: 'G D', icon: CheckSquare, run: () => setCurrentView('completed') },
    { id: 'calendar', label: 'Calendar', hint: 'G C', icon: CalendarDays, run: () => setCurrentView('calendar') },
    { id: 'tools', label: 'Resources', hint: 'G R', icon: Library, run: () => setCurrentView('tools') },
    { id: 'files', label: 'Files', hint: 'G F', icon: FolderOpen, run: () => setCurrentView('files') },
    { id: 'members', label: 'Members', hint: 'G M', icon: Users, run: () => setCurrentView('members') },
    ...(activeWorkspace?.time_tracking_enabled && role !== 'viewer'
      ? [{ id: 'work_time', label: 'Work Time', icon: Clock, run: () => setCurrentView('work_time') }] : []),
    ...(activeWorkspace?.enable_client_tracker
      ? [{ id: 'clients', label: 'Clients', icon: ContactRound, run: () => setCurrentView('clients') }] : []),
    ...(role && role !== 'viewer'
      ? [{ id: 'new-task', label: 'New task', hint: 'N', icon: Plus, run: () => { setTaskToEdit(null); setIsTaskModalOpen(true); } }] : []),
    { id: 'shortcuts', label: 'Keyboard shortcuts', hint: '?', icon: Keyboard, run: () => setShortcutsOpen(true) },
  ];

  const memberFilter = (currentMemberProfile?.permission_role === 'owner' || currentMemberProfile?.permission_role === 'admin') && (
    <div className="flex justify-end mb-4">
      <select
        value={selectedMemberFilter}
        onChange={(e) => setSelectedMemberFilter(e.target.value)}
        aria-label="Filter by member"
        className="input-field w-full fold:w-auto text-sm py-1.5 cursor-pointer"
      >
        <option value="all">All Members</option>
        <option value="me">Assigned to Me</option>
        {members
          .filter(m => m.user_id !== currentMemberProfile?.user_id)
          .map(m => (
            <option key={m.id} value={m.id}>
              {m.member_title ? `${m.email.split('@')[0]} (${m.member_title})` : m.email.split('@')[0]}
            </option>
          ))}
      </select>
    </div>
  );

  const filteredTools = tools.filter(t => {
    return selectedCategory === 'All' ? true : t.category === selectedCategory;
  });

  const currentProjectName = currentProjectId ? projects.find(p => p.id === currentProjectId)?.name : null;

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = filteredTasks.findIndex(t => t.id === active.id);
    const newIndex = filteredTasks.findIndex(t => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(filteredTasks, oldIndex, newIndex);

    // Optimistic update of full tasks array preserving non-filtered tasks
    const reorderedIds = reordered.map(t => t.id);
    setTasks(prev => {
      const nonFiltered = prev.filter(t => !reorderedIds.includes(t.id));
      const updatedFiltered = reordered.map((t, i) => ({ ...t, sort_order: i * 1000 }));
      return [...nonFiltered, ...updatedFiltered].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    });

    // Persist to Supabase
    for (let i = 0; i < reordered.length; i++) {
      const newSortOrder = i * 1000;
      await supabase!
        .from('tasks')
        .update({ sort_order: newSortOrder })
        .eq('id', reordered[i].id);
    }
  };

  return (
    <div className="min-h-screen text-text-main dark:text-slate-100 font-sans transition-colors duration-300">
      <Sidebar
        currentView={currentView}
        onViewChange={(view) => {
          setCurrentView(view);
          setIsMobileMenuOpen(false);
        }}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        projects={projects}
        currentProjectId={currentProjectId}
        onProjectSelect={(id) => {
          setCurrentProjectId(id);
          setIsMobileMenuOpen(false);
        }}
        onNewProject={() => {
          setIsProjectModalOpen(true);
          setIsMobileMenuOpen(false);
        }}
        onDeleteProject={handleDeleteProject}
      />

      <main className="ml-0 md:ml-64 p-3 fold:p-5 md:p-8 min-h-screen transition-all duration-300">
        <header className="flex flex-col fold:flex-row fold:items-center md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Open menu"
              className="md:hidden p-2 -ml-2 text-text-muted hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-2xl fold:text-3xl font-bold text-text-main dark:text-slate-100 capitalize">
                  {currentView === 'tasks' ? 'Tasks' 
                   : currentView === 'completed' ? 'Completed Tasks' 
                   : currentView === 'calendar' ? 'Calendar'
                   : currentView === 'members' ? 'Members' 
                   : currentView === 'work_time' ? 'Work Time'
                   : currentView === 'clients' ? 'Clients'
                   : currentView === 'files' ? 'Files'
                   : 'Resources'}
                </h1>
                {currentProjectName && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    {currentProjectName}
                  </span>
                )}
              </div>
              <p className="text-text-muted dark:text-slate-400">
                {currentView === 'tasks'
                  ? `You have ${filteredTasks.length} pending tasks`
                  : currentView === 'completed'
                    ? `You have completed ${filteredTasks.length} tasks`
                    : currentView === 'calendar'
                      ? 'Tasks by due date. Drag a task to reschedule it'
                    : currentView === 'members'
                      ? 'Manage your workspace team'
                      : currentView === 'work_time'
                        ? 'Track your daily work hours'
                        : currentView === 'clients'
                          ? 'Manage your workspace leads and active relationships'
                          : currentView === 'files'
                            ? 'This workspace\'s files, with a folder for every project'
                            : 'Your collection of useful resources'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full fold:w-auto md:w-auto">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            title={`Search (${modKey}+K)`}
            className="h-11 min-w-11 inline-flex items-center justify-center gap-2 px-3 rounded-full text-text-muted hover:text-text-main hover:bg-slate-900/[0.05] dark:hover:text-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          >
            <Search className="w-5 h-5" />
            <span className="hidden lg:inline text-sm">Search</span>
            <span className="hidden lg:inline"><Kbd>{modKey} K</Kbd></span>
          </button>
          <NotificationBell onOpenTask={handleOpenTask} />
          {currentView !== 'members' && currentView !== 'work_time' && currentView !== 'files' && currentMemberProfile?.permission_role !== 'viewer' && (
            <button
              onClick={() => {
                if (currentView === 'tools') {
                  setToolToEdit(null);
                  setIsToolModalOpen(true);
                } else if (currentView === 'clients') {
                  setClientToEdit(null);
                  setIsClientModalOpen(true);
                } else {
                  setTaskToEdit(null);
                  setIsTaskModalOpen(true);
                }
              }}
              className="btn-primary flex items-center gap-2 shadow-lg hover:shadow-primary/20 flex-1 fold:flex-none justify-center"
            >
              <Plus className="w-5 h-5" />
              Add {currentView === 'tools' ? 'Resource' : currentView === 'clients' ? 'Client' : 'Task'}
            </button>
          )}
          </div>
        </header>

        {isInitialLoad ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
          </div>
        ) : (
          <>
            {currentView === 'members' ? (
              <MemberManagement />
            ) : currentView === 'work_time' ? (
              <WorkTime />
            ) : currentView === 'files' ? (
              <FileBrowser key={activeWorkspace?.id} />
            ) : currentView === 'calendar' ? (
              <div>
                {memberFilter}
                {activeWorkspace && <CalendarView
                  workspaceId={activeWorkspace.id}
                  tasks={tasks.filter(matchesFilters)}
                  canEdit={currentMemberProfile?.permission_role !== 'viewer'}
                  canRemoveNote={(note) => role === 'owner' || role === 'admin' || (role === 'member' && note.created_by === user.id)}
                  onReschedule={(taskId, dueDate) => handleTaskUpdate(taskId, { due_date: dueDate })}
                  onOpen={(task) => handleOpenTask(activeWorkspace.id, task.id)}
                />}
              </div>
            ) : currentView === 'clients' ? (
              <div className="grid grid-cols-1 fold:grid-cols-2 lg:grid-cols-3 gap-6">
                {clients.length === 0 ? (
                  <div className="col-span-full text-center py-12 bg-white/50 dark:bg-dark-surface/50 rounded-2xl border border-dashed border-slate-300 dark:border-dark-border">
                    <p className="text-text-muted dark:text-slate-400">No clients yet. Add your first client to get started.</p>
                  </div>
                ) : (
                  clients.map(client => (
                    <ClientCard
                      key={client.id}
                      client={client}
                      onEdit={() => {
                        setClientToEdit(client);
                        setIsClientModalOpen(true);
                      }}
                      onDelete={async () => {
                        if (!window.confirm('Are you sure you want to delete this client?')) return;
                        // Optimistic removal
                        setClients(prev => prev.filter(c => c.id !== client.id));
                        const { error } = await supabase!
                          .from('clients')
                          .delete()
                          .eq('id', client.id);
                        if (error) {
                          console.error('Error deleting client:', error);
                          fetchClients(); // Revert on failure
                        }
                      }}
                    />
                  ))
                )}
              </div>
            ) : currentView === 'tools' ? (
              <div className="space-y-6">
                {/* Category Filters */}
                <div className="flex justify-start pb-2">
                  <div className="relative inline-block w-48">
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="w-full appearance-none bg-white dark:bg-dark-surface border border-slate-200 dark:border-dark-border text-text-main dark:text-slate-100 py-2 pl-4 pr-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all cursor-pointer"
                    >
                      {uniqueCategories.map(category => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-text-muted">
                      <svg className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                        <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTools.map(tool => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      onEdit={() => {
                        setToolToEdit(tool);
                        setIsToolModalOpen(true);
                      }}
                      onDelete={() => handleDeleteTool(tool)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div className={currentView === 'tasks' && taskLayout === 'board' ? '' : 'max-w-3xl xl:max-w-4xl'}>
                {currentView === 'tasks' ? (
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <div role="group" aria-label="Task layout" className="inline-flex p-1 rounded-full border border-slate-200/80 dark:border-white/10 bg-white/50 dark:bg-white/[0.03]">
                      {([['list', 'List', List], ['board', 'Board', Columns3]] as const).map(([id, label, Icon]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => changeTaskLayout(id)}
                          aria-pressed={taskLayout === id}
                          className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full text-sm font-medium transition-colors ${
                            taskLayout === id ? 'bg-primary text-on-primary' : 'text-text-muted hover:text-text-main dark:hover:text-slate-100'
                          }`}
                        >
                          <Icon className="w-4 h-4" /> {label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 [&>div]:mb-0">{memberFilter}</div>
                  </div>
                ) : memberFilter}

                {currentView === 'tasks' && taskLayout === 'board' ? (
                  <KanbanBoard
                    tasks={tasks.filter(matchesFilters)}
                    members={members}
                    canMove={(t) => taskAccess(t, currentMemberProfile?.permission_role, currentMemberProfile?.id, user.id).work}
                    onMove={(taskId, status) => handleTaskUpdate(taskId, { status })}
                    onOpen={(task) => activeWorkspace && handleOpenTask(activeWorkspace.id, task.id)}
                    onShowCompleted={() => setCurrentView('completed')}
                  />
                ) : (

                <div className="space-y-4">
                  {filteredTasks.length === 0 ? (
                    <div className="text-center py-12 bg-white/50 dark:bg-dark-surface/50 rounded-2xl border border-dashed border-slate-300 dark:border-dark-border">
                      <p className="text-text-muted dark:text-slate-400">No items found</p>
                    </div>
                ) : currentView === 'tasks' ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={filteredTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                      {filteredTasks.map(task => (
                        <SortableTaskCard
                          key={task.id}
                          task={task}
                          members={members}
                          onStatusChange={handleTaskStatusChange}
                          onUpdateTask={handleTaskUpdate}
                          onEdit={() => {
                            setTaskToEdit(task);
                            setIsTaskModalOpen(true);
                          }}
                          onDelete={() => handleDeleteTask(task)}
                          focused={focusTaskId === task.id}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                ) : (
                  filteredTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      members={members}
                      onStatusChange={handleTaskStatusChange}
                      onUpdateTask={handleTaskUpdate}
                      onEdit={() => {
                        setTaskToEdit(task);
                        setIsTaskModalOpen(true);
                      }}
                      onDelete={() => handleDeleteTask(task)}
                      focused={focusTaskId === task.id}
                    />
                  ))
                )}
                </div>
                )}
              </div>
            )}
          </>
        )}

        {paletteOpen && (
          <CommandPalette
            workspaceId={activeWorkspace?.id}
            tasks={tasks}
            clients={activeWorkspace?.enable_client_tracker ? clients : []}
            tools={tools}
            commands={paletteCommands}
            onOpenTask={(task) => activeWorkspace && handleOpenTask(activeWorkspace.id, task.id)}
            onOpenClient={(client) => {
              setCurrentView('clients');
              if (role !== 'viewer') { setClientToEdit(client); setIsClientModalOpen(true); }
            }}
            onOpenFile={setViewingFile}
            onClose={() => setPaletteOpen(false)}
          />
        )}

        {viewingFile && activeWorkspace && (
          <FileViewer workspaceId={activeWorkspace.id} files={[{ id: viewingFile.id, name: viewingFile.name }]} startIndex={0} onClose={() => setViewingFile(null)} />
        )}

        <Modal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-3 text-sm">
            {([
              [[`${modKey} K`], 'Search everything (/ works too)'],
              [['N'], 'New task'],
              [['G', 'T'], 'Go to Tasks'],
              [['G', 'D'], 'Go to Completed'],
              [['G', 'C'], 'Go to Calendar'],
              [['G', 'R'], 'Go to Resources'],
              [['G', 'F'], 'Go to Files'],
              [['G', 'M'], 'Go to Members'],
              [['?'], 'Show this list'],
              [['Esc'], 'Close a dialog or preview'],
              [[`${modKey} Enter`], 'Save the open form'],
            ] as const).map(([keys, label]) => (
              <div key={label + keys.join()} className="contents">
                <dt className="text-text-main dark:text-slate-200">{label}</dt>
                <dd className="flex items-center gap-1 text-text-muted">
                  {keys.map((k, i) => <span key={k} className="flex items-center gap-1">{i > 0 && <span className="text-xs">then</span>}<Kbd>{k}</Kbd></span>)}
                </dd>
              </div>
            ))}
          </dl>
        </Modal>

        <AddTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setTaskToEdit(null);
          }}
          onSuccess={fetchData}
          tools={tools}
          members={members}
          taskToEdit={taskToEdit}
          projects={projects}
          defaultProjectId={currentProjectId}
          clients={clients}
        />

        <AddToolModal
          isOpen={isToolModalOpen}
          onClose={() => {
            setIsToolModalOpen(false);
            setToolToEdit(null);
          }}
          onSuccess={fetchTools}
          categories={uniqueCategories.filter(c => c !== 'All')}
          toolToEdit={toolToEdit}
        />

        <AddProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          onSuccess={fetchData}
        />

        <ClientModal
          isOpen={isClientModalOpen}
          onClose={() => {
            setIsClientModalOpen(false);
            setClientToEdit(null);
          }}
          onSuccess={fetchClients}
          clientToEdit={clientToEdit}
        />

        <ConfirmModal
          isOpen={deleteConfig.isOpen}
          onClose={() => setDeleteConfig(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmDelete}
          title={deleteConfig.type === 'task' ? 'Delete Task' : 'Delete Resource'}
          message={`Are you sure you want to delete "${deleteConfig.item?.name}"? This action cannot be undone.`}
        >
          {deletableTaskFiles.length > 0 && (
            <label className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-sm text-text-main dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteTaskFiles}
                onChange={(e) => setDeleteTaskFiles(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-red-500"
              />
              <span>
                Also delete {deletableTaskFiles.length === 1 ? 'its attached file' : `its ${deletableTaskFiles.length} attached files`} from Google Drive
                <span className="block text-xs text-text-muted mt-0.5">Leave unchecked to keep them in the Files page.</span>
              </span>
            </label>
          )}
        </ConfirmModal>
      </main>
    </div>
  );
}

import { ThemeProvider } from './context/ThemeContext';
import { WorkspaceProvider } from './context/WorkspaceContext';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <Dashboard />
        </WorkspaceProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
