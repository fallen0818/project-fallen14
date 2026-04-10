/**
 * Custom Event System
 * 
 * Uses CustomEvents for component communication
 * to trigger re-renders and updates across the app.
 */

// Event bus - a simple event emitter using DOM events
const eventBus = document.createElement('div');

// Event names
export const Events = {
    // Auth events
    AUTH_INITIALIZED: 'auth:initialized',
    AUTH_SIGNED_IN: 'auth:signed-in',
    AUTH_SIGNED_OUT: 'auth:signed-out',

    // Data events
    DATA_LOADED: 'data:loaded',
    DATA_UPDATED: 'data:updated',
    DATA_INSERTED: 'data:inserted',
    DATA_DELETED: 'data:deleted',

    // UI events
    ROUTE_CHANGED: 'route:changed',
    LOADING_STARTED: 'ui:loading-started',
    LOADING_FINISHED: 'ui:loading-finished',
    TOAST_SHOW: 'ui:toast-show',

    // Real-time events
    REALTIME_SUBSCRIBED: 'realtime:subscribed',
    REALTIME_UPDATE: 'realtime:update'
};

/**
 * Emit a custom event with optional detail
 */
export function emit(eventName, detail = null) {
    const event = new CustomEvent(eventName, { detail });
    eventBus.dispatchEvent(event);
}

/**
 * Listen to a custom event
 */
export function on(eventName, callback) {
    eventBus.addEventListener(eventName, (e) => callback(e.detail));
    return () => eventBus.removeEventListener(eventName, callback);
}

/**
 * Listen to a custom event once
 */
export function once(eventName, callback) {
    eventBus.addEventListener(eventName, (e) => callback(e.detail), { once: true });
}

/**
 * Remove a specific event listener
 */
export function off(eventName, callback) {
    eventBus.removeEventListener(eventName, callback);
}

export default { Events, emit, on, once, off };