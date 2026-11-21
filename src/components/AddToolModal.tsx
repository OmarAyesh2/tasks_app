import React, { useState, useEffect } from 'react';
import { Modal, ModalActions } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Tool } from '../types';

interface AddToolModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    toolToEdit?: Tool | null;
    categories?: string[]; // categories already in use, offered as suggestions
}

const FORM_ID = 'resource-form';
const DEFAULT_CATEGORIES = ['AI Tools', 'Design Reference', 'Assets', 'Legal'];
const labelClass = 'block text-sm font-medium text-text-muted dark:text-slate-400 mb-1';

export function AddToolModal({ isOpen, onClose, onSuccess, toolToEdit, categories = [] }: AddToolModalProps) {
    const { user } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [link, setLink] = useState('');
    const [category, setCategory] = useState('');

    const suggestions = [...new Set([...categories, ...DEFAULT_CATEGORIES])].sort();

    const resetForm = () => {
        setName('');
        setDescription('');
        setLink('');
        setCategory('');
    };

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setDirty(false);
            if (toolToEdit) {
                setName(toolToEdit.name);
                setDescription(toolToEdit.description || '');
                setLink(toolToEdit.link);
                setCategory(toolToEdit.category || '');
            } else {
                resetForm();
            }
        }
    }, [isOpen, toolToEdit]);

    // pasting a URL fills an empty name with the site, e.g. "figma.com"
    const fillNameFromLink = () => {
        if (name.trim()) return;
        try { setName(new URL(link).hostname.replace(/^www\./, '')); } catch { /* not a full URL yet */ }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !supabase) return;

        setLoading(true);
        setError(null);
        try {
            if (toolToEdit) {
                const { error } = await supabase.from('tools').update({
                    name,
                    description: description || null,
                    link,
                    category: category || null
                }).eq('id', toolToEdit.id);

                if (error) throw error;
            } else {
                const { error } = await supabase.from('tools').insert({
                    name,
                    description: description || null,
                    link,
                    category: category || null,
                    user_id: user.id
                });

                if (error) throw error;
            }

            onSuccess();
            resetForm();
            onClose();
        } catch (err) {
            console.error('Error adding resource:', err);
            setError('Could not save the resource. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={toolToEdit ? 'Edit Resource' : 'New Resource'}
            confirmClose={dirty}
            footer={
                <ModalActions
                    formId={FORM_ID}
                    onCancel={onClose}
                    submitLabel={toolToEdit ? 'Save Changes' : 'Add Resource'}
                    loading={loading}
                    error={error}
                />
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit} onChange={() => setDirty(true)} className="space-y-4">
                <div>
                    <label htmlFor="resource-url" className={labelClass}>URL</label>
                    <input
                        id="resource-url"
                        type="url"
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        onBlur={fillNameFromLink}
                        className="input-field"
                        placeholder="https://..."
                        required
                        autoFocus
                    />
                </div>

                <div>
                    <label htmlFor="resource-name" className={labelClass}>Name</label>
                    <input
                        id="resource-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="Filled from the URL, or type your own"
                        required
                    />
                </div>

                <div>
                    <label htmlFor="resource-category" className={labelClass}>Category</label>
                    <input
                        id="resource-category"
                        type="text"
                        list="resource-categories"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="input-field"
                        placeholder="Pick one or type a new category"
                    />
                    <datalist id="resource-categories">
                        {suggestions.map(c => <option key={c} value={c} />)}
                    </datalist>
                </div>

                <div>
                    <label htmlFor="resource-description" className={labelClass}>Description</label>
                    <textarea
                        id="resource-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="input-field min-h-[100px] resize-y"
                        placeholder="What is this resource for?"
                    />
                </div>
            </form>
        </Modal>
    );
}
