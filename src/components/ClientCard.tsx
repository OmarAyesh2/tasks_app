import type { Client } from '../types';
import { Mail, Phone, Globe, Pencil, Trash2, Instagram, Facebook } from 'lucide-react';

// Lucide doesn't include TikTok/LinkedIn as named exports — use inline SVGs
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

const STATUS_CONFIG: Record<Client['status'], { label: string; color: string; bg: string; border: string }> = {
    active: {
        label: 'Active',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/30',
    },
    potential: {
        label: 'Potential',
        color: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/30',
    },
    negotiating: {
        label: 'Negotiating',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/30',
    },
};

interface ClientCardProps {
    client: Client;
    onEdit: () => void;
    onDelete: () => void;
}

export function ClientCard({ client, onEdit, onDelete }: ClientCardProps) {
    const status = STATUS_CONFIG[client.status] ?? STATUS_CONFIG.potential;
    const social = client.social_links ?? {};

    const socialLinks: { key: string; icon: React.ReactNode; url?: string }[] = [
        {
            key: 'website',
            icon: <Globe className="w-4 h-4" />,
            url: client.website ?? undefined,
        },
        {
            key: 'instagram',
            icon: <Instagram className="w-4 h-4" />,
            url: social.instagram,
        },
        {
            key: 'facebook',
            icon: <Facebook className="w-4 h-4" />,
            url: social.facebook,
        },
        {
            key: 'tiktok',
            icon: <TikTokIcon className="w-4 h-4" />,
            url: social.tiktok,
        },
        {
            key: 'linkedin',
            icon: <LinkedInIcon className="w-4 h-4" />,
            url: social.linkedin,
        },
    ];

    return (
        <div className="group relative bg-white dark:bg-dark-surface rounded-2xl p-5 border border-slate-100 dark:border-dark-border shadow-soft hover:shadow-soft-hover dark:shadow-none dark:hover:bg-slate-800/80 transition-all duration-300 animate-fade-in">
            {/* Action buttons — revealed on hover */}
            <div className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                    onClick={onEdit}
                    className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-colors"
                    title="Edit client"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    onClick={onDelete}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete client"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            {/* Name + Status */}
            <div className="flex items-start gap-3 mb-4">
                <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-text-main dark:text-slate-100 truncate pr-8">
                        {client.name}
                    </h3>
                    <span className={`inline-flex items-center mt-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${status.bg} ${status.color} ${status.border}`}>
                        {status.label}
                    </span>
                </div>
            </div>

            {/* Contact Details */}
            <div className="space-y-2 mb-4">
                {client.email ? (
                    <a href={`mailto:${client.email}`} className="flex items-center gap-2 text-sm text-text-muted dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors truncate">
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{client.email}</span>
                    </a>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-300 dark:text-slate-600">
                        <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>No email</span>
                    </div>
                )}

                {client.phone ? (
                    <a href={`tel:${client.phone}`} className="flex items-center gap-2 text-sm text-text-muted dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>{client.phone}</span>
                    </a>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-300 dark:text-slate-600">
                        <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                        <span>No phone</span>
                    </div>
                )}
            </div>

            {/* Social Links Row */}
            <div className="flex items-center gap-1.5 pt-3 border-t border-slate-100 dark:border-dark-border/50">
                {socialLinks.map(({ key, icon, url }) =>
                    url ? (
                        <a
                            key={key}
                            href={url.startsWith('http') ? url : `https://${url}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 rounded-lg text-text-muted dark:text-slate-400 hover:text-primary hover:bg-primary/10 dark:hover:bg-primary/20 transition-all duration-200"
                            title={key.charAt(0).toUpperCase() + key.slice(1)}
                        >
                            {icon}
                        </a>
                    ) : (
                        <span
                            key={key}
                            className="p-2 rounded-lg text-slate-300 dark:text-slate-700 cursor-default"
                            title={`No ${key}`}
                        >
                            {icon}
                        </span>
                    )
                )}
            </div>
        </div>
    );
}
