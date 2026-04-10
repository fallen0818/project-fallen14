/**
 * Reports Page - Advanced Analytics and Filtering
 */

import { db } from '../supabase.js';
import { State } from '../state.js';
import Chart from 'chart.js/auto';

let allProjects = [];
let filteredProjects = [];
let charts = {};

export async function getReportsHTML() {
  try {
    allProjects = await db.getProjects();
    filteredProjects = [...allProjects];
  } catch (error) {
    console.error('Failed to load reports:', error);
    allProjects = [];
    filteredProjects = [];
  }

  const categories = (() => {
    try { return JSON.parse(localStorage.getItem('fallen_pro_categories')) || ['Internal Infrastructure', 'Client-Facing Digital', 'Compliance & Security', 'R&D Innovation']; } catch { return ['Internal Infrastructure', 'Client-Facing Digital', 'Compliance & Security', 'R&D Innovation']; }
  })();

  const statuses = (() => {
    try { return JSON.parse(localStorage.getItem('fallen_pro_statuses')) || ['draft', 'active', 'flagged', 'completed']; } catch { return ['draft', 'active', 'flagged', 'completed']; }
  })();

  return `
    <div class="page-header">
      <div class="page-header-left">
        <p class="page-breadcrumb">Analytics</p>
        <h2 class="page-title">Reports Center</h2>
        <p class="page-description">Generate and analyze project reports with filtering capabilities.</p>
      </div>
    </div>

    <!-- Filters Section -->
    <div class="card" style="margin-bottom: 2rem; padding: 1.5rem;">
      <h3 style="font-family: var(--font-headline); font-size: 1.125rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;">
        <span class="material-symbols-outlined" style="font-size: 1.25rem;">filter_list</span>
        Filters
      </h3>
      <div class="form-grid cols-3" style="gap: 1rem;">
        <div>
          <label class="form-label" for="filter-status">Status</label>
          <select class="form-select" id="filter-status">
            <option value="">All Statuses</option>
            ${statuses.map(s => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label" for="filter-category">Category</label>
          <select class="form-select" id="filter-category">
            <option value="">All Categories</option>
            ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
          </select>
        </div>
        <div style="display: flex; align-items: flex-end;">
          <button class="btn btn-primary" id="apply-filters-btn">
            <span class="material-symbols-outlined">filter_alt</span>
            Apply Filters
          </button>
          <button class="btn btn-secondary" id="clear-filters-btn" style="margin-left: 0.5rem;">
            Clear
          </button>
        </div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr); margin-bottom: 2rem;">
      <div class="kpi-card" style="min-height: 8rem;">
        <div>
          <p class="kpi-label">Total Projects</p>
          <p class="kpi-value" id="report-total">${filteredProjects.length}</p>
        </div>
      </div>
      <div class="kpi-card" style="min-height: 8rem;">
        <div>
          <p class="kpi-label">Active Projects</p>
          <p class="kpi-value" id="report-active">${filteredProjects.filter(p => p.status === 'active').length}</p>
        </div>
      </div>
      <div class="kpi-card" style="min-height: 8rem;">
        <div>
          <p class="kpi-label">Total Allocation</p>
          <p class="kpi-value" style="font-size: 1.25rem;" id="report-allocation">${getTotalAllocation(filteredProjects)}</p>
        </div>
      </div>
      <div class="kpi-card" style="min-height: 8rem;">
        <div>
          <p class="kpi-label">Avg ROI</p>
          <p class="kpi-value" id="report-avg-roi">${getAvgROI(filteredProjects)}%</p>
        </div>
      </div>
    </div>

    <!-- Charts -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
      <div class="card" style="padding: 1.5rem;">
        <h3 style="font-family: var(--font-headline); margin-bottom: 1rem;">Projects by Status</h3>
        <canvas id="chart-status" style="max-height: 250px;"></canvas>
      </div>
      <div class="card" style="padding: 1.5rem;">
        <h3 style="font-family: var(--font-headline); margin-bottom: 1rem;">Projects by Category</h3>
        <canvas id="chart-category" style="max-height: 250px;"></canvas>
      </div>
    </div>

    <!-- Project Table -->
    <div class="data-table-container" id="report-table-section">
      ${renderReportTable()}
    </div>
  `;
}

