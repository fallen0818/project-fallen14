/**
 * Login Page
 * 
 * Authentication screen for unauthenticated users.
 */

import { signIn, signUp } from '../auth.js';

export function getLoginHTML() {
  return `
    <div style="min-height: 70vh; display: flex; align-items: center; justify-content: center;">
      <div class="card" style="max-width: 420px; width: 100%; padding: 3rem;">
        <div style="text-align: center; margin-bottom: 2rem;">
          <div class="logo-icon primary-gradient" style="margin: 0 auto 1rem; width: 4rem; height: 4rem;">
            <span class="material-symbols-outlined filled" style="font-size: 2rem;">analytics</span>
          </div>
          <h2 class="font-headline text-2xl" style="margin-bottom: 0.5rem;">Welcome Back</h2>
          <p style="color: var(--on-surface-variant); font-size: 0.875rem;">Sign in to access Fallen Pro</p>
        </div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label" for="login-email">Email</label>
            <input class="form-input" id="login-email" type="email" placeholder="you@company.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input class="form-input" id="login-password" type="password" placeholder="Your password" required minlength="8" />
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;">
            Sign In
          </button>
        </form>

        <div style="text-align: center; margin-top: 1.5rem; font-size: 0.875rem; color: var(--on-surface-variant);">
          Don't have an account? <a href="#" id="show-signup" style="color: var(--primary); text-decoration: none; font-weight: 600;">Create one</a>
        </div>

        <!-- Sign Up Form (Hidden by default) -->
        <form id="signup-form" style="display: none; margin-top: 1.5rem;">
          <h3 style="text-align: center; margin-bottom: 1rem;" class="font-headline">Create Account</h3>
          <div class="form-group">
            <label class="form-label" for="signup-email">Email</label>
            <input class="form-input" id="signup-email" type="email" placeholder="you@company.com" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="signup-password">Password</label>
            <input class="form-input" id="signup-password" type="password" placeholder="At least 8 characters" required minlength="8" />
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 0.5rem;">
            Create Account
          </button>
          <div style="text-align: center; margin-top: 1rem; font-size: 0.875rem; color: var(--on-surface-variant);">
            Already have an account? <a href="#" id="show-login" style="color: var(--primary); text-decoration: none; font-weight: 600;">Sign in</a>
          </div>
        </form>
      </div>
    </div>
  `;
}

/**
 * Initialize login page functionality
 */
export function initLogin() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const showSignupLink = document.getElementById('show-signup');
  const showLoginLink = document.getElementById('show-login');

  if (showSignupLink) {
    showSignupLink.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.style.display = 'none';
      signupForm.style.display = 'block';
    });
  }

  if (showLoginLink) {
    showLoginLink.addEventListener('click', (e) => {
      e.preventDefault();
      signupForm.style.display = 'none';
      loginForm.style.display = 'block';
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;

      try {
        await signIn(email, password);
        window.location.hash = '#dashboard';
      } catch (error) {
        console.error('Login failed:', error);
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('signup-email').value;
      const password = document.getElementById('signup-password').value;

      try {
        await signUp(email, password);
        signupForm.innerHTML = '<p style="text-align: center; color: var(--secondary);">Account created! Please check your email to verify before signing in.</p>';
      } catch (error) {
        console.error('Signup failed:', error);
      }
    });
  }
}

export default { getLoginHTML, initLogin };