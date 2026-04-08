// Projects page JavaScript functionality
let allProjects = [];
let allTasks = [];
let allTeamMembers = [];
let currentEditingProject = null;
let currentEditingTask = null;

// Initialize page on DOM load
document.addEventListener('DOMContentLoaded', function() {
    console.log('Projects page loaded');
    initializeProjectsPage();
});

async function initializeProjectsPage() {
    try {
        console.log('Initializing projects page...');
        
        // Show loading state
        showLoading(true);
        
        // Load initial data
        await loadProjects();
        await loadTeamMembers();
        
        // Setup event listeners
        setupEventListeners();
        
        // Hide loading state
        showLoading(false);
        
        console.log('Projects page initialization complete');
    } catch (error) {
        console.error('Error initializing projects page:', error);
        showError('Failed to initialize projects page: ' + error.message);
        showLoading(false);
    }
}

function setupEventListeners() {
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            filterProjects(this.dataset.filter);
        });
    });

    // Search input
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterProjects();
        });
    }

    // Project form submit
    const projectForm = document.getElementById('projectForm');
    if (projectForm) {
        projectForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            await saveProject();
        });
    }
}

async function saveProject() {
    const payload = {
        name:            document.getElementById('projectName').value.trim(),
        client:          document.getElementById('projectClient').value.trim(),
        project_manager: document.getElementById('projectManager').value.trim(),
        budget:          document.getElementById('projectBudget').value || 0,
        status:          document.getElementById('projectStatus').value,
        priority:        document.getElementById('projectPriority').value,
        start_date:      document.getElementById('projectStartDate').value,
        end_date:        document.getElementById('projectEndDate').value || null,
        description:     document.getElementById('projectDescription').value.trim(),
    };

    const isEdit = currentEditingProject !== null;
    const url    = isEdit ? `/api/projects/${currentEditingProject.id}` : '/api/projects';
    const method = isEdit ? 'PUT' : 'POST';

    try {
        const resp = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await resp.json();
        if (!resp.ok) {
            showError(result.message || `Save failed (${resp.status})`);
            return;
        }
        // Close modal
        const modalEl = document.getElementById('projectModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        showSuccess(isEdit ? 'Project updated.' : 'Project created.');
        await loadProjects();
    } catch (err) {
        showError(`Save failed: ${err.message}`);
    }
}

// Load all projects
async function loadProjects() {
    try {
        console.log('Loading projects...');
        const response = await fetch('/api/projects');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        allProjects = data || [];
        
        console.log(`Loaded ${allProjects.length} projects`);
        displayProjects(allProjects);
        
    } catch (error) {
        console.error('Error loading projects:', error);
        showError('Failed to load projects: ' + error.message);
        
        // Show error state in the projects container
        const container = document.querySelector('.projects-container') || document.querySelector('#projectsContainer');
        if (container) {
            container.innerHTML = `
                <div class="alert alert-danger">
                    <h5>Failed to load projects</h5>
                    <p>Error: ${error.message}</p>
                    <button class="btn btn-primary" onclick="loadProjects()">Retry</button>
                </div>
            `;
        }
    }
}

// Load team members
async function loadTeamMembers() {
    try {
        console.log('Loading team members...');
        const response = await fetch('/api/team-members');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        allTeamMembers = data || [];
        
        console.log(`Loaded ${allTeamMembers.length} team members`);
        populateTeamMemberSelects();
        
    } catch (error) {
        console.error('Error loading team members:', error);
        showError('Failed to load team members: ' + error.message);
    }
}

// Display projects in the UI
function displayProjects(projects) {
    const container = document.querySelector('#projects-grid') ||
                     document.querySelector('.projects-container') ||
                     document.querySelector('#projectsContainer');

    if (!container) {
        console.error('Projects container not found');
        return;
    }

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info text-center">
                    <i class="fas fa-info-circle fa-3x mb-3"></i>
                    <h5>No Projects Found</h5>
                    <p>Get started by creating your first project.</p>
                    <button class="btn btn-primary" onclick="showCreateProjectModal()">
                        <i class="fas fa-plus me-1"></i>Create Project
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // ── Totals summary ──────────────────────────────────────────────────────────
    const totalBudget   = projects.reduce((s, p) => s + (p.budget || 0), 0);
    const totalSpent    = projects.reduce((s, p) => s + (p.spent  || 0), 0);
    const totalHrsPlanned = projects.reduce((s, p) => s + (p.estimated_hours || 0), 0);
    const totalHrsSpent   = projects.reduce((s, p) => s + (p.actual_hours    || 0), 0);
    const totalTasks    = projects.reduce((s, p) => s + (p.task_count || 0), 0);

    // Weighted average completion (weighted by task count)
    const avgCompletion = totalTasks > 0
        ? projects.reduce((s, p) => s + (p.completion_percentage || 0) * (p.task_count || 0), 0) / totalTasks
        : 0;
    const budgetUtil    = totalBudget > 0 ? totalSpent / totalBudget * 100 : 0;
    const hoursUtil     = totalHrsPlanned > 0 ? totalHrsSpent / totalHrsPlanned * 100 : 0;

    const completionColor = avgCompletion >= hoursUtil ? 'success' : 'danger';
    const budgetBarColor  = budgetUtil > 100 ? 'danger' : budgetUtil > 80 ? 'warning' : 'success';
    const hoursBarColor   = hoursUtil  > 100 ? 'danger' : hoursUtil  > 80 ? 'warning' : 'success';

    const totalsHtml = `
        <div class="col-12 mb-4">
            <div class="card border-primary">
                <div class="card-header bg-primary text-white py-2">
                    <strong><i class="fas fa-chart-bar me-2"></i>Portfolio Totals — ${projects.length} project${projects.length !== 1 ? 's' : ''}</strong>
                </div>
                <div class="card-body py-3">
                    <div class="row g-3 align-items-center">
                        <!-- KPI numbers -->
                        <div class="col-6 col-md-3 text-center border-end">
                            <div class="text-muted small">Total Budget</div>
                            <div class="fw-bold fs-5">€${totalBudget.toLocaleString()}</div>
                            <div class="text-muted small">Spent: €${totalSpent.toLocaleString()}</div>
                        </div>
                        <div class="col-6 col-md-3 text-center border-end">
                            <div class="text-muted small">Planned Hours</div>
                            <div class="fw-bold fs-5">${totalHrsPlanned.toLocaleString()}h</div>
                            <div class="text-muted small">Spent: ${totalHrsSpent.toLocaleString()}h</div>
                        </div>
                        <div class="col-6 col-md-3 text-center border-end">
                            <div class="text-muted small">Tasks</div>
                            <div class="fw-bold fs-5">${totalTasks}</div>
                            <div class="text-muted small">&nbsp;</div>
                        </div>
                        <!-- Progress bars -->
                        <div class="col-12 col-md-3">
                            <div class="mb-2">
                                <div class="d-flex justify-content-between small mb-1">
                                    <span class="text-muted">Avg Completion (% ready)</span>
                                    <span class="fw-semibold text-${completionColor}">${Math.round(avgCompletion)}%</span>
                                </div>
                                <div class="progress" style="height:8px;">
                                    <div class="progress-bar bg-${completionColor}" style="width:${Math.min(avgCompletion,100)}%"></div>
                                </div>
                            </div>
                            <div class="mb-2">
                                <div class="d-flex justify-content-between small mb-1">
                                    <span class="text-muted">Budget used (€)</span>
                                    <span class="fw-semibold ${budgetUtil > 100 ? 'text-danger' : ''}">${Math.round(budgetUtil)}%</span>
                                </div>
                                <div class="progress" style="height:8px;">
                                    <div class="progress-bar bg-${budgetBarColor}" style="width:${Math.min(budgetUtil,100)}%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="d-flex justify-content-between small mb-1">
                                    <span class="text-muted">Hours used</span>
                                    <span class="fw-semibold ${hoursUtil > 100 ? 'text-danger' : ''}">${Math.round(hoursUtil)}%</span>
                                </div>
                                <div class="progress" style="height:8px;">
                                    <div class="progress-bar bg-${hoursBarColor}" style="width:${Math.min(hoursUtil,100)}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    // ────────────────────────────────────────────────────────────────────────────
    
    container.innerHTML = totalsHtml + projects.map(project => `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card project-card">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="card-title">${escapeHtml(project.name)}</h5>
                        <div class="dropdown">
                            <button class="btn btn-sm btn-outline-secondary" data-bs-toggle="dropdown">
                                <i class="fas fa-ellipsis-v"></i>
                            </button>
                            <ul class="dropdown-menu">
                                <li><a class="dropdown-item" href="#" onclick="viewProject(${project.id})">
                                    <i class="fas fa-eye me-2"></i>View
                                </a></li>
                                <li><a class="dropdown-item" href="#" onclick="editProject(${project.id})">
                                    <i class="fas fa-edit me-2"></i>Edit
                                </a></li>
                                <li><a class="dropdown-item" href="/gantt?project_id=${project.id}">
                                    <i class="fas fa-chart-gantt me-2"></i>GANTT Chart
                                </a></li>
                                <li><hr class="dropdown-divider"></li>
                                <li><a class="dropdown-item text-danger" href="#" onclick="deleteProject(${project.id})">
                                    <i class="fas fa-trash me-2"></i>Delete
                                </a></li>
                            </ul>
                        </div>
                    </div>
                    
                    <p class="card-text text-muted small mb-2">${escapeHtml(project.client || '')}</p>
                    
                    <div class="mb-3">
                        <span class="badge bg-${getStatusColor(project.status)}">${project.status}</span>
                        <span class="badge bg-${getPriorityColor(project.priority)} ms-1">${project.priority}</span>
                    </div>
                    
                    <div class="row text-center mb-3">
                        <div class="col-4">
                            <div class="text-muted small">Budget</div>
                            <div class="fw-bold">€${(project.budget || 0).toLocaleString()}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-muted small">Spent</div>
                            <div class="fw-bold">€${(project.spent || 0).toLocaleString()}</div>
                        </div>
                        <div class="col-4">
                            <div class="text-muted small">Tasks</div>
                            <div class="fw-bold">${project.task_count || 0}</div>
                        </div>
                    </div>
                    
                    <div class="mb-2">
                        <div class="d-flex justify-content-between small text-muted mb-1">
                            <span>Completion</span>
                            <span>${Math.round(project.completion_percentage || 0)}%</span>
                        </div>
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar" style="width: ${project.completion_percentage || 0}%"></div>
                        </div>
                    </div>
                    
                    <div class="mb-2">
                        <div class="d-flex justify-content-between small text-muted mb-1">
                            <span>Budget Utilization</span>
                            <span>${Math.round(project.budget_utilization || 0)}%</span>
                        </div>
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar bg-warning" style="width: ${Math.min(project.budget_utilization || 0, 100)}%"></div>
                        </div>
                    </div>
                    
                    ${project.start_date ? `
                        <div class="small text-muted">
                            <i class="fas fa-calendar me-1"></i>
                            ${formatDate(project.start_date)} 
                            ${project.end_date ? `- ${formatDate(project.end_date)}` : ''}
                        </div>
                    ` : ''}
                </div>
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

function getPriorityColor(priority) {
    const colors = {
        'High': 'danger',
        'Medium': 'warning',
        'Low': 'success'
    };
    return colors[priority] || 'secondary';
}

function formatDate(dateString) {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Filter projects
function filterProjects(status = null) {
    let filteredProjects = allProjects;
    
    // Filter by status if provided
    if (status && status !== 'All') {
        filteredProjects = filteredProjects.filter(project => project.status === status);
    }
    
    // Filter by search term
    const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase();
    if (searchTerm) {
        filteredProjects = filteredProjects.filter(project => 
            (project.name || '').toLowerCase().includes(searchTerm) ||
            (project.client || '').toLowerCase().includes(searchTerm) ||
            (project.description || '').toLowerCase().includes(searchTerm)
        );
    }
    
    displayProjects(filteredProjects);
}

// Modal functions (placeholders - implement as needed)
function showCreateProjectModal() {
    console.log('Show create project modal');
    // Reset form
    document.getElementById('projectForm')?.reset();
    currentEditingProject = null;
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('projectModal'));
    modal.show();
}

function viewProject(projectId) {
    window.location.href = `/gantt?project_id=${projectId}`;
}

function editProject(projectId) {
    console.log('Edit project:', projectId);
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    
    currentEditingProject = project;
    
    // Populate form fields
    document.getElementById('projectName').value = project.name || '';
    document.getElementById('projectClient').value = project.client || '';
    document.getElementById('projectManager').value = project.project_manager || '';
    document.getElementById('projectBudget').value = project.budget || '';
    document.getElementById('projectStartDate').value = project.start_date || '';
    document.getElementById('projectEndDate').value = project.end_date || '';
    document.getElementById('projectStatus').value = project.status || 'Active';
    document.getElementById('projectPriority').value = project.priority || 'Medium';
    document.getElementById('projectDescription').value = project.description || '';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('projectModal'));
    modal.show();
}

async function deleteProject(projectId) {
    const id = projectId || (currentEditingProject && currentEditingProject.id);
    if (!id) return;

    const project = allProjects.find(p => p.id === id);
    const name = project ? project.name : `project #${id}`;

    if (!confirm(`Delete "${name}" and all its tasks? This cannot be undone.`)) return;

    try {
        const resp = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            showError(err.message || `Delete failed (${resp.status})`);
            return;
        }
        // Close any open modal
        const detailsModalEl = document.getElementById('projectDetailsModal');
        if (detailsModalEl) {
            const m = bootstrap.Modal.getInstance(detailsModalEl);
            if (m) m.hide();
        }
        currentEditingProject = null;
        await loadProjects();
    } catch (err) {
        showError(`Delete failed: ${err.message}`);
    }
}

function populateTeamMemberSelects() {
    const selects = document.querySelectorAll('select[data-team-members]');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">Select team member...</option>' +
            allTeamMembers.map(member => 
                `<option value="${member.id}">${escapeHtml(member.name)}</option>`
            ).join('');
        if (currentValue) select.value = currentValue;
    });
}

// Utility functions
function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = show ? 'flex' : 'none';
}

function showError(message) {
    console.error('Error:', message);
    showToast(message, 'danger');
}

function showSuccess(message) {
    console.log('Success:', message);
    showToast(message, 'success');
}

function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '1055';
        document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toastId = 'toast-' + Date.now();
    const toastHtml = `
        <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;
    
    toastContainer.insertAdjacentHTML('beforeend', toastHtml);
    
    // Show toast
    const toastElement = document.getElementById(toastId);
    const toast = new bootstrap.Toast(toastElement, {
        autohide: true,
        delay: 5000
    });
    toast.show();
    
    // Remove toast element after it's hidden
    toastElement.addEventListener('hidden.bs.toast', () => {
        toastElement.remove();
    });
}

// Export functions for global access
window.showCreateProjectModal = showCreateProjectModal;
window.viewProject = viewProject;
window.editProject = editProject;
window.deleteProject = deleteProject;
