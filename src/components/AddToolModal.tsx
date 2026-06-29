import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import type { Tool, Project } from '../types';

interface AddToolModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    toolToEdit?: Tool | null;
    projects: Project[];
    defaultProjectId?: string | null;
}

export function AddToolModal({ isOpen, onClose, onSuccess, toolToEdit, projects, defaultProjectId }: AddToolModalProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [link, setLink] = useState('');
    const [category, setCategory] = useState('');
    const [projectId, setProjectId] = useState<string | null>(defaultProjectId || null);

    const resetForm = () => {
        setName('');
        setDescription('');
        setLink('');
        setCategory('');
    };

    useEffect(() => {
        if (isOpen) {
            if (toolToEdit) {
                setName(toolToEdit.name);
                setDescription(toolToEdit.description || '');
                setLink(toolToEdit.link);
                setCategory(toolToEdit.category || '');
                setProjectId(toolToEdit.project_id || null);
            } else {
                resetForm();
                setProjectId(defaultProjectId || null);
            }
        }
    }, [isOpen, toolToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !supabase) return;

        setLoading(true);
        try {
            if (toolToEdit) {
                const { error } = await supabase.from('tools').update({
                    name,
                    description: description || null,
                    link,
                    category: category || null,
                    project_id: projectId
                }).eq('id', toolToEdit.id);

                if (error) throw error;
            } else {
                const { error } = await supabase.from('tools').insert({
                    name,
                    description: description || null,
                    link,
                    category: category || null,
                    user_id: user.id,
                    project_id: projectId
                });

                if (error) throw error;
            }

            onSuccess();
            resetForm();
            onClose();
        } catch (error) {
            console.error('Error adding resource:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={toolToEdit ? "Edit Resource" : "New Resource"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Resource Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="Resource Name"
                        required
                    />
                </div>

                {/* Project Assignment */}
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Project Assignment</label>
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

                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Category</label>
                    <input
                        type="text"
                        list="resource-categories"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="input-field"
                        placeholder="e.g. AI Tools, Design Reference..."
                    />
                    <datalist id="resource-categories">
                        <option value="AI Tools" />
                        <option value="Design Reference" />
                        <option value="Assets" />
                        <option value="Legal" />
                    </datalist>
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field min-h-[100px] resize-none"
                        placeholder="What is this resource for?"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">URL</label>
                    <input
                        type="url"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        className="input-field"
                        placeholder="https://..."
                        required
                    />
                </div>

                <div className="pt-4 flex justify-end gap-3">
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
                        {toolToEdit ? "Save Changes" : "Add Resource"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
