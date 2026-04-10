/**
 * Main Application Entry Point
 * 
 * Bootstraps the Fallen Pro application by initializing
 * all core modules and setting up event listeners.
 */

import { initRouter } from './router.js';
import { initAuth, onAuthStateChange } from './auth.js';
import { State } from './state.js';
import { emit, Events } from './events.js';
import { showToast, showLoading, hideLoading } from './ui.js';
import { supabase, db } from './supabase.js';

/**
 * Initialize the application
 */
async function init() {
    showLoading();

    try {
        // Check Supabase configuration
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder')) {
            console.warn('Supabase credentials not configured. Running in demo mode.');
            showToast('Supabase not configured. See .env.example for setup.', 'info');
            // Continue without backend
        }

        // Initialize authentication
        await initAuth();

        // Set up auth state change listener
        onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN') {
                showToast('Welcome to Fallen Pro!', 'success');
            } else if (event === 'SIGNED_OUT') {
                showToast('Signed out successfully', 'info');
            }
        });

        // Set up global event listeners
        setupEventListeners();

        // Initialize the router
        initRouter();

        hideLoading();

        // Emit app initialized event
        emit(Events.AUTH_INITIALIZED, State.user);

        console.log('Fallen Pro initialized successfully');
    } catch (error) {
        console.error('Failed to initialize application:', error);
        hideLoading();
        showToast('Application failed to initialize. Check console for details.', 'error');
    }
}

/**
 * Set up global event listeners
 */
function setupEventListeners() {
    // Handle sidebar navigation clicks
    const sidebarNav = document.getElementById('sidebar-nav');
    if (sidebarNav) {
        sidebarNav.addEventListener('click', (e) => {
            const navItem = e.target.closest('.nav-item');
            if (navItem) {
                e.preventDefault();
                const route = navItem.getAttribute('data-route');
                if (route) {
                    window.location.hash = `#${route}`;
                }
            }
        });
    }

    // Handle user profile click for sign out
    const userProfile = document.getElementById('user-profile');
    if (userProfile) {
        userProfile.addEventListener('click', async () => {
            if (State.user) {
                // Show sign out option
                if (confirm('Do you want to sign out?')) {
                    const { signOut } = await import('./auth.js');
                    await signOut();
                }
            } else {
                // Show login modal
                window.location.hash = '#login';
            }
        });
    }

    // Handle notification button
    const notificationBtn = document.getElementById('notification-btn');
    if (notificationBtn) {
        notificationBtn.addEventListener('click', () => {
            showToast('No new notifications', 'info');
        });
    }

    // Handle auth modal close button
    const authModalClose = document.getElementById('auth-modal-close');
    const authModal = document.getElementById('auth-modal');

    if (authModalClose) {
        authModalClose.addEventListener('click', async () => {
            const { closeAuthModal } = await import('./ui.js');
            closeAuthModal();
        });
    }

    if (authModal) {
        authModal.addEventListener('click', async (e) => {
            if (e.target === authModal) {
                const { closeAuthModal } = await import('./ui.js');
                closeAuthModal();
            }
        });
    }
}

/**
 * Handle unhandled promise rejections
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});

/**
 * Handle global errors
 */
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
});

// Start the application when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export default { init };