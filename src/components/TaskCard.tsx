import { useState, useRef } from 'react';
import type { Task } from '../types';
import { Check, Link as LinkIcon, ExternalLink, Trash2, Library, Pencil, Loader2, Sparkles, Plus, X, Paperclip, File as FileIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { gemini } from '../lib/gemini';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface TaskCardProps {
    task: Task;
    onStatusChange: (task: Task) => void;
    onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
    onEdit: () => void;
    onDelete: () => void;
}

export function TaskCard({ task, onStatusChange, onUpdateTask, onEdit, onDelete }: TaskCardProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const [newStepText, setNewStepText] = useState('');
    const [isUploadingAsset, setIsUploadingAsset] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

            const response = await gemini.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
            });

            const responseText = response.text || '[]';
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
            const driveUrl = await new Promise<string>((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                xhr.open('POST', 'https://gaehkozgxxftdacfsxnf.supabase.co/functions/v1/upload-to-drive');

                xhr.setRequestHeader('Authorization', `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`);
                xhr.setRequestHeader('apikey', import.meta.env.VITE_SUPABASE_ANON_KEY);
                xhr.setRequestHeader('x-filename', encodeURIComponent(file.name));
                xhr.setRequestHeader('x-filetype', file.type || 'application/octet-stream');

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
                        reject(new Error(`Upload failed with status: ${xhr.status}`));
                    }
                };

                xhr.onerror = () => reject(new Error("Network error during upload"));
                xhr.send(file);
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

    const handleDeleteAsset = async (assetId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
            if (!supabase) return;
            const { error } = await supabase.from('task_assets').delete().eq('id', assetId);

            if (error) throw error;

            const currentAssets = task.assets || [];
            const updatedAssets = currentAssets.filter((item) => item.id !== assetId);
            onUpdateTask(task.id, { assets: updatedAssets });
        } catch (error) {
            console.error('Error deleting asset:', error);
            alert('Failed to delete asset. Please try again.');
        }
    };

    const isDone = task.status === 'done';

    return (
        <div className="group relative bg-white dark:bg-dark-surface rounded-xl p-5 border border-slate-100 dark:border-dark-border shadow-soft hover:shadow-soft-hover dark:shadow-none dark:hover:bg-slate-800 transition-all duration-300 animate-fade-in pr-14">
            <div className="absolute top-4 right-4 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onEdit();
                    }}
                    className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
                    title="Edit task"
                >
                    <Pencil className="w-4 h-4" />
                </button>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete();
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                    title="Delete task"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => onStatusChange(task)}
                            className={cn(
                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200",
                                isDone
                                    ? "bg-green-500 border-green-500 text-white"
                                    : "border-slate-300 dark:border-slate-600 hover:border-primary text-transparent"
                            )}
                        >
                            <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        </button>
                        <h3 className={cn(
                            "text-lg font-medium transition-all duration-200",
                            isDone ? "text-text-muted line-through" : "text-text-main dark:text-slate-200"
                        )}>
                            {task.name}
                        </h3>
                    </div>

                    {task.description && (
                        <p className="text-text-muted text-sm pl-9">{task.description}</p>
                    )}

                    {/* Checklist Section */}
                    <div className="pt-2 pl-9 space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-text-main dark:text-slate-200">Checklist</h4>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleAIBreakDown}
                                    disabled={isGenerating}
                                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 dark:hover:bg-indigo-900/50 transition-colors disabled:opacity-50"
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
                                className="flex-1 text-sm bg-transparent border-b border-slate-200 dark:border-slate-700 px-1 py-1 focus:outline-none focus:border-primary dark:text-slate-200 placeholder:text-slate-400"
                            />
                            <button
                                onClick={addSubTask}
                                disabled={!newStepText.trim()}
                                className="p-1 text-primary disabled:opacity-40 hover:bg-primary/10 rounded transition-colors"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* File Attachments Section */}
                    <div className="pt-2 pl-9 space-y-2">
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
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-primary hover:border-primary dark:text-slate-400 dark:hover:text-primary transition-all disabled:opacity-50"
                            >
                                {isUploadingAsset ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Paperclip className="w-3.5 h-3.5" />}
                                {isUploadingAsset
                                    ? uploadProgress === 100
                                        ? 'Processing File...'
                                        : `Uploading ${uploadProgress}%`
                                    : 'Attach File'}
                            </button>
                        </div>

                        {task.assets && task.assets.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1">
                                {task.assets.map((asset) => (
                                    <a
                                        key={asset.id}
                                        href={asset.public_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-indigo-50/50 dark:bg-indigo-900/20 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors border border-indigo-100 dark:border-indigo-800/50"
                                    >
                                        <FileIcon className="w-3 h-3 flex-shrink-0" />
                                        <span className="truncate max-w-[180px]">{asset.file_name}</span>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDeleteAsset(asset.id, e)}
                                            className="p-0.5 ml-1 flex-shrink-0 text-indigo-400 hover:text-red-500 hover:bg-white/50 dark:hover:bg-dark-surface/50 rounded transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>

                    {task.links && task.links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pl-9 pt-2">
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
                        <div className="flex flex-wrap gap-2 pl-9 pt-1">
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
                </div>
            </div>
        </div>
    );
}
