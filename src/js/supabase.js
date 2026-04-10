/**
 * Supabase Client Configuration
 * 
 * Initializes the Supabase client and provides database helpers.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
import { State } from './state.js';
import { emit, on, Events } from './events.js';

// Create the Supabase client
export const supabase = createClient(
    config.supabase.url,
    config.supabase.anonKey,
    {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    }
);

// Database helper functions
export const db = {
    /**
     * Fetch all projects
     */
    async getProjects() {
        const { data, error } = await supabase
            .from('projects')
            .select('*, unit_distribution(*)')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    },

    /**
     * Fetch a single project by ID
     */
    async getProjectById(id) {
        const { data, error } = await supabase
            .from('projects')
            .select('*, unit_distribution(*)')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Create a new project
     */
    async createProject(projectData, unitDistributionData) {
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .insert([{
                ...projectData,
                user_id: State.session?.user?.id
            }])
            .select()
            .single();

        if (projectError) throw projectError;

        // Insert unit distribution if provided
        if (unitDistributionData && project?.id) {
            const { error: distError } = await supabase
                .from('unit_distribution')
                .insert([{
                    project_id: project.id,
                    ...unitDistributionData
                }]);

            if (distError) throw distError;
        }

        return project;
    },

    /**
     * Update a project
     */
    async updateProject(id, updates) {
        const { data, error } = await supabase
            .from('projects')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Delete a project
     */
    async deleteProject(id) {
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Subscribe to real-time project updates
     */
    subscribeToProjects(callback) {
        const channel = supabase
            .channel('projects-channel')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'projects'
                },
                (payload) => {
                    callback(payload);
                    emit(Events.REALTIME_UPDATE, payload);
                }
            )
            .subscribe();

        emit(Events.REALTIME_SUBSCRIBED, channel);
        return channel;
    },

    // ============================================
    // TASKS
    // ============================================

    /**
     * Get all tasks (optionally filtered by project) with their subtasks
     */
    async getTasksByProject(projectId) {
        const query = supabase
            .from('tasks')
            .select(`
                *,
                projects (
                    id,
                    title
                ),
                subtasks (
                    id,
                    task_id,
                    title,
                    description,
                    assigned_to,
                    status,
                    due_date,
                    completed_at,
                    sort_order,
                    created_at,
                    updated_at
                )
            `)
            .order('created_at', { ascending: true });

        // Only filter by project_id if a specific projectId is provided
        if (projectId) {
            const { data, error } = await query.eq('project_id', projectId);
            if (error) throw error;
            return data;
        }

        // Return all tasks for any project
        const { data, error } = await query;
        if (error) throw error;
        return data;
    },

    /**
     * Get a single task by ID with its subtasks
     */
    async getTaskById(id) {
        const { data, error } = await supabase
            .from('tasks')
            .select(`
                *,
                subtasks (
                    *,
                    assigned_to:assigned_to(id, email, full_name)
                )
            `)
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Create a new task
     */
    async createTask(taskData) {
        const { data: task, error } = await supabase
            .from('tasks')
            .insert([{
                ...taskData,
                created_by: State.session?.user?.id
            }])
            .select()
            .single();

        if (error) throw error;
        return task;
    },

    /**
     * Update a task
     */
    async updateTask(id, updates) {
        // Auto-set completed_at when status changes to completed
        if (updates.status === 'completed') {
            updates.completed_at = new Date().toISOString();
        } else if (updates.status && updates.status !== 'completed') {
            updates.completed_at = null;
        }

        const { data, error } = await supabase
            .from('tasks')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Delete a task
     */
    async deleteTask(id) {
        const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    // ============================================
    // SUBTASKS
    // ============================================

    /**
     * Get all subtasks for a task
     */
    async getSubtasksByTask(taskId) {
        const { data, error } = await supabase
            .from('subtasks')
            .select('*')
            .eq('task_id', taskId)
            .order('sort_order', { ascending: true });

        if (error) throw error;
        return data;
    },

    /**
     * Create a new subtask
     */
    async createSubtask(subtaskData) {
        // Get the current max sort_order if not provided
        if (subtaskData.sort_order === undefined) {
            const { data: existing } = await supabase
                .from('subtasks')
                .select('sort_order')
                .eq('task_id', subtaskData.task_id)
                .order('sort_order', { ascending: false })
                .limit(1);

            subtaskData.sort_order = existing?.length > 0 ? existing[0].sort_order + 1 : 0;
        }

        const { data: subtask, error } = await supabase
            .from('subtasks')
            .insert([{
                ...subtaskData,
                created_by: State.session?.user?.id
            }])
            .select()
            .single();

        if (error) throw error;
        return subtask;
    },

    /**
     * Update a subtask
     */
    async updateSubtask(id, updates) {
        // Auto-set completed_at when status changes to completed
        if (updates.status === 'completed') {
            updates.completed_at = new Date().toISOString();
        } else if (updates.status && updates.status !== 'completed') {
            updates.completed_at = null;
        }

        const { data, error } = await supabase
            .from('subtasks')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Delete a subtask
     */
    async deleteSubtask(id) {
        const { error } = await supabase
            .from('subtasks')
            .delete()
            .eq('id', id);

        if (error) throw error;
    },

    /**
     * Reorder subtasks within a task
     */
    async reorderSubtasks(taskId, orderedIds) {
        const updates = orderedIds.map((id, index) => ({
            id,
            task_id: taskId,
            sort_order: index
        }));

        const { data, error } = await supabase
            .from('subtasks')
            .upsert(updates);

        if (error) throw error;
        return data;
    },

    // ============================================
    // SUBSCRIPTIONS FOR TASKS AND SUBTASKS
    // ============================================

    /**
     * Subscribe to real-time task updates
     */
    subscribeToTasks(projectId, callback) {
        const channel = supabase
            .channel(`tasks-${projectId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tasks',
                    filter: `project_id=eq.${projectId}`
                },
                (payload) => {
                    callback(payload);
                }
            )
            .subscribe();

        return channel;
    },

    /**
     * Subscribe to real-time subtask updates for a task
     */
    subscribeToSubtasks(taskId, callback) {
        const channel = supabase
            .channel(`subtasks-${taskId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'subtasks',
                    filter: `task_id=eq.${taskId}`
                },
                (payload) => {
                    callback(payload);
                }
            )
            .subscribe();

        return channel;
    },

    /**
     * Unsubscribe from real-time updates
     */
    async unsubscribe(channel) {
        await supabase.removeChannel(channel);
    }
};

export default { supabase, db };
