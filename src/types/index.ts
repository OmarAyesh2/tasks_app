export type User = {
    id: string;
    email?: string;
};

export type TaskStatus = 'to_do' | 'done';

export type Link = {
    name: string;
    url: string;
};

export type Task = {
    id: string;
    created_at: string;
    name: string;
    description: string | null;
    status: TaskStatus;
    links: Link[] | null;
    user_id: string;
};

export type Tool = {
    id: string;
    created_at: string;
    name: string;
    description: string | null;
    link: string;
    user_id: string;
};
