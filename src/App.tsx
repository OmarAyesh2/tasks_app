import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Auth } from './components/Auth';
import { Sidebar } from './components/Sidebar';
import { TaskCard } from './components/TaskCard';
import { ToolCard } from './components/ToolCard';
import { AddTaskModal } from './components/AddTaskModal';
import { AddToolModal } from './components/AddToolModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Plus, Loader2, Menu } from 'lucide-react';
import { supabase } from './lib/supabase';
import type { Task, Tool } from './types';

function Dashboard() {
  if (!supabase) return null;

  const { user, loading: authLoading } = useAuth();
  const [currentView, setCurrentView] = useState<'tasks' | 'completed' | 'tools'>('tasks');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isToolModalOpen, setIsToolModalOpen] = useState(false);
  const [toolToEdit, setToolToEdit] = useState<Tool | null>(null);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when view changes
  const handleViewChange = (view: 'tasks' | 'completed' | 'tools') => {
    setCurrentView(view);
    setIsMobileMenuOpen(false);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch tasks
      const { data: tasksData } = await supabase!
        .from('tasks')
        .select('*')
        .order('created_at', { ascending: false });

      if (tasksData) setTasks(tasksData as Task[]);

      // Fetch tools
      const { data: toolsData } = await supabase!
        .from('tools')
        .select('*')
        .order('created_at', { ascending: false });

      if (toolsData) setTools(toolsData as Tool[]);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const handleTaskStatusChange = async (task: Task) => {
    const newStatus = task.status === 'to_do' ? 'done' : 'to_do';

    // Optimistic update
    setTasks(tasks.map(t =>
      t.id === task.id ? { ...t, status: newStatus } : t
    ));

    const { error } = await supabase!
      .from('tasks')
      .update({ status: newStatus })
      .eq('id', task.id);

    if (error) {
      console.error('Error updating task:', error);
      // Revert if error
      fetchData();
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
        console.error('Error deleting tool:', error);
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

  const filteredTasks = tasks.filter(t =>
    currentView === 'tasks' ? t.status === 'to_do' : t.status === 'done'
  );

  return (
    <div className="min-h-screen bg-background dark:bg-dark-bg text-text-main dark:text-slate-100 font-sans transition-colors duration-300">
      <Sidebar
        currentView={currentView}
        onViewChange={handleViewChange}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
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
              <h1 className="text-3xl font-bold text-text-main dark:text-slate-100 capitalize">
                {currentView === 'tasks' ? 'Tasks' : currentView === 'completed' ? 'Completed Tasks' : 'Tools'}
              </h1>
              <p className="text-text-muted dark:text-slate-400 mt-1">
                {currentView === 'tasks'
                  ? `You have ${filteredTasks.length} pending tasks`
                  : currentView === 'completed'
                    ? `You have completed ${filteredTasks.length} tasks`
                    : 'Your collection of useful tools'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              if (currentView === 'tools') {
                setToolToEdit(null);
                setIsToolModalOpen(true);
              } else {
                setIsTaskModalOpen(true);
              }
            }}
            className="btn-primary flex items-center gap-2 shadow-lg hover:shadow-primary/20 w-full md:w-auto justify-center"
          >
            <Plus className="w-5 h-5" />
            Add {currentView === 'tools' ? 'Tool' : 'Task'}
          </button>
        </header>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
          </div>
        ) : (
          <>
            {currentView === 'tools' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tools.map(tool => (
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
          onClose={() => setIsTaskModalOpen(false)}
          onTaskAdded={fetchData}
        />

        <AddToolModal
          isOpen={isToolModalOpen}
          onClose={() => {
            setIsToolModalOpen(false);
            setToolToEdit(null);
          }}
          onToolAdded={fetchData}
          toolToEdit={toolToEdit}
        />

        <ConfirmModal
          isOpen={deleteConfig.isOpen}
          onClose={() => setDeleteConfig(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmDelete}
          title={deleteConfig.type === 'task' ? 'Delete Task' : 'Delete Tool'}
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
