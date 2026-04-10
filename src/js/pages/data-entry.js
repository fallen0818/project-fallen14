/**
 * Data Entry Page (Dynamic with Edit/Add/Delete)
 */

import { db } from '../supabase.js';
import { showToast } from '../ui.js';

let currentProjects = [];
let editingProjectId = null;

export async function getDataEntryHTML() {
  try {
    currentProjects = await db.getProjects();
  } catch (error) {
    console.error('Failed to load projects:', error);
    currentProjects = [];
  }

  return `
    <div class="page-header">
      <div class="page-header-left">
        <p class="page-breadcrumb">Project Management</p>
        <h2 class="page-title">Projects</h2>
        <p class="page-description">Manage your enterprise projects - create, edit, and delete project records.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="new-project-btn">
          <span class="material-symbols-outlined">add</span>
          New Project
        </button>
      </div>
    </div>

    <section id="project-list-section">
      ${currentProjects.length > 0 ? renderProjectList() : renderEmptyState()}
    </section>

    <section id="project-form-section" style="display: none;">
      <div class="page-header" style="margin-bottom: 1rem;">
        <div class="page-header-left">
          <button class="btn btn-tertiary" id="back-to-list-btn">
            <span class="material-symbols-outlined">arrow_back</span>
            Back to List
          </button>
          <h3 id="form-title" style="font-family: var(--font-headline); font-size: 1.5rem; margin-top: 0.5rem;">New Project</h3>
        </div>
      </div>

      <form id="project-form" style="max-width: 72rem; margin: 0 auto;">
        <input type="hidden" id="project-id" />
        <section class="form-section">
          <div class="form-section-accent primary"></div>
          <div class="form-section-header">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">assignment</span>
            <h3 class="form-section-title">Project Core Identity</h3>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label" for="project-title">Project Official Title</label>
              <input class="form-input" id="project-title" type="text" placeholder="e.g. Infrastructure Modernization 2024" required />
            </div>
            <div class="form-group">
              <label class="form-label" for="project-category">Strategic Category</label>
              <select class="form-select" id="project-category" required>
                <option value="">Select category...</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="implementing-dept">Implementing Department</label>
              <select class="form-select" id="implementing-dept">
                <option value="">Select department...</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="project-summary">Executive Summary</label>
              <textarea class="form-input" id="project-summary" placeholder="Provide a high-level technical brief..." rows="3"></textarea>
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-accent secondary"></div>
          <div class="form-section-header">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">payments</span>
            <h3 class="form-section-title">Financial Framework</h3>
          </div>
          <div class="form-grid cols-3">
            <div class="form-group" style="text-align: center;">
              <label class="form-label" for="project-allocation">Initial Capital Allocation</label>
              <input class="form-input" id="project-allocation" type="number" placeholder="0.00" style="text-align: center;" />
            </div>
            <div class="form-group" style="text-align: center;">
              <label class="form-label" for="project-roi">Projected ROI (12m)</label>
              <div class="form-input-group">
                <input class="form-input" id="project-roi" type="number" placeholder="0" step="0.1" min="0" style="text-align: center;" />
                <span class="input-suffix">%</span>
              </div>
            </div>
            <div class="form-group" style="text-align: center;">
              <label class="form-label" for="project-date">Fiscal Commencement</label>
              <input class="form-input" id="project-date" type="date" style="text-align: center;" />
            </div>
          </div>
          <div class="checkbox-group">
            <span class="checkbox-group-title">Funding Source Authentication</span>
            <div class="checkbox-grid">
              <div class="checkbox-item">
                <input type="checkbox" id="funding-operational" value="Operational" />
                <label for="funding-operational">Operational</label>
              </div>
              <div class="checkbox-item">
                <input type="checkbox" id="funding-venture" value="Venture Cap" />
                <label for="funding-venture">Venture Cap</label>
              </div>
              <div class="checkbox-item">
                <input type="checkbox" id="funding-federal" value="Federal Grant" />
                <label for="funding-federal">Federal Grant</label>
              </div>
              <div class="checkbox-item">
                <input type="checkbox" id="funding-equity" value="Equity Reserve" />
                <label for="funding-equity">Equity Reserve</label>
              </div>
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-accent tertiary"></div>
          <div class="form-section-header">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">groups</span>
            <h3 class="form-section-title">Unit Distribution</h3>
          </div>
          <div class="form-grid">
            <div class="form-group" style="text-align: center;">
              <label class="form-label" for="unit-engineering">Engineering Heads</label>
              <input class="form-input" id="unit-engineering" type="number" value="0" min="0" style="text-align: center;" />
            </div>
            <div class="form-group" style="text-align: center;">
              <label class="form-label" for="unit-design">Design & UX Leads</label>
              <input class="form-input" id="unit-design" type="number" value="0" min="0" style="text-align: center;" />
            </div>
            <div class="form-group" style="text-align: center;">
              <label class="form-label" for="unit-qa">Quality Assurance</label>
              <input class="form-input" id="unit-qa" type="number" value="0" min="0" style="text-align: center;" />
            </div>
            <div class="form-group" style="text-align: center;">
              <label class="form-label" for="unit-data">Data Governance</label>
              <input class="form-input" id="unit-data" type="number" value="0" min="0" style="text-align: center;" />
            </div>
          </div>
        </section>

        <section class="form-section">
          <div class="form-section-accent" style="background-color: var(--outline);"></div>
          <div class="form-section-header">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">flag</span>
            <h3 class="form-section-title">Project Status</h3>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label" for="project-status">Status</label>
              <select class="form-select" id="project-status">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="flagged">Flagged</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </section>

        <div class="page-actions" style="justify-content: flex-end; gap: 1rem; padding-top: 2rem; border-top: 1px solid rgba(195, 198, 214, 0.2);">
          <button type="button" class="btn btn-secondary" id="cancel-form-btn">Cancel</button>
          <button type="submit" class="btn btn-primary" id="submit-btn">
            <span class="material-symbols-outlined">save</span>
            <span id="submit-btn-text">Save Project</span>
          </button>
        </div>
      </form>
    </section>
  `;
}

