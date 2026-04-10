/**
 * Dashboard Page
 * 
 * Main analytics dashboard with KPIs and charts.
 */

import { db } from '../supabase.js';
import { State } from '../state.js';
import { getProjectTasks } from '../db.js';
import Chart from 'chart.js/auto';

let channel = null;
let ganttChart = null;

export async function getDashboardHTML() {
  // Load projects data
  try {
    const projects = await db.getProjects();
    State.setProjects(projects);
  } catch (error) {
    console.error('Failed to load projects:', error);
  }

  // Load tasks data for Gantt chart
  try {
    const tasks = await getProjectTasks();
    State.setTasks(tasks);
  } catch (error) {
    console.error('Failed to load tasks:', error);
  }

  const m = State.metrics;

  return `
    <!-- Dashboard Header -->
    <div class="page-header">
      <div class="page-header-left">
        <p class="page-breadcrumb">Operational Overview</p>
        <h2 class="page-title">The Informed Monolith</h2>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" id="export-data-btn">
          Export Data
        </button>
        <a href="#data-entry" class="btn btn-primary">
          <span class="material-symbols-outlined">add</span>
          New Entry
        </a>
      </div>
    </div>

    <!-- Gantt Chart Section -->
    <div class="chart-container">
      <div class="chart-header">
        <div>
          <h3 class="chart-title" id="gantt-chart-title">Project Timeline</h3>
          <p class="chart-description">Click on a project below to view its tasks timeline</p>
        </div>
        <div class="chart-toggle-group">
          <button class="chart-toggle active" id="all-projects-btn">All Projects</button>
        </div>
      </div>
      <div class="chart-body">
        <canvas id="gantt-chart"></canvas>
      </div>
    </div>

    <!-- KPI Section (Bento Grid Style) -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-header">
          <div class="kpi-icon" style="background-color: rgba(0,61,155,0.1); color: var(--primary);">
            <span class="material-symbols-outlined">database</span>
          </div>
          <span class="kpi-trend" id="kpi-entries-trend">
          </span>
        </div>
        <div>
          <p class="kpi-label">Total Entries</p>
          <p class="kpi-value" id="kpi-total">${m.totalEntries}</p>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <div class="kpi-icon" style="background-color: rgba(0,104,122,0.1); color: var(--secondary);">
            <span class="material-symbols-outlined">verified</span>
          </div>
          <span class="kpi-trend">
            <span class="material-symbols-outlined">check_circle</span>
            Stable
          </span>
        </div>
        <div>
          <p class="kpi-label">Accuracy Rate</p>
          <p class="kpi-value" id="kpi-accuracy">${m.accuracyRate}%</p>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <div class="kpi-icon" style="background-color: rgba(67,47,156,0.1); color: var(--tertiary);">
            <span class="material-symbols-outlined">account_balance</span>
          </div>
          <span class="kpi-trend">
            <span class="material-symbols-outlined">stacked_line_chart</span>
            Portfolio
          </span>
        </div>
        <div>
          <p class="kpi-label">Total Allocation</p>
          <p class="kpi-value" id="kpi-total-allocation" style="font-size: 1.25rem;">${getTotalAllocation()}</p>
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <div class="kpi-icon" style="background-color: rgba(0,82,204,0.1); color: var(--primary-container);">
            <span class="material-symbols-outlined">speed</span>
          </div>
          <span class="kpi-trend">
            <span class="material-symbols-outlined">bolt</span>
            Fast
          </span>
        </div>
        <div>
          <p class="kpi-label">Latency</p>
          <p class="kpi-value">${m.latency}<span style="font-size:0.5em">ms</span></p>
        </div>
      </div>
    </div>

    <!-- Main Analytics Section -->
    <div class="space-y-10">

${State.projects.length > 0 ? renderProjectsTable() : renderEmptyState()}
     </div>
   `;
}


