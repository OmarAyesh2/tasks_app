import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { Plus, X, Loader2, ChevronDown, Wrench, Search } from 'lucide-react';
import type { Link, Tool, Task, Project } from '../types';
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
}

export function AddTaskModal({ isOpen, onClose, onSuccess, tools, members, taskToEdit, projects, defaultProjectId }: AddTaskModalProps) {
    const { user } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [links, setLinks] = useState<Link[]>([]);
    const [newLinkName, setNewLinkName] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');
    const [projectId, setProjectId] = useState<string | null>(defaultProjectId || null);
    const [assignedToMember, setAssignedToMember] = useState<string | null>(null);

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
            if (taskToEdit) {
                setName(taskToEdit.name);
                setDescription(taskToEdit.description || '');
                setLinks(taskToEdit.links || []);
                setProjectId(taskToEdit.project_id || null);
                setAssignedToMember(taskToEdit.assigned_to_member || null);
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
        setSelectedToolIds([]);
        setInlineTools([]);
        setToolSearch('');
        setShowToolDropdown(false);
        setShowInlineForm(false);
        setInlineToolName('');
        setInlineToolLink('');
    };

    const handleAddLink = () => {
        if (newLinkName && newLinkUrl) {
            setLinks([...links, { name: newLinkName, url: newLinkUrl }]);
            setNewLinkName('');
            setNewLinkUrl('');
        }
    };

    const removeLink = (index: number) => {
        setLinks(links.filter((_, i) => i !== index));
    };

    const toggleTool = (toolId: string) => {
        setSelectedToolIds(prev =>
            prev.includes(toolId)
                ? prev.filter(id => id !== toolId)
                : [...prev, toolId]
        );
    };

    const removeInlineTool = (index: number) => {
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

        setLoading(true);
        try {
            let taskId: string;

            if (isEditing) {
                // Update existing task
                const { error: updateError } = await supabase
                    .from('tasks')
                    .update({
                        name,
                        description: description || null,
                        links,
                        project_id: projectId,
                        assigned_to_member: assignedToMember
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
                        links,
                        user_id: user.id,
                        status: 'to_do',
                        project_id: projectId,
                        workspace_id: activeWorkspace.id,
                        assigned_to_member: assignedToMember
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
                        user_id: user.id,
                        project_id: projectId,
                        workspace_id: activeWorkspace.id
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
        } catch (error) {
            console.error('Error saving task:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Edit Task' : 'New Task'}>
            <form onSubmit={handleSubmit} className="space-y-3">
                {/* Task Name */}
                <div>
                    <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">Task Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="What needs to be done?"
                        required
                    />
                </div>

                {/* Project Assignment */}
                <div>
                    <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">Project Assignment</label>
                    <select
                        value={projectId || ''}
                        onChange={(e) => setProjectId(e.target.value || null)}
                        className="input-field"
                    >
                        <option value="">No Project (Workspace Default)</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </div>

                {/* Member Assignment */}
                <div>
                    <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">Assign To</label>
                    <select
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

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field min-h-[80px] resize-none"
                        placeholder="Add some details..."
                    />
                </div>

                {/* Attach Resources */}
                <div>
                    <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">Attach Resources</label>

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
                                        className="ml-0.5 hover:text-red-500 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Dropdown */}
                    <div className="relative" ref={dropdownRef}>
                        <button
                            type="button"
                            onClick={() => setShowToolDropdown(!showToolDropdown)}
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
                                            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-text-main dark:text-slate-100 outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
                                            placeholder="Search resources..."
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
                                className="w-full px-3 py-1.5 text-sm rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-text-main dark:text-slate-100 outline-none focus:border-primary transition-all"
                                placeholder="Resource name"
                                autoFocus
                            />
                            <input
                                type="url"
                                value={inlineToolLink}
                                onChange={(e) => setInlineToolLink(e.target.value)}
                                className="w-full px-3 py-1.5 text-sm rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-text-main dark:text-slate-100 outline-none focus:border-primary transition-all"
                                placeholder="https://..."
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
                    <label className="block text-sm font-medium text-text-muted dark:text-slate-400 mb-1">Links</label>

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
                            type="text"
                            value={newLinkName}
                            onChange={(e) => setNewLinkName(e.target.value)}
                            className="input-field flex-1"
                            placeholder="Link Name"
                        />
                        <input
                            type="url"
                            value={newLinkUrl}
                            onChange={(e) => setNewLinkUrl(e.target.value)}
                            className="input-field flex-[2]"
                            placeholder="https://..."
                        />
                        <button
                            type="button"
                            onClick={handleAddLink}
                            disabled={!newLinkName || !newLinkUrl}
                            className="p-2 bg-slate-100 dark:bg-slate-800 text-text-muted rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors flex-shrink-0"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Actions */}
                <div className="pt-3 flex justify-end gap-3 border-t border-slate-100 dark:border-dark-border">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-text-muted hover:text-text-main dark:text-slate-400 dark:hover:text-slate-100 font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary flex items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {isEditing ? 'Save Changes' : 'Create Task'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