function renderProjectList() {
  const rows = currentProjects.map(p => `
    <tr>
      <td><strong>${p.title || 'Untitled'}</strong></td>
      <td>${p.category || 'N/A'}</td>
      <td>${p.implementing_department || '\u2014'}</td>
      <td>${p.initial_allocation ? Number(p.initial_allocation).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014'}</td>
      <td>${p.projected_roi ? Number(p.projected_roi).toFixed(2) + '%' : '\u2014'}</td>
      <td><span class="status-badge ${p.status || 'draft'}">${(p.status || 'draft').charAt(0).toUpperCase() + (p.status || 'draft').slice(1)}</span></td>
      <td>${p.created_at ? new Date(p.created_at).toLocaleDateString() : '\u2014'}</td>
      <td>
        <div style="display: flex; gap: 0.25rem;">
          <button class="btn btn-tertiary edit-btn" data-id="${p.id}" title="Edit">
            <span class="material-symbols-outlined" style="font-size: 1.25rem;">edit</span>
          </button>
          <button class="btn btn-tertiary delete-btn" data-id="${p.id}" title="Delete" style="color: var(--error);">
            <span class="material-symbols-outlined" style="font-size: 1.25rem;">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  return `
    <div class="data-table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Project</th>
            <th>Category</th>
            <th>Department</th>
            <th>Allocation</th>
            <th>ROI</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="card" style="text-align: center; padding: 4rem 2rem;">
      <span class="material-symbols-outlined" style="font-size: 4rem; color: var(--outline-variant); margin-bottom: 1rem;">inbox</span>
      <h3 style="font-family: var(--font-headline); font-size: 1.25rem; margin-bottom: 0.5rem;">No Projects Yet</h3>
      <p style="color: var(--on-surface-variant); margin-bottom: 1.5rem;">Get started by creating your first project.</p>
      <button class="btn btn-primary" id="new-project-btn-empty">
        <span class="material-symbols-outlined">add</span>
        Create Project
      </button>
    </div>
  `;
}

function populateDepartments() {
  const deptSelect = document.getElementById('implementing-dept');
  if (deptSelect) {
    const depts = (() => {
      try { return JSON.parse(localStorage.getItem('fallen_pro_departments')) || ['IT', 'Finance', 'HR', 'Operations', 'Legal', 'Marketing', 'Engineering']; } catch { return ['IT', 'Finance', 'HR', 'Operations', 'Legal', 'Marketing', 'Engineering']; }
    })();
    deptSelect.innerHTML = '<option value="">Select department...</option>' + depts.map(d => `<option value="${d}">${d}</option>`).join('');
  }
}

function loadDynamicOptions() {
  // Populate categories
  const categorySelect = document.getElementById('project-category');
  if (categorySelect) {
    const categories = (() => {
      try { return JSON.parse(localStorage.getItem('fallen_pro_categories')) || ['Internal Infrastructure', 'Client-Facing Digital', 'Compliance & Security', 'R&D Innovation']; } catch { return ['Internal Infrastructure', 'Client-Facing Digital', 'Compliance & Security', 'R&D Innovation']; }
    })();
    categorySelect.innerHTML = '<option value="">Select category...</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
  }

  // Populate funding sources
  const checkboxGrid = document.querySelector('.checkbox-grid');
  if (checkboxGrid) {
    const fundingSources = (() => {
      try { return JSON.parse(localStorage.getItem('fallen_pro_funding_sources')) || ['Operational', 'Venture Cap', 'Federal Grant', 'Equity Reserve']; } catch { return ['Operational', 'Venture Cap', 'Federal Grant', 'Equity Reserve']; }
    })();
    checkboxGrid.innerHTML = fundingSources.map(s => `
      <div class="checkbox-item">
        <input type="checkbox" id="funding-${s.replace(/\s+/g, '-').toLowerCase()}" value="${s}" />
        <label for="funding-${s.replace(/\s+/g, '-').toLowerCase()}">${s}</label>
      </div>
    `).join('');
  }

  // Populate statuses
  const statusSelect = document.getElementById('project-status');
  if (statusSelect) {
    const statuses = (() => {
      try { return JSON.parse(localStorage.getItem('fallen_pro_statuses')) || ['draft', 'active', 'flagged', 'completed']; } catch { return ['draft', 'active', 'flagged', 'completed']; }
    })();
    statusSelect.innerHTML = statuses.map(s => `<option value="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('');
  }
}

