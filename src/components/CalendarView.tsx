import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarX2, StickyNote, X, Plus, CalendarCheck2 } from 'lucide-react';
import {
    DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
    type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import type { Task } from '../types';
import { supabase } from '../lib/supabase';

export type CalendarNote = { id: string; day: string; body: string; created_by: string; author_email: string | null; assigned_to: string | null };
export type NoteAssignee = { userId: string; label: string };
const NOTE_FIELDS = 'id, day, body, created_by, author_email, assigned_to';

const PRIORITY_BAR = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-primary' } as const;
const NO_DATE = 'no-date';

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local YYYY-MM-DD, same as due_date
const todayKey = () => keyOf(new Date());
const dateOf = (key: string) => new Date(key + 'T00:00:00');

// first day of the week from the browser's locale (Sunday in the US, Saturday/Sunday/Monday elsewhere)
const weekStart = (() => {
    try {
        const loc = new Intl.Locale(navigator.language) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
        const first = loc.getWeekInfo?.().firstDay ?? loc.weekInfo?.firstDay ?? 7; // 1 = Monday … 7 = Sunday
        return first % 7; // to JS getDay(): 0 = Sunday
    } catch { return 0; }
})();

interface CalendarViewProps {
    workspaceId: string;
    tasks: Task[]; // already filtered by project and member
    canEdit: boolean; // move tasks and add notes (everyone but viewers)
    currentUserId: string;
    assignees?: NoteAssignee[]; // owners/admins only: members they can leave a note for
    toolbarEnd?: React.ReactNode; // e.g. the member filter, shown at the end of the toolbar
    onReschedule: (taskId: string, dueDate: string | null) => void;
    onOpen: (task: Task) => void;
}

// Notes are private: only the writer sees them, unless an owner/admin leaves one for a member (then both do).
export function CalendarView({ workspaceId, tasks, canEdit, currentUserId, assignees, toolbarEnd, onReschedule, onOpen }: CalendarViewProps) {
    const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [selected, setSelected] = useState(todayKey);
    const [dragging, setDragging] = useState<Task | null>(null);
    const [notes, setNotes] = useState<CalendarNote[]>([]);
    const [draft, setDraft] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [noteFor, setNoteFor] = useState(''); // '' = just me
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a plain click still opens the task
        useSensor(KeyboardSensor),
    );

    const today = todayKey();
    const byDay = new Map<string, Task[]>();
    const undated: Task[] = [];
    for (const t of tasks) {
        if (!t.due_date) { undated.push(t); continue; }
        byDay.set(t.due_date, [...(byDay.get(t.due_date) ?? []), t]);
    }
    // open tasks first, then by priority
    const rank = (t: Task) => (t.status === 'done' ? 10 : 0) + ({ high: 0, medium: 1, low: 2 }[t.priority ?? 'low'] ?? 3);
    byDay.forEach(list => list.sort((a, b) => rank(a) - rank(b)));

    // always 6 rows so the grid doesn't jump between months
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() - weekStart + 7) % 7));
    const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
    const weekdays = days.slice(0, 7).map(d => ({ short: d.toLocaleDateString(undefined, { weekday: 'short' }), narrow: d.toLocaleDateString(undefined, { weekday: 'narrow' }), weekend: d.getDay() === 0 || d.getDay() === 6 }));
    const firstKey = keyOf(days[0]);
    const lastKey = keyOf(days[41]);

    // notes for the six weeks on screen
    useEffect(() => {
        let cancelled = false;
        supabase!.from('calendar_notes').select(NOTE_FIELDS)
            .eq('workspace_id', workspaceId).gte('day', firstKey).lte('day', lastKey).order('created_at')
            .then(({ data, error }) => {
                if (error) console.error('Could not load calendar notes:', error);
                else if (!cancelled) setNotes(data as CalendarNote[]);
            });
        return () => { cancelled = true; };
    }, [workspaceId, firstKey, lastKey]);
    const notesByDay = new Map<string, CalendarNote[]>();
    for (const n of notes) notesByDay.set(n.day, [...(notesByDay.get(n.day) ?? []), n]);

    const addNote = async (e: React.FormEvent) => {
        e.preventDefault();
        const body = draft.trim();
        if (!body) return;
        setSavingNote(true);
        const { data, error } = await supabase!.from('calendar_notes')
            .insert({ workspace_id: workspaceId, day: selected, body, assigned_to: noteFor || null })
            .select(NOTE_FIELDS).single();
        setSavingNote(false);
        if (error) { alert('Could not save the note. Please try again.'); return; }
        setNotes(list => [...list, data as CalendarNote]);
        setDraft('');
    };
    const removeNote = async (note: CalendarNote) => {
        setNotes(list => list.filter(n => n.id !== note.id));
        const { error } = await supabase!.from('calendar_notes').delete().eq('id', note.id);
        if (error) { setNotes(list => [...list, note]); alert('Could not delete the note.'); }
    };

    const isCurrentMonth = month.getFullYear() === new Date().getFullYear() && month.getMonth() === new Date().getMonth();
    const shiftMonth = (step: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + step, 1));
    const goToday = () => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayKey()); };

    const onDragStart = (e: DragStartEvent) => setDragging(tasks.find(t => t.id === e.active.id) ?? null);
    const onDragEnd = (e: DragEndEvent) => {
        setDragging(null);
        if (!e.over) return;
        const target = e.over.id === NO_DATE ? null : String(e.over.id);
        const task = tasks.find(t => t.id === e.active.id);
        if (task && (task.due_date ?? null) !== target) onReschedule(task.id, target);
    };

    // a one-line summary of the month shown
    const monthPrefix = keyOf(month).slice(0, 7);
    const monthTasks = tasks.filter(t => t.due_date?.startsWith(monthPrefix));
    const dueCount = monthTasks.filter(t => t.status !== 'done').length;
    const overdueCount = monthTasks.filter(t => t.status !== 'done' && t.due_date! < today).length;
    const noteCount = notes.filter(n => n.day.startsWith(monthPrefix)).length;

    const selectedTasks = byDay.get(selected) ?? [];
    const selectedNotes = notesByDay.get(selected) ?? [];
    const nameOf = (userId: string | null) => assignees?.find(a => a.userId === userId)?.label ?? 'a member';
    // who else is involved: "for sara" on notes you left, "from omar" on notes left for you
    const noteTag = (n: CalendarNote) =>
        n.created_by !== currentUserId ? `from ${n.author_email?.split('@')[0] ?? 'an admin'}`
            : n.assigned_to && n.assigned_to !== currentUserId ? `for ${nameOf(n.assigned_to)}` : null;
    const sel = dateOf(selected);

    return (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
            {/* toolbar */}
            <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-5">
                <div className="mr-auto min-w-0">
                    <h2 className="text-2xl sm:text-[28px] font-semibold tracking-[-0.02em] leading-none text-text-main dark:text-slate-50">
                        {month.toLocaleDateString(undefined, { month: 'long' })}
                        <span className="ml-2 font-light text-text-muted dark:text-slate-500">{month.getFullYear()}</span>
                    </h2>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                        <span><span className="font-semibold text-text-main dark:text-slate-200 tabular-nums">{dueCount}</span> due</span>
                        {overdueCount > 0 && <span className="text-red-500 dark:text-red-400"><span className="font-semibold tabular-nums">{overdueCount}</span> overdue</span>}
                        {noteCount > 0 && <span><span className="font-semibold text-text-main dark:text-slate-200 tabular-nums">{noteCount}</span> note{noteCount === 1 ? '' : 's'}</span>}
                    </p>
                </div>
                {toolbarEnd}
                <div className="inline-flex items-center p-1 rounded-full border border-slate-200/80 bg-white/60 dark:border-white/10 dark:bg-white/[0.03] backdrop-blur">
                    <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className={stepButton}><ChevronLeft className="w-4 h-4" /></button>
                    <button type="button" onClick={goToday} disabled={isCurrentMonth && selected === today}
                        className="h-8 px-3.5 rounded-full text-sm font-medium text-text-main dark:text-slate-100 hover:bg-slate-900/[0.05] dark:hover:bg-white/[0.07] disabled:text-text-muted disabled:hover:bg-transparent transition-colors">
                        Today
                    </button>
                    <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className={stepButton}><ChevronRight className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_19rem] items-start">
                {/* month grid */}
                <div className="glass-panel rounded-3xl overflow-hidden">
                    <div className="grid grid-cols-7 border-b border-slate-200/70 dark:border-white/[0.07]">
                        {weekdays.map((w, i) => (
                            <div key={i} className={`py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] ${w.weekend ? 'text-text-muted/70' : 'text-text-muted'}`}>
                                <span className="hidden sm:inline">{w.short}</span><span className="sm:hidden" aria-hidden="true">{w.narrow}</span>
                            </div>
                        ))}
                    </div>
                    <div key={monthPrefix} className="grid grid-cols-7 animate-fade-in">
                        {days.map((d, i) => {
                            const key = keyOf(d);
                            return (
                                <DayCell
                                    key={key}
                                    dateKey={key}
                                    day={d.getDate()}
                                    inMonth={d.getMonth() === month.getMonth()}
                                    weekend={d.getDay() === 0 || d.getDay() === 6}
                                    lastCol={i % 7 === 6}
                                    lastRow={i >= 35}
                                    isToday={key === today}
                                    isSelected={key === selected}
                                    tasks={byDay.get(key) ?? []}
                                    notes={notesByDay.get(key) ?? []}
                                    today={today}
                                    canEdit={canEdit}
                                    onSelect={() => setSelected(key)}
                                    onOpen={onOpen}
                                />
                            );
                        })}
                    </div>
                </div>

                {/* selected day + unscheduled */}
                <div className="space-y-5 lg:sticky lg:top-6">
                    <section aria-live="polite" aria-label={`Selected day, ${sel.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}`} className="glass-panel rounded-3xl p-5">
                        <div className="flex items-start gap-4 pb-4 border-b border-slate-200/70 dark:border-white/[0.07]">
                            <span className={`text-5xl font-light leading-none tracking-[-0.04em] tabular-nums ${selected === today ? 'text-primary' : 'text-text-main dark:text-slate-50'}`}>
                                {sel.getDate()}
                            </span>
                            <div className="pt-0.5 min-w-0">
                                <p className="text-sm font-semibold text-text-main dark:text-slate-100">{sel.toLocaleDateString(undefined, { weekday: 'long' })}</p>
                                <p className="text-xs text-text-muted">
                                    {sel.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                    {selected === today && <span className="ml-1.5 text-primary font-medium">· Today</span>}
                                </p>
                            </div>
                        </div>

                        {/* notes */}
                        <h3 className={sectionLabel}>Notes</h3>
                        {selectedNotes.length > 0 && (
                            <ul className="space-y-2 mb-3">
                                {selectedNotes.map(n => (
                                    <li key={n.id} className="group/note relative flex items-start gap-2.5 rounded-2xl pl-3.5 pr-2.5 py-2.5 text-sm bg-amber-400/[0.08] border border-amber-400/20 text-text-main dark:text-amber-50">
                                        <StickyNote className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                                        <span className="flex-1 min-w-0 break-words leading-snug">
                                            {n.body}
                                            {noteTag(n) && <span className="block mt-0.5 text-xs text-amber-700/80 dark:text-amber-200/60">{noteTag(n)}</span>}
                                        </span>
                                        {(n.created_by === currentUserId || n.assigned_to === currentUserId) && (
                                            <button type="button" onClick={() => removeNote(n)} aria-label={`Delete note: ${n.body}`}
                                                className="w-7 h-7 -my-1 flex-shrink-0 rounded-full flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-500/10 md:opacity-0 md:group-hover/note:opacity-100 focus-visible:opacity-100 transition">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {canEdit ? (
                            <form onSubmit={addNote} className="space-y-2">
                                <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] pl-3.5 pr-1.5 py-1.5 focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10 transition">
                                    <label htmlFor="calendar-note" className="sr-only">Add a note for {sel.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}</label>
                                    <input
                                        id="calendar-note"
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        maxLength={500}
                                        placeholder="Add a note…"
                                        className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1 text-text-main dark:text-slate-100 placeholder:text-text-muted"
                                    />
                                    <button type="submit" disabled={!draft.trim() || savingNote} aria-label="Add note"
                                        className="w-8 h-8 flex-shrink-0 rounded-xl bg-primary text-on-primary flex items-center justify-center hover:bg-primary-hover transition disabled:opacity-0 disabled:pointer-events-none">
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                {assignees && assignees.length > 0 && (
                                    <select value={noteFor} onChange={(e) => setNoteFor(e.target.value)} aria-label="Who the note is for"
                                        className="input-field text-sm py-2 cursor-pointer">
                                        <option value="">Just me</option>
                                        {assignees.map(a => <option key={a.userId} value={a.userId}>For {a.label}</option>)}
                                    </select>
                                )}
                                <p className="text-[11px] text-text-muted">
                                    {noteFor ? `Only you and ${nameOf(noteFor)} will see it; they'll be notified.` : 'Only you can see your notes.'}
                                </p>
                            </form>
                        ) : selectedNotes.length === 0 && (
                            <p className="text-sm text-text-muted">No notes.</p>
                        )}

                        {/* tasks due */}
                        <h3 className={sectionLabel}>Due{selectedTasks.length > 0 && <span className="ml-1.5 tabular-nums">{selectedTasks.length}</span>}</h3>
                        {selectedTasks.length === 0 ? (
                            <p className="flex items-center gap-2 text-sm text-text-muted"><CalendarCheck2 className="w-4 h-4" /> Nothing due.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {selectedTasks.map(t => <li key={t.id}><TaskChip task={t} today={today} canEdit={canEdit} onOpen={onOpen} large /></li>)}
                            </ul>
                        )}
                    </section>

                    <NoDateList tasks={undated} today={today} canEdit={canEdit} onOpen={onOpen} />
                </div>
            </div>

            <DragOverlay dropAnimation={null}>
                {dragging && <ChipBody task={dragging} today={today} className="shadow-2xl shadow-black/40 ring-1 ring-primary/60 scale-[1.03] cursor-grabbing" />}
            </DragOverlay>
        </DndContext>
    );
}

const stepButton = 'w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-slate-900/[0.05] dark:hover:text-slate-100 dark:hover:bg-white/[0.07] transition-colors';
const sectionLabel = 'mt-5 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted';

interface DayCellProps {
    dateKey: string; day: number; inMonth: boolean; weekend: boolean; lastCol: boolean; lastRow: boolean;
    isToday: boolean; isSelected: boolean;
    tasks: Task[]; notes: CalendarNote[]; today: string; canEdit: boolean; onSelect: () => void; onOpen: (t: Task) => void;
}

function DayCell({ dateKey, day, inMonth, weekend, lastCol, lastRow, isToday, isSelected, tasks, notes, today, canEdit, onSelect, onOpen }: DayCellProps) {
    const { setNodeRef, isOver } = useDroppable({ id: dateKey, disabled: !canEdit });
    // up to 3 lines per day: notes first, then tasks
    const shownNotes = notes.slice(0, 2);
    const shown = tasks.slice(0, 3 - shownNotes.length);
    const more = notes.length + tasks.length - shownNotes.length - shown.length;
    const label = `${dateOf(dateKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}${notes.length ? `, ${notes.length} note${notes.length === 1 ? '' : 's'}` : ''}`;
    return (
        <div
            ref={setNodeRef}
            onClick={onSelect}
            className={[
                'relative min-h-[3.75rem] md:min-h-[7.25rem] p-1 md:p-2 flex flex-col gap-1 cursor-pointer transition-colors duration-150',
                lastCol ? '' : 'border-r border-slate-200/70 dark:border-white/[0.06]',
                lastRow ? '' : 'border-b border-slate-200/70 dark:border-white/[0.06]',
                isOver ? 'bg-primary/[0.12]'
                    : isSelected ? 'bg-primary/[0.07] dark:bg-primary/[0.06]'
                        : weekend || !inMonth ? 'bg-slate-900/[0.015] dark:bg-black/[0.12] hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.025]'
                            : 'hover:bg-slate-900/[0.025] dark:hover:bg-white/[0.025]',
            ].join(' ')}
        >
            {/* selection / drop outline drawn inside the cell so the grid lines stay crisp */}
            {(isSelected || isOver) && <span className={`pointer-events-none absolute inset-0 ring-1 ring-inset ${isOver ? 'ring-primary/70' : 'ring-primary/40'}`} aria-hidden="true" />}

            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                aria-label={label}
                aria-pressed={isSelected}
                className={[
                    'relative self-center md:self-start w-7 h-7 rounded-full text-[13px] tabular-nums flex items-center justify-center transition-colors',
                    isToday ? 'bg-gradient-to-br from-primary to-accent text-on-primary font-semibold shadow-glow'
                        : inMonth ? 'font-medium text-text-main dark:text-slate-200 hover:bg-slate-900/[0.06] dark:hover:bg-white/[0.08]'
                            : 'text-text-muted/50',
                ].join(' ')}
            >
                {day}
            </button>

            {/* phones: dots only; the panel shows the details */}
            {(tasks.length > 0 || notes.length > 0) && (
                <div className="md:hidden flex justify-center gap-[3px]">
                    {notes.length > 0 && <span className="w-[5px] h-[5px] rounded-full bg-amber-400" />}
                    {tasks.slice(0, 3).map(t => <span key={t.id} className={`w-[5px] h-[5px] rounded-full ${t.status === 'done' ? 'bg-slate-400/60' : t.priority ? PRIORITY_BAR[t.priority] : 'bg-primary'}`} />)}
                </div>
            )}
            <div className={`hidden md:flex flex-col gap-1 min-w-0 ${inMonth ? '' : 'opacity-50'}`}>
                {shownNotes.map(n => (
                    <span key={n.id} title={n.body} className="flex items-center gap-1 rounded-md pl-1.5 pr-1 py-[3px] text-[11px] leading-tight bg-amber-400/[0.12] text-amber-800 dark:text-amber-100">
                        <StickyNote className="w-3 h-3 flex-shrink-0 text-amber-500" />
                        <span className="truncate">{n.body}</span>
                    </span>
                ))}
                {shown.map(t => <TaskChip key={t.id} task={t} today={today} canEdit={canEdit} onOpen={onOpen} />)}
                {more > 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(); }} className="self-start px-1.5 text-[11px] font-medium text-text-muted hover:text-primary transition-colors">
                        +{more} more
                    </button>
                )}
            </div>
        </div>
    );
}

function TaskChip({ task, today, canEdit, onOpen, large }: { task: Task; today: string; canEdit: boolean; onOpen: (t: Task) => void; large?: boolean }) {
    const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id, disabled: !canEdit });
    return (
        <button
            ref={setNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => { e.stopPropagation(); onOpen(task); }}
            title={task.name}
            className={`block w-full text-left rounded-md focus-visible:outline-offset-1 ${isDragging ? 'opacity-30' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
            <ChipBody task={task} today={today} large={large} />
        </button>
    );
}

// a slim pill with a priority stripe; done tasks fade, overdue ones turn red
function ChipBody({ task, today, large, className = '' }: { task: Task; today: string; large?: boolean; className?: string }) {
    const done = task.status === 'done';
    const overdue = !done && !!task.due_date && task.due_date < today;
    const tone = done
        ? 'bg-slate-900/[0.03] text-text-muted dark:bg-white/[0.03]'
        : overdue
            ? 'bg-red-500/[0.09] text-red-700 dark:text-red-300'
            : 'bg-primary/[0.09] text-text-main dark:bg-primary/[0.1] dark:text-slate-100';
    const bar = done ? 'bg-slate-400/50' : overdue ? 'bg-red-500' : task.priority ? PRIORITY_BAR[task.priority] : 'bg-primary/70';
    return (
        <span className={`relative flex items-center gap-2 overflow-hidden ${large ? 'rounded-xl pl-4 pr-3 py-2.5 text-sm hover:brightness-110' : 'rounded-md pl-2.5 pr-1.5 py-[3px] text-[11px] leading-tight'} transition ${tone} ${className}`}>
            <span className={`absolute left-0 inset-y-0 ${large ? 'w-1' : 'w-[3px]'} ${bar}`} aria-hidden="true" />
            <span className={`truncate ${done ? 'line-through decoration-1' : ''}`}>{task.name}</span>
            {large && task.status === 'in_progress' && <span className="ml-auto flex-shrink-0 text-[11px] text-accent">In progress</span>}
        </span>
    );
}

function NoDateList({ tasks, today, canEdit, onOpen }: { tasks: Task[]; today: string; canEdit: boolean; onOpen: (t: Task) => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: NO_DATE, disabled: !canEdit });
    const open = tasks.filter(t => t.status !== 'done');
    return (
        <aside ref={setNodeRef} aria-labelledby="no-date-heading"
            className={`glass-panel rounded-3xl p-5 transition-shadow ${isOver ? 'ring-2 ring-primary/60' : ''}`}>
            <h3 id="no-date-heading" className="flex items-center gap-2 text-sm font-semibold text-text-main dark:text-slate-100">
                <CalendarX2 className="w-4 h-4 text-text-muted" /> Unscheduled
                <span className="ml-auto min-w-[1.5rem] h-6 px-2 rounded-full bg-slate-900/[0.05] dark:bg-white/[0.06] text-xs font-medium text-text-muted flex items-center justify-center tabular-nums">{open.length}</span>
            </h3>
            <p className="text-xs text-text-muted mt-1.5 mb-3">{canEdit ? 'Drag onto a day to schedule, or back here to clear the date.' : 'Open tasks without a due date.'}</p>
            {open.length === 0 ? (
                <p className="text-sm text-text-muted">Every open task has a date.</p>
            ) : (
                <ul className="space-y-1.5 max-h-[40vh] overflow-y-auto -mr-1 pr-1">
                    {open.map(t => <li key={t.id}><TaskChip task={t} today={today} canEdit={canEdit} onOpen={onOpen} large /></li>)}
                </ul>
            )}
        </aside>
    );
}
