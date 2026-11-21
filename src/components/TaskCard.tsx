import { useState, useRef, useEffect } from 'react';
import type { Task, TaskComment, TaskAsset } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { Check, Link as LinkIcon, ExternalLink, Trash2, Library, Pencil, Loader2, Sparkles, Plus, X, Paperclip, File as FileIcon, FolderOpen, GripVertical, MessageSquare, Send, ContactRound, ChevronDown, CalendarDays, Repeat } from 'lucide-react';
import { supabase, canDeleteFile, driveFileId, taskAccess } from '../lib/supabase';
import { FileViewer, type ViewerFile } from './FileViewer';
import { FileBrowser, type DriveItem } from './FileBrowser';
import { Modal } from './Modal';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useWorkspace, type WorkspaceMember } from '../context/WorkspaceContext';
import { useAuth } from '../context/AuthContext';

// one chip shape for every piece of task metadata; color only where it carries meaning
const chipClass = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/[0.04]';
const PRIORITY_DOT = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-primary' } as const;

interface TaskCardProps {
    task: Task;
    members: WorkspaceMember[];
    onStatusChange: (task: Task) => void;
    onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
    onEdit: () => void;
    onDelete: () => void;
    isDragging?: boolean;
    dragHandleProps?: React.HTMLAttributes<HTMLElement>;
    focused?: boolean; // opened from a notification: scroll here, expand and highlight
}