export function initDataEntry() {
  populateDepartments();
  loadDynamicOptions();

  const newBtn = document.getElementById('new-project-btn');
  if (newBtn) newBtn.addEventListener('click', () => showForm());

  const newBtnEmpty = document.getElementById('new-project-btn-empty');
  if (newBtnEmpty) newBtnEmpty.addEventListener('click', () => showForm());

  const backBtn = document.getElementById('back-to-list-btn');
  if (backBtn) backBtn.addEventListener('click', showList);

  const cancelBtn = document.getElementById('cancel-form-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { showList(); resetForm(); });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => editProject(btn.dataset.id));
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteProject(btn.dataset.id));
  });

  const form = document.getElementById('project-form');
  if (form) form.addEventListener('submit', handleFormSubmit);
}

function showForm(projectData) {
  const listSection = document.getElementById('project-list-section');
  const formSection = document.getElementById('project-form-section');
  const formTitle = document.getElementById('form-title');
  const submitBtnText = document.getElementById('submit-btn-text');

  if (listSection) listSection.style.display = 'none';
  if (formSection) formSection.style.display = 'block';

  if (projectData) {
    editingProjectId = projectData.id;
    formTitle.textContent = 'Edit Project';
    submitBtnText.textContent = 'Update Project';
    populateForm(projectData);
  } else {
    editingProjectId = null;
    formTitle.textContent = 'New Project';
    submitBtnText.textContent = 'Save Project';
    resetForm();
  }
}

function showList() {
  const listSection = document.getElementById('project-list-section');
  const formSection = document.getElementById('project-form-section');
  if (listSection) listSection.style.display = 'block';
  if (formSection) formSection.style.display = 'none';
}

