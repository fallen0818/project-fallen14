/**
 * UI Utilities
 * 
 * Toast notifications, loading states, and common UI helpers.
 */

// Show toast notification
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
        success: 'check_circle',
        error: 'error',
        info: 'info'
    };

    toast.innerHTML = `
    <span class="material-symbols-outlined">${iconMap[type] || 'info'}</span>
    <span class="toast-message">${message}</span>
  `;

    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 4000);
}

// Show loading screen
export function showLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.remove('hidden');
    }
}

// Hide loading screen
export function hideLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.classList.add('hidden');
    }
}

// Toggle auth modal
export function toggleAuthModal(action = 'signin') {
    const modal = document.getElementById('auth-modal');
    const title = document.getElementById('auth-modal-title');
    const body = document.getElementById('auth-modal-body');

    if (!modal || !title || !body) return;

    if (modal.classList.contains('hidden')) {
        modal.classList.remove('hidden');
        title.textContent = action === 'signin' ? 'Sign In' : 'Create Account';
        body.innerHTML = getAuthFormHTML(action);
        attachAuthFormListeners(action);
    } else {
        modal.classList.add('hidden');
    }
}

// Close auth modal
export function closeAuthModal() {
    const modal = document.getElementById('auth-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// Get auth form HTML
function getAuthFormHTML(action) {
    if (action === 'signin') {
        return `
      <form id="auth-form" class="auth-form">
        <div class="form-group">
          <label class="form-label" for="login-email">Email</label>
          <input class="form-input" id="login-email" type="email" placeholder="you@company.com" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Password</label>
          <input class="form-input" id="login-password" type="password" placeholder="Your password" required />
        </div>
        <button class="btn btn-primary w-full" type="submit">Sign In</button>
        <div class="auth-footer">
          Don't have an account? <a href="#" id="switch-to-signup">Create one</a>
        </div>
      </form>
    `;
    }

    return `
    <form id="auth-form" class="auth-form">
      <div class="form-group">
        <label class="form-label" for="signup-email">Email</label>
        <input class="form-input" id="signup-email" type="email" placeholder="you@company.com" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="signup-password">Password</label>
        <input class="form-input" id="signup-password" type="password" placeholder="At least 8 characters" minlength="8" required />
      </div>
      <button class="btn btn-primary w-full" type="submit">Create Account</button>
      <div class="auth-footer">
        Already have an account? <a href="#" id="switch-to-signin">Sign in</a>
      </div>
    </form>
  `;
}

// Attach auth form event listeners
function attachAuthFormListeners(action) {
    const form = document.getElementById('auth-form');
    const closeBtn = document.getElementById('auth-modal-close');
    const switchLink = document.getElementById(action === 'signin' ? 'switch-to-signup' : 'switch-to-signin');

    if (closeBtn) {
        closeBtn.addEventListener('click', closeAuthModal);
    }

    if (switchLink) {
        switchLink.addEventListener('click', (e) => {
            e.preventDefault();
            toggleAuthModal(action === 'signin' ? 'signup' : 'signin');
        });
    }

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            try {
                const { signIn, signUp } = await import('./auth.js');

                if (action === 'signin') {
                    const email = document.getElementById('login-email').value;
                    const password = document.getElementById('login-password').value;
                    await signIn(email, password);
                    closeAuthModal();
                } else {
                    const email = document.getElementById('signup-email').value;
                    const password = document.getElementById('signup-password').value;
                    await signUp(email, password);
                    closeAuthModal();
                }
            } catch (err) {
                console.error('Auth error:', err);
            }
        });
    }
}

// Update sidebar active state
export function updateActiveNav(route) {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        const itemRoute = item.getAttribute('data-route');
        if (itemRoute === route) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

export default {
    showToast,
    showLoading,
    hideLoading,
    toggleAuthModal,
    closeAuthModal,
    updateActiveNav
};