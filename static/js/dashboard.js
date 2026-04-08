// Dashboard page JavaScript functionality
let dashboardData = {};

// Initialize page on DOM load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Dashboard page loaded');
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        console.log('Initializing dashboard...');
        
        // Show loading state
        showLoading(true);
        
        // Load dashboard data
        await loadKPIs();
        await loadRecentProjects();
        await loadUpcomingTasks();
        
        // Hide loading state
        showLoading(false);
        
        console.log('Dashboard initialization complete');
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        showError('Failed to initialize dashboard: ' + error.message);
        showLoading(false);
    }
}

// Load KPI data
async function loadKPIs() {
    try {
        console.log('Loading KPIs...');
        const response = await fetch('/api/kpis');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        dashboardData.kpis = data;
        
        updateKPICards(data);
        console.log('KPIs loaded successfully');
        
    } catch (error) {
        console.error('Error loading KPIs:', error);
        showError('Failed to load dashboard data');
    }
}

// Load recent projects
async function loadRecentProjects() {
    try {
        console.log('Loading recent projects...');
        const response = await fetch('/api/projects?limit=5');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        dashboardData.recentProjects = data;
        
        updateRecentProjectsList(data);
        console.log('Recent projects loaded successfully');
        
    } catch (error) {
        console.error('Error loading recent projects:', error);
    }
}

// Load upcoming tasks  
async function loadUpcomingTasks() {
    try {
        console.log('Loading upcoming tasks...');
        // This would need a specific endpoint for upcoming tasks
        // For now, just log that it would be implemented
        console.log('Upcoming tasks endpoint would be implemented here');
        
    } catch (error) {
        console.error('Error loading upcoming tasks:', error);
    }
}

// Update KPI cards
function updateKPICards(data) {
    // Update total projects
    const totalProjectsElement = document.querySelector('[data-kpi="total-projects"]');
    if (totalProjectsElement) {
        totalProjectsElement.textContent = data.total_projects || 0;
    }
    
    // Update active projects
    const activeProjectsElement = document.querySelector('[data-kpi="active-projects"]');
    if (activeProjectsElement) {
        activeProjectsElement.textContent = data.active_projects || 0;
    }
    
    // Update completed projects
    const completedProjectsElement = document.querySelector('[data-kpi="completed-projects"]');
    if (completedProjectsElement) {
        completedProjectsElement.textContent = data.completed_projects || 0;
    }
    
    // Update total budget
    const totalBudgetElement = document.querySelector('[data-kpi="total-budget"]');
    if (totalBudgetElement) {
        totalBudgetElement.textContent = `€${(data.total_budget || 0).toLocaleString()}`;
    }
}

// Update recent projects list
function updateRecentProjectsList(projects) {
    const container = document.querySelector('#recent-projects-list');
    if (!container) return;
    
    if (projects.length === 0) {
        container.innerHTML = '<p class="text-muted">No recent projects</p>';
        return;
    }
    
    container.innerHTML = projects.map(project => `
        <div class="d-flex justify-content-between align-items-center py-2 border-bottom">
            <div>
                <div class="fw-bold">${escapeHtml(project.name)}</div>
                <div class="text-muted small">${escapeHtml(project.client || '')}</div>
            </div>
            <div class="text-end">
                <span class="badge bg-${getStatusColor(project.status)}">${project.status}</span>
                <div class="text-muted small">${Math.round(project.completion_percentage || 0)}%</div>
            </div>
        </div>
    `).join('');
}

// Helper functions
function getStatusColor(status) {
    const colors = {
        'Active': 'success',
        'Completed': 'primary',
        'On Hold': 'warning', 
        'Cancelled': 'danger'
    };
    return colors[status] || 'secondary';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility functions
function showLoading(show) {
    const spinner = document.querySelector('.loading-spinner');
    if (spinner) {
        spinner.style.display = show ? 'block' : 'none';
    }
}

function showError(message) {
    console.error('Error:', message);
    // Could implement toast notifications here if needed
}

function showSuccess(message) {
    console.log('Success:', message);
    // Could implement toast notifications here if needed
}