function populateForm(project) {
  document.getElementById('project-id').value = project.id || '';
  document.getElementById('project-title').value = project.title || '';
  document.getElementById('project-category').value = project.category || '';
  document.getElementById('implementing-dept').value = project.implementing_department || '';
  document.getElementById('project-summary').value = project.summary || '';
  document.getElementById('project-allocation').value = project.initial_allocation || '';
  document.getElementById('project-roi').value = project.projected_roi || '';
  document.getElementById('project-date').value = project.fiscal_commencement || '';
  document.getElementById('project-status').value = project.status || 'draft';
  document.querySelectorAll('.checkbox-item input[type="checkbox"]').forEach(cb => {
    cb.checked = project.funding_sources?.includes(cb.value) || false;
  });
  const units = project.unit_distribution || {};
  document.getElementById('unit-engineering').value = units.engineering_heads || 0;
  document.getElementById('unit-design').value = units.design_ux_leads || 0;
  document.getElementById('unit-qa').value = units.qa_count || 0;
  document.getElementById('unit-data').value = units.data_gov_count || 0;
}

function resetForm() {
  const form = document.getElementById('project-form');
  if (form) form.reset();
  document.getElementById('project-id').value = '';
  document.getElementById('unit-engineering').value = '0';
  document.getElementById('unit-design').value = '0';
  document.getElementById('unit-qa').value = '0';
  document.getElementById('unit-data').value = '0';
}

async function editProject(id) {
  try {
    const project = await db.getProjectById(id);
    showForm(project);
    document.getElementById('project-form-section')?.scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    console.error('Failed to load project:', error);
    showToast('Failed to load project', 'error');
  }
}

async function deleteProject(id) {
  if (!confirm('Are you sure you want to delete this project? This cannot be undone.')) return;
  try {
    await db.deleteProject(id);
    showToast('Project deleted successfully', 'success');
    currentProjects = await db.getProjects();
    const listSection = document.getElementById('project-list-section');
    if (listSection) {
      listSection.innerHTML = currentProjects.length > 0 ? renderProjectList() : renderEmptyState();
      initDataEntry();
    }
  } catch (error) {
    console.error('Failed to delete project:', error);
    showToast('Failed to delete project', 'error');
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  const projectId = document.getElementById('project-id').value;
  const projectData = {
    title: document.getElementById('project-title').value,
    category: document.getElementById('project-category').value,
    implementing_department: document.getElementById('implementing-dept').value || null,
    summary: document.getElementById('project-summary').value,
    initial_allocation: document.getElementById('project-allocation').value || null,
    projected_roi: document.getElementById('project-roi').value || null,
    fiscal_commencement: document.getElementById('project-date').value || null,
    funding_sources: getSelectedFundingSources(),
    status: document.getElementById('project-status').value
  };
  const unitDistribution = {
    engineering_heads: parseInt(document.getElementById('unit-engineering').value) || 0,
    design_ux_leads: parseInt(document.getElementById('unit-design').value) || 0,
    qa_count: parseInt(document.getElementById('unit-qa').value) || 0,
    data_gov_count: parseInt(document.getElementById('unit-data').value) || 0
  };

  try {
    if (projectId) {
      await db.updateProject(projectId, projectData);
      showToast('Project updated successfully!', 'success');
    } else {
      await db.createProject(projectData, unitDistribution);
      showToast('Project created successfully!', 'success');
    }
    currentProjects = await db.getProjects();
    showList();
    const listSection = document.getElementById('project-list-section');
    if (listSection) {
      listSection.innerHTML = currentProjects.length > 0 ? renderProjectList() : renderEmptyState();
      initDataEntry();
    }
    resetForm();
  } catch (error) {
    console.error('Failed to save project:', error);
    showToast('Failed to save project', 'error');
  }
}

function getSelectedFundingSources() {
  const sources = [];
  document.querySelectorAll('.checkbox-item input[type="checkbox"]:checked').forEach(cb => {
    sources.push(cb.value);
  });
  return sources;
}

export default { getDataEntryHTML, initDataEntry };