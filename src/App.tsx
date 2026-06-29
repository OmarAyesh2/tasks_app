import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { TaskCard } from './components/TaskCard';
import { ToolCard } from './components/ToolCard';
import { AddTaskModal } from './components/AddTaskModal';
import { AddToolModal } from './components/AddToolModal';
import { AddProjectModal } from './components/AddProjectModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Plus, Loader2, Menu } from 'lucide-react';
import { supabase } from './lib/supabase';
import type { Task, Tool, Project } from './types';

function Dashboard() {
  if (!supabase) return null;

  const { user, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<'tasks' | 'completed' | 'tools'>('tasks');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [toolToEdit, setToolToEdit] = useState<Tool | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const fetchData = async () => {
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
          task_assets (*)
        `)
        .order('created_at', { ascending: false });

      if (tasksData) {
        const enriched = tasksData.map((t: any) => ({
          ...t,
          tools: (t.task_tools ?? []).map((jt: any) => jt.tools).filter(Boolean),
          assets: t.task_assets ?? [],
        }));
        // Remove the raw junction keys
        enriched.forEach((t: any) => {
          delete t.task_tools;
          delete t.task_assets;
        });
        setTasks(enriched as Task[]);
      }

      // Fetch tools
      const { data: toolsData } = await supabase!
        .from('tools')
        .select('*')
        .order('created_at', { ascending: false });

      // Fetch projects
      const { data: projectsData } = await supabase!
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (toolsData) setTools(toolsData as Tool[]);
      if (projectsData) setProjects(projectsData as Project[]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsInitialLoad(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const handleTaskStatusChange = async (task: Task) => {
    handleTaskUpdate(task.id, { status: task.status === 'to_do' ? 'done' : 'to_do' });
  };

  const handleTaskUpdate = async (taskId: string, updates: Partial<Task>) => {
    // Optimistic update
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, ...updates } : t
    ));

    const { error } = await supabase!
      .from('tasks')
      .update(updates)
      .eq('id', taskId);

    if (error) {
      console.error('Error updating task:', error);
      fetchData(); // Revert
    }
  };

  // Delete Confirmation State
  const [deleteConfig, setDeleteConfig] = useState<{
    isOpen: boolean;
    type: 'task' | 'tool';
    item: Task | Tool | null;
  }>({
    isOpen: false,
    type: 'task',
    item: null,
  });

  const uniqueCategories = ['All', ...Array.from(new Set(tools.map(t => t.category).filter(Boolean) as string[])).sort()];

  const handleDeleteTask = (task: Task) => {
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

      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', item.id);

      if (error) {
        console.error('Error deleting task:', error);
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const filteredTasks = tasks.filter(t => {
    if (currentProjectId && t.project_id !== currentProjectId) return false;
    return currentView === 'tasks' ? t.status === 'to_do' : t.status === 'done';
  });

  const filteredTools = tools.filter(t => {
    if (currentProjectId && t.project_id !== currentProjectId) return false;
    return selectedCategory === 'All' ? true : t.category === selectedCategory;
  });

  const currentProjectName = currentProjectId ? projects.find(p => p.id === currentProjectId)?.name : null;

  return (
    <div className="min-h-screen bg-background dark:bg-dark-bg text-text-main dark:text-slate-100 font-sans transition-colors duration-300">
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
      />

      <main className="ml-0 md:ml-64 p-4 md:p-8 min-h-screen transition-all duration-300">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 animate-fade-in">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-2 text-text-muted hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-bold text-text-main dark:text-slate-100 capitalize">
                  {currentView === 'tasks' ? 'Tasks' : currentView === 'completed' ? 'Completed Tasks' : 'Resources'}
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
                    : 'Your collection of useful resources'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (currentView === 'tools') {
                setToolToEdit(null);
                setIsToolModalOpen(true);
              } else {
                setTaskToEdit(null);
                setIsTaskModalOpen(true);
              }
            }}
            className="btn-primary flex items-center gap-2 shadow-lg hover:shadow-primary/20 w-full md:w-auto justify-center"
          >
            <Plus className="w-5 h-5" />
            Add {currentView === 'tools' ? 'Resource' : 'Task'}
          </button>
        </header>

        {isInitialLoad ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
          </div>
        ) : (
          <>
            {currentView === 'tools' ? (
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
              <div className="space-y-4 max-w-3xl">
                {filteredTasks.length === 0 ? (
                  <div className="text-center py-12 bg-white/50 dark:bg-dark-surface/50 rounded-2xl border border-dashed border-slate-300 dark:border-dark-border">
                    <p className="text-text-muted dark:text-slate-400">No items found</p>
                  </div>
                ) : (
                  filteredTasks.map(task => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onStatusChange={handleTaskStatusChange}
                      onUpdateTask={handleTaskUpdate}
                      onEdit={() => {
                        setTaskToEdit(task);
                        setIsTaskModalOpen(true);
                      }}
                      onDelete={() => handleDeleteTask(task)}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}

        <AddTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => {
            setIsTaskModalOpen(false);
            setTaskToEdit(null);
          }}
          onSuccess={fetchData}
          tools={tools}
          taskToEdit={taskToEdit}
          projects={projects}
          defaultProjectId={currentProjectId}
        />

        <AddToolModal
          isOpen={isToolModalOpen}
          onClose={() => {
            setIsToolModalOpen(false);
            setToolToEdit(null);
          }}
          onSuccess={fetchData}
          toolToEdit={toolToEdit}
          projects={projects}
          defaultProjectId={currentProjectId}
        />

        <AddProjectModal
          isOpen={isProjectModalOpen}
          onClose={() => setIsProjectModalOpen(false)}
          onSuccess={fetchData}
        />

        <ConfirmModal
          isOpen={deleteConfig.isOpen}
          onClose={() => setDeleteConfig(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmDelete}
          title={deleteConfig.type === 'task' ? 'Delete Task' : 'Delete Resource'}
          message={`Are you sure you want to delete "${deleteConfig.item?.name}"? This action cannot be undone.`}
        />
      </main>
    </div>
  );
}

import { ThemeProvider } from './context/ThemeContext';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Dashboard />
      </AuthProvider>
    </ThemeProvider>
  );
}
