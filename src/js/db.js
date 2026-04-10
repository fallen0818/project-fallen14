/**
 * Database Helper Functions
 * 
 * Additional database queries and helper functions
 */

import { supabase } from './supabase.js';

/**
 * Get all tasks with project information
 */
export async function getProjectTasks() {
    try {
        const { data, error } = await supabase
            .from('tasks')
            .select(`
        id,
        title,
        description,
        status,
        priority,
        due_date,
        created_at,
        project_id,
        created_by,
        projects (title, category, status)
      `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Failed to load tasks:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error fetching tasks:', error);
        return [];
    }
}