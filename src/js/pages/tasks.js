/**
 * Tasks & Subtasks Management Page
 * 
 * Full CRUD operations for tasks and subtasks with project association.
 */

import { db } from '../supabase.js';
import { showToast } from '../ui.js';
import { State } from '../state.js';
import { exportTasksToCSV } from '../utils/csvExport.js';

let currentProjects = [];
let currentTasks = [];
let expandedTaskId = null;
let newSubtaskTaskId = null;

// ============================================================
// Main HTML Template
// ============================================================

export async function getTasksHTML() {
  try {
    currentProjects = await db.getProjects();
    currentTasks = await db.getTasksByProject(null); // Get all tasks
  } catch (error) {
    console.error('Failed to load data:', error);
    showToast('Failed to load tasks', 'error');
    currentProjects = [];
    currentTasks = [];
  }

  return `
    <div class="page-header">
      <div class="page-header-left">
        <p class="page-breadcrumb">Project Management</p>
        <h2 class="page-title">Tasks & Subtasks</h2>
        <p class="page-description">Track and manage tasks across your projects with detailed subtask breakdown.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="export-csv-btn">
          <span class="material-symbols-outlined">download</span>
          Export CSV
        </button>
        <button class="btn btn-primary" id="new-task-btn">
          <span class="material-symbols-outlined">add</span>
          New Task
        </button>
      </div>
    </div>

    <!-- Task Filters -->
    <section class="task-filters-section">
      <div class="task-filter-row">
        <div class="filter-group">
          <label class="form-label">Project</label>
          <select class="form-select" id="filter-project">
            <option value="">All Projects</option>
            ${currentProjects.map(p => `<option value="${p.id}">${p.title}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="filter-status">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="form-label">Priority</label>
          <select class="form-select" id="filter-priority">
            <option value="">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="form-label">Search</label>
          <input class="form-input" id="filter-search" type="text" placeholder="Search tasks..." />
        </div>
      </div>
      <!-- Task Summary Stats -->
      <div class="task-stats-row" id="task-stats">
        ${renderTaskStats()}
      </div>
    </section>

    <!-- Task List Section -->
    <section id="task-list-section">
      ${currentTasks.length > 0 ? renderTaskList() : renderEmptyState()}
    </section>

    <!-- Expanded Task/Subtask Section -->
    <section id="subtask-section" style="display: none;">
      <div class="subtask-header">
        <div class="subtask-header-left">
          <button class="btn btn-tertiary" id="back-to-tasks-btn">
            <span class="material-symbols-outlined">arrow_back</span>
            Back to Tasks
          </button>
          <h3 class="subtask-title" id="subtask-title"></h3>
        </div>
        <button class="btn btn-primary" id="add-subtask-btn">
          <span class="material-symbols-outlined">add</span>
          Add Subtask
        </button>
      </div>
      <div id="subtask-list"></div>
      <div id="subtask-form-container"></div>
    </section>

    <!-- Task Form Modal -->
    <div id="task-form-modal" class="modal-overlay hidden">
      <div class="modal-content task-form-modal">
        <div class="modal-header">
          <h2 class="modal-title" id="task-form-title">New Task</h2>
          <button class="modal-close" id="task-modal-close">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
        <div class="modal-body">
          <form id="task-form">
            <input type="hidden" id="task-id" />
            <div class="form-grid">
              <div class="form-group full-width">
                <label class="form-label" for="task-title">Task Title *</label>
                <input class="form-input" id="task-title" type="text" placeholder="Enter task title..." required />
              </div>
              <div class="form-group full-width">
                <label class="form-label" for="task-description">Description</label>
                <textarea class="form-input" id="task-description" placeholder="Describe the task..." rows="3"></textarea>
              </div>
              <div class="form-group">
                <label class="form-label" for="task-project">Project *</label>
                <select class="form-select" id="task-project" required>
                  <option value="">Select project...</option>
                  ${currentProjects.map(p => `<option value="${p.id}">${p.title}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="task-status">Status</label>
                <select class="form-select" id="task-status">
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="task-priority">Priority</label>
                <select class="form-select" id="task-priority">
                  <option value="low">Low</option>
                  <option value="medium" selected>Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="task-due-date">Due Date</label>
                <input class="form-input" id="task-due-date" type="date" />
              </div>
            </div>
            <div class="form-actions" style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
              <button type="button" class="btn btn-secondary" id="cancel-task-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">
                <span class="material-symbols-outlined">save</span>
                <span id="task-submit-text">Save Task</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Subtask Form (inline) -->
    <div id="inline-subtask-form" style="display: none;">
      <form id="subtask-form" class="subtask-form-inline">
        <div class="form-grid cols-4">
          <div class="form-group">
            <label class="form-label" for="subtask-title">Subtask Title *</label>
            <input class="form-input" id="subtask-title" type="text" placeholder="Enter subtask..." required />
          </div>
          <div class="form-group">
            <label class="form-label" for="subtask-status">Status</label>
            <select class="form-select" id="subtask-status">
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label" for="subtask-due-date">Due Date</label>
            <input class="form-input" id="subtask-due-date" type="date" />
          </div>
          <div class="form-actions" style="display: flex; align-items: flex-end; gap: 0.5rem;">
            <button type="submit" class="btn btn-primary">
              <span class="material-symbols-outlined">add</span>
              Add
            </button>
            <button type="button" class="btn btn-secondary" id="cancel-subtask-btn">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  `;
}

// ============================================================
// Render Functions
// ============================================================

function renderTaskStats() {
  const total = currentTasks.length;
  const completed = currentTasks.filter(t => t.status === 'completed').length;
  const inProgress = currentTasks.filter(t => t.status === 'in_progress').length;
  const blocked = currentTasks.filter(t => t.status === 'blocked').length;
  const pending = currentTasks.filter(t => t.status === 'pending').length;
  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return `
    <div class="stat-item">
      <span class="stat-value">${total}</span>
      <span class="stat-label">Total</span>
    </div>
    <div class="stat-item stat-pending">
      <span class="stat-value">${pending}</span>
      <span class="stat-label">Pending</span>
    </div>
    <div class="stat-item stat-progress">
      <span class="stat-value">${inProgress}</span>
      <span class="stat-label">In Progress</span>
    </div>
    <div class="stat-item stat-completed">
      <span class="stat-value">${completed}</span>
      <span class="stat-label">Completed</span>
    </div>
    <div class="stat-item stat-blocked">
      <span class="stat-value">${blocked}</span>
      <span class="stat-label">Blocked</span>
    </div>
    <div class="stat-progress-bar">
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
      </div>
      <span class="progress-label">${progressPercent}% Complete</span>
    </div>
  `;
}

function getFilteredTasks() {
  const projectFilter = document.getElementById('filter-project')?.value || '';
  const statusFilter = document.getElementById('filter-status')?.value || '';
  const priorityFilter = document.getElementById('filter-priority')?.value || '';
  const searchFilter = document.getElementById('filter-search')?.value?.toLowerCase() || '';

  return currentTasks.filter(task => {
    if (projectFilter && task.project_id !== projectFilter) return false;
    if (statusFilter && task.status !== statusFilter) return false;
    if (priorityFilter && task.priority !== priorityFilter) return false;
    if (searchFilter && !task.title.toLowerCase().includes(searchFilter)) return false;
    return true;
  });
}

function renderTaskList() {
  const filteredTasks = getFilteredTasks();

  if (filteredTasks.length === 0) {
    return `
      <div class="empty-state">
        <span class="material-symbols-outlined empty-icon">task_alt</span>
        <h3>No tasks found</h3>
        <p>${currentTasks.length > 0 ? 'Try adjusting your filters' : 'Get started by creating your first task'}</p>
      </div>
    `;
  }

  const taskRows = filteredTasks.map(task => {
    const project = currentProjects.find(p => p.id === task.project_id);
    const subtaskCount = task.subtasks?.length || 0;
    const completedSubtasks = task.subtasks?.filter(s => s.status === 'completed').length || 0;
    const progressPercent = subtaskCount > 0 ? Math.round((completedSubtasks / subtaskCount) * 100) : 0;
    const isExpanded = expandedTaskId === task.id;

    return `
      <div class="task-card ${isExpanded ? 'expanded' : ''} task-status-${task.status}" data-task-id="${task.id}">
        <div class="task-card-header">
          <div class="task-card-main" data-action="expand">
            <div class="task-status-indicator status-${task.status}"></div>
            <div class="task-info">
              <div class="task-title-row">
                <span class="task-title">${task.title}</span>
                <span class="priority-badge priority-${task.priority}">${task.priority}</span>
                <span class="status-badge task-${task.status}">${formatStatus(task.status)}</span>
              </div>
              <div class="task-meta">
                <span class="task-project">${project?.title || 'No Project'}</span>
                ${task.due_date ? `<span class="task-due">Due: ${formatDate(task.due_date)}</span>` : ''}
                <span class="task-subtasks">${completedSubtasks}/${subtaskCount} subtasks</span>
              </div>
            </div>
          </div>
          <div class="task-card-actions">
            ${subtaskCount > 0 ? `
              <div class="task-progress-mini" title="${progressPercent}% complete">
                <div class="progress-mini-bar">
                  <div class="progress-mini-fill" style="width: ${progressPercent}%"></div>
                </div>
                <span>${progressPercent}%</span>
              </div>
            ` : ''}
            <button class="icon-btn edit-task-btn" data-task-id="${task.id}" title="Edit Task">
              <span class="material-symbols-outlined">edit</span>
            </button>
            <button class="icon-btn delete-task-btn" data-task-id="${task.id}" title="Delete Task">
              <span class="material-symbols-outlined">delete</span>
            </button>
            <button class="icon-btn expand-btn ${isExpanded ? 'rotated' : ''}" data-task-id="${task.id}">
              <span class="material-symbols-outlined">expand_more</span>
            </button>
          </div>
        </div>
        ${isExpanded && task.subtasks?.length > 0 ? `
          <div class="task-subtasks-list">
            ${task.subtasks.map(subtask => `
              <div class="subtask-item subtask-${subtask.status}" data-subtask-id="${subtask.id}">
                <button class="subtask-status-toggle" data-subtask-id="${subtask.id}" title="Toggle Status">
                  <span class="material-symbols-outlined">${getSubtaskIcon(subtask.status)}</span>
                </button>
                <div class="subtask-info">
                  <span class="subtask-title">${subtask.title}</span>
                  ${subtask.due_date ? `<span class="subtask-due">Due: ${formatDate(subtask.due_date)}</span>` : ''}
                </div>
                <span class="status-badge subtask-${subtask.status}">${formatSubtaskStatus(subtask.status)}</span>
                <div class="subtask-actions">
                  <button class="icon-btn edit-subtask-btn" data-subtask-id="${subtask.id}" title="Edit">
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  <button class="icon-btn delete-subtask-btn" data-subtask-id="${subtask.id}" title="Delete">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  return `
    <div class="task-list-container">
      ${taskRows}
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <span class="material-symbols-outlined empty-icon">assignment</span>
      <h3>No Tasks Yet</h3>
      <p>Start tracking your project work by creating tasks and breaking them down into manageable subtasks.</p>
      <button class="btn btn-primary" id="new-task-btn-empty">
        <span class="material-symbols-outlined">add</span>
        Create First Task
      </button>
    </div>
  `;
}

function renderSubtasks(task) {
  if (!task.subtasks || task.subtasks.length === 0) {
    return `
      <div class="empty-state" style="padding: 2rem;">
        <span class="material-symbols-outlined empty-icon">playlist_add_check</span>
        <h3>No Subtasks</h3>
        <p>Break down this task into smaller subtasks for better tracking.</p>
      </div>
    `;
  }

  return task.subtasks.map((subtask, index) => `
    <div class="subtask-card" data-subtask-id="${subtask.id}" style="order: ${subtask.sort_order || index}">
      <div class="subtask-card-header">
        <div class="subtask-card-left">
          <button class="subtask-checkbox ${subtask.status === 'completed' ? 'checked' : ''}" data-subtask-id="${subtask.id}">
            <span class="material-symbols-outlined">${subtask.status === 'completed' ? 'check_box' : 'check_box_outline_blank'}</span>
          </button>
          <div class="subtask-card-info">
            <span class="subtask-card-title ${subtask.status === 'completed' ? 'completed' : ''}">${subtask.title}</span>
            ${subtask.due_date ? `<span class="subtask-due-date">Due: ${formatDate(subtask.due_date)}</span>` : ''}
          </div>
        </div>
        <div class="subtask-card-actions">
          <span class="status-badge subtask-${subtask.status}">${formatSubtaskStatus(subtask.status)}</span>
          <button class="icon-btn edit-subtask-btn" data-subtask-id="${subtask.id}">
            <span class="material-symbols-outlined">edit</span>
          </button>
          <button class="icon-btn delete-subtask-btn" data-subtask-id="${subtask.id}">
            <span class="material-symbols-outlined">delete</span>
          </button>
          <button class="icon-btn drag-handle" title="Drag to reorder">
            <span class="material-symbols-outlined">drag_indicator</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// Helper Functions
// ============================================================

function formatStatus(status) {
  const statusMap = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Completed',
    blocked: 'Blocked'
  };
  return statusMap[status] || status;
}

function formatSubtaskStatus(status) {
  const statusMap = {
    pending: 'Pending',
    in_progress: 'In Progress',
    completed: 'Done'
  };
  return statusMap[status] || status;
}

function getSubtaskIcon(status) {
  switch (status) {
    case 'completed': return 'check_circle';
    case 'in_progress': return 'pending';
    default: return 'radio_button_unchecked';
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getProjectName(projectId) {
  const project = currentProjects.find(p => p.id === projectId);
  return project?.title || 'No Project';
}

// ============================================================
// Event Handlers & Initialization
// ============================================================

export function initTasks() {
  // Export CSV button
  const exportCsvBtn = document.getElementById('export-csv-btn');
  if (exportCsvBtn) exportCsvBtn.addEventListener('click', handleExportCSV);

  // New Task button
  const newTaskBtn = document.getElementById('new-task-btn');
  if (newTaskBtn) newTaskBtn.addEventListener('click', () => openTaskForm());

  const newTaskBtnEmpty = document.getElementById('new-task-btn-empty');
  if (newTaskBtnEmpty) newTaskBtnEmpty.addEventListener('click', () => openTaskForm());

  // Task form
  const taskForm = document.getElementById('task-form');
  if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);

  // Modal controls
  const modalClose = document.getElementById('task-modal-close');
  const cancelTaskBtn = document.getElementById('cancel-task-btn');
  if (modalClose) modalClose.addEventListener('click', closeTaskForm);
  if (cancelTaskBtn) cancelTaskBtn.addEventListener('click', closeTaskForm);

  // Expand task cards
  document.querySelectorAll('.task-card-main').forEach(el => {
    el.addEventListener('click', () => toggleTaskExpand(el.dataset.taskId));
  });

  document.querySelectorAll('.expand-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTaskExpand(el.dataset.taskId);
    });
  });

  // Edit task
  document.querySelectorAll('.edit-task-btn').forEach(btn => {
    btn.addEventListener('click', () => openTaskForm(btn.dataset.taskId));
  });

  // Delete task
  document.querySelectorAll('.delete-task-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteTask(btn.dataset.taskId));
  });

  // Subtask status toggle (from expanded view)
  document.querySelectorAll('.subtask-status-toggle').forEach(btn => {
    btn.addEventListener('click', () => toggleSubtaskStatus(btn.dataset.subtaskId));
  });

  // Edit subtask
  document.querySelectorAll('.edit-subtask-btn').forEach(btn => {
    btn.addEventListener('click', () => openSubtaskForm(btn.dataset.taskId, btn.dataset.subtaskId));
  });

  // Delete subtask
  document.querySelectorAll('.delete-subtask-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteSubtask(btn.dataset.subtaskId));
  });

  // Back to tasks
  const backBtn = document.getElementById('back-to-tasks-btn');
  if (backBtn) backBtn.addEventListener('click', () => {
    document.getElementById('subtask-section').style.display = 'none';
    document.getElementById('task-list-section').style.display = 'block';
  });

  // Add subtask button
  const addSubtaskBtn = document.getElementById('add-subtask-btn');
  if (addSubtaskBtn) addSubtaskBtn.addEventListener('click', () => openSubtaskForm(expandedTaskId));

  // Subtask form
  const subtaskForm = document.getElementById('subtask-form');
  if (subtaskForm) subtaskForm.addEventListener('submit', handleSubtaskSubmit);

  const cancelSubtaskBtn = document.getElementById('cancel-subtask-btn');
  if (cancelSubtaskBtn) cancelSubtaskBtn.addEventListener('click', closeSubtaskForm);

  // Filter listeners
  document.getElementById('filter-project')?.addEventListener('change', refreshTaskList);
  document.getElementById('filter-status')?.addEventListener('change', refreshTaskList);
  document.getElementById('filter-priority')?.addEventListener('change', refreshTaskList);
  document.getElementById('filter-search')?.addEventListener('input', refreshTaskList);
}

async function refreshTaskList() {
  try {
    currentTasks = await db.getTasksByProject(null);
    const listSection = document.getElementById('task-list-section');
    if (listSection) {
      listSection.innerHTML = currentTasks.length > 0 ? renderTaskList() : renderEmptyState();
      initTasks();
    }
    // Update stats
    const statsEl = document.getElementById('task-stats');
    if (statsEl) statsEl.innerHTML = renderTaskStats();
  } catch (error) {
    console.error('Failed to refresh tasks:', error);
  }
}

// ============================================================
// CSV Export
// ============================================================

async function handleExportCSV() {
  try {
    const filteredTasks = getFilteredTasks();

    if (filteredTasks.length === 0) {
      showToast('No tasks to export', 'warning');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `tasks_export_${timestamp}.csv`;

    const success = exportTasksToCSV(filteredTasks, filename);

    if (success) {
      showToast(`Exported ${filteredTasks.length} tasks to CSV`, 'success');
    } else {
      showToast('Failed to export tasks', 'error');
    }
  } catch (error) {
    console.error('Export error:', error);
    showToast('Failed to export tasks', 'error');
  }
}

// ============================================================
// Task Form Modal
// ============================================================

async function openTaskForm(taskId = null) {
  const modal = document.getElementById('task-form-modal');
  const formTitle = document.getElementById('task-form-title');
  const submitText = document.getElementById('task-submit-text');
  const form = document.getElementById('task-form');

  if (!modal || !form) return;

  form.reset();
  document.getElementById('task-id').value = '';

  if (taskId) {
    try {
      const task = currentTasks.find(t => t.id === taskId);
      if (task) {
        formTitle.textContent = 'Edit Task';
        submitText.textContent = 'Update Task';
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-project').value = task.project_id;
        document.getElementById('task-status').value = task.status;
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-due-date').value = task.due_date || '';
      }
    } catch (error) {
      console.error('Failed to load task:', error);
    }
  } else {
    formTitle.textContent = 'New Task';
    submitText.textContent = 'Save Task';
  }

  modal.classList.remove('hidden');
}

function closeTaskForm() {
  const modal = document.getElementById('task-form-modal');
  if (modal) modal.classList.add('hidden');
}

async function handleTaskSubmit(e) {
  e.preventDefault();

  const taskId = document.getElementById('task-id').value;
  const taskData = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-description').value || null,
    project_id: document.getElementById('task-project').value,
    status: document.getElementById('task-status').value,
    priority: document.getElementById('task-priority').value,
    due_date: document.getElementById('task-due-date').value || null
  };

  try {
    if (taskId) {
      await db.updateTask(taskId, taskData);
      showToast('Task updated successfully!', 'success');
    } else {
      await db.createTask(taskData);
      showToast('Task created successfully!', 'success');
    }
    closeTaskForm();
    await refreshTaskList();
  } catch (error) {
    console.error('Failed to save task:', error);
    showToast('Failed to save task', 'error');
  }
}

// ============================================================
// Task Actions
// ============================================================

function toggleTaskExpand(taskId) {
  if (expandedTaskId === taskId) {
    expandedTaskId = null;
  } else {
    expandedTaskId = taskId;
  }
  refreshTaskList();
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task? All subtasks will also be deleted.')) return;

  try {
    await db.deleteTask(taskId);
    showToast('Task deleted successfully', 'success');
    await refreshTaskList();
  } catch (error) {
    console.error('Failed to delete task:', error);
    showToast('Failed to delete task', 'error');
  }
}

// ============================================================
// Subtask Actions
// ============================================================

function openSubtaskForm(taskId, subtaskId = null) {
  expandedTaskId = taskId;
  newSubtaskTaskId = taskId;

  const formContainer = document.getElementById('inline-subtask-form');
  const form = document.getElementById('subtask-form');

  if (!formContainer || !form) {
    // Show section and then open form
    document.getElementById('task-list-section').style.display = 'none';
    document.getElementById('subtask-section').style.display = 'block';
    return;
  }

  form.reset();

  if (subtaskId) {
    // TODO: Populate form with existing subtask data
  }

  document.getElementById('task-list-section').style.display = 'none';
  document.getElementById('subtask-section').style.display = 'block';
  document.getElementById('inline-subtask-form').style.display = 'block';
}

function closeSubtaskForm() {
  document.getElementById('inline-subtask-form').style.display = 'none';
  document.getElementById('subtask-form')?.reset();
}

async function handleSubtaskSubmit(e) {
  e.preventDefault();

  const subtaskData = {
    task_id: expandedTaskId,
    title: document.getElementById('subtask-title').value,
    status: document.getElementById('subtask-status').value,
    due_date: document.getElementById('subtask-due-date').value || null
  };

  try {
    await db.createSubtask(subtaskData);
    showToast('Subtask added!', 'success');
    closeSubtaskForm();
    await refreshTaskList();
  } catch (error) {
    console.error('Failed to add subtask:', error);
    showToast('Failed to add subtask', 'error');
  }
}

async function toggleSubtaskStatus(subtaskId) {
  const subtask = currentTasks
    .flatMap(t => t.subtasks || [])
    .find(s => s.id === subtaskId);

  if (!subtask) return;

  const newStatus = subtask.status === 'completed' ? 'pending' : 'completed';

  try {
    await db.updateSubtask(subtaskId, { status: newStatus });
    await refreshTaskList();
  } catch (error) {
    console.error('Failed to update subtask:', error);
  }
}

async function deleteSubtask(subtaskId) {
  if (!confirm('Delete this subtask?')) return;

  try {
    await db.deleteSubtask(subtaskId);
    showToast('Subtask deleted', 'success');
    await refreshTaskList();
  } catch (error) {
    console.error('Failed to delete subtask:', error);
    showToast('Failed to delete subtask', 'error');
  }
}

export default { getTasksHTML, initTasks };