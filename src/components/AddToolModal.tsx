import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';
import type { Tool } from '../types';

interface AddToolModalProps {
    isOpen: boolean;
    onClose: () => void;
    onToolAdded: () => void;
    toolToEdit?: Tool | null;
}

export function AddToolModal({ isOpen, onClose, onToolAdded, toolToEdit }: AddToolModalProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [link, setLink] = useState('');

    const resetForm = () => {
        setName('');
        setDescription('');
        setLink('');
    };

    useEffect(() => {
        if (isOpen) {
            if (toolToEdit) {
                setName(toolToEdit.name);
                setDescription(toolToEdit.description || '');
                setLink(toolToEdit.link);
            } else {
                resetForm();
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
                    link
                }).eq('id', toolToEdit.id);

                if (error) throw error;
            } else {
                const { error } = await supabase.from('tools').insert({
                    name,
                    description: description || null,
                    link,
                    user_id: user.id
                });

                if (error) throw error;
            }

            onToolAdded();
            resetForm();
            onClose();
        } catch (error) {
            console.error('Error adding tool:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={toolToEdit ? "Edit Tool" : "New Tool"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Tool Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="Tool Name"
                        required
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Description</label>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field min-h-[100px] resize-none"
                        placeholder="What is this tool for?"
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
                        {toolToEdit ? "Save Changes" : "Add Tool"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
