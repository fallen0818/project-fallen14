/**
 * Application Configuration
 * 
 * Environment variables are loaded by Vite from .env
 * Make sure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 */

export const config = {
    supabase: {
        url: import.meta.env.VITE_SUPABASE_URL || '',
        anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || ''
    },
    app: {
        name: 'Fallen Pro',
        version: '1.0.0'
    }
};

export default config;