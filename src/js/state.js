/**
 * Global State Management
 * 
 * A simple global State object to hold user session, 
 * current projects list, and dashboard metrics.
 */

export const State = {
    // User session
    user: null,
    session: null,

    // Data
    projects: [],
    tasks: [],
    currentProject: null,

    // Dashboard metrics
    metrics: {
        totalEntries: 0,
        accuracyRate: 0,
        systemHealth: 'Active',
        latency: 0
    },

    // UI state
    currentRoute: 'dashboard',
    isLoading: false,

    // Methods
    setUser(userData) {
        this.user = userData;
        this.updateUserProfile();
    },

    setSession(sessionData) {
        this.session = sessionData;
    },

    setProjects(projectsData) {
        this.projects = projectsData;
        this.updateMetrics();
    },

    setTasks(tasksData) {
        this.tasks = tasksData;
    },

    updateMetrics() {
        this.metrics.totalEntries = this.projects.length;
        // Calculate accuracy and other metrics
        const flaggedCount = this.projects.filter(p => p.status === 'flagged').length;
        this.metrics.accuracyRate = this.projects.length > 0
            ? ((this.projects.length - flaggedCount) / this.projects.length * 100).toFixed(1)
            : 0;
    },

    updateUserProfile() {
        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        const userAvatarEl = document.getElementById('user-avatar');

        if (userNameEl && this.user) {
            userNameEl.textContent = this.user.email?.split('@')[0] || 'User';
        }

        if (userRoleEl && this.user) {
            userRoleEl.textContent = 'Admin';
            // Show the user info on mobile
            userRoleEl.parentElement.classList.remove('hidden');
        }
    },

    reset() {
        this.user = null;
        this.session = null;
        this.projects = [];
        this.tasks = [];
        this.currentProject = null;
        this.metrics = {
            totalEntries: 0,
            accuracyRate: 0,
            systemHealth: 'Active',
            latency: 0
        };
    }
};

export default State;