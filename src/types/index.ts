export type User = {
    id: string;
    email?: string;
};

export type TaskStatus = 'to_do' | 'done';

export type Project = {
    id: string;
    created_at: string;
    name: string;
    description: string | null;
    user_id: string;
};

export type SubTask = {
    text: string;
    done: boolean;
};

export type Link = {
    name: string;
    url: string;
};

export type TaskAsset = {
    id: string;
    task_id: string;
    file_name: string;
    public_url: string;
    storage_path?: string;
    created_at?: string;
};

export type Task = {
    id: string;
    created_at: string;
    name: string;
    description: string | null;
    status: TaskStatus;
    links: Link[] | null;
    user_id: string;
    project_id?: string | null;
    assigned_to_member?: string | null;
    sub_tasks?: SubTask[] | null;
    due_date?: string | null;
    priority?: 'high' | 'medium' | 'low' | null;
    sort_order?: number;
    tools?: Tool[];
    assets?: TaskAsset[];
    client_id?: string | null;
    client?: { id: string; name: string } | null;
};

export type TaskComment = {
    id: string;
    task_id: string;
    workspace_id: string;
    user_id: string;
    author_email: string;
    content: string;
    created_at: string;
};

export type Tool = {
    id: string;
    created_at: string;
    name: string;
    description: string | null;
    link: string;
    category?: string | null;
    user_id: string;
    project_id?: string | null;
};

export type TaskTool = {
    id: string;
    task_id: string;
    tool_id: string;
};

export type ClientStatus = 'potential' | 'negotiating' | 'active';

export type ClientSocialLinks = {
    instagram?: string;
    facebook?: string;
    tiktok?: string;
    linkedin?: string;
    maps?: string;
    snapchat?: string;
};

export type Client = {
    id: string;
    created_at: string;
    workspace_id: string;
    user_id: string;
    name: string;
    status: ClientStatus;
    phone: string | null;
    email: string | null;
    website: string | null;
    notes: string | null;
    social_links: ClientSocialLinks | null;
};