function getTotalAllocation(projects) {
  const total = projects.reduce((sum, p) => sum + (Number(p.initial_allocation) || 0), 0);
  return total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getAvgROI(projects) {
  const roiProjects = projects.filter(p => p.projected_roi);
  if (roiProjects.length === 0) return '0.00';
  const avg = roiProjects.reduce((sum, p) => sum + Number(p.projected_roi), 0) / roiProjects.length;
  return avg.toFixed(2);
}

function renderReportTable() {
  if (filteredProjects.length === 0) {
    return `<p style="text-align: center; color: var(--on-surface-variant); padding: 2rem;">No projects match your filters.</p>`;
  }

  const rows = filteredProjects.map(p => `
    <tr>
      <td><strong>${p.title || 'Untitled'}</strong></td>
      <td>${p.category || 'N/A'}</td>
      <td>${p.initial_allocation ? Number(p.initial_allocation).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}</td>
      <td>${p.projected_roi ? Number(p.projected_roi).toFixed(2) + '%' : '\u2014'}</td>
      <td><span class="status-badge ${p.status || 'draft'}">${(p.status || 'draft').charAt(0).toUpperCase() + (p.status || 'draft').slice(1)}</span></td>
      <td>${p.fiscal_commencement ? new Date(p.fiscal_commencement).toLocaleDateString() : '\u2014'}</td>
    </tr>
  `).join('');

  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Project</th>
          <th>Category</th>
          <th>Allocation</th>
          <th>ROI</th>
          <th>Status</th>
          <th>Start Date</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function applyFilters() {
  const statusFilter = document.getElementById('filter-status')?.value;
  const categoryFilter = document.getElementById('filter-category')?.value;

  filteredProjects = allProjects.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false;
    if (categoryFilter && p.category !== categoryFilter) return false;
    return true;
  });

  updateSummaryCards();
  updateTable();
  updateCharts();
}

function clearFilters() {
  const statusFilter = document.getElementById('filter-status');
  const categoryFilter = document.getElementById('filter-category');
  if (statusFilter) statusFilter.value = '';
  if (categoryFilter) categoryFilter.value = '';
  filteredProjects = [...allProjects];
  updateSummaryCards();
  updateTable();
  updateCharts();
}

function updateSummaryCards() {
  const totalEl = document.getElementById('report-total');
  const activeEl = document.getElementById('report-active');
  const allocEl = document.getElementById('report-allocation');
  const roiEl = document.getElementById('report-avg-roi');

  if (totalEl) totalEl.textContent = filteredProjects.length;
  if (activeEl) activeEl.textContent = filteredProjects.filter(p => p.status === 'active').length;
  if (allocEl) allocEl.textContent = getTotalAllocation(filteredProjects);
  if (roiEl) roiEl.textContent = getAvgROI(filteredProjects) + '%';
}

function updateTable() {
  const tableSection = document.getElementById('report-table-section');
  if (tableSection) {
    tableSection.innerHTML = renderReportTable();
  }
}

function initCharts() {
  // Chart.js is imported as ES module at the top of this file
  createCharts();
}

function createCharts() {
  createStatusChart();
  createCategoryChart();
}

function getStatusCounts() {
  const counts = {};
  filteredProjects.forEach(p => {
    const status = p.status || 'draft';
    counts[status] = (counts[status] || 0) + 1;
  });
  return counts;
}

function getCategoryCounts() {
  const counts = {};
  filteredProjects.forEach(p => {
    const cat = p.category || 'Uncategorized';
    counts[cat] = (counts[cat] || 0) + 1;
  });
  return counts;
}

function createStatusChart() {
  const canvas = document.getElementById('chart-status');
  if (!canvas) return;
  if (charts.status) charts.status.destroy();

  const data = getStatusCounts();
  const labels = Object.keys(data);
  const values = Object.values(data);

  charts.status = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
      datasets: [{
        data: values,
        backgroundColor: ['#003d9b', '#00687a', '#ba1a1a', '#432f9c', '#c3c6d6']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom' }
      }
    }
  });
}

function createCategoryChart() {
  const canvas = document.getElementById('chart-category');
  if (!canvas) return;
  if (charts.category) charts.category.destroy();

  const data = getCategoryCounts();
  const labels = Object.keys(data);
  const values = Object.values(data);

  charts.category = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Projects',
        data: values,
        backgroundColor: '#003d9b',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { stepSize: 1 } },
        x: { grid: { display: false } }
      }
    }
  });
}

function updateCharts() {
  createStatusChart();
  createCategoryChart();
}

export function initReports() {
  const applyBtn = document.getElementById('apply-filters-btn');
  if (applyBtn) applyBtn.addEventListener('click', applyFilters);

  const clearBtn = document.getElementById('clear-filters-btn');
  if (clearBtn) clearBtn.addEventListener('click', clearFilters);

  initCharts();
}

export default { getReportsHTML, initReports };