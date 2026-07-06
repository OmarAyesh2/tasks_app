import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { Loader2, Instagram, Facebook, Globe, MapPin } from 'lucide-react';
import type { Client, ClientStatus } from '../types';

function SnapchatIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.12 1.34c-1.3-.08-2.61.16-3.83.65a8.77 8.77 0 0 0-3.23 2.5 8.1 8.1 0 0 0-1.78 4.34c-.11.83-.08 1.68.08 2.5.07.4.2.78.38 1.15.2.4.4.8.44 1.25.04.41-.05.82-.24 1.19-.24.47-.6.87-1.04 1.18-.32.22-.68.37-1.06.45-.4.07-.8.07-1.2 0-.25-.03-.5-.09-.72-.18a2.53 2.53 0 0 0-1.12.33 1.5 1.5 0 0 0-.61 1.05c-.06.32-.03.65.1.95.14.3.36.56.64.74.45.28.98.43 1.51.42 1.05 0 2.05-.33 2.89-.92.8-.54 1.4-1.3 1.74-2.2a4.4 4.4 0 0 1 1.72-2.12c.57-.36 1.25-.52 1.93-.45.4.03.8.12 1.17.26a4.4 4.4 0 0 0 2.87 0 5.42 5.42 0 0 0 1.17-.26c.68-.07 1.36.09 1.93.45a4.4 4.4 0 0 1 1.72 2.12c.34.9.94 1.66 1.74 2.2.84.59 1.84.92 2.89.92.53.01 1.06-.14 1.51-.42.28-.18.5-.44.64-.74.13-.3.16-.63.1-.95a1.5 1.5 0 0 0-.61-1.05 2.53 2.53 0 0 0-1.12-.33c-.22-.09-.47-.15-.72-.18-.4-.07-.8-.07-1.2 0-.38.08-.74.23-1.06.45-.44.31-.8.71-1.04 1.18-.19.37-.28.78-.24 1.19.04.45.24.85.44 1.25.18.37.31.75.38 1.15.16.82.19 1.67.08 2.5a8.1 8.1 0 0 0-1.78 4.34 8.77 8.77 0 0 0-3.23-2.5 8.35 8.35 0 0 0-3.83-.65z" />
        </svg>
    );
}

// Inline SVG icons for TikTok and LinkedIn (lucide-react doesn't have them)
function TikTokIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.16 15a6.34 6.34 0 0 0 6.33 6.34 6.34 6.34 0 0 0 6.34-6.34V8.56a8.2 8.2 0 0 0 3.76.92V6.05a4.78 4.78 0 0 1 0 .64z" />
        </svg>
    );
}

function LinkedInIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
        </svg>
    );
}

interface ClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    clientToEdit?: Client | null;
}

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
    { value: 'potential', label: 'Potential' },
    { value: 'negotiating', label: 'Negotiating' },
    { value: 'active', label: 'Active' },
];