function renderProjectsTable() {
  const projectsHTML = State.projects.slice(0, 10).map(p => `
    <tr class="project-row" data-project-id="${p.id}">
      <td>${p.title || 'Untitled'}</td>
      <td>${p.category || 'N/A'}</td>
      <td>${p.status ? `<span class="status-badge ${p.status}">${p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span>` : 'N/A'}</td>
      <td>${p.initial_allocation ? Number(p.initial_allocation).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'N/A'}</td>
      <td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A'}</td>
    </tr>
  `).join('');

  return `
    <!-- Recent Projects -->
    <div class="data-table-container">
      <h3 class="chart-title">Recent Projects</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Project Title</th>
            <th>Category</th>
            <th>Status</th>
            <th>Allocation</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${projectsHTML}
        </tbody>
      </table>
    </div>
  `;
}

function getTotalAllocation() {
  const total = (State.projects || []).reduce((sum, p) => sum + (Number(p.initial_allocation) || 0), 0);
  return total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderEmptyState() {
  return `
    <div class="chart-container" style="text-align: center; padding: 3rem;">
      <span class="material-symbols-outlined" style="font-size: 3rem; color: var(--outline-variant); margin-bottom: 1rem;">inbox</span>
      <h3 class="chart-title" style="margin-bottom: 0.5rem;">No Projects Yet</h3>
      <p class="chart-description" style="margin-bottom: 1.5rem;">Get started by creating your first project entry.</p>
      <a href="#data-entry" class="btn btn-primary">
        <span class="material-symbols-outlined">add</span>
        Create Project
      </a>
    </div>
  `;
}

/**
 * Initialize dashboard functionality
 */
export function initDashboard() {
  initGanttChart();
  subscribeToRealtime();
  setupProjectSelection();
  setupExportButton();
}

/**
 * Setup project selection functionality
 */
function setupProjectSelection() {
  const projectRows = document.querySelectorAll('.project-row');
  const allProjectsBtn = document.getElementById('all-projects-btn');

  projectRows.forEach(row => {
    row.addEventListener('click', () => {
      // Remove highlight from all rows
      projectRows.forEach(r => r.classList.remove('selected'));
      // Add highlight to selected row
      row.classList.add('selected');

      // Get selected project id
      const projectId = row.dataset.projectId;

      // Filter tasks for selected project
      const selectedProject = State.projects.find(p => p.id === projectId);

      // Update chart title
      document.getElementById('gantt-chart-title').textContent = `Timeline: ${selectedProject?.title || 'Project'}`;

      // Re-render Gantt chart with filtered tasks
      if (ganttChart) {
        ganttChart.destroy();
      }

      const filteredTasks = State.tasks.filter(task => task.project_id === projectId);
      const canvas = document.getElementById('gantt-chart');
      createGanttChart(canvas, filteredTasks);
    });
  });

  if (allProjectsBtn) {
    allProjectsBtn.addEventListener('click', () => {
      // Remove highlight from all rows
      projectRows.forEach(r => r.classList.remove('selected'));

      // Update chart title
      document.getElementById('gantt-chart-title').textContent = 'Project Timeline';

      // Re-render Gantt chart with all tasks
      if (ganttChart) {
        ganttChart.destroy();
      }

      const canvas = document.getElementById('gantt-chart');
      createGanttChart(canvas, State.tasks);
    });
  }
}

/**
 * Initialize Gantt chart
 */
function initGanttChart() {
  const canvas = document.getElementById('gantt-chart');
  if (!canvas) return;

  // Chart.js is imported as ES module at the top of this file
  createGanttChart(canvas);
}

function createGanttChart(canvas, tasks = State.tasks || []) {
  const ctx = canvas.getContext('2d');

  // If no real tasks exist, show an empty state instead of mock data
  if (tasks.length === 0) {
    const container = canvas.parentElement;
    if (container) {
      container.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; color: var(--on-surface-variant);">
          <span class="material-symbols-outlined" style="font-size: 2.5rem; margin-bottom: 0.75rem; opacity: 0.5;">timeline</span>
          <p style="font-size: 0.95rem; font-weight: 500;">No tasks to display</p>
          <p style="font-size: 0.8rem; opacity: 0.7;">Create tasks in a project to see the timeline here.</p>
        </div>
      `;
    }
    return;
  }

  // Calculate project bounds for x-axis
  const allStartTimes = tasks.map(task => new Date(task.created_at).getTime());
  const allEndTimes = tasks.map(task => task.due_date ? new Date(task.due_date).getTime() : new Date(task.created_at).getTime() + (24 * 60 * 60 * 1000));
  
  const minTime = Math.min(...allStartTimes);
  const maxTime = Math.max(...allEndTimes);
  const padding = Math.max(24 * 60 * 60 * 1000, (maxTime - minTime) * 0.05);

  // Create a proper horizontal Gantt chart with dates on X axis
  ganttChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: tasks.map(task => task.title),
      datasets: [{
        label: 'Task Timeline',
        data: tasks.map(task => {
          const start = new Date(task.created_at).getTime();
          const end = task.due_date ? new Date(task.due_date).getTime() : start + (24 * 60 * 60 * 1000); // Default 1 day
          return [start, end];
        }),
        backgroundColor: tasks.map(task => getStatusColor(task.status)),
        borderRadius: 6,
        borderSkipped: false,
        barPercentage: 0.6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          min: minTime - padding,
          max: maxTime + padding,
          grid: {
            color: 'rgba(0, 0, 0, 0.05)',
            borderDash: [5, 5]
          },
          ticks: {
            callback: function (value) {
              return new Date(value).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric' 
              });
            },
            font: {
              family: "'Inter', sans-serif",
              size: 11
            }
          },
          title: {
            display: true,
            text: 'Timeline',
            color: '#64748b',
            font: {
              family: "'Inter', sans-serif",
              size: 12,
              weight: '600'
            }
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            font: {
              family: "'Inter', sans-serif",
              size: 12,
              weight: '500'
            }
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          titleColor: '#1e293b',
          bodyColor: '#475569',
          borderColor: 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 6,
          usePointStyle: true,
          callbacks: {
            title: function(context) {
              return tasks[context[0].dataIndex].title;
            },
            label: function (context) {
              const task = tasks[context.dataIndex];
              const startStr = new Date(task.created_at).toLocaleDateString();
              const endStr = task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A';
              return [
                `Status: ${task.status?.toUpperCase() || 'N/A'}`,
                `Duration: ${startStr} - ${endStr}`
              ];
            }
          }
        }
      }
    }
  });

  // Set canvas height dynamically based on number of tasks
  const container = canvas.parentElement;
  if (container) {
    container.style.height = `${Math.max(400, tasks.length * 50 + 100)}px`;
  }
}

function getStatusColor(status) {
  const colors = {
    pending: '#ff9800',
    in_progress: '#2196f3',
    completed: '#4caf50',
    blocked: '#f44336'
  };
  return colors[status] || '#9e9e9e';
}

/**
 * Subscribe to real-time project updates
 */
function subscribeToRealtime() {
  channel = db.subscribeToProjects((payload) => {
    console.log('Real-time update:', payload);
    // Refresh dashboard data
    refreshMetrics();
  });
}

/**
 * Refresh dashboard metrics
 */
async function refreshMetrics() {
  try {
    const projects = await db.getProjects();
    State.setProjects(projects);

    // Update KPI elements
    const totalEl = document.getElementById('kpi-total');
    const accuracyEl = document.getElementById('kpi-accuracy');
    const allocEl = document.getElementById('kpi-total-allocation');
    if (totalEl) totalEl.textContent = State.metrics.totalEntries;
    if (accuracyEl) accuracyEl.textContent = State.metrics.accuracyRate + '%';
    if (allocEl) allocEl.textContent = getTotalAllocation();
  } catch (error) {
    console.error('Failed to refresh metrics:', error);
  }
}

/**
 * Setup export data button
 */
function setupExportButton() {
  const exportBtn = document.getElementById('export-data-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      try {
        const { exportProjectsToCSV } = await import('../utils/csvExport.js');
        exportProjectsToCSV(State.projects);
      } catch (error) {
        console.error('Export failed:', error);
      }
    });
  }
}

export default { getDashboardHTML, initDashboard };