export function TaskCard({ task, members, onStatusChange, onUpdateTask, onEdit, onDelete, isDragging, dragHandleProps, focused }: TaskCardProps) {
    const { activeWorkspace, currentMemberProfile } = useWorkspace();
    const { user } = useAuth();
    const [isGenerating, setIsGenerating] = useState(false);
    const [newStepText, setNewStepText] = useState('');
    const [isUploadingAsset, setIsUploadingAsset] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [assetToDelete, setAssetToDelete] = useState<TaskAsset | null>(null);
    const [isPickingFile, setIsPickingFile] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Comments state
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState<TaskComment[]>([]);
    const [commentText, setCommentText] = useState('');
    const [isLoadingComments, setIsLoadingComments] = useState(false);
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);

    const fetchComments = async () => {
        if (!supabase) return;
        setIsLoadingComments(true);
        try {
            const { data } = await supabase
                .from('task_comments')
                .select('*')
                .eq('task_id', task.id)
                .order('created_at', { ascending: true });
            if (data) setComments(data as TaskComment[]);
        } catch (error) {
            console.error('Error fetching comments:', error);
        } finally {
            setIsLoadingComments(false);
        }
    };

    useEffect(() => {
        if (showComments) {
            fetchComments();
        }
    }, [showComments]);

    const assignee = members.find(m => m.id === task.assigned_to_member);
    const [viewing, setViewing] = useState<{ files: ViewerFile[]; index: number } | null>(null);
    const [expanded, setExpanded] = useState(false); // collapsed cards keep the list scannable
    const cardRef = useRef<HTMLElement>(null);
    useEffect(() => {
        if (!focused) return;
        const frame = requestAnimationFrame(() => {
            setExpanded(true);
            cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        return () => cancelAnimationFrame(frame);
    }, [focused]);

    const totalSteps = task.sub_tasks?.length ?? 0;
    const doneSteps = task.sub_tasks?.filter(s => s.done).length ?? 0;

    const dueInfo = (() => {
        if (!task.due_date) return null;
        const todayStr = new Date().toLocaleDateString('en-CA');
        const formatted = new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (task.due_date < todayStr && task.status !== 'done') return { label: `Overdue · ${formatted}`, tone: 'text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10' };
        if (task.due_date === todayStr) return { label: 'Due today', tone: 'text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10' };
        return { label: formatted, tone: 'text-text-muted dark:text-slate-300' };
    })();

    function cn(...inputs: string[]) {
        return twMerge(clsx(inputs));
    }

    const handleAIBreakDown = async () => {
        if (task.sub_tasks && task.sub_tasks.length > 0) {
            if (!window.confirm("Regenerating will completely overwrite your current checklist and any manual changes. Do you want to proceed?")) {
                return;
            }
        }

        setIsGenerating(true);
        try {
            const prompt = `Break down this task into sub-tasks:
Task Name: ${task.name}
Description: ${task.description || 'No description provided'}

Strictly return a JSON array of sub-task objects formatted exactly like this: [{"text": "Sub-task description", "done": false}]. Each sub-task must be ultra-concise, punchy, and actionable. Limit each step to a maximum of 5 to 8 words. Crucially, DO NOT include any parentheses, detailed explanations, or descriptive examples. Just output the raw action step. You must generate a maximum of 5 sub-tasks total per task. Do not exceed 5 items under any circumstances. If the task is complex, only provide the top 5 most critical foundational steps. CRITICAL: Detect the language used in the task's name and description (e.g., Arabic, English). You MUST return the text values inside the JSON array strictly in that exact same language. Do not mix languages or translate the output to English if the input is in Arabic. No conversational filler text, no markdown code block formatting like \`\`\`json, just the raw JSON array.`;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${import.meta.env.VITE_GEMINI_API_KEY}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json();
            const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            const generatedSubTasks = JSON.parse(cleanJson);

            onUpdateTask(task.id, { sub_tasks: generatedSubTasks });
        } catch (err) {
            console.error("AI breakdown failed:", err);
            alert("Failed to generate breakdown. Check console for details.");
        } finally {
            setIsGenerating(false);
        }
    };

    const toggleSubTask = (idx: number) => {
        const currentList = task.sub_tasks || [];
        const newList = [...currentList];
        newList[idx] = { ...newList[idx], done: !newList[idx].done };

        let updatedStatus = task.status;
        if (newList.length > 0) {
            const allDone = newList.every(step => step.done);
            if (allDone && task.status !== 'done') {
                updatedStatus = 'done';
            } else if (!allDone && task.status === 'done') {
                updatedStatus = 'to_do';
            }
        }

        onUpdateTask(task.id, { sub_tasks: newList, status: updatedStatus });
    };

    const updateSubTaskText = (idx: number, newText: string) => {
        if (!newText.trim() || task.sub_tasks?.[idx]?.text === newText) return;
        const currentList = task.sub_tasks || [];
        const newList = [...currentList];
        newList[idx] = { ...newList[idx], text: newText.trim() };
        onUpdateTask(task.id, { sub_tasks: newList });
    };

    const deleteSubTask = (idx: number) => {
        const currentList = task.sub_tasks || [];
        const newList = currentList.filter((_, i) => i !== idx);
        onUpdateTask(task.id, { sub_tasks: newList });
    };

    const addSubTask = () => {
        if (!newStepText.trim()) return;
        const currentList = task.sub_tasks || [];
        const newList = [...currentList, { text: newStepText.trim(), done: false }];
        onUpdateTask(task.id, { sub_tasks: newList });
        setNewStepText('');
    };

    const clearSubTasks = () => {
        onUpdateTask(task.id, { sub_tasks: [] });
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !supabase) return;

        setIsUploadingAsset(true);
        setUploadProgress(0);
        try {
            // The function needs the user's session token, not the public anon key.
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Your session expired. Please sign in again.');

            const driveUrl = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://gaehkozgxxftdacfsxnf.supabase.co/functions/v1/upload-to-drive');

                xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
                xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
                // The function puts the file in this task's folder (<project>/<task>) in the workspace's Drive.
                const formData = new FormData();
                formData.append('file', file);
                formData.append('taskId', task.id);

                xhr.upload.onprogress = (event) => {
                    if (event.lengthComputable) {
                        setUploadProgress(Math.round((event.loaded / event.total) * 100));
                    }
                };

                xhr.onload = () => {
                    if (xhr.status === 200) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            if (!data.url) {
                                reject(new Error("Google Drive uploaded the file but failed to return a valid URL link."));
                            } else {
                                resolve(data.url);
                            }
                        } catch (e) {
                            reject(new Error("Failed to parse response"));
                        }
                    } else {
                        try {
                            const parsedError = JSON.parse(xhr.responseText);
                            console.error("CRITICAL BACKEND ERROR DETAILS:", parsedError);
                        } catch {
                            console.error("Raw Server Error Response:", xhr.responseText);
                        }
                        reject(new Error(`Upload failed with status: ${xhr.status}`));
                    }
                };

                xhr.onerror = () => reject(new Error("Network error during upload"));
                xhr.send(formData);
            });

            const { data: assetData, error } = await supabase
                .from('task_assets')
                .insert({
                    task_id: task.id,
                    file_name: file.name,
                    public_url: driveUrl,
                    storage_path: 'google_drive'
                })
                .select()
                .single();

            if (error) throw error;

            const currentAssets = task.assets || [];
            onUpdateTask(task.id, { assets: [...currentAssets, assetData] });

        } catch (error: any) {
            console.error('Full Upload Error Object:', error);
            const errorDetails = error?.message || error?.details || JSON.stringify(error);
            alert(`Failed to upload file. Error details: ${errorDetails}`);
        } finally {
            setIsUploadingAsset(false);
            setUploadProgress(0);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    // Removes the attachment from this task only; the file stays in the workspace Files page.
    const handleDeleteAsset = async (assetId: string) => {
        try {
            if (!supabase) return;

            const currentAssets = task.assets || [];
            const { error } = await supabase.from('task_assets').delete().eq('id', assetId);

            if (error) throw error;

            const updatedAssets = currentAssets.filter((item) => item.id !== assetId);
            onUpdateTask(task.id, { assets: updatedAssets });
        } catch (error) {
            console.error('Error deleting asset:', error);
            alert('Failed to remove the attachment. Please try again.');
        }
    };

    // Attach a file that already exists in the workspace Files page
    const attachExisting = async (item: DriveItem) => {
        setIsPickingFile(false);
        if (!supabase || !item.webViewLink) return;
        const currentAssets = task.assets || [];
        if (currentAssets.some(a => driveFileId(a.public_url) === item.id)) return;
        const { data, error } = await supabase
            .from('task_assets')
            .insert({ task_id: task.id, file_name: item.name, public_url: item.webViewLink, storage_path: 'google_drive' })
            .select()
            .single();
        if (error) {
            alert('Could not attach the file. Please try again.');
            return;
        }
        onUpdateTask(task.id, { assets: [...currentAssets, data] });
    };

    const openAttachment = (asset: TaskAsset) => {
        const fileId = driveFileId(asset.public_url);
        if (!fileId || !activeWorkspace) return window.open(asset.public_url, '_blank', 'noopener');
        // step through this task's Drive attachments; old-account files fall back to their Drive link
        const files = (task.assets ?? []).flatMap(a => {
            const id = driveFileId(a.public_url);
            return id ? [{ id, name: a.file_name, fallbackUrl: a.public_url }] : [];
        });
        setViewing({ files, index: Math.max(0, files.findIndex(f => f.id === fileId)) });
    };

    const isDone = task.status === 'done';
    const access = taskAccess(task, currentMemberProfile?.permission_role, currentMemberProfile?.id, user?.id);

    return (
        <article ref={cardRef} className={cn('card-base group relative p-4 sm:p-5 animate-fade-in transition-shadow duration-500', isDragging ? 'opacity-50 shadow-lg' : '', focused ? 'ring-2 ring-primary shadow-glow' : '')}>
            {/* Header: status, title + description, actions */}
            <div className="flex items-start gap-3">
                <button
                    type="button"
                    onClick={() => onStatusChange(task)}
                    disabled={!access.work}
                    title={access.work ? undefined : 'Only the creator, the assignee or an admin can change this'}
                    aria-label={isDone ? `Mark "${task.name}" as not done` : `Mark "${task.name}" as done`}
                    aria-pressed={isDone}
                    className={cn(
                        "mt-0.5 w-7 h-7 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200 active:scale-90",
                        isDone
                            ? "bg-green-500 border-green-500 text-white"
                            : "border-slate-300 dark:border-white/20 hover:border-primary text-transparent hover:text-primary/40",
                        !access.work ? "opacity-50 pointer-events-none" : ""
                    )}
                >
                    <Check className="w-4 h-4" strokeWidth={3} />
                </button>

                <div className="flex-1 min-w-0">
                    <h3 className={cn(
                        "text-base sm:text-[17px] font-semibold leading-snug tracking-[-0.01em] break-words transition-colors",
                        isDone ? "text-text-muted line-through" : "text-text-main dark:text-slate-100"
                    )}>
                        {task.name}
                    </h3>
                    {task.description && (
                        <p className={cn("mt-1 text-sm leading-relaxed text-text-muted", expanded ? "" : "line-clamp-2")}>
                            {task.description}
                        </p>
                    )}
                </div>

                {/* always visible on touch screens; on desktop they appear on hover or keyboard focus */}
                <div className="flex items-center -mr-1.5 -mt-1 flex-shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity">
                    {dragHandleProps && (
                        <span
                            {...dragHandleProps}
                            aria-label="Drag to reorder"
                            title="Drag to reorder"
                            className="p-2 rounded-full cursor-grab active:cursor-grabbing text-slate-400 hover:text-text-main hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                        >
                            <GripVertical className="w-4 h-4" />
                        </span>
                    )}
                    {access.full && (<>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onEdit(); }}
                        aria-label="Edit task"
                        title="Edit task"
                        className="p-2 rounded-full text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                        <Pencil className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        aria-label="Delete task"
                        title="Delete task"
                        className="p-2 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>
                    </>)}
                </div>
            </div>

            {/* Meta chips: due, priority, client, assignee */}
            {(dueInfo || task.priority || task.client || assignee || task.status === 'in_progress' || (task.recurrence && !task.next_task_id)) && (
                <div className="mt-3 pl-10 flex flex-wrap items-center gap-1.5">
                    {task.status === 'in_progress' && (
                        <span className={cn(chipClass, 'text-accent border-accent/30 bg-accent/10')}>
                            <span className="w-2 h-2 rounded-full bg-accent animate-pulse motion-reduce:animate-none" />
                            In progress
                        </span>
                    )}
                    {dueInfo && (
                        <span className={cn(chipClass, dueInfo.tone)}>
                            <CalendarDays className="w-3.5 h-3.5" />
                            {dueInfo.label}
                        </span>
                    )}
                    {task.recurrence && !task.next_task_id && (
                        <span className={cn(chipClass, 'text-text-muted dark:text-slate-300')} title="A new copy is created when this one is done">
                            <Repeat className="w-3.5 h-3.5" />
                            {{ daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }[task.recurrence]}
                        </span>
                    )}
                    {task.priority && (
                        <span className={cn(chipClass, 'text-text-muted dark:text-slate-300')}>
                            <span className={cn('w-2 h-2 rounded-full', PRIORITY_DOT[task.priority])} />
                            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                        </span>
                    )}
                    {task.client && (
                        <span className={cn(chipClass, 'text-teal-700 dark:text-teal-300')}>
                            <ContactRound className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[160px]">{task.client.name}</span>
                        </span>
                    )}
                    {assignee && (
                        <span className={cn(chipClass, 'text-text-muted dark:text-slate-300')} title={assignee.email}>
                            <span className="w-4 h-4 rounded-full bg-gradient-to-br from-primary to-accent text-on-primary text-[10px] font-semibold flex items-center justify-center uppercase">
                                {assignee.email.charAt(0)}
                            </span>
                            <span className="truncate max-w-[160px]">
                                {assignee.email.split('@')[0]}{assignee.member_title ? ` · ${assignee.member_title}` : ''}
                            </span>
                        </span>
                    )}
                </div>
            )}

            {/* Checklist progress */}
            {totalSteps > 0 && (
                <div className="mt-3 pl-10 flex items-center gap-3">
                    <div
                        className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden"
                        role="progressbar"
                        aria-label="Checklist progress"
                        aria-valuemin={0}
                        aria-valuemax={totalSteps}
                        aria-valuenow={doneSteps}
                    >
                        <div
                            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500"
                            style={{ width: `${(doneSteps / totalSteps) * 100}%` }}
                        />
                    </div>
                    <span className="text-xs font-medium tabular-nums text-text-muted">{doneSteps}/{totalSteps}</span>
                </div>
            )}

            {/* Footer: what's inside + details toggle */}
            <div className="mt-3 pl-10 flex items-center gap-3 text-xs text-text-muted">
                {(task.assets?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1" title="Files"><Paperclip className="w-3.5 h-3.5" />{task.assets!.length}</span>
                )}
                {(task.tools?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1" title="Resources"><Library className="w-3.5 h-3.5" />{task.tools!.length}</span>
                )}
                {(task.links?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1" title="Links"><LinkIcon className="w-3.5 h-3.5" />{task.links!.length}</span>
                )}
                <button
                    type="button"
                    onClick={() => setExpanded(e => !e)}
                    aria-expanded={expanded}
                    className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 -my-1 -mr-1.5 rounded-full font-medium hover:text-text-main hover:bg-slate-100 dark:hover:text-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                >
                    {expanded ? 'Hide details' : 'Details'}
                    <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', expanded ? 'rotate-180' : '')} />
                </button>
            </div>

            {expanded && (
                <div className="mt-4 pt-4 pl-10 space-y-5 border-t border-slate-200/70 dark:border-white/10 animate-fade-in">
                    {/* Checklist Section */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-text-main dark:text-slate-200">Checklist</h4>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleAIBreakDown}
                                    disabled={isGenerating}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50 min-h-[44px] md:min-h-0"
                                >
                                    {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                    AI Break Down
                                </button>
                                {task.sub_tasks && task.sub_tasks.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearSubTasks}
                                        className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>

                        {task.sub_tasks && task.sub_tasks.length > 0 && (
                            <div className="space-y-2">
                                {task.sub_tasks.map((step, idx) => (
                                    <div key={idx} className="flex items-start gap-2 group/step">
                                        <button
                                            type="button"
                                            onClick={() => toggleSubTask(idx)}
                                            className={cn(
                                                "mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0",
                                                step.done
                                                    ? "bg-green-500 border-green-500 text-white"
                                                    : "border-slate-300 dark:border-slate-600 text-transparent"
                                            )}
                                        >
                                            <Check className="w-2.5 h-2.5" strokeWidth={3} />
                                        </button>
                                        <input
                                            type="text"
                                            defaultValue={step.text}
                                            key={`${idx}-${step.text}`}
                                            onBlur={(e) => updateSubTaskText(idx, e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                                            className={cn(
                                                "text-sm flex-1 bg-transparent border-none outline-none focus:ring-0 p-0 m-0",
                                                step.done ? "text-text-muted line-through" : "text-text-main dark:text-slate-300"
                                            )}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => deleteSubTask(idx)}
                                            className="opacity-0 group-hover/step:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all rounded"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                            <input
                                type="text"
                                value={newStepText}
                                onChange={(e) => setNewStepText(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addSubTask()}
                                placeholder="Add a step..."
                                className="flex-1 text-sm bg-transparent border-b border-slate-200 dark:border-slate-700 px-1 py-1 min-h-[44px] md:min-h-0 focus:outline-none focus:border-primary dark:text-slate-200 placeholder:text-slate-400"
                            />
                            <button
                                onClick={addSubTask}
                                disabled={!newStepText.trim()}
                                className="p-1 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center justify-center text-primary disabled:opacity-40 hover:bg-primary/10 rounded transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* File Attachments Section */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <input
                                type="file"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isUploadingAsset}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-primary hover:border-primary dark:text-slate-400 dark:hover:text-primary transition-all disabled:opacity-50 min-h-[44px] md:min-h-0"
                            >
                                {isUploadingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                                {isUploadingAsset
                                    ? uploadProgress === 100
                                        ? 'Processing File...'
                                        : `Uploading ${uploadProgress}%`
                                    : 'Attach File'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsPickingFile(true)}
                                disabled={isUploadingAsset}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-primary hover:border-primary dark:text-slate-400 dark:hover:text-primary transition-all disabled:opacity-50 min-h-[44px] md:min-h-0"
                            >
                                <FolderOpen className="w-3.5 h-3.5" />
                                From Files
                            </button>
                        </div>

                        {task.assets && task.assets.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1 max-w-full">
                                {task.assets.map((asset) => (
                                    <a
                                        key={asset.id}
                                        href={asset.public_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={(e) => { e.preventDefault(); openAttachment(asset); }}
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-50/50 dark:bg-indigo-900/20 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-100 dark:border-indigo-800/50 max-w-full"
                                    >
                                        <FileIcon className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate max-w-[120px] sm:max-w-[180px]">{asset.file_name}</span>
                                        {canDeleteFile(asset.uploaded_by, currentMemberProfile?.permission_role, user?.id) && <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setAssetToDelete(asset);
                                            }}
                                            aria-label={`Remove ${asset.file_name} from this task`}
                                            className="p-0.5 ml-1 flex-shrink-0 text-indigo-400 hover:text-red-500 hover:bg-white/50 dark:hover:bg-dark-surface/50 rounded transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {task.links && task.links.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {task.links.map((link, idx) => (
                                <a
                                    key={idx}
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800 text-xs font-medium text-primary hover:bg-primary/10 hover:underline transition-colors border border-slate-100 dark:border-slate-700"
                                >
                                    <LinkIcon className="w-3 h-3" />
                                    {link.name}
                                    <ExternalLink className="w-3 h-3 opacity-50" />
                                </a>
                            ))}
                        </div>
                    )}

                    {task.tools && task.tools.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {task.tools.map(tool => (
                                <a
                                    key={tool.id}
                                    href={tool.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 hover:underline transition-colors border border-primary/20"
                                >
                                    <Library className="w-3 h-3" />
                                    {tool.name}
                                    <ExternalLink className="w-3 h-3 opacity-50" />
                                </a>
                            ))}
                        </div>
                    )}

                    {/* Comments Toggle */}
                    <div>
                        <button
                            type="button"
                            onClick={() => setShowComments(!showComments)}
                            aria-expanded={showComments}
                            className="inline-flex items-center gap-1.5 text-xs text-text-muted dark:text-slate-400 hover:text-primary dark:hover:text-primary transition-colors"
                        >
                            <MessageSquare className="w-3.5 h-3.5" />
                            {`Comments${comments.length > 0 ? ` (${comments.length})` : ''}`}
                        </button>

                        {showComments && (
                            <div className="mt-2 space-y-3 border-t border-slate-100 dark:border-dark-border pt-3">
                                {isLoadingComments ? (
                                    <div className="flex justify-center py-3">
                                        <Loader2 className="w-4 h-4 animate-spin text-primary/50" />
                                    </div>
                                ) : (
                                    comments.map(comment => (
                                        <div key={comment.id} className="group/comment flex items-start justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center">
                                                    <span className="font-medium text-xs text-text-main dark:text-slate-300">
                                                        {comment.author_email.split('@')[0]}
                                                    </span>
                                                    <span className="text-[10px] text-text-muted ml-2">
                                                        {new Date(comment.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <p className="text-sm text-text-main dark:text-slate-300 mt-0.5">{comment.content}</p>
                                            </div>
                                            {comment.user_id === user?.id && (
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        setComments(prev => prev.filter(c => c.id !== comment.id));
                                                        await supabase?.from('task_comments').delete().eq('id', comment.id);
                                                    }}
                                                    className="opacity-0 group-hover/comment:opacity-100 p-1 text-slate-400 hover:text-red-500 transition-all flex-shrink-0"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    ))
                                )}

                                {/* Add comment input */}
                                <div className="flex gap-2 items-end">
                                    <textarea
                                        rows={2}
                                        value={commentText}
                                        onChange={(e) => setCommentText(e.target.value)}
                                        className="input-field text-sm flex-1 resize-none"
                                        placeholder="Write a comment..."
                                    />
                                    <button
                                        type="button"
                                        disabled={!commentText.trim() || isSubmittingComment}
                                        onClick={async () => {
                                            if (!supabase || !user || !activeWorkspace) return;
                                            setIsSubmittingComment(true);
                                            try {
                                                const { data, error } = await supabase
                                                    .from('task_comments')
                                                    .insert({
                                                        task_id: task.id,
                                                        workspace_id: activeWorkspace.id,
                                                        user_id: user.id,
                                                        author_email: user.email,
                                                        content: commentText.trim()
                                                    })
                                                    .select()
                                                    .single();
                                                if (error) throw error;
                                                setComments(prev => [...prev, data as TaskComment]);
                                                setCommentText('');
                                            } catch (error) {
                                                console.error('Error adding comment:', error);
                                            } finally {
                                                setIsSubmittingComment(false);
                                            }
                                        }}
                                        className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0"
                                    >
                                        {isSubmittingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={assetToDelete !== null}
                onClose={() => setAssetToDelete(null)}
                onConfirm={() => {
                    if (assetToDelete) handleDeleteAsset(assetToDelete.id);
                    setAssetToDelete(null);
                }}
                title="Remove Attachment"
                message={`Remove "${assetToDelete?.file_name}" from this task? The file stays in the workspace Files page.`}
            />

            <Modal isOpen={isPickingFile} onClose={() => setIsPickingFile(false)} title="Attach from Files">
                <FileBrowser key={activeWorkspace?.id} onPick={attachExisting} />
            </Modal>

            {viewing && activeWorkspace && (
                <FileViewer workspaceId={activeWorkspace.id} files={viewing.files} startIndex={viewing.index} onClose={() => setViewing(null)} />
            )}
        </article>
    );
}
