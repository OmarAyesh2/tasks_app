import React, { useState } from 'react';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Plus, X, Loader2 } from 'lucide-react';
import type { Link } from '../types';

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTaskAdded: () => void;
}

export function AddTaskModal({ isOpen, onClose, onTaskAdded }: AddTaskModalProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [links, setLinks] = useState<Link[]>([]);
    const [newLinkName, setNewLinkName] = useState('');
    const [newLinkUrl, setNewLinkUrl] = useState('');

    const resetForm = () => {
        setName('');
        setDescription('');
        setLinks([]);
        setNewLinkName('');
        setNewLinkUrl('');
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !supabase) return;

        setLoading(true);
        try {
            const { error } = await supabase.from('tasks').insert({
                name,
                description: description || null,
                links,
                user_id: user.id,
                status: 'to_do'
            });

            if (error) throw error;

            onTaskAdded();
            resetForm();
            onClose();
        } catch (error) {
            console.error('Error adding task:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="New Task">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Task Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="What needs to be done?"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field min-h-[100px] resize-none"
                        placeholder="Add some details..."
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-muted mb-2">Links</label>

                    <div className="space-y-2 mb-3">
                        {links.map((link, idx) => (
                            <div key={idx} className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <span className="font-medium text-sm text-text-main">{link.name}</span>
                                    <span className="text-xs text-text-muted truncate border-l border-slate-200 pl-2">{link.url}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeLink(idx)}
                                    className="text-slate-400 hover:text-red-500 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>

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
                            className="p-2 bg-slate-100 text-text-muted rounded-lg hover:bg-slate-200 disabled:opacity-50 transition-colors"
                        >
                            <Plus className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-text-muted hover:text-text-main font-medium transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary flex items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Create Task
                    </button>
                </div>
            </form>
        </Modal>
    );
}
