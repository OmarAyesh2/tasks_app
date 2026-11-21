import React, { useState, useRef, useEffect } from 'react';
import { Modal, ModalActions } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { Plus, X, ChevronDown, Wrench, Search } from 'lucide-react';
import type { Link, Tool, Task, Project, Client } from '../types';
import type { WorkspaceMember } from '../context/WorkspaceContext';

interface InlineTool {
    name: string;
    link: string;
}

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    tools: Tool[];
    members: WorkspaceMember[];
    taskToEdit?: Task | null;
    projects: Project[];
    defaultProjectId?: string | null;
    clients?: Client[];
}

const FORM_ID = 'task-form';
const labelClass = 'block text-sm font-medium text-text-muted dark:text-slate-400 mb-1';

// a link added without a name is labelled with its site, e.g. "figma.com"
const siteName = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

export function AddTaskModal({ isOpen, onClose, onSuccess, tools, members, taskToEdit, projects, defaultProjectId, clients }: AddTaskModalProps) {
    const { user } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [links, setLinks] = useState<Link[]>([]);
    const [newLinkName, setNewLinkName] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [projectId, setProjectId] = useState<string | null>(defaultProjectId || null);
    const [assignedToMember, setAssignedToMember] = useState<string | null>(null);
    const [dueDate, setDueDate] = useState('');
    const [priority, setPriority] = useState<'high' | 'medium' | 'low' | null>(null);
    const [clientId, setClientId] = useState<string | null>(null);

    // Tool selection state
    const [selectedToolIds, setSelectedToolIds] = useState<string[]>([]);
    const [inlineTools, setInlineTools] = useState<InlineTool[]>([]);
    const [showToolDropdown, setShowToolDropdown] = useState(false);
    const [toolSearch, setToolSearch] = useState('');
    const [showInlineForm, setShowInlineForm] = useState(false);
    const [inlineToolName, setInlineToolName] = useState('');
    const [inlineToolLink, setInlineToolLink] = useState('');

    const isEditing = !!taskToEdit;

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Pre-fill form when editing
    useEffect(() => {
        if (isOpen) {
            setError(null);
            setDirty(false);
            if (taskToEdit) {
                setName(taskToEdit.name);
                setDescription(taskToEdit.description || '');
                setLinks(taskToEdit.links || []);
                setProjectId(taskToEdit.project_id || null);
                setAssignedToMember(taskToEdit.assigned_to_member || null);
                setDueDate(taskToEdit.due_date ?? '');
                setPriority(taskToEdit.priority ?? null);
                setClientId(taskToEdit.client_id ?? null);
                setSelectedToolIds(taskToEdit.tools?.map(t => t.id) || []);
                setInlineTools([]);
            } else {
                resetForm();
                setProjectId(defaultProjectId || null);
            }
        }
    }, [isOpen, taskToEdit]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowToolDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const resetForm = () => {
        setName('');
        setDescription('');
        setLinks([]);
        setNewLinkName('');
        setNewLinkUrl('');
        setAssignedToMember(null);
        setDueDate('');
        setPriority(null);
        setClientId(null);
        setSelectedToolIds([]);
        setInlineTools([]);
        setToolSearch('');
        setShowToolDropdown(false);
        setShowInlineForm(false);
        setInlineToolName('');
        setInlineToolLink('');
    };

    const pendingLink = (): Link | null =>
        newLinkUrl.trim() ? { name: newLinkName.trim() || siteName(newLinkUrl.trim()), url: newLinkUrl.trim() } : null;

    const handleAddLink = () => {
        const link = pendingLink();
        if (!link) return;
        setLinks([...links, link]);
        setNewLinkName('');
        setNewLinkUrl('');
    };

    // Enter in a sub-field adds that item instead of submitting the whole task
    const addOnEnter = (add: () => void) => (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            add();
        }
    };

    const removeLink = (index: number) => {
        setDirty(true);
        setLinks(links.filter((_, i) => i !== index));
    };

    const toggleTool = (toolId: string) => {
        setDirty(true);
        setSelectedToolIds(prev =>
            prev.includes(toolId)
                ? prev.filter(id => id !== toolId)
                : [...prev, toolId]
        );
    };

    const removeInlineTool = (index: number) => {
        setDirty(true);
        setInlineTools(prev => prev.filter((_, i) => i !== index));
    };

    const handleAddInlineTool = () => {
        if (inlineToolName && inlineToolLink) {
            setInlineTools(prev => [...prev, { name: inlineToolName, link: inlineToolLink }]);
            setInlineToolName('');
            setInlineToolLink('');
            setShowInlineForm(false);
        }
    };

    const filteredTools = tools.filter(tool =>
        tool.name.toLowerCase().includes(toolSearch.toLowerCase())
    );

    const selectedTools = tools.filter(t => selectedToolIds.includes(t.id));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !supabase || !activeWorkspace) return;

        // a link typed but not yet added with + is saved too, instead of silently dropped
        const extra = pendingLink();
        const allLinks = extra ? [...links, extra] : links;

        setLoading(true);
        setError(null);
        try {
            let taskId: string;

            if (isEditing) {
                // Update existing task
                const { error: updateError } = await supabase
                    .from('tasks')
                    .update({
                        name,
                        description: description || null,
                        links: allLinks,
                        project_id: projectId,
                        assigned_to_member: assignedToMember,
                        due_date: dueDate || null,
                        priority,
                        client_id: clientId || null
                    })
                    .eq('id', taskToEdit!.id);

                if (updateError) throw updateError;
                taskId = taskToEdit!.id;

                // Remove old junction rows, then re-insert
                const { error: deleteJunctionError } = await supabase
                    .from('task_tools')
                    .delete()
                    .eq('task_id', taskId);

                if (deleteJunctionError) throw deleteJunctionError;
            } else {
                // Insert new task
                const { data: taskData, error: taskError } = await supabase
                    .from('tasks')
                    .insert({
                        name,
                        description: description || null,
                        links: allLinks,
                        user_id: user.id,
                        status: 'to_do',
                        project_id: projectId,
                        workspace_id: activeWorkspace.id,
                        assigned_to_member: assignedToMember,
                        due_date: dueDate || null,
                        priority,
                        client_id: clientId || null
                    })
                    .select('id')
                    .single();

                if (taskError) throw taskError;
                taskId = taskData.id;
            }

            // Insert any inline tools and collect their IDs
            const allToolIds = [...selectedToolIds];

            for (const inlineTool of inlineTools) {
                const { data: toolData, error: toolError } = await supabase
                    .from('tools')
                    .insert({
                        name: inlineTool.name,
                        link: inlineTool.link,
                        category: 'Uncategorized',
                        user_id: user.id
                    })
                    .select('id')
                    .single();

                if (toolError) throw toolError;
                allToolIds.push(toolData.id);
            }

            // Insert junction rows
            if (allToolIds.length > 0) {
                const junctionRows = allToolIds.map(toolId => ({
                    task_id: taskId,
                    tool_id: toolId
                }));

                const { error: junctionError } = await supabase
                    .from('task_tools')
                    .insert(junctionRows);

                if (junctionError) throw junctionError;
            }

            onSuccess();
            resetForm();
            onClose();
        } catch (err) {
            console.error('Error saving task:', err);
            setError('Could not save the task. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Edit Task' : 'New Task'}
            size="lg"
            confirmClose={dirty}
            footer={
                <ModalActions
                    formId={FORM_ID}
                    onCancel={onClose}
                    submitLabel={isEditing ? 'Save Changes' : 'Create Task'}
                    loading={loading}
                    error={error}
                />
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit} onChange={() => setDirty(true)} className="space-y-4">
                {/* What */}
                <div>
                    <label htmlFor="task-name" className={labelClass}>Task name</label>
                    <input
                        id="task-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="What needs to be done?"
                        required
                        autoFocus
                    />
                </div>

                <div>
                    <label htmlFor="task-description" className={labelClass}>Description</label>
                    <textarea
                        id="task-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field min-h-[80px] resize-y"
                        placeholder="Add some details..."
                    />
                </div>

                {/* Details: short fields side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-4">
                    <div>
                        <label htmlFor="task-project" className={labelClass}>Project</label>
                        <select
                            id="task-project"
                            value={projectId || ''}
                            onChange={(e) => setProjectId(e.target.value || null)}
                            className="input-field"
                        >
                            <option value="">No project</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="task-assignee" className={labelClass}>Assign to</label>
                        <select
                            id="task-assignee"
                            value={assignedToMember || ''}
                            onChange={(e) => setAssignedToMember(e.target.value || null)}
                            className="input-field"
                        >
                            <option value="">Unassigned</option>
                            {members.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.member_title ? `${m.email} (${m.member_title})` : m.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label htmlFor="task-due" className="block text-sm font-medium text-text-muted dark:text-slate-400">Due date</label>
                            {dueDate && (
                                <button
                                    type="button"
                                    onClick={() => { setDueDate(''); setDirty(true); }}
                                    className="text-xs text-primary hover:text-primary-hover transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        <input
                            id="task-due"
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="input-field"
                        />
                    </div>

                    <div>
                        <span id="task-priority-label" className={labelClass}>Priority</span>
                        <div role="group" aria-labelledby="task-priority-label" className="flex gap-2">
                            {(['high', 'medium', 'low'] as const).map((level) => {
                                const isSelected = priority === level;
                                const colorMap = {
                                    high: isSelected
                                        ? 'bg-red-100 text-red-600 border-red-300 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-white dark:bg-dark-surface text-text-muted dark:text-slate-400 border-slate-200 dark:border-dark-border hover:border-slate-300',
                                    medium: isSelected
                                        ? 'bg-amber-100 text-amber-600 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400'
                                        : 'bg-white dark:bg-dark-surface text-text-muted dark:text-slate-400 border-slate-200 dark:border-dark-border hover:border-slate-300',
                                    low: isSelected
                                        ? 'bg-blue-100 text-blue-600 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400'
                                        : 'bg-white dark:bg-dark-surface text-text-muted dark:text-slate-400 border-slate-200 dark:border-dark-border hover:border-slate-300',
                                };
                                return (
                                    <button
                                        key={level}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => { setPriority(isSelected ? null : level); setDirty(true); }}
                                        className={`flex-1 min-h-[42px] px-3 text-sm font-medium rounded-lg border transition-colors ${colorMap[level]}`}
                                    >
                                        {level.charAt(0).toUpperCase() + level.slice(1)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {clients && clients.length > 0 && (
                        <div>
                            <label htmlFor="task-client" className={labelClass}>Client</label>
                            <select
                                id="task-client"
                                value={clientId || ''}
                                onChange={(e) => setClientId(e.target.value || null)}
                                className="input-field"
                            >
                                <option value="">No client</option>
                                {clients.filter(c => c.status === 'active' || c.status === 'negotiating').map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Attach Resources */}
                <div>
                    <span className={labelClass}>Resources</span>

                    {/* Selected & inline tool chips */}
                    {(selectedTools.length > 0 || inlineTools.length > 0) && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {selectedTools.map(tool => (
                                <span
                                    key={tool.id}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20"
                                >
                                    <Wrench className="w-3 h-3" />
                                    {tool.name}
                                    <button
                                        type="button"
                                        onClick={() => toggleTool(tool.id)}
                                        aria-label={`Remove ${tool.name}`}
                                        className="ml-0.5 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                            {inlineTools.map((tool, idx) => (
                                <span
                                    key={`inline-${idx}`}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-xs font-medium border border-green-500/20"
                                >
                                    <Plus className="w-3 h-3" />
                                    {tool.name}
                                    <span className="text-[10px] opacity-60">(new)</span>
                                    <button
                                        type="button"
                                        onClick={() => removeInlineTool(idx)}
                                        aria-label={`Remove ${tool.name}`}
                                        className="ml-0.5 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Dropdown (Escape closes just the list, not the whole form) */}
                    <div
                        className="relative"
                        ref={dropdownRef}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape' && showToolDropdown) {
                                e.stopPropagation();
                                setShowToolDropdown(false);
                            }
                        }}
                    >
                        <button
                            type="button"
                            onClick={() => setShowToolDropdown(!showToolDropdown)}
                            aria-expanded={showToolDropdown}
                            className="input-field flex items-center justify-between cursor-pointer"
                        >
                            <span className="text-text-muted text-sm">
                                {selectedToolIds.length + inlineTools.length > 0
                                    ? `${selectedToolIds.length + inlineTools.length} resource(s) selected`
                                    : 'Select resources...'}
                            </span>
                            <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 ${showToolDropdown ? 'rotate-180' : ''}`} />
                        </button>

                        {showToolDropdown && (
                            <div className="absolute z-50 mt-1 w-full bg-white dark:bg-dark-surface rounded-lg border border-slate-200 dark:border-dark-border shadow-xl animate-fade-in flex flex-col"
                                style={{ maxHeight: '220px' }}
                            >
                                {/* Search bar */}
                                <div className="px-2.5 py-2 border-b border-slate-100 dark:border-dark-border flex-shrink-0">
                                    <div className="relative">
                                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
                                        <input
                                            type="text"
                                            value={toolSearch}
                                            onChange={(e) => setToolSearch(e.target.value)}
                                            onKeyDown={addOnEnter(() => filteredTools[0] && toggleTool(filteredTools[0].id))}
                                            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-text-main dark:text-slate-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                                            placeholder="Search resources..."
                                            aria-label="Search resources"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                {/* Tool list */}
                                <div className="overflow-y-auto flex-1">
                                    {filteredTools.length === 0 && (
                                        <div className="px-4 py-3 text-sm text-text-muted dark:text-slate-500 text-center">
                                            {toolSearch ? 'No matches found' : 'No resources yet'}
                                        </div>
                                    )}
                                    {filteredTools.map(tool => {
                                        const isSelected = selectedToolIds.includes(tool.id);
                                        return (
                                            <button
                                                type="button"
                                                key={tool.id}
                                                onClick={() => toggleTool(tool.id)}
                                                aria-pressed={isSelected}
                                                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors ${
                                                    isSelected
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'text-text-main dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                                                }`}
                                            >
                                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                    isSelected
                                                        ? 'bg-primary border-primary text-white'
                                                        : 'border-slate-300 dark:border-slate-600'
                                                }`}>
                                                    {isSelected && (
                                                        <svg className="w-2.5 h-2.5" viewBox="0 0 12 12" fill="none">
                                                            <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                                                        </svg>
                                                    )}
                                                </div>
                                                <span className="font-medium truncate">{tool.name}</span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* "Add Resource Manually" trigger at bottom of dropdown */}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowInlineForm(true);
                                        setShowToolDropdown(false);
                                    }}
                                    className="flex items-center gap-2 px-3 py-2 text-sm text-primary font-medium hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors border-t border-slate-100 dark:border-dark-border flex-shrink-0"
                                >
                                    <Plus className="w-4 h-4" />
                                    Add Resource Manually
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Inline "Add Resource Manually" form — shown OUTSIDE the dropdown */}
                    {showInlineForm && (
                        <div className="mt-2 p-3 rounded-lg border border-dashed border-primary/40 bg-primary/5 dark:bg-primary/10 space-y-2">
                            <p className="text-xs font-semibold text-primary mb-1">New Resource</p>
                            <input
                                type="text"
                                value={inlineToolName}
                                onChange={(e) => setInlineToolName(e.target.value)}
                                onKeyDown={addOnEnter(handleAddInlineTool)}
                                className="w-full px-3 py-1.5 text-sm rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-text-main dark:text-slate-100 outline-none focus:border-primary transition-all"
                                placeholder="Resource name"
                                aria-label="New resource name"
                                autoFocus
                            />
                            <input
                                type="url"
                                value={inlineToolLink}
                                onChange={(e) => setInlineToolLink(e.target.value)}
                                onKeyDown={addOnEnter(handleAddInlineTool)}
                                className="w-full px-3 py-1.5 text-sm rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-text-main dark:text-slate-100 outline-none focus:border-primary transition-all"
                                placeholder="https://..."
                                aria-label="New resource URL"
                            />
                            <div className="flex justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowInlineForm(false);
                                        setInlineToolName('');
                                        setInlineToolLink('');
                                    }}
                                    className="px-3 py-1.5 text-xs text-text-muted dark:text-slate-400 hover:text-text-main dark:hover:text-slate-100 font-medium rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAddInlineTool}
                                    disabled={!inlineToolName || !inlineToolLink}
                                    className="px-3 py-1.5 text-xs bg-primary text-white rounded-md font-medium disabled:opacity-40 hover:bg-primary-hover transition-colors"
                                >
                                    Add Resource
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Links */}
                <div>
                    <span className={labelClass}>Links</span>

                    {links.length > 0 && (
                        <div className="space-y-1.5 mb-2">
                            {links.map((link, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-100 dark:border-dark-border">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="font-medium text-sm text-text-main dark:text-slate-200">{link.name}</span>
                                        <span className="text-xs text-text-muted truncate border-l border-slate-200 dark:border-slate-600 pl-2">{link.url}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => removeLink(idx)}
                                        aria-label={`Remove link ${link.name}`}
                                        className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-2">
                        <input
                            type="url"
                            value={newLinkUrl}
                            onChange={(e) => setNewLinkUrl(e.target.value)}
                            onKeyDown={addOnEnter(handleAddLink)}
                            className="input-field flex-[2]"
                            placeholder="https://..."
                            aria-label="Link URL"
                        />
                        <input
                            type="text"
                            value={newLinkName}
                            onChange={(e) => setNewLinkName(e.target.value)}
                            onKeyDown={addOnEnter(handleAddLink)}
                            className="input-field flex-1"
                            placeholder="Name (optional)"
                            aria-label="Link name"
                        />
                        <button
                            type="button"
                            onClick={handleAddLink}
                            disabled={!newLinkUrl.trim()}
                            aria-label="Add link"
                            className="p-2 bg-slate-100 dark:bg-slate-800 text-text-muted rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors flex-shrink-0"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </form>
        </Modal>
    );
}
