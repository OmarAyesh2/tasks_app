import { useState } from 'react';
import { CalendarDays, CheckSquare, ListChecks } from 'lucide-react';
import {
    DndContext, DragOverlay, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors,
    type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import type { Task, TaskStatus } from '../types';
import type { WorkspaceMember } from '../context/WorkspaceContext';

const PRIORITY_DOT = { high: 'bg-red-500', medium: 'bg-amber-400', low: 'bg-primary' } as const;
const COLUMNS: { id: TaskStatus; label: string; dot: string }[] = [
    { id: 'to_do', label: 'To do', dot: 'bg-slate-400' },
    { id: 'in_progress', label: 'In progress', dot: 'bg-accent' },
    { id: 'done', label: 'Done', dot: 'bg-emerald-500' },
];
const DONE_SHOWN = 15; // shortcut: the Done column shows the latest 15; the Completed page has the rest

interface KanbanBoardProps {
    tasks: Task[]; // already filtered by project and member
    members: WorkspaceMember[];
    canMove: (task: Task) => boolean; // mirrors the database's update rule
    onMove: (taskId: string, status: TaskStatus) => void;
    onOpen: (task: Task) => void;
    onShowCompleted: () => void;
}

export function KanbanBoard({ tasks, members, canMove, onMove, onOpen, onShowCompleted }: KanbanBoardProps) {
    const [dragging, setDragging] = useState<Task | null>(null);
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), // a click still opens the task
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }), // press and hold, so swiping still scrolls
        useSensor(KeyboardSensor),
    );
    const today = new Date().toLocaleDateString('en-CA');

    const byColumn = (status: TaskStatus) => {
        const list = tasks.filter(t => t.status === status);
        return status === 'done'
            ? list.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''))
            : list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    };

    const onDragStart = (e: DragStartEvent) => setDragging(tasks.find(t => t.id === e.active.id) ?? null);
    const onDragEnd = (e: DragEndEvent) => {
        setDragging(null);
        const task = tasks.find(t => t.id === e.active.id);
        const target = e.over?.id as TaskStatus | undefined;
        if (task && target && task.status !== target) onMove(task.id, target);
    };

    return (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
            {/* phones: columns side by side, swipe between them */}
            <div className="-mx-3 px-3 fold:mx-0 fold:px-0 flex md:grid md:grid-cols-3 gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-2">
                {COLUMNS.map(col => {
                    const all = byColumn(col.id);
                    const shown = col.id === 'done' ? all.slice(0, DONE_SHOWN) : all;
                    return (
                        <Column key={col.id} id={col.id} label={col.label} dot={col.dot} count={all.length}>
                            {shown.length === 0 && (
                                <p className="px-2 py-6 text-center text-xs text-text-muted">
                                    {col.id === 'in_progress' ? 'Drag a task here when you start it.' : col.id === 'done' ? 'Finished tasks land here.' : 'Nothing to do.'}
                                </p>
                            )}
                            {shown.map(t => (
                                <BoardCard key={t.id} task={t} members={members} today={today} draggable={canMove(t)} onOpen={onOpen} />
                            ))}
                            {all.length > shown.length && (
                                <button type="button" onClick={onShowCompleted} className="w-full py-2 text-xs font-medium text-primary hover:underline">
                                    +{all.length - shown.length} more in Completed
                                </button>
                            )}
                        </Column>
                    );
                })}
            </div>

            <DragOverlay dropAnimation={null}>
                {dragging && <CardBody task={dragging} members={members} today={today} className="shadow-2xl ring-2 ring-primary rotate-1 cursor-grabbing" />}
            </DragOverlay>
        </DndContext>
    );
}

function Column({ id, label, dot, count, children }: { id: TaskStatus; label: string; dot: string; count: number; children: React.ReactNode }) {
    const { setNodeRef, isOver } = useDroppable({ id });
    return (
        <section
            ref={setNodeRef}
            aria-label={`${label}, ${count} tasks`}
            className={`snap-start shrink-0 w-[82vw] fold:w-[20rem] md:w-auto rounded-2xl p-2.5 flex flex-col gap-2 min-h-[12rem] transition-colors border ${
                isOver ? 'border-primary/60 bg-primary/[0.08]' : 'border-slate-200/70 bg-slate-900/[0.02] dark:border-white/[0.06] dark:bg-white/[0.02]'
            }`}
        >
            <h2 className="flex items-center gap-2 px-1.5 pt-1 pb-1.5 text-sm font-semibold text-text-main dark:text-slate-100">
                <span className={`w-2 h-2 rounded-full ${dot}`} />
                {label}
                <span className="ml-auto text-xs font-medium text-text-muted">{count}</span>
            </h2>
            {children}
        </section>
    );
}

function BoardCard({ task, members, today, draggable, onOpen }: { task: Task; members: WorkspaceMember[]; today: string; draggable: boolean; onOpen: (t: Task) => void }) {
    const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id, disabled: !draggable });
    return (
        <button
            ref={setNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            onClick={() => onOpen(task)}
            title={draggable ? undefined : 'Only the task’s creator or an admin can move it'}
            className={`block w-full text-left touch-manipulation ${isDragging ? 'opacity-30' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
        >
            <CardBody task={task} members={members} today={today} />
        </button>
    );
}

function CardBody({ task, members, today, className = '' }: { task: Task; members: WorkspaceMember[]; today: string; className?: string }) {
    const done = task.status === 'done';
    const overdue = !done && !!task.due_date && task.due_date < today;
    const steps = task.sub_tasks ?? [];
    const stepsDone = steps.filter(s => s.done).length;
    const assignee = members.find(m => m.id === task.assigned_to_member);
    return (
        <span className={`card-base block p-3 hover:border-primary/40 transition-colors ${className}`}>
            <span className="flex items-start gap-2">
                {task.priority && <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[task.priority]}`} aria-label={`${task.priority} priority`} />}
                <span className={`flex-1 text-sm font-medium text-text-main dark:text-slate-100 line-clamp-2 ${done ? 'line-through opacity-60' : ''}`}>{task.name}</span>
                {done && <CheckSquare className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
            </span>
            {(task.due_date || steps.length > 0 || assignee) && (
                <span className="mt-2.5 flex items-center gap-3 text-xs text-text-muted">
                    {task.due_date && (
                        <span className={`inline-flex items-center gap-1 ${overdue ? 'text-red-500 font-medium' : task.due_date === today && !done ? 'text-amber-500 font-medium' : ''}`}>
                            <CalendarDays className="w-3.5 h-3.5" />
                            {new Date(task.due_date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                    )}
                    {steps.length > 0 && (
                        <span className="inline-flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" />{stepsDone}/{steps.length}</span>
                    )}
                    {assignee && (
                        <span className="ml-auto w-6 h-6 rounded-full bg-primary/15 text-primary text-[10px] font-semibold uppercase flex items-center justify-center" title={assignee.email}>
                            {assignee.email.charAt(0)}
                        </span>
                    )}
                </span>
            )}
        </span>
    );
}