export function ClientModal({ isOpen, onClose, onSuccess, clientToEdit }: ClientModalProps) {
    const { user } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const [loading, setLoading] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [status, setStatus] = useState<ClientStatus>('potential');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [website, setWebsite] = useState('');
    const [notes, setNotes] = useState('');
    const [instagram, setInstagram] = useState('');
    const [facebook, setFacebook] = useState('');
    const [tiktok, setTiktok] = useState('');
    const [linkedin, setLinkedin] = useState('');
    const [maps, setMaps] = useState('');
    const [snapchat, setSnapchat] = useState('');

    const resetForm = () => {
        setName('');
        setStatus('potential');
        setPhone('');
        setEmail('');
        setWebsite('');
        setNotes('');
        setInstagram('');
        setFacebook('');
        setTiktok('');
        setLinkedin('');
        setMaps('');
        setSnapchat('');
    };

    useEffect(() => {
        if (isOpen) {
            if (clientToEdit) {
                setName(clientToEdit.name);
                setStatus(clientToEdit.status);
                setPhone(clientToEdit.phone || '');
                setEmail(clientToEdit.email || '');
                setWebsite(clientToEdit.website || '');
                setNotes(clientToEdit.notes || '');
                setInstagram(clientToEdit.social_links?.instagram || '');
                setFacebook(clientToEdit.social_links?.facebook || '');
                setTiktok(clientToEdit.social_links?.tiktok || '');
                setLinkedin(clientToEdit.social_links?.linkedin || '');
                setMaps(clientToEdit.social_links?.maps || '');
                setSnapchat(clientToEdit.social_links?.snapchat || '');
            } else {
                resetForm();
            }
        }
    }, [isOpen, clientToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !supabase || !activeWorkspace) return;

        setLoading(true);

        const socialLinks = {
            ...(instagram && { instagram }),
            ...(facebook && { facebook }),
            ...(tiktok && { tiktok }),
            ...(linkedin && { linkedin }),
            ...(maps && { maps }),
            ...(snapchat && { snapchat }),
        };

        const payload = {
            name,
            status,
            phone: phone || null,
            email: email || null,
            website: website || null,
            notes: notes || null,
            social_links: Object.keys(socialLinks).length > 0 ? socialLinks : {},
        };

        try {
            if (clientToEdit) {
                const { error } = await supabase
                    .from('clients')
                    .update(payload)
                    .eq('id', clientToEdit.id);

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from('clients')
                    .insert({
                        ...payload,
                        workspace_id: activeWorkspace.id,
                        user_id: user.id,
                    });

                if (error) throw error;
            }

            onSuccess();
            resetForm();
            onClose();
        } catch (error) {
            console.error('Error saving client:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={clientToEdit ? 'Edit Client' : 'New Client'}>
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Client Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="Company or contact name"
                        required
                    />
                </div>

                {/* Status */}
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Status</label>
                    <div className="relative">
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as ClientStatus)}
                            className="input-field appearance-none cursor-pointer pr-10"
                        >
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-muted">
                            <svg className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Phone + Email side by side */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-text-muted mb-1">Phone</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="input-field"
                            placeholder="+1 (555) 000-0000"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-text-muted mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input-field"
                            placeholder="contact@company.com"
                        />
                    </div>
                </div>

                {/* Website */}
                <div>
                    <label className="block text-sm font-medium text-text-muted mb-1">Website</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
                            <Globe className="w-4 h-4" />
                        </div>
                        <input
                            type="url"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            className="input-field pl-9"
                            placeholder="https://company.com"
                        />
                    </div>
                </div>

                {/* Social Links Section */}
                <div className="pt-2">
                    <label className="block text-sm font-medium text-text-muted mb-3">Social Media Links</label>
                    <div className="space-y-3">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-pink-500">
                                <Instagram className="w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                value={instagram}
                                onChange={(e) => setInstagram(e.target.value)}
                                className="input-field pl-9"
                                placeholder="https://instagram.com/..."
                            />
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-blue-600">
                                <Facebook className="w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                value={facebook}
                                onChange={(e) => setFacebook(e.target.value)}
                                className="input-field pl-9"
                                placeholder="https://facebook.com/..."
                            />
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-100">
                                <TikTokIcon className="w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                value={tiktok}
                                onChange={(e) => setTiktok(e.target.value)}
                                className="input-field pl-9"
                                placeholder="https://tiktok.com/@..."
                            />
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-blue-500">
                                <LinkedInIcon className="w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                value={linkedin}
                                onChange={(e) => setLinkedin(e.target.value)}
                                className="input-field pl-9"
                                placeholder="https://linkedin.com/company/..."
                            />
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-red-500">
                                <MapPin className="w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                value={maps}
                                onChange={(e) => setMaps(e.target.value)}
                                className="input-field pl-9"
                                placeholder="https://maps.google.com/..."
                            />
                        </div>

                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-yellow-400">
                                <SnapchatIcon className="w-4 h-4" />
                            </div>
                            <input
                                type="text"
                                value={snapchat}
                                onChange={(e) => setSnapchat(e.target.value)}
                                className="input-field pl-9"
                                placeholder="https://snapchat.com/add/..."
                            />
                        </div>
                    </div>
                </div>

                {/* Notes */}
                <div className="pt-2">
                    <label className="block text-sm font-medium text-text-muted mb-1">Client Notes</label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="input-field min-h-[100px] resize-y"
                        placeholder="Add important details, context, or meeting notes here..."
                    />
                </div>

                {/* Actions */}
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
                        {clientToEdit ? 'Save Changes' : 'Add Client'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
