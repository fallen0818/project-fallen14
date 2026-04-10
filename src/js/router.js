/**
 * Hash-based Router
 * 
 * Handles client-side routing using the History API.
 * Logic to inject screen templates into the main #app container.
 */

import { State } from './state.js';
import { emit, Events } from './events.js';
import { updateActiveNav } from './ui.js';
import { isAuthenticated } from './auth.js';
import { getDashboardHTML } from './pages/dashboard.js';
import { getDataEntryHTML } from './pages/data-entry.js';
import { getReportsHTML } from './pages/reports.js';
import { getSettingsHTML } from './pages/settings.js';
import { getLoginHTML } from './pages/login.js';
import { getTasksHTML } from './pages/tasks.js';

// Route to page mapping
const routes = {
    'dashboard': { title: 'Dashboard', fn: getDashboardHTML, auth: false },
    'data-entry': { title: 'Data Entry', fn: getDataEntryHTML, auth: false },
    'tasks': { title: 'Tasks & Subtasks', fn: getTasksHTML, auth: false },
    'reports': { title: 'Reports', fn: getReportsHTML, auth: false },
    'settings': { title: 'Settings', fn: getSettingsHTML, auth: false },
    'login': { title: 'Login', fn: getLoginHTML, auth: false }
};

/**
 * Get the current route from the URL hash
 */
function getCurrentRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    return hash;
}

/**
 * Resolve a route and render it
 */
export async function resolve(route) {
    const routeConfig = routes[route] || routes['dashboard'];

    // Check authentication requirement
    if (routeConfig.auth && !isAuthenticated()) {
        window.location.hash = '#login';
        return;
    }

    // If logged in and trying to access login, redirect to dashboard
    if (route === 'login' && isAuthenticated()) {
        window.location.hash = '#dashboard';
        return;
    }

    const appContainer = document.getElementById('app');
    if (!appContainer) return;

    try {
        // Update state
        State.currentRoute = route;

        // Emit route change event
        emit(Events.ROUTE_CHANGED, route);

        // Update active navigation
        updateActiveNav(route);

        // Update page title
        document.title = `Fallen Pro - ${routeConfig.title}`;

        // Render page content
        appContainer.innerHTML = await routeConfig.fn();

        // Initialize page-specific functionality
        initializePage(route);
    } catch (error) {
        console.error('Route resolution error:', error);
        appContainer.innerHTML = '<p>Error loading page. Please try refreshing.</p>';
    }
}

/**
 * Initialize page-specific functionality after rendering
 */
async function initializePage(route) {
    switch (route) {
        case 'dashboard':
            const { initDashboard } = await import('./pages/dashboard.js');
            initDashboard();
            break;
        case 'data-entry':
            const { initDataEntry } = await import('./pages/data-entry.js');
            initDataEntry();
            break;
        case 'tasks':
            const { initTasks } = await import('./pages/tasks.js');
            initTasks();
            break;
        case 'reports':
            const { initReports } = await import('./pages/reports.js');
            initReports();
            break;
        case 'settings':
            const { initSettings } = await import('./pages/settings.js');
            initSettings();
            break;
        case 'login':
            const { initLogin } = await import('./pages/login.js');
            initLogin();
            break;
    }
}

/**
 * Handle hash change events
 */
function handleHashChange() {
    const route = getCurrentRoute();
    resolve(route);
}

/**
 * Initialize the router
 */
export function initRouter() {
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Handle initial route
    handleHashChange();
}

/**
 * Navigate to a route programmatically
 */
export function navigate(route) {
    window.location.hash = `#${route}`;
}

export default { initRouter, resolve, navigate, getCurrentRoute };