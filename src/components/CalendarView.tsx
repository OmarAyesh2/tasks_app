import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarX2, StickyNote, X, Plus } from 'lucide-react';
import {
    DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
    type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import type { Task } from '../types';
import { supabase } from '../lib/supabase';

export type CalendarNote = { id: string; day: string; body: string; created_by: string; author_email: string | null };

const PRIORITY_DOT = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-primary' } as const;
const NO_DATE = 'no-date';

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local YYYY-MM-DD, same as due_date
const todayKey = () => keyOf(new Date());

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
    canRemoveNote: (note: CalendarNote) => boolean; // the author, or an owner/admin (same as the database rule)
    onReschedule: (taskId: string, dueDate: string | null) => void;
    onOpen: (task: Task) => void;
}

export function CalendarView({ workspaceId, tasks, canEdit, canRemoveNote, onReschedule, onOpen }: CalendarViewProps) {
    const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
    const [selected, setSelected] = useState(todayKey);
    const [dragging, setDragging] = useState<Task | null>(null);
    const [notes, setNotes] = useState<CalendarNote[]>([]);
    const [draft, setDraft] = useState('');
    const [savingNote, setSavingNote] = useState(false);
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
    const weekdayNames = days.slice(0, 7).map(d => d.toLocaleDateString(undefined, { weekday: 'short' }));
    const firstKey = keyOf(days[0]);
    const lastKey = keyOf(days[41]);

    // notes for the six weeks on screen
    useEffect(() => {
        let cancelled = false;
        supabase!.from('calendar_notes').select('id, day, body, created_by, author_email')
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
            .insert({ workspace_id: workspaceId, day: selected, body })
            .select('id, day, body, created_by, author_email').single();
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

    const selectedTasks = byDay.get(selected) ?? [];
    const selectedNotes = notesByDay.get(selected) ?? [];
    const selectedLabel = new Date(selected + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
            <div className="grid gap-6 xl:grid-cols-[1fr_17rem]">
                <div className="min-w-0">
                    {/* month switcher */}
                    <div className="flex items-center gap-2 mb-4">
                        <h2 className="text-lg font-semibold text-text-main dark:text-slate-100 mr-auto">
                            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        </h2>
                        <button type="button" onClick={goToday} className="h-9 px-4 rounded-full text-sm font-medium border border-slate-200 dark:border-white/10 text-text-main dark:text-slate-200 hover:bg-slate-900/[0.04] dark:hover:bg-white/[0.06] transition-colors">
                            Today
                        </button>
                        <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month" className={roundButton}><ChevronLeft className="w-5 h-5" /></button>
                        <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month" className={roundButton}><ChevronRight className="w-5 h-5" /></button>
                    </div>

                    <div className="card-base p-2 sm:p-3">
                        <div className="grid grid-cols-7 mb-1">
                            {weekdayNames.map(n => (
                                <div key={n} className="px-1 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-text-muted">{n}</div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {days.map(d => {
                                const key = keyOf(d);
                                return (
                                    <DayCell
                                        key={key}
                                        dateKey={key}
                                        day={d.getDate()}
                                        inMonth={d.getMonth() === month.getMonth()}
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

                    {/* selected day: the readable list on phones, a quick summary on desktop */}
                    <section className="mt-6" aria-live="polite">
                        <h3 className="text-sm font-semibold text-text-main dark:text-slate-100 mb-2">{selectedLabel}</h3>

                        {selectedNotes.length > 0 && (
                            <ul className="space-y-1.5 mb-3" aria-label="Notes">
                                {selectedNotes.map(n => (
                                    <li key={n.id} className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-sm bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-100">
                                        <StickyNote className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber-500" />
                                        <span className="flex-1 min-w-0 break-words">
                                            {n.body}
                                            {n.author_email && <span className="block text-xs text-amber-700/70 dark:text-amber-200/60">{n.author_email.split('@')[0]}</span>}
                                        </span>
                                        {canRemoveNote(n) && (
                                            <button type="button" onClick={() => removeNote(n)} aria-label={`Delete note: ${n.body}`}
                                                className="p-1 -m-1 rounded-full text-amber-600/70 hover:text-red-500 hover:bg-white/60 dark:hover:bg-white/10 transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}

                        {canEdit && (
                            <form onSubmit={addNote} className="flex items-center gap-2 mb-4">
                                <label htmlFor="calendar-note" className="sr-only">Add a note for {selectedLabel}</label>
                                <input
                                    id="calendar-note"
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    maxLength={500}
                                    placeholder="Add a note for this day, e.g. Follow up Abdeen"
                                    className="input-field flex-1 text-sm py-2"
                                />
                                <button type="submit" disabled={!draft.trim() || savingNote} aria-label="Add note"
                                    className="h-10 w-10 flex-shrink-0 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-primary-hover transition-colors disabled:opacity-40">
                                    <Plus className="w-5 h-5" />
                                </button>
                            </form>
                        )}

                        {selectedTasks.length === 0 ? (
                            <p className="text-sm text-text-muted">Nothing due this day.</p>
                        ) : (
                            <ul className="space-y-1.5">
                                {selectedTasks.map(t => <li key={t.id}><TaskChip task={t} today={today} canEdit={canEdit} onOpen={onOpen} large /></li>)}
                            </ul>
                        )}
                    </section>
                </div>

                <NoDateList tasks={undated} today={today} canEdit={canEdit} onOpen={onOpen} />
            </div>

            <DragOverlay dropAnimation={null}>
                {dragging && <ChipBody task={dragging} today={today} className="shadow-2xl ring-2 ring-primary cursor-grabbing" />}
            </DragOverlay>
        </DndContext>
    );
}

const roundButton = 'w-9 h-9 rounded-full flex items-center justify-center text-text-muted hover:text-text-main hover:bg-slate-900/[0.05] dark:hover:text-slate-100 dark:hover:bg-white/[0.06] transition-colors';

interface DayCellProps {
    dateKey: string; day: number; inMonth: boolean; isToday: boolean; isSelected: boolean;
    tasks: Task[]; notes: CalendarNote[]; today: string; canEdit: boolean; onSelect: () => void; onOpen: (t: Task) => void;
}

function DayCell({ dateKey, day, inMonth, isToday, isSelected, tasks, notes, today, canEdit, onSelect, onOpen }: DayCellProps) {
    const { setNodeRef, isOver } = useDroppable({ id: dateKey, disabled: !canEdit });
    // up to 3 lines per day: notes first, then tasks
    const shownNotes = notes.slice(0, 2);
    const shown = tasks.slice(0, 3 - shownNotes.length);
    const more = notes.length + tasks.length - shownNotes.length - shown.length;
    return (
        <div
            ref={setNodeRef}
            onClick={onSelect}
            className={[
                'min-h-[3.25rem] md:min-h-[6.5rem] rounded-xl p-1 md:p-1.5 flex flex-col gap-1 cursor-pointer transition-colors',
                inMonth ? '' : 'opacity-40',
                isOver ? 'bg-primary/15 ring-2 ring-primary/60' : isSelected ? 'bg-primary/[0.07] dark:bg-white/[0.05]' : 'hover:bg-slate-900/[0.03] dark:hover:bg-white/[0.03]',
            ].join(' ')}
        >
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
                aria-label={`${new Date(dateKey + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${tasks.length} task${tasks.length === 1 ? '' : 's'}${notes.length ? `, ${notes.length} note${notes.length === 1 ? '' : 's'}` : ''}`}
                aria-pressed={isSelected}
                className={[
                    'self-center md:self-start w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center',
                    isToday ? 'bg-primary text-on-primary font-semibold' : 'text-text-main dark:text-slate-200',
                ].join(' ')}
            >
                {day}
            </button>

            {/* phones: dots only; the list below shows the details */}
            {(tasks.length > 0 || notes.length > 0) && (
                <div className="md:hidden flex justify-center gap-0.5">
                    {notes.length > 0 && <span className="w-1.5 h-1.5 rounded-sm bg-amber-400" />}
                    {tasks.slice(0, 3).map(t => <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${t.status === 'done' ? 'bg-slate-400' : t.priority ? PRIORITY_DOT[t.priority] : 'bg-primary'}`} />)}
                </div>
            )}
            <div className="hidden md:flex flex-col gap-1 min-w-0">
                {shownNotes.map(n => (
                    <span key={n.id} title={n.body} className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] bg-amber-100/80 text-amber-900 dark:bg-amber-400/15 dark:text-amber-100">
                        <StickyNote className="w-3 h-3 flex-shrink-0 text-amber-500" />
                        <span className="truncate">{n.body}</span>
                    </span>
                ))}
                {shown.map(t => <TaskChip key={t.id} task={t} today={today} canEdit={canEdit} onOpen={onOpen} />)}
                {more > 0 && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(); }} className="text-left px-1.5 text-[11px] font-medium text-text-muted hover:text-text-main dark:hover:text-slate-100">
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
            className={`block w-full text-left ${isDragging ? 'opacity-30' : ''} ${canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
            <ChipBody task={task} today={today} large={large} />
        </button>
    );
}

function ChipBody({ task, today, large, className = '' }: { task: Task; today: string; large?: boolean; className?: string }) {
    const done = task.status === 'done';
    const overdue = !done && !!task.due_date && task.due_date < today;
    const tone = done
        ? 'bg-slate-100 text-text-muted dark:bg-white/[0.04]'
        : overdue
            ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
            : 'bg-primary/10 text-text-main dark:bg-primary/[0.12] dark:text-slate-100';
    return (
        <span className={`flex items-center gap-1.5 rounded-lg ${large ? 'px-3 py-2.5 text-sm' : 'px-1.5 py-1 text-[11px]'} ${tone} ${className}`}>
            <span className={`flex-shrink-0 rounded-full ${large ? 'w-2 h-2' : 'w-1.5 h-1.5'} ${done ? 'bg-slate-400' : task.priority ? PRIORITY_DOT[task.priority] : 'bg-primary'}`} />
            <span className={`truncate ${done ? 'line-through' : ''}`}>{task.name}</span>
        </span>
    );
}

function NoDateList({ tasks, today, canEdit, onOpen }: { tasks: Task[]; today: string; canEdit: boolean; onOpen: (t: Task) => void }) {
    const { setNodeRef, isOver } = useDroppable({ id: NO_DATE, disabled: !canEdit });
    const open = tasks.filter(t => t.status !== 'done');
    return (
        <aside ref={setNodeRef} aria-labelledby="no-date-heading"
            className={`card-base p-4 h-fit xl:sticky xl:top-6 transition-colors ${isOver ? 'ring-2 ring-primary/60 bg-primary/[0.06]' : ''}`}>
            <h3 id="no-date-heading" className="flex items-center gap-2 text-sm font-semibold text-text-main dark:text-slate-100">
                <CalendarX2 className="w-4 h-4 text-text-muted" /> No due date
                <span className="ml-auto text-xs font-medium text-text-muted">{open.length}</span>
            </h3>
            <p className="text-xs text-text-muted mt-1 mb-3">{canEdit ? 'Drag a task onto a day to schedule it, or here to clear its date.' : 'Open tasks without a date.'}</p>
            {open.length === 0 ? (
                <p className="text-sm text-text-muted">Every open task has a date.</p>
            ) : (
                <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                    {open.map(t => <li key={t.id}><TaskChip task={t} today={today} canEdit={canEdit} onOpen={onOpen} large /></li>)}
                </ul>
            )}
        </aside>
    );
}
