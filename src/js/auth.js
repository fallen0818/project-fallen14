/**
 * Authentication Module
 * 
 * Handles user sign-in, sign-up, sign-out, and session management.
 */

import { supabase } from './supabase.js';
import { State } from './state.js';
import { emit, Events } from './events.js';
import { showToast, hideLoading, showLoading } from './ui.js';

// Initialize auth state
export async function initAuth() {
    showLoading();

    try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
            State.setSession(session);
            State.setUser(session.user);
            emit(Events.AUTH_INITIALIZED, session.user);
        } else {
            State.reset();
        }

        emit(Events.AUTH_INITIALIZED, session?.user || null);
    } catch (error) {
        console.error('Auth initialization error:', error);
    } finally {
        hideLoading();
    }
}

// Sign in with email and password
export async function signIn(email, password) {
    showLoading();

    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        State.setSession(data.session);
        State.setUser(data.user);

        showToast('Welcome back!', 'success');
        emit(Events.AUTH_SIGNED_IN, data.user);

        return data;
    } catch (error) {
        showToast(error.message || 'Sign in failed', 'error');
        throw error;
    } finally {
        hideLoading();
    }
}

// Sign up with email and password
export async function signUp(email, password) {
    showLoading();

    try {
        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) throw error;

        if (data.user) {
            showToast('Account created! Please check your email to verify.', 'success');
            return data;
        }

        throw new Error('Sign up failed. Please try again.');
    } catch (error) {
        showToast(error.message || 'Sign up failed', 'error');
        throw error;
    } finally {
        hideLoading();
    }
}

// Sign out
export async function signOut() {
    showLoading();

    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        State.reset();
        showToast('Signed out successfully', 'info');
        emit(Events.AUTH_SIGNED_OUT);

        // Redirect to login
        window.location.hash = '#login';
    } catch (error) {
        showToast(error.message || 'Sign out failed', 'error');
    } finally {
        hideLoading();
    }
}

// Listen for auth state changes
export function onAuthStateChange(callback) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            State.setSession(session);
            State.setUser(session.user);
            emit(Events.AUTH_SIGNED_IN, session.user);
        } else if (event === 'SIGNED_OUT') {
            State.reset();
            emit(Events.AUTH_SIGNED_OUT);
        }

        if (callback) callback(event, session);
    });

    return subscription;
}

// Get current user
export function getCurrentUser() {
    return State.user;
}

// Check if user is logged in
export function isAuthenticated() {
    return State.session !== null && State.user !== null;
}

export default {
    initAuth,
    signIn,
    signUp,
    signOut,
    onAuthStateChange,
    getCurrentUser,
    isAuthenticated
};