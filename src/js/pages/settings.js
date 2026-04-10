/**
 * Settings Page - Dynamic Category/Source/Status Management
 */

import { supabase } from '../supabase.js';
import { showToast } from '../ui.js';

const STORAGE_KEYS = {
  categories: 'fallen_pro_categories',
  fundingSources: 'fallen_pro_funding_sources',
  statuses: 'fallen_pro_statuses',
  departments: 'fallen_pro_departments'
};

const DEFAULTS = {
  categories: ['Internal Infrastructure', 'Client-Facing Digital', 'Compliance & Security', 'R&D Innovation'],
  fundingSources: ['Operational', 'Venture Cap', 'Federal Grant', 'Equity Reserve'],
  statuses: ['draft', 'active', 'flagged', 'completed'],
  departments: ['IT', 'Finance', 'HR', 'Operations', 'Legal', 'Marketing', 'Engineering']
};

function loadData(key) {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS[key]);
    return stored ? JSON.parse(stored) : [...DEFAULTS[key]];
  } catch {
    return [...DEFAULTS[key]];
  }
}

function saveData(key, data) {
  localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(data));
}

function renderSection(title, items, key, placeholder) {
  const listItems = items.map((item, i) => `
    <div class="settings-item" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
      <input class="form-input settings-item-input" value="${item}" data-key="${key}" data-index="${i}" style="flex: 1;" placeholder="${placeholder}" />
      <button class="btn btn-tertiary settings-remove-btn" data-key="${key}" data-index="${i}" style="color: var(--error);">
        <span class="material-symbols-outlined" style="font-size: 1.25rem;">delete</span>
      </button>
    </div>
  `).join('');

  return `
    <div class="form-section">
      <div class="form-section-accent primary"></div>
      <div class="form-section-header">
        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">list</span>
        <h3 class="form-section-title">${title}</h3>
      </div>
      <div class="settings-list" id="settings-list-${key}">
        ${listItems}
      </div>
      <button class="btn btn-secondary" id="add-btn-${key}" style="margin-top: 1rem;">
        <span class="material-symbols-outlined" style="font-size: 1.25rem;">add</span>
        Add ${title.slice(0, -1)}
      </button>
    </div>
  `;
}

export function getSettingsHTML() {
  const categories = loadData('categories');
  const fundingSources = loadData('fundingSources');
  const statuses = loadData('statuses');

  return `
    <div class="page-header">
      <div class="page-header-left">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <button class="btn btn-tertiary" id="back-to-dashboard-btn">
            <span class="material-symbols-outlined">arrow_back</span>
            Back
          </button>
        </div>
        <div style="margin-top: 0.5rem;">
          <p class="page-breadcrumb">Preferences</p>
          <h2 class="page-title">Settings</h2>
          <p class="page-description">Manage dropdown options for categories, funding sources, and statuses.</p>
        </div>
      </div>
    </div>

    ${renderSection('Categories', categories, 'categories', 'Category name')}
    ${renderSection('Funding Sources', fundingSources, 'fundingSources', 'Source name')}
    ${renderSection('Departments', loadData('departments'), 'departments', 'Department name')}
    ${renderSection('Statuses', statuses, 'statuses', 'Status value')}

    <div style="margin-top: 2rem;">
      <button class="btn btn-secondary" id="reset-defaults-btn">Reset All to Defaults</button>
    </div>
  `;
}

function initSettingsList(key) {
  // Add button
  const addBtn = document.getElementById(`add-btn-${key}`);
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const data = loadData(key);
      data.push('');
      saveData(key, data);
      location.reload();
    });
  }

  // Input changes
  document.querySelectorAll(`.settings-item-input[data-key="${key}"]`).forEach(input => {
    input.addEventListener('change', (e) => {
      const data = loadData(key);
      const index = parseInt(e.target.dataset.index);
      data[index] = e.target.value;
      saveData(key, data);
    });
  });

  // Remove buttons
  document.querySelectorAll(`.settings-remove-btn[data-key="${key}"]`).forEach(btn => {
    btn.addEventListener('click', (e) => {
      const button = e.currentTarget;
      const index = parseInt(button.dataset.index);
      const data = loadData(key);
      if (data.length <= 1) {
        showToast('Must have at least one item', 'error');
        return;
      }
      data.splice(index, 1);
      saveData(key, data);
      location.reload();
    });
  });
}

export function initSettings() {
  // Back button
  const backBtn = document.getElementById('back-to-dashboard-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.hash = '#dashboard';
    });
  }

  initSettingsList('categories');
  initSettingsList('fundingSources');
  initSettingsList('departments');
  initSettingsList('statuses');

  const resetBtn = document.getElementById('reset-defaults-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (!confirm('Reset all settings to defaults?')) return;
      Object.keys(STORAGE_KEYS).forEach(key => {
        saveData(key, DEFAULTS[key]);
      });
      location.reload();
    });
  }
}

export default { getSettingsHTML, initSettings };