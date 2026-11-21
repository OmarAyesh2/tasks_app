import React, { useState, useEffect } from 'react';
import { Modal, ModalActions } from './Modal';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { ChevronRight, Instagram, Facebook, Globe, MapPin } from 'lucide-react';
import type { Client, ClientSocialLinks, ClientStatus } from '../types';

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

const FORM_ID = 'client-form';
const labelClass = 'block text-sm font-medium text-text-muted dark:text-slate-400 mb-1';

const STATUS_OPTIONS: { value: ClientStatus; label: string; selected: string }[] = [
    { value: 'potential', label: 'Potential', selected: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:border-slate-500' },
    { value: 'negotiating', label: 'Negotiating', selected: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' },
    { value: 'active', label: 'Active', selected: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
];

type SocialKey = keyof ClientSocialLinks;
const SOCIALS: { key: SocialKey; label: string; Icon: React.ComponentType<{ className?: string }>; color: string; placeholder: string }[] = [
    { key: 'instagram', label: 'Instagram', Icon: Instagram, color: 'text-pink-500', placeholder: 'https://instagram.com/...' },
    { key: 'facebook', label: 'Facebook', Icon: Facebook, color: 'text-blue-600', placeholder: 'https://facebook.com/...' },
    { key: 'tiktok', label: 'TikTok', Icon: TikTokIcon, color: 'text-slate-900 dark:text-slate-100', placeholder: 'https://tiktok.com/@...' },
    { key: 'linkedin', label: 'LinkedIn', Icon: LinkedInIcon, color: 'text-blue-500', placeholder: 'https://linkedin.com/company/...' },
    { key: 'maps', label: 'Google Maps', Icon: MapPin, color: 'text-red-500', placeholder: 'https://maps.google.com/...' },
    { key: 'snapchat', label: 'Snapchat', Icon: SnapchatIcon, color: 'text-yellow-400', placeholder: 'https://snapchat.com/add/...' },
];

export function ClientModal({ isOpen, onClose, onSuccess, clientToEdit }: ClientModalProps) {
    const { user } = useAuth();
    const { activeWorkspace } = useWorkspace();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dirty, setDirty] = useState(false);

    // Form state
    const [name, setName] = useState('');
    const [status, setStatus] = useState<ClientStatus>('potential');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [website, setWebsite] = useState('');
    const [notes, setNotes] = useState('');
    const [socials, setSocials] = useState<ClientSocialLinks>({});

    const filledSocials = SOCIALS.filter(s => socials[s.key]?.trim()).length;

    useEffect(() => {
        if (isOpen) {
            setError(null);
            setDirty(false);
            setName(clientToEdit?.name ?? '');
            setStatus(clientToEdit?.status ?? 'potential');
            setPhone(clientToEdit?.phone ?? '');
            setEmail(clientToEdit?.email ?? '');
            setWebsite(clientToEdit?.website ?? '');
            setNotes(clientToEdit?.notes ?? '');
            setSocials(clientToEdit?.social_links ?? {});
        }
    }, [isOpen, clientToEdit]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !supabase || !activeWorkspace) return;

        setLoading(true);
        setError(null);

        // only keep the links that were filled in
        const socialLinks = Object.fromEntries(
            Object.entries(socials).filter(([, v]) => typeof v === 'string' && v.trim()).map(([k, v]) => [k, (v as string).trim()])
        );

        const payload = {
            name,
            status,
            phone: phone || null,
            email: email || null,
            website: website || null,
            notes: notes || null,
            social_links: socialLinks,
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
            onClose();
        } catch (err) {
            console.error('Error saving client:', err);
            setError('Could not save the client. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={clientToEdit ? 'Edit Client' : 'New Client'}
            confirmClose={dirty}
            footer={
                <ModalActions
                    formId={FORM_ID}
                    onCancel={onClose}
                    submitLabel={clientToEdit ? 'Save Changes' : 'Add Client'}
                    loading={loading}
                    error={error}
                />
            }
        >
            <form id={FORM_ID} onSubmit={handleSubmit} onChange={() => setDirty(true)} className="space-y-4">
                <div>
                    <label htmlFor="client-name" className={labelClass}>Client name</label>
                    <input
                        id="client-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="input-field"
                        placeholder="Company or contact name"
                        required
                        autoFocus
                    />
                </div>

                <div>
                    <span id="client-status-label" className={labelClass}>Status</span>
                    <div role="group" aria-labelledby="client-status-label" className="flex gap-2">
                        {STATUS_OPTIONS.map((opt) => {
                            const isSelected = status === opt.value;
                            return (
                                <button
                                    key={opt.value}
                                    type="button"
                                    aria-pressed={isSelected}
                                    onClick={() => { setStatus(opt.value); setDirty(true); }}
                                    className={`flex-1 min-h-[42px] px-3 text-sm font-medium rounded-lg border transition-colors ${isSelected
                                        ? opt.selected
                                        : 'bg-white dark:bg-dark-surface text-text-muted dark:text-slate-400 border-slate-200 dark:border-dark-border hover:border-slate-300'}`}
                                >
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="client-phone" className={labelClass}>Phone</label>
                        <input
                            id="client-phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            className="input-field"
                            placeholder="+962 7 0000 0000"
                        />
                    </div>
                    <div>
                        <label htmlFor="client-email" className={labelClass}>Email</label>
                        <input
                            id="client-email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="input-field"
                            placeholder="contact@company.com"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="client-website" className={labelClass}>Website</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-text-muted">
                            <Globe className="w-4 h-4" />
                        </div>
                        <input
                            id="client-website"
                            type="url"
                            value={website}
                            onChange={(e) => setWebsite(e.target.value)}
                            className="input-field pl-9"
                            placeholder="https://company.com"
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="client-notes" className={labelClass}>Notes</label>
                    <textarea
                        id="client-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="input-field min-h-[90px] resize-y"
                        placeholder="Important details, context, or meeting notes..."
                    />
                </div>

                {/* Social links: folded away so the core fields stay short; open when editing a client that has some */}
                <details open={filledSocials > 0 && !!clientToEdit} className="group rounded-lg border border-slate-200 dark:border-dark-border">
                    <summary className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none text-sm font-medium text-text-main dark:text-slate-200 list-none [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="w-4 h-4 text-text-muted transition-transform group-open:rotate-90" />
                        Social links
                        <span className="text-xs font-normal text-text-muted">
                            {filledSocials > 0 ? `${filledSocials} added` : 'optional'}
                        </span>
                    </summary>
                    <div className="px-3 pb-3 pt-1 space-y-3">
                        {SOCIALS.map(({ key, label, Icon, color, placeholder }) => (
                            <div key={key} className="relative">
                                <div className={`absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none ${color}`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                                <input
                                    type="text"
                                    value={socials[key] ?? ''}
                                    onChange={(e) => setSocials(s => ({ ...s, [key]: e.target.value }))}
                                    className="input-field pl-9"
                                    placeholder={placeholder}
                                    aria-label={label}
                                />
                            </div>
                        ))}
                    </div>
                </details>
            </form>
        </Modal>
    );
}
