import type { TaskAsset } from '../types';

export type BrowserFile = TaskAsset & { tasks: { name: string; projects: { name: string } | null } | null };
type TaskGroup = { label: string; files: BrowserFile[] };
type ProjectGroup = { label: string; tasks: Map<string, TaskGroup> };

const DELETED_KEY = 'deleted';

// Project -> task -> files. Files whose task was deleted go last, under "Deleted tasks".
export function groupFiles(files: BrowserFile[]) {
    const groups = new Map<string, ProjectGroup>();
    for (const f of files) {
        const projectName = f.tasks?.projects?.name ?? 'No project';
        const groupKey = f.task_id ? `project:${projectName}` : DELETED_KEY;
        const taskKey = f.task_id ?? `deleted:${f.task_name ?? ''}`;
        const taskLabel = f.task_id ? (f.tasks?.name ?? 'Untitled task') : (f.task_name ?? 'Unknown task');

        if (!groups.has(groupKey)) groups.set(groupKey, { label: f.task_id ? projectName : 'Deleted tasks', tasks: new Map() });
        const tasks = groups.get(groupKey)!.tasks;
        if (!tasks.has(taskKey)) tasks.set(taskKey, { label: taskLabel, files: [] });
        tasks.get(taskKey)!.files.push(f);
    }
    return [...groups.entries()]
        .sort(([a, ga], [b, gb]) => (a === DELETED_KEY ? 1 : b === DELETED_KEY ? -1 : ga.label.localeCompare(gb.label)))
        .map(([key, g]) => ({ key, ...g }));
}
