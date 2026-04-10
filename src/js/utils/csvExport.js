/**
 * CSV Export Utility
 * 
 * Provides functions to export data to CSV format and trigger browser downloads.
 */

/**
 * Convert array of objects to CSV string
 * @param {Array<Object>} data - Array of objects to convert
 * @returns {string} CSV formatted string
 */
export function arrayToCSV(data) {
    if (!data || data.length === 0) return '';

    // Get headers from first object
    const headers = Object.keys(data[0]);

    // Create CSV rows
    const csvRows = [
        // Header row
        headers.map(h => escapeCSVValue(h)).join(','),
        // Data rows
        ...data.map(row =>
            headers.map(h => escapeCSVValue(row[h])).join(',')
        )
    ];

    return csvRows.join('\n');
}

/**
 * Escape a CSV value to handle special characters
 * @param {*} value - Value to escape
 * @returns {string} Escaped CSV value
 */
function escapeCSVValue(value) {
    if (value === null || value === undefined) return '';

    const str = String(value);

    // If value contains comma, quote, or newline, wrap in quotes
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        // Double any quotes
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

/**
 * Download a CSV string as a file
 * @param {string} csvContent - CSV content to download
 * @param {string} filename - Filename for the download (should end with .csv)
 */
export function downloadCSV(csvContent, filename) {
    // Create blob from CSV content
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

    // Create download link
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';

    // Add link, click it, and remove it
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up URL object
    URL.revokeObjectURL(url);
}

/**
 * Format tasks data into flat rows for CSV export
 * @param {Array<Object>} tasks - Array of tasks with subtasks
 * @returns {Array<Object>} Flat array for CSV
 */
export function formatTasksForCSV(tasks) {
    const csvRows = [];

    tasks.forEach(task => {
        // If task has subtasks, create a row for each subtask
        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(subtask => {
                csvRows.push({
                    'Task Title': task.title,
                    'Task Description': task.description || '',
                    'Task Status': formatStatus(task.status),
                    'Task Priority': formatPriority(task.priority),
                    'Project': task.projects?.title || '',
                    'Due Date': task.due_date ? formatDate(task.due_date) : '',
                    'Subtask Title': subtask.title,
                    'Subtask Status': formatSubtaskStatus(subtask.status),
                    'Subtask Due Date': subtask.due_date ? formatDate(subtask.due_date) : '',
                    'Created At': task.created_at ? formatDateTime(task.created_at) : ''
                });
            });
        } else {
            // Task without subtasks
            csvRows.push({
                'Task Title': task.title,
                'Task Description': task.description || '',
                'Task Status': formatStatus(task.status),
                'Task Priority': formatPriority(task.priority),
                'Project': task.projects?.title || '',
                'Due Date': task.due_date ? formatDate(task.due_date) : '',
                'Subtask Title': '',
                'Subtask Status': '',
                'Subtask Due Date': '',
                'Created At': task.created_at ? formatDateTime(task.created_at) : ''
            });
        }
    });

    return csvRows;
}

// Helper formatting functions
function formatStatus(status) {
    const statusMap = {
        pending: 'Pending',
        in_progress: 'In Progress',
        completed: 'Completed',
        blocked: 'Blocked'
    };
    return statusMap[status] || status;
}

function formatPriority(priority) {
    const priorityMap = {
        low: 'Low',
        medium: 'Medium',
        high: 'High',
        urgent: 'Urgent'
    };
    return priorityMap[priority] || priority;
}

function formatSubtaskStatus(status) {
    const statusMap = {
        pending: 'Pending',
        in_progress: 'In Progress',
        completed: 'Done'
    };
    return statusMap[status] || status;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleString('en-US');
}

/**
 * Export tasks to CSV file
 * @param {Array<Object>} tasks - Array of tasks with subtasks
 * @param {string} [filename='tasks_export.csv'] - Output filename
 */
export function exportTasksToCSV(tasks, filename = 'tasks_export.csv') {
    const csvData = formatTasksForCSV(tasks);

    if (csvData.length === 0) {
        console.warn('No data to export');
        return false;
    }

    const csvContent = arrayToCSV(csvData);
    downloadCSV(csvContent, filename);
    return true;
}

/**
 * Format projects data for CSV export
 * @param {Array<Object>} projects - Array of project objects
 * @returns {Array<Object>} Flat array for CSV
 */
export function formatProjectsForCSV(projects) {
    return projects.map(p => ({
        'Title': p.title || '',
        'Category': p.category || '',
        'Status': formatStatus(p.status),
        'Summary': p.summary || '',
        'Initial Allocation': p.initial_allocation || '',
        'Projected ROI': p.projected_roi || '',
        'Fiscal Commencement': p.fiscal_commencement ? formatDate(p.fiscal_commencement) : '',
        'Funding Sources': Array.isArray(p.funding_sources) ? p.funding_sources.join('; ') : '',
        'Implementing Department': p.implementing_department || '',
        'Created At': p.created_at ? formatDateTime(p.created_at) : ''
    }));
}

/**
 * Export projects to CSV file
 * @param {Array<Object>} projects - Array of project objects
 * @param {string} [filename='projects_export.csv'] - Output filename
 */
export function exportProjectsToCSV(projects, filename = 'projects_export.csv') {
    if (!projects || projects.length === 0) {
        console.warn('No projects to export');
        return false;
    }

    const csvData = formatProjectsForCSV(projects);
    const csvContent = arrayToCSV(csvData);
    downloadCSV(csvContent, filename);
    return true;
}

export default {
    arrayToCSV,
    downloadCSV,
    formatTasksForCSV,
    exportTasksToCSV,
    formatProjectsForCSV,
    exportProjectsToCSV
};