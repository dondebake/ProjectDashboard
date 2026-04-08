// Global variables
let ganttChart = null;
let currentProject = null;
let allProjects = [];
let allTasks = [];
let allTeamMembers = [];
let _memberColorMap = new Map();   // member id (number) → hex color

const MEMBER_COLORS = [
    '#667eea','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4',
    '#ec4899','#14b8a6','#f97316','#a855f7','#84cc16','#0ea5e9',
    '#e11d48','#16a34a','#d97706','#7c3aed','#0891b2','#dc2626',
];

function memberColor(memberId, fallbackIndex = 0) {
    if (memberId && _memberColorMap.has(memberId)) return _memberColorMap.get(memberId);
    return MEMBER_COLORS[fallbackIndex % MEMBER_COLORS.length];
}

function buildMemberColorMap() {
    _memberColorMap = new Map();
    allTeamMembers.forEach((m, i) => {
        _memberColorMap.set(m.id, MEMBER_COLORS[i % MEMBER_COLORS.length]);
    });
}
let allTaskGroups = [];
let currentEditingTask = null;
let taskAssignments = {};
let taskDependencies = {};
let highlightsEnabled = false;  // Controlled by 5d button; off by default
let workingDaysOnly  = false;   // When true: show Mon–Fri only (weekend columns covered)

// Group state
const _collapsedGroups = new Set();   // group IDs currently collapsed
let _dragSourceTaskId  = null;        // task ID being dragged in left panel
let _dragSourceGroupId = null;        // group ID being dragged in left panel or modal

// ── Custom Gantt constants ─────────────────────────────────────────────────────
const HEADER_H = 50;              // px — date header height
const BAR_H    = 20;              // px — task bar height
const ROW_H    = 38;              // px — row height (must match .tl-row in CSS)
const ROW_PAD  = (ROW_H - BAR_H) / 2;   // 9 — vertical centering within row
const HANDLE_W = 6;               // px — resize handle width on bar edges

function getPixPerDay(mode) {
    return mode === 'Day' ? 30 : mode === 'Week' ? 6 : 2;
}

// Current task's assignment list (UI state while modal is open)
let currentTaskAssignments = [];  // [{member_id, name, planned, spent}]

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing GANTT chart...');
    console.log('Container exists:', !!document.getElementById('gantt-chart'));
    initializeApp();
});

async function initializeApp() {
    try {
        console.log('Starting app initialization...');
        
        // Check for required elements
        const projectSelect = document.getElementById('project-select');
        const ganttChart = document.getElementById('gantt-chart');
        
        console.log('Project select element:', !!projectSelect);
        console.log('Gantt chart element:', !!ganttChart);
        
        if (!projectSelect) {
            throw new Error('Project select element not found');
        }
        
        if (!ganttChart) {
            throw new Error('Gantt chart container not found');
        }
        
        // Load basic data
        console.log('Loading projects...');
        await loadProjects();
        
        console.log('Loading team members...');
        await loadTeamMembers();
        
        console.log('Setting up event listeners...');
        // Setup event listeners
        setupEventListeners();
        
        // Check if there's a project selected
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project_id');
        
        if (projectId) {
            console.log(`Project ID from URL: ${projectId}`);
            document.getElementById('project-select').value = projectId;
            await handleProjectChange();
        } else {
            console.log('No project ID in URL - showing default message');
            // Show default message in gantt chart container
            const container = document.getElementById('gantt-chart');
            if (container) {
                container.innerHTML = `
                    <div class="text-center text-muted p-5">
                        <i class="fas fa-chart-gantt fa-3x mb-3"></i>
                        <h5>Select a Project</h5>
                        <p>Choose a project from the dropdown above to view its GANTT chart.</p>
                    </div>
                `;
            }
        }
        
        console.log('App initialization complete');
    } catch (error) {
        console.error('Error initializing app:', error);
        
        // Simple error display without fancy toasts
        const ganttChart = document.getElementById('gantt-chart');
        if (ganttChart) {
            ganttChart.innerHTML = `
                <div class="alert alert-danger">
                    <h5>Initialization Error</h5>
                    <p>${error.message}</p>
                    <p>Check the browser console for more details.</p>
                    <button class="btn btn-primary" onclick="location.reload()">Reload Page</button>
                </div>
            `;
        }
        
        // Try to show error in a simple way
        alert('Failed to initialize application: ' + error.message);
    }
}

function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Project selection
    const projectSelect = document.getElementById('project-select');
    if (projectSelect) {
        projectSelect.addEventListener('change', handleProjectChange);
    }
    
    // Save task button
    const saveTaskBtn = document.getElementById('save-task-btn');
    if (saveTaskBtn) {
        saveTaskBtn.addEventListener('click', saveTask);
    }
    
    // Add dependency button
    const addDependencyBtn = document.getElementById('add-dependency-btn');
    if (addDependencyBtn) {
        addDependencyBtn.addEventListener('click', addDependency);
    }

    // Add team-member assignment button
    const addMemberBtn = document.getElementById('add-team-member-btn');
    if (addMemberBtn) {
        addMemberBtn.addEventListener('click', addMemberAssignment);
    }
    
    // Delete task button
    const deleteTaskBtn = document.getElementById('delete-task-btn');
    if (deleteTaskBtn) {
        deleteTaskBtn.addEventListener('click', function() {
            if (currentEditingTask) {
                deleteTask(currentEditingTask.id);
            }
        });
    }
}

// Load projects from API
async function loadProjects() {
    try {
        console.log('Loading projects...');
        const response = await fetch('/api/projects');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        allProjects = data || [];
        
        const select = document.getElementById('project-select');
        if (select) {
            select.innerHTML = '<option value="">Select a project...</option>';
            allProjects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            });
        } else {
            console.warn('Project select element not found');
        }
        
        console.log(`Loaded ${allProjects.length} projects successfully`);
    } catch (error) {
        console.error('Error loading projects:', error);
        allProjects = []; // Set to empty array to prevent further errors
        
        // Try to show error in select if it exists
        const select = document.getElementById('project-select');
        if (select) {
            select.innerHTML = '<option value="">Failed to load projects</option>';
        }
        
        // Don't throw - let the app continue
        console.warn('Continuing without projects data');
    }
}

// Load team members from API
async function loadTeamMembers() {
    try {
        console.log('Loading team members...');
        const response = await fetch('/api/team-members');
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        allTeamMembers = data || [];
        buildMemberColorMap();
        console.log(`Loaded ${allTeamMembers.length} team members successfully`);
    } catch (error) {
        console.error('Error loading team members:', error);
        allTeamMembers = []; // Set to empty array to prevent further errors
        
        // Don't throw - let the app continue
        console.warn('Continuing without team members data');
    }
}

// Load task groups for a project
async function loadTaskGroups(projectId) {
    try {
        const resp = await fetch(`/api/projects/${projectId}/task-groups`);
        if (!resp.ok) { allTaskGroups = []; return; }
        const data = await resp.json();
        // Flatten hierarchical structure
        allTaskGroups = [];
        function flatten(groups, parentId) {
            for (const g of groups) {
                allTaskGroups.push({
                    id: g.id, name: g.name, color: g.color,
                    sort_order: g.sort_order || 0, parent_id: parentId || null,
                    is_expanded: g.is_expanded !== false,
                    task_count: g.task_count || 0
                });
                if (g.subgroups && g.subgroups.length) flatten(g.subgroups, g.id);
            }
        }
        flatten(data, null);
    } catch (e) {
        console.warn('Failed to load task groups:', e);
        allTaskGroups = [];
    }
}

/**
 * Build the ordered display-item list for both the left panel and the Gantt SVG.
 * Returns [{type:'group', group, tasks}, {type:'task', task, indent}]
 * Groups are shown first (sorted by sort_order), with their tasks indented beneath them.
 * Ungrouped tasks appear at the bottom.
 */
function buildDisplayItems(visibleTasks, groups) {
    const items = [];

    // Build map: group_id → sorted tasks
    const groupTaskMap = new Map();
    const ungrouped = [];

    for (const t of visibleTasks) {
        if (t.group_id) {
            if (!groupTaskMap.has(t.group_id)) groupTaskMap.set(t.group_id, []);
            groupTaskMap.get(t.group_id).push(t);
        } else {
            ungrouped.push(t);
        }
    }
    for (const [, arr] of groupTaskMap) arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // Root groups only (no parent), sorted by sort_order
    const rootGroups = groups
        .filter(g => !g.parent_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    function addGroup(group, depth = 0) {
        const groupTasks = groupTaskMap.get(group.id) || [];
        items.push({ type: 'group', group, tasks: groupTasks, depth });

        if (!_collapsedGroups.has(group.id)) {
            for (const t of groupTasks) items.push({ type: 'task', task: t, indent: depth + 1 });

            // Subgroups
            const subs = groups
                .filter(g => g.parent_id === group.id)
                .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            for (const sub of subs) addGroup(sub, depth + 1);
        }
    }

    for (const g of rootGroups) addGroup(g);

    // Ungrouped tasks
    ungrouped.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const t of ungrouped) items.push({ type: 'task', task: t, indent: 0 });

    return items;
}

/** Toggle a group's collapsed state and re-render */
function toggleGroupCollapse(groupId) {
    if (_collapsedGroups.has(groupId)) _collapsedGroups.delete(groupId);
    else _collapsedGroups.add(groupId);
    renderGanttChart(allTasks, true);
}

/** Move a task to a different group (or ungrouped if groupId is null/0) */
async function moveTaskToGroup(taskId, groupId) {
    try {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        const targetGroupId = groupId || null;
        const groupTasks = allTasks.filter(t => t.group_id === targetGroupId && t.id !== taskId);
        const newSortOrder = groupTasks.length > 0
            ? Math.max(...groupTasks.map(t => t.sort_order || 0)) + 1 : 0;

        const resp = await fetch(`/api/tasks/${taskId}/group`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ group_id: targetGroupId, sort_order: newSortOrder })
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.message || 'Failed');

        // Update in memory
        task.group_id = targetGroupId;
        task.sort_order = newSortOrder;
        const grp = allTaskGroups.find(g => g.id === targetGroupId);
        task.group_color = grp ? grp.color : null;
        task.group_name  = grp ? grp.name  : null;

        renderGanttChart(allTasks, true);
        showSuccess(targetGroupId ? 'Task moved to group' : 'Task removed from group');
    } catch (err) {
        showError('Failed to move task: ' + err.message);
    }
}

/**
 * Reorder a task within (or into) a group by dropping it before a target task.
 * sourceTaskId is dragged; it's inserted just before targetTaskId in targetGroupId.
 */
async function reorderTask(sourceTaskId, targetTaskId, targetGroupId) {
    try {
        const sourceTask = allTasks.find(t => t.id === sourceTaskId);
        const targetTask = allTasks.find(t => t.id === targetTaskId);
        if (!sourceTask || !targetTask) return;

        const gid = targetGroupId != null ? targetGroupId : null;

        // Build ordered list for the target group (excluding source)
        const peers = allTasks
            .filter(t => t.group_id === gid && t.id !== sourceTaskId)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        // Insert source before target
        const insertIdx = peers.findIndex(t => t.id === targetTaskId);
        if (insertIdx >= 0) peers.splice(insertIdx, 0, sourceTask);
        else peers.push(sourceTask);

        // Assign sequential sort_orders
        const updates = peers.map((t, i) => ({ id: t.id, group_id: gid, sort_order: i * 10 }));

        // Apply in memory
        for (const u of updates) {
            const t = allTasks.find(x => x.id === u.id);
            if (t) { t.sort_order = u.sort_order; t.group_id = u.group_id; }
        }
        const grp = allTaskGroups.find(g => g.id === gid);
        if (sourceTask) {
            sourceTask.group_color = grp ? grp.color : null;
            sourceTask.group_name  = grp ? grp.name  : null;
        }

        renderGanttChart(allTasks, true);

        // Persist
        await Promise.all(updates.map(u =>
            fetch(`/api/tasks/${u.id}/group`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ group_id: u.group_id, sort_order: u.sort_order })
            })
        ));
    } catch (err) {
        showError('Failed to reorder task: ' + err.message);
        await loadProjectTasks(currentProject.id, true);
        renderGanttChart(allTasks, true);
    }
}

/**
 * Reorder a group among its siblings by dropping it before a target group.
 * Only siblings (same parent_id) can be reordered against each other.
 */
async function reorderGroup(sourceGroupId, targetGroupId) {
    try {
        const sourceGroup = allTaskGroups.find(g => g.id === sourceGroupId);
        const targetGroup = allTaskGroups.find(g => g.id === targetGroupId);
        if (!sourceGroup || !targetGroup) return;
        if (sourceGroup.parent_id !== targetGroup.parent_id) return;

        const parentId = sourceGroup.parent_id;
        const peers = allTaskGroups
            .filter(g => g.parent_id === parentId && g.id !== sourceGroupId)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const insertIdx = peers.findIndex(g => g.id === targetGroupId);
        if (insertIdx >= 0) peers.splice(insertIdx, 0, sourceGroup);
        else peers.push(sourceGroup);

        const updates = peers.map((g, i) => ({ id: g.id, sort_order: i * 10 }));

        for (const u of updates) {
            const g = allTaskGroups.find(x => x.id === u.id);
            if (g) g.sort_order = u.sort_order;
        }

        renderGroupsList();
        renderGanttChart(allTasks, true);

        await Promise.all(updates.map(u =>
            fetch(`/api/task-groups/${u.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sort_order: u.sort_order })
            })
        ));
    } catch (err) {
        showError('Failed to reorder group: ' + err.message);
        await loadTaskGroups(currentProject.id);
        renderGroupsList();
        renderGanttChart(allTasks, true);
    }
}

// Handle project selection change
async function handleProjectChange() {
    const projectId = document.getElementById('project-select').value;
    
    if (!projectId) {
        document.getElementById('gantt-chart').innerHTML = '<p class="text-center text-muted">Please select a project to view the GANTT chart.</p>';
        return;
    }
    
    try {
        console.log(`Loading project ${projectId} tasks...`);
        showLoading(true);
        
        // Find the project
        currentProject = allProjects.find(p => p.id === parseInt(projectId));

        // Show/hide Budget button
        const budgetBtn = document.getElementById('budget-btn');
        if (budgetBtn) budgetBtn.style.display = currentProject ? '' : 'none';

        // Load task groups first so displayItems are built correctly
        await loadTaskGroups(projectId);

        // Load project tasks
        await loadProjectTasks(projectId);
        
        showLoading(false);
    } catch (error) {
        console.error('Error handling project change:', error);
        showError('Failed to load project data');
        showLoading(false);
    }
}

// Load full task details for a project
async function loadProjectTasks(projectId, skipRender = false) {
    try {
        console.log(`Fetching tasks for project ${projectId}...`);
        const response = await fetch(`/api/projects/${projectId}/tasks`);
        const data = await response.json();

        if (data.success) {
            allTasks = data.tasks || [];
            console.log(`Loaded ${allTasks.length} tasks`);

            // Render Gantt chart (skip when the caller will render with preserveView)
            if (!skipRender) renderGanttChart(allTasks);
        } else {
            console.error('API error:', data.message);
            throw new Error(data.message || 'Failed to load tasks');
        }
    } catch (error) {
        console.error('Error loading project tasks:', error);
        
        if (error.message.includes('404')) {
            showError('Project not found or no tasks endpoint available. Please check backend implementation.');
        } else {
            showError('Failed to load project tasks: ' + error.message);
        }
        
        // Show fallback message
        document.getElementById('gantt-chart').innerHTML = `
            <div class="alert alert-warning">
                <h5>Unable to load tasks</h5>
                <p>Error: ${error.message}</p>
                <p>Please check:</p>
                <ul>
                    <li>Backend server is running</li>
                    <li>/api/projects/${projectId}/tasks endpoint exists</li>
                    <li>Database contains tasks for this project</li>
                </ul>
            </div>
        `;
    }
}

// Render Gantt chart — custom SVG implementation (no Frappe dependency)
function renderGanttChart(tasks, preserveView = false) {
    const container = document.getElementById('gantt-chart');
    if (!container) return;

    const visibleTasks = tasks.filter(t => t.start_date && t.end_date);

    if (visibleTasks.length === 0) {
        container.innerHTML = '<p class="text-center text-muted p-4">No tasks with dates to display.</p>';
        ganttChart = null;
        buildTaskListPanel();
        return;
    }

    const viewMode  = window.currentViewMode || 'Month';
    const pixPerDay = getPixPerDay(viewMode);
    const { start: ganttStart, end: ganttEnd } = computeGanttRange(visibleTasks);

    // Save scroll before clearing
    const prevBody = document.getElementById('gantt-body-scroll');
    const savedX = preserveView && prevBody ? prevBody.scrollLeft : null;
    const savedY = preserveView && prevBody ? prevBody.scrollTop  : null;

    // Build display items (group headers + task rows)
    const displayItems = buildDisplayItems(visibleTasks, allTaskGroups);

    // Build state object — backward-compatible with legacy code reading ganttChart.*
    ganttChart = {
        tasks:        visibleTasks,
        displayItems: displayItems,
        gantt_start:  ganttStart,
        gantt_end:    ganttEnd,
        view_mode:    viewMode,
        pixPerDay,
        options: {
            header_height: HEADER_H,
            bar_height:    BAR_H,
            padding:       ROW_H - BAR_H,
            column_width:  pixPerDay,
            view_mode:     viewMode,
        },
    };

    // Clear and rebuild #gantt-chart contents
    container.innerHTML = '';

    const totalDays = Math.ceil((ganttEnd - ganttStart) / 86400000);
    const totalW    = Math.max(totalDays * pixPerDay, 800);
    const bodyH     = displayItems.length * ROW_H;

    // ── Header wrap (scrolls horizontally, not vertically) ────────────────────
    const headerWrap = document.createElement('div');
    headerWrap.id = 'gantt-header-wrap';
    headerWrap.style.cssText =
        `overflow:hidden; flex-shrink:0; height:${HEADER_H}px; border-bottom:2px solid #ced4da;`;

    // ── Body scroll area ───────────────────────────────────────────────────────
    const bodyWrap = document.createElement('div');
    bodyWrap.id = 'gantt-body-scroll';
    bodyWrap.style.cssText = 'flex:1; overflow:auto; min-height:0;';

    container.appendChild(headerWrap);
    container.appendChild(bodyWrap);

    // Header SVG
    const hSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    hSvg.id = 'gantt-header-svg';
    hSvg.setAttribute('width',  totalW);
    hSvg.setAttribute('height', HEADER_H);
    hSvg.style.display = 'block';
    headerWrap.appendChild(hSvg);
    _drawHeader(hSvg, ganttStart, totalDays, pixPerDay, viewMode, totalW);

    // Body SVG
    const bSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    bSvg.id = 'gantt-svg';
    bSvg.setAttribute('width',  totalW);
    bSvg.setAttribute('height', bodyH);
    bSvg.style.cssText = 'display:block; user-select:none;';
    bodyWrap.appendChild(bSvg);

    _drawRowBackgrounds(bSvg, displayItems, totalW);
    _drawGridLines(bSvg, ganttStart, totalDays, pixPerDay, viewMode, bodyH);
    _drawBars(bSvg, displayItems, ganttStart, pixPerDay);

    // Sync header scrollLeft with body scrollLeft
    bodyWrap.addEventListener('scroll', () => {
        headerWrap.scrollLeft = bodyWrap.scrollLeft;
    });

    // Drag & resize (still uses visibleTasks for task data lookup)
    _initBarDrag(bSvg, visibleTasks, ganttStart, pixPerDay);

    // Task list panel + scroll sync (can run synchronously)
    buildTaskListPanel();
    syncTaskListScroll();

    // Overlays deferred one tick so SVG is in DOM
    setTimeout(() => {
        highlightNonWorkingDays();
        addTodayLine();
        drawDependencyArrows();
        enableHoverPopup();

        if (preserveView && savedX !== null) {
            bodyWrap.scrollLeft = savedX;
            bodyWrap.scrollTop  = savedY;
        } else {
            goToToday();
        }
    }, 0);
}

// ── Compute chart date bounds with 2-week padding ─────────────────────────────
function computeGanttRange(tasks) {
    let minStart = null, maxEnd = null;
    for (const t of tasks) {
        if (t.start_date) { const d = new Date(t.start_date); if (!minStart || d < minStart) minStart = d; }
        if (t.end_date)   { const d = new Date(t.end_date);   if (!maxEnd   || d > maxEnd  ) maxEnd   = d; }
    }
    if (!minStart || !maxEnd) { const now = new Date(); return { start: now, end: now }; }
    const start = new Date(minStart); start.setDate(start.getDate() - 14);
    const end   = new Date(maxEnd);   end.setDate(end.getDate()   + 14);
    return { start, end };
}

// ── Draw date header SVG ──────────────────────────────────────────────────────
function _drawHeader(svg, ganttStart, totalDays, pixPerDay, viewMode, totalW) {
    const ROW1 = 30, ROW2 = 20;
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const ns = 'http://www.w3.org/2000/svg';

    const mkRect = (x, y, w, h, fill) => {
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', x); r.setAttribute('y', y);
        r.setAttribute('width', w); r.setAttribute('height', h);
        r.setAttribute('fill', fill);
        svg.appendChild(r); return r;
    };
    const mkLine = (x1, y1, x2, y2, stroke) => {
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', '1');
        svg.appendChild(l);
    };
    const mkText = (x, y, text, fontSize, fill, fontWeight) => {
        const t = document.createElementNS(ns, 'text');
        t.setAttribute('x', x); t.setAttribute('y', y);
        t.setAttribute('font-size', fontSize);
        t.setAttribute('font-family', 'Segoe UI, sans-serif');
        t.setAttribute('fill', fill);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'middle');
        if (fontWeight) t.setAttribute('font-weight', fontWeight);
        t.textContent = text;
        svg.appendChild(t);
    };

    mkRect(0, 0, totalW, HEADER_H, '#f0f0f5');
    mkLine(0, ROW1 - 0.5, totalW, ROW1 - 0.5, '#ced4da');

    if (viewMode === 'Day') {
        let curMonth = -1, curYear = -1, monthStartX = 0;
        for (let i = 0; i <= totalDays; i++) {
            const d = new Date(ganttStart); d.setDate(d.getDate() + i);
            const x = i * pixPerDay;
            if (d.getMonth() !== curMonth || d.getFullYear() !== curYear) {
                if (curMonth >= 0) {
                    mkText(monthStartX + (x - monthStartX) / 2, ROW1 / 2,
                           `${MONTHS[curMonth]} ${curYear}`, 11, '#495057', '600');
                    if (i > 0) mkLine(x, 0, x, ROW1, '#ced4da');
                }
                curMonth = d.getMonth(); curYear = d.getFullYear(); monthStartX = x;
            }
            if (i < totalDays) {
                const dow = d.getDay(), isWE = dow === 0 || dow === 6;
                if (isWE) mkRect(x, ROW1, pixPerDay, ROW2, '#e8e8f0');
                if (i > 0) mkLine(x, ROW1, x, HEADER_H, '#e9ecef');
                mkText(x + pixPerDay / 2, ROW1 + ROW2 / 2, d.getDate(),
                       9, isWE ? '#aaa' : '#6c757d', null);
            }
        }
        mkText(monthStartX + (totalDays * pixPerDay - monthStartX) / 2, ROW1 / 2,
               `${MONTHS[curMonth]} ${curYear}`, 11, '#495057', '600');

    } else if (viewMode === 'Week') {
        let curMonth = -1, curYear = -1, monthStartX = 0;
        for (let i = 0; i <= totalDays; i++) {
            const d = new Date(ganttStart); d.setDate(d.getDate() + i);
            const x = i * pixPerDay;
            if (d.getMonth() !== curMonth || d.getFullYear() !== curYear) {
                if (curMonth >= 0) {
                    mkText(monthStartX + (x - monthStartX) / 2, ROW1 / 2,
                           `${MONTHS[curMonth]} ${curYear}`, 11, '#495057', '600');
                    mkLine(x, 0, x, ROW1, '#ced4da');
                }
                curMonth = d.getMonth(); curYear = d.getFullYear(); monthStartX = x;
            }
            if (i < totalDays && d.getDay() === 1) {
                if (i > 0) mkLine(x, ROW1, x, HEADER_H, '#dee2e6');
                mkText(x + 7 * pixPerDay / 2, ROW1 + ROW2 / 2,
                       `${MONTHS[d.getMonth()]} ${d.getDate()}`, 9, '#6c757d', null);
            }
        }
        mkText(monthStartX + (totalDays * pixPerDay - monthStartX) / 2, ROW1 / 2,
               `${MONTHS[curMonth]} ${curYear}`, 11, '#495057', '600');

    } else { // Month
        let curYear = -1, yearStartX = 0;
        for (let i = 0; i <= totalDays; i++) {
            const d = new Date(ganttStart); d.setDate(d.getDate() + i);
            const x = i * pixPerDay;
            if (d.getFullYear() !== curYear) {
                if (curYear >= 0) {
                    mkText(yearStartX + (x - yearStartX) / 2, ROW1 / 2,
                           String(curYear), 12, '#495057', '700');
                    mkLine(x, 0, x, ROW1, '#ced4da');
                }
                curYear = d.getFullYear(); yearStartX = x;
            }
            if (i < totalDays && d.getDate() === 1) {
                if (i > 0) mkLine(x, ROW1, x, HEADER_H, '#dee2e6');
                const dIM = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
                mkText(x + dIM * pixPerDay / 2, ROW1 + ROW2 / 2,
                       MONTHS[d.getMonth()], 10, '#6c757d', null);
            }
        }
        mkText(yearStartX + (totalDays * pixPerDay - yearStartX) / 2, ROW1 / 2,
               String(curYear), 12, '#495057', '700');
    }
}

// ── Alternating row backgrounds ───────────────────────────────────────────────
function _drawRowBackgrounds(svg, displayItems, totalW) {
    const ns = 'http://www.w3.org/2000/svg';
    let taskRowIdx = 0;
    displayItems.forEach((item, i) => {
        const r = document.createElementNS(ns, 'rect');
        r.setAttribute('x', 0); r.setAttribute('y', i * ROW_H);
        r.setAttribute('width', totalW); r.setAttribute('height', ROW_H);

        if (item.type === 'group') {
            // Group header: colored tint
            r.setAttribute('fill', item.group.color + '18');
        } else {
            r.setAttribute('fill', taskRowIdx % 2 === 0 ? '#ffffff' : '#f8f9fa');
            taskRowIdx++;
        }
        svg.appendChild(r);

        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', 0); l.setAttribute('y1', (i + 1) * ROW_H - 0.5);
        l.setAttribute('x2', totalW); l.setAttribute('y2', (i + 1) * ROW_H - 0.5);
        l.setAttribute('stroke', item.type === 'group' ? item.group.color + '50' : '#e9ecef');
        l.setAttribute('stroke-width', '1');
        svg.appendChild(l);
    });
}

// ── Vertical grid column lines ────────────────────────────────────────────────
function _drawGridLines(svg, ganttStart, totalDays, pixPerDay, viewMode, bodyH) {
    const ns = 'http://www.w3.org/2000/svg';
    const g  = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'grid-lines');
    for (let i = 1; i < totalDays; i++) {
        const d = new Date(ganttStart); d.setDate(d.getDate() + i);
        const draw = viewMode === 'Day' ||
                    (viewMode === 'Week'  && d.getDay()  === 1) ||
                    (viewMode === 'Month' && d.getDate() === 1);
        if (!draw) continue;
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', i * pixPerDay); l.setAttribute('y1', 0);
        l.setAttribute('x2', i * pixPerDay); l.setAttribute('y2', bodyH);
        // Heavier line at month boundary in Day view
        const heavy = viewMode === 'Day' && d.getDate() === 1;
        l.setAttribute('stroke', heavy ? '#dee2e6' : '#f0f0f5');
        l.setAttribute('stroke-width', '1');
        g.appendChild(l);
    }
    svg.appendChild(g);
}

// ── Bar colour ────────────────────────────────────────────────────────────────
const _BAR_STATUS_COLORS = {
    'Completed':   '#22c55e',
    'In Progress': '#667eea',
    'Not Started': '#94a3b8',
    'Pending':     '#94a3b8',
    'On Hold':     '#f97316',
};
function _getBarFill(task) {
    // Budget-health colouring: same logic as existing getTaskClass
    if ((task.estimated_hours || 0) > 0) {
        const budgetPct = Math.round((task.actual_hours || 0) / task.estimated_hours * 100);
        return (task.progress || 0) >= budgetPct ? '#22c55e' : '#dc3545';
    }
    return _BAR_STATUS_COLORS[task.status] || '#667eea';
}

// ── Draw task bars (and group summary bars) ───────────────────────────────────
function _drawBars(svg, displayItems, ganttStart, pixPerDay) {
    const ns = 'http://www.w3.org/2000/svg';
    const gsMs = ganttStart.getTime();
    const layer = document.createElementNS(ns, 'g');
    layer.setAttribute('class', 'bars-layer');

    displayItems.forEach((item, rowIdx) => {
        if (item.type === 'group') {
            // ── Group summary bar ──────────────────────────────────────────
            const groupTasks = item.tasks.filter(t => t.start_date && t.end_date);
            if (groupTasks.length === 0) return;

            const minMs = Math.min(...groupTasks.map(t => new Date(t.start_date).getTime()));
            const maxMs = Math.max(...groupTasks.map(t => new Date(t.end_date).getTime()));
            const startDay = (minMs - gsMs) / 86400000;
            const endDay   = (maxMs - gsMs) / 86400000 + 1;
            const x = startDay * pixPerDay;
            const w = Math.max(2, (endDay - startDay) * pixPerDay);
            const y = rowIdx * ROW_H + ROW_PAD + BAR_H * 0.25;
            const h = BAR_H * 0.5;

            const bar = document.createElementNS(ns, 'rect');
            bar.setAttribute('x', x); bar.setAttribute('y', y);
            bar.setAttribute('width', w); bar.setAttribute('height', h);
            bar.setAttribute('rx', 2); bar.setAttribute('ry', 2);
            bar.setAttribute('fill', item.group.color + '70');
            bar.setAttribute('pointer-events', 'none');
            layer.appendChild(bar);

            // Group name label inside bar
            if (w > 40) {
                const txt = document.createElementNS(ns, 'text');
                txt.setAttribute('x', x + 5); txt.setAttribute('y', y + h / 2);
                txt.setAttribute('font-size', '9');
                txt.setAttribute('font-family', 'Segoe UI, sans-serif');
                txt.setAttribute('font-weight', '600');
                txt.setAttribute('fill', item.group.color);
                txt.setAttribute('dominant-baseline', 'middle');
                txt.setAttribute('pointer-events', 'none');
                txt.textContent = item.group.name;
                layer.appendChild(txt);
            }
            return;
        }

        // ── Task bar ──────────────────────────────────────────────────────
        const task = item.task;
        const startDay = (new Date(task.start_date).getTime() - gsMs) / 86400000;
        const endDay   = (new Date(task.end_date  ).getTime() - gsMs) / 86400000 + 1;
        const x = startDay * pixPerDay;
        const w = Math.max(2, (endDay - startDay) * pixPerDay);
        const y = rowIdx * ROW_H + ROW_PAD;
        // Use group color when available, else status color
        const fill = task.group_color || _getBarFill(task);

        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'bar-wrapper');
        g.setAttribute('data-id',      task.id);
        g.setAttribute('data-task-id', task.id);
        g.setAttribute('data-row', rowIdx);
        if ((task.progress || 0) >= 100) g.setAttribute('opacity', '0.5');

        // Transparent hit area
        const hit = document.createElementNS(ns, 'rect');
        hit.setAttribute('x', x); hit.setAttribute('y', rowIdx * ROW_H);
        hit.setAttribute('width', w); hit.setAttribute('height', ROW_H);
        hit.setAttribute('fill', 'transparent');
        hit.setAttribute('class', 'bar-hit');
        g.appendChild(hit);

        // Main bar
        const bar = document.createElementNS(ns, 'rect');
        bar.setAttribute('x', x); bar.setAttribute('y', y);
        bar.setAttribute('width', w); bar.setAttribute('height', BAR_H);
        bar.setAttribute('rx', 3); bar.setAttribute('ry', 3);
        bar.setAttribute('fill', fill);
        bar.setAttribute('class', 'bar');
        g.appendChild(bar);

        // Progress stripe (bottom 40% of bar)
        const progress = task.progress || 0;
        if (progress > 0 && w > 4) {
            const pW = Math.min(w, w * progress / 100);
            const prg = document.createElementNS(ns, 'rect');
            prg.setAttribute('x', x); prg.setAttribute('y', y + BAR_H * 0.6);
            prg.setAttribute('width', pW); prg.setAttribute('height', BAR_H * 0.4);
            prg.setAttribute('fill', 'rgba(0,0,0,0.22)');
            prg.setAttribute('class', 'bar-progress');
            prg.setAttribute('pointer-events', 'none');
            g.appendChild(prg);
        }

        // Fixed-start lock indicator
        if (task.fixed_start) {
            const lk = document.createElementNS(ns, 'text');
            lk.setAttribute('x', Math.max(0, x - 13)); lk.setAttribute('y', y + BAR_H / 2);
            lk.setAttribute('font-size', '10'); lk.setAttribute('dominant-baseline', 'middle');
            lk.setAttribute('pointer-events', 'none');
            lk.textContent = '🔒';
            g.appendChild(lk);
        }

        // Resize handle — left edge
        const rl = document.createElementNS(ns, 'rect');
        rl.setAttribute('x', x); rl.setAttribute('y', y);
        rl.setAttribute('width', HANDLE_W); rl.setAttribute('height', BAR_H);
        rl.setAttribute('fill', 'rgba(0,0,0,0.18)'); rl.setAttribute('rx', 2);
        rl.setAttribute('class', 'resize-left'); rl.style.cursor = 'ew-resize';
        g.appendChild(rl);

        // Resize handle — right edge
        const rr = document.createElementNS(ns, 'rect');
        rr.setAttribute('x', x + w - HANDLE_W); rr.setAttribute('y', y);
        rr.setAttribute('width', HANDLE_W); rr.setAttribute('height', BAR_H);
        rr.setAttribute('fill', 'rgba(0,0,0,0.18)'); rr.setAttribute('rx', 2);
        rr.setAttribute('class', 'resize-right'); rr.style.cursor = 'ew-resize';
        g.appendChild(rr);

        layer.appendChild(g);
    });
    svg.appendChild(layer);
}

// ── Drag & resize ─────────────────────────────────────────────────────────────
let _activeDrag = null;
// Keep listeners at module scope so they can be added once and reused
function _initBarDrag(svg, tasks, ganttStart, pixPerDay) {
    svg.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const wrapper = e.target.closest('.bar-wrapper');
        if (!wrapper) return;

        const taskId = parseInt(wrapper.getAttribute('data-task-id'));
        const task   = tasks.find(t => t.id === taskId);
        if (!task) return;

        e.preventDefault();
        const isRL = e.target.classList.contains('resize-left');
        const isRR = e.target.classList.contains('resize-right');
        const mode = isRL ? 'resize-left' : isRR ? 'resize-right' : 'move';
        const bar  = wrapper.querySelector('.bar');

        _activeDrag = {
            taskId, task, wrapper, bar, mode,
            startClientX:  e.clientX,
            origX: parseFloat(bar.getAttribute('x')),
            origW: parseFloat(bar.getAttribute('width')),
            origStartDate: task.start_date,
            origEndDate:   task.end_date,
            pixPerDay, ganttStart,
            moved: false,
        };
        svg.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
        document.body.style.userSelect = 'none';
    });
}

// Attach drag move/up to document once — they always check _activeDrag
(function _attachGlobalDragListeners() {
    document.addEventListener('mousemove', e => {
        if (!_activeDrag) return;
        const dxPx = e.clientX - _activeDrag.startClientX;
        if (Math.abs(dxPx) > 2) _activeDrag.moved = true;
        if (_activeDrag.moved) _applyDragVisuals(_activeDrag, dxPx);
    });

    document.addEventListener('mouseup', async () => {
        if (!_activeDrag) return;
        const drag = _activeDrag;
        _activeDrag = null;
        document.body.style.userSelect = '';
        const ganttSvg = document.getElementById('gantt-svg');
        if (ganttSvg) ganttSvg.style.cursor = '';

        if (!drag.moved) {
            showEditTaskModal(drag.taskId);
            return;
        }

        const { newStartDate, newEndDate } = _computeDragDates(drag);

        if (newStartDate !== drag.origStartDate || newEndDate !== drag.origEndDate) {
            await handleTaskDateChange(drag.taskId, new Date(newStartDate), new Date(newEndDate));
        }
    });
})();

function _applyDragVisuals(drag, dxPx) {
    const { mode, origX, origW, wrapper, bar, pixPerDay } = drag;
    const rl  = wrapper.querySelector('.resize-left');
    const rr  = wrapper.querySelector('.resize-right');
    const hit = wrapper.querySelector('.bar-hit');
    const prg = wrapper.querySelector('.bar-progress');

    if (mode === 'move') {
        const nx = origX + dxPx;
        bar.setAttribute('x', nx);
        if (rl)  rl.setAttribute('x', nx);
        if (rr)  rr.setAttribute('x', nx + origW - HANDLE_W);
        if (hit) hit.setAttribute('x', nx);
        if (prg) prg.setAttribute('x', nx);
    } else if (mode === 'resize-right') {
        const nw = Math.max(pixPerDay, origW + dxPx);
        bar.setAttribute('width', nw);
        if (rr)  rr.setAttribute('x', origX + nw - HANDLE_W);
        if (hit) hit.setAttribute('width', nw);
    } else { // resize-left
        const dx = Math.min(dxPx, origW - pixPerDay);
        const nx = origX + dx, nw = origW - dx;
        bar.setAttribute('x', nx); bar.setAttribute('width', nw);
        if (rl)  rl.setAttribute('x', nx);
        if (rr)  rr.setAttribute('x', nx + nw - HANDLE_W);
        if (hit) { hit.setAttribute('x', nx); hit.setAttribute('width', nw); }
        if (prg) prg.setAttribute('x', nx);
    }
}

function _computeDragDates(drag) {
    const { mode, origStartDate, origEndDate, pixPerDay, ganttStart, bar } = drag;
    const gsMs   = ganttStart.getTime();
    const finalX = parseFloat(bar.getAttribute('x'));
    const finalW = parseFloat(bar.getAttribute('width'));

    let newStartDate = origStartDate;
    let newEndDate   = origEndDate;

    if (mode === 'move' || mode === 'resize-left') {
        const dayOff = Math.round(finalX / pixPerDay);
        newStartDate = formatDateForAPI(new Date(gsMs + dayOff * 86400000));
    }
    if (mode === 'move' || mode === 'resize-right') {
        const dayOff = Math.round((finalX + finalW) / pixPerDay) - 1; // inclusive
        newEndDate = formatDateForAPI(new Date(gsMs + dayOff * 86400000));
    }
    if (newEndDate < newStartDate) newEndDate = newStartDate;
    return { newStartDate, newEndDate };
}

// Get task CSS class based on status and priority
function getTaskClass(status, priority, dependencies, fixedStart, fixedEnd, progress, estimatedHours, actualHours) {
    let className = 'task-';

    if (status === 'Completed') {
        className += 'completed';
    } else if (status === 'In Progress' || status === 'in_progress') {
        className += 'in-progress';
    } else {
        className += 'todo';
    }

    if (priority === 'High') {
        className += ' task-high-priority';
    }

    // Add dependency indicators
    if (dependencies && dependencies.length > 0) {
        className += ' task-has-dependencies';
    }

    // Add milestone indicators
    if (fixedStart && fixedEnd) {
        className += ' task-milestone-both';
    } else if (fixedStart) {
        className += ' task-milestone-start';
    } else if (fixedEnd) {
        className += ' task-milestone-end';
    }

    // Budget health: green if % ready >= budget used, red if behind
    if (estimatedHours > 0) {
        const budgetUsedPct = Math.round((actualHours || 0) / estimatedHours * 100);
        const readyPct = progress || 0;
        if (readyPct >= budgetUsedPct) {
            className += ' task-budget-ok';
        } else {
            className += ' task-budget-over';
        }
    }

    return className;
}

// Highlight weekends and holidays in the body SVG
function highlightNonWorkingDays() {
    const svg = document.getElementById('gantt-svg');
    if (!svg || !ganttChart) return;

    // Remove previous highlight layer
    svg.querySelectorAll('.highlights-layer').forEach(el => el.remove());

    if (!highlightsEnabled && !workingDaysOnly) return;

    const ganttStart = ganttChart.gantt_start;
    const ganttEnd   = ganttChart.gantt_end;
    const pixPerDay  = ganttChart.pixPerDay;
    const totalDays  = Math.ceil((ganttEnd - ganttStart) / 86400000);
    const bodyH      = parseInt(svg.getAttribute('height')) || ganttChart.tasks.length * ROW_H;
    const startYear = ganttStart.getFullYear ? ganttStart.getFullYear() : new Date(ganttStart).getFullYear();
    const endYear   = ganttEnd.getFullYear   ? ganttEnd.getFullYear()   : new Date(ganttEnd).getFullYear();
    let holidays = [];
    for (let y = startYear; y <= endYear; y++) holidays = holidays.concat(getDutchHolidays(y));

    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('class', 'highlights-layer');
    layer.setAttribute('pointer-events', 'none');

    for (let i = 0; i < totalDays; i++) {
        const d = new Date(ganttStart); d.setDate(d.getDate() + i);
        const dow     = d.getDay();
        const dateStr = formatDateForAPI(d);
        const isWE    = dow === 0 || dow === 6;
        const isHol   = holidays.includes(dateStr);

        if (!isWE && !isHol) continue;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', i * pixPerDay);
        rect.setAttribute('y', 0);
        rect.setAttribute('width',  pixPerDay);
        rect.setAttribute('height', bodyH);

        if (workingDaysOnly && isWE) {
            // Solid mask — covers the weekend column entirely
            rect.setAttribute('fill',    '#c8c8d0');
            rect.setAttribute('opacity', '0.45');
            rect.setAttribute('class',   'weekend-mask');
        } else if (isHol) {
            rect.setAttribute('fill',    '#2d5016');
            rect.setAttribute('opacity', '0.15');
            rect.setAttribute('class',   'holiday-highlight');
        } else {
            rect.setAttribute('fill',    '#4a4a4a');
            rect.setAttribute('opacity', '0.12');
            rect.setAttribute('class',   'weekend-highlight');
        }
        layer.appendChild(rect);
    }

    // Insert before bars so highlights render behind task bars
    const barsLayer = svg.querySelector('.bars-layer');
    svg.insertBefore(layer, barsLayer || svg.firstChild);
}

// Get Dutch holidays for a given year
function getDutchHolidays(year) {
    const holidays = [];
    
    // Fixed holidays
    holidays.push(
        `${year}-01-01`, // New Year's Day
        `${year}-04-27`, // King's Day
        `${year}-12-25`, // Christmas Day
        `${year}-12-26`  // Boxing Day
    );
    
    // Easter-based holidays — use formatDateForAPI (local timezone) to avoid UTC off-by-one
    const easter = calculateEaster(year);
    const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

    holidays.push(
        formatDateForAPI(addDays(easter, -2)),  // Goede Vrijdag
        formatDateForAPI(easter),               // Eerste Paasdag
        formatDateForAPI(addDays(easter,  1)),  // Tweede Paasdag
        formatDateForAPI(addDays(easter, 39)),  // Hemelvaart
        formatDateForAPI(addDays(easter, 49)),  // Eerste Pinksterdag
        formatDateForAPI(addDays(easter, 50))   // Tweede Pinksterdag
    );
    
    return holidays;
}

// Calculate Easter Sunday for a given year
function calculateEaster(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    
    return new Date(year, month - 1, day);
}

// ── Build popup HTML from a taskData object ───────────────────────────────────
function buildPopupHtml(taskData) {
    const statusColor   = taskData.status === 'Completed' ? 'success' :
                          taskData.status === 'In Progress' ? 'primary' : 'secondary';
    const priorityColor = taskData.priority === 'High' ? 'danger' :
                          taskData.priority === 'Medium' ? 'warning' : 'info';

    // Dependencies
    let dependenciesHtml = '';
    if (taskData.dependencies && taskData.dependencies.length > 0) {
        const depList = taskData.dependencies.map(dep => {
            const depType = dep.type || dep.dependency_type || 'finish_to_start';
            const label   = depType === 'finish_to_start' ? 'FS' :
                            depType === 'start_to_start'  ? 'SS' :
                            depType === 'finish_to_finish'? 'FF' : 'SF';
            const lag     = dep.lag_days || dep.lag || 0;
            const lagText = lag > 0 ? ` +${lag}d` : '';
            const predId  = dep.id || dep.predecessor_id;
            const pred    = allTasks.find(t => t.id === predId);
            return `${pred ? pred.title : 'Task ' + predId} (${label}${lagText})`;
        }).join(', ');
        dependenciesHtml = `<tr>
            <td class="fw-bold text-muted">Dependencies</td>
            <td>${depList}</td>
        </tr>`;
    }

    // Milestone
    let milestoneHtml = '';
    if (taskData.fixed_start || taskData.fixed_end) {
        const txt = taskData.fixed_start && taskData.fixed_end ? 'Fixed Start & End' :
                    taskData.fixed_start ? 'Fixed Start' : 'Fixed End';
        milestoneHtml = `<tr>
            <td class="fw-bold text-muted">Milestone</td>
            <td><i class="fas fa-lock text-warning me-1"></i>${txt}</td>
        </tr>`;
    }

    // Budget bar
    const spent   = taskData.actual_hours   || 0;
    const planned = taskData.estimated_hours || 0;
    const budgetHtml = planned > 0 ? (() => {
        const pct      = Math.round(spent / planned * 100);
        const over     = pct > 100;
        const barColor = over ? 'danger' : pct >= 80 ? 'warning' : 'success';
        return `<div class="d-flex align-items-center gap-2">
            <div class="progress flex-grow-1" style="height:10px;">
                <div class="progress-bar bg-${barColor}" style="width:${Math.min(pct,100)}%"></div>
            </div>
            <span style="min-width:38px;text-align:right;color:${over?'#dc3545':'inherit'};font-weight:${over?'600':'normal'}">${pct}%</span>
        </div>`;
    })() : '<span class="text-muted">—</span>';

    // Team table
    let teamHtml = '';
    if (taskData.assignments && taskData.assignments.length > 0) {
        const rows = taskData.assignments.map(a => {
            const mPct = a.allocated_hours > 0 ? Math.round((a.actual_hours||0) / a.allocated_hours * 100) : 0;
            const mOver = mPct > 100;
            return `<tr>
                <td style="padding:2px 4px 2px 0"><i class="fas fa-user me-1" style="color:#667eea"></i>${escapeHtml(a.name)}</td>
                <td style="padding:2px 4px;text-align:right">${a.allocated_hours}h</td>
                <td style="padding:2px 4px;text-align:right">${a.actual_hours||0}h</td>
                <td style="padding:2px 0 2px 4px;text-align:right;color:${mOver?'#dc3545':'inherit'};font-weight:${mOver?'600':'normal'}">${mPct}%</td>
            </tr>`;
        }).join('');
        teamHtml = `<tr>
            <td class="fw-bold text-muted" style="vertical-align:top">Team</td>
            <td><table style="width:100%;font-size:11px;border-collapse:collapse">
                <thead><tr style="color:#888;border-bottom:1px solid #eee">
                    <th style="padding:1px 4px 3px 0;font-weight:600">Member</th>
                    <th style="padding:1px 4px 3px 4px;font-weight:600;text-align:right">Planned</th>
                    <th style="padding:1px 4px 3px 4px;font-weight:600;text-align:right">Spent</th>
                    <th style="padding:1px 0 3px 4px;font-weight:600;text-align:right">Budget</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></td>
        </tr>`;
    } else if (taskData.assignee_name) {
        teamHtml = `<tr>
            <td class="fw-bold text-muted">Assigned To</td>
            <td><i class="fas fa-user me-1"></i>${escapeHtml(taskData.assignee_name)}</td>
        </tr>`;
    }

    const pct = taskData.progress || 0;

    return `<div class="gantt-popup" style="width:384px;max-width:384px;padding:12px;background:white;border:2px solid #667eea;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);color:#333;">
        <div class="d-flex justify-content-between align-items-start mb-2">
            <h6 class="mb-0" style="font-size:14px;font-weight:600;color:#333;word-break:break-word;white-space:normal;flex:1;margin-right:6px">${escapeHtml(taskData.title)}</h6>
            <div class="d-flex align-items-center gap-1">
                <span class="badge bg-${statusColor}" style="font-size:10px">${taskData.status}</span>
                <button onclick="document.getElementById('gantt-hover-popup').style.display='none'"
                    style="background:none;border:none;padding:0 2px;cursor:pointer;font-size:16px;line-height:1;color:#999" title="Close">&times;</button>
            </div>
        </div>
        <table class="table table-sm table-borderless mb-0" style="font-size:12px;color:#333">
            <tbody>
                <tr><td class="fw-bold text-muted" style="width:35%">Priority</td>
                    <td><span class="badge bg-${priorityColor}">${taskData.priority}</span></td></tr>
                <tr><td class="fw-bold text-muted">% Ready</td>
                    <td><div class="d-flex align-items-center gap-2">
                        <div class="progress flex-grow-1" style="height:12px">
                            <div class="progress-bar bg-${statusColor}" style="width:${pct}%"></div>
                        </div>
                        <span style="min-width:32px;text-align:right">${pct}%</span>
                    </div></td></tr>
                <tr><td class="fw-bold text-muted">Start Date</td>
                    <td><i class="far fa-calendar me-1"></i>${formatDutchDate(taskData.start_date)}</td></tr>
                <tr><td class="fw-bold text-muted">End Date</td>
                    <td><i class="far fa-calendar me-1"></i>${formatDutchDate(taskData.end_date)}</td></tr>
                <tr><td class="fw-bold text-muted">Duration</td>
                    <td>${countWorkingDaysJS(taskData.start_date, taskData.end_date)} werkdagen</td></tr>
                <tr><td class="fw-bold text-muted">Planned Hours</td>
                    <td><i class="far fa-clock me-1"></i>${planned}h</td></tr>
                <tr><td class="fw-bold text-muted">Spent Hours</td>
                    <td><i class="far fa-clock me-1"></i>${spent}h</td></tr>
                <tr><td class="fw-bold text-muted">Budget used</td>
                    <td>${budgetHtml}</td></tr>
                ${teamHtml}
                ${dependenciesHtml}
                ${milestoneHtml}
            </tbody>
        </table>
        <div class="text-center mt-2">
            <small class="text-muted" style="font-size:10px">Click to edit task</small>
        </div>
    </div>`;
}

// ── Hover popup — attached once to persistent #gantt-chart via delegation ──────
let _hoverPopupEnabled = false;
let _popupVisible = true;   // user toggle: show or hide popups

function togglePopup() {
    _popupVisible = !_popupVisible;
    const btn = document.querySelector('.btn-toggle-popup');
    if (btn) {
        btn.classList.toggle('btn-secondary',        _popupVisible);
        btn.classList.toggle('btn-outline-secondary', !_popupVisible);
    }
    // Hide any currently visible popup when disabling
    if (!_popupVisible) {
        const pw = document.getElementById('gantt-hover-popup');
        if (pw) pw.style.display = 'none';
    }
}

function enableHoverPopup() {
    if (_hoverPopupEnabled) return;
    _hoverPopupEnabled = true;

    // Single persistent popup div on <body>
    let pw = document.getElementById('gantt-hover-popup');
    if (!pw) {
        pw = document.createElement('div');
        pw.id = 'gantt-hover-popup';
        pw.style.cssText = 'position:fixed;z-index:99999;display:none;pointer-events:auto;';
        document.body.appendChild(pw);
    }

    const ganttEl = document.getElementById('gantt-chart');
    if (!ganttEl) return;

    let hideTimer   = null;
    let currentId   = null;

    function showPopup(wrapper) {
        if (!_popupVisible) return;
        const taskId   = parseInt(wrapper.getAttribute('data-task-id'));
        const taskData = allTasks.find(t => t.id === taskId);
        if (!taskData) return;

        clearTimeout(hideTimer);
        if (taskId === currentId && pw.style.display !== 'none') return;
        currentId = taskId;

        pw.innerHTML     = buildPopupHtml(taskData);
        pw.style.display = '';

        // Position: fully visible, below bar (or above if no room), not overlaying the bar
        const bar        = wrapper.querySelector('.bar');
        const svgEl      = document.getElementById('gantt-svg');
        if (bar && svgEl) {
            // getBoundingClientRect already accounts for scroll — do NOT subtract scrollLeft/scrollTop
            const svgRect = svgEl.getBoundingClientRect();
            const bx = parseFloat(bar.getAttribute('x'));
            const by = parseFloat(bar.getAttribute('y'));
            const bw = parseFloat(bar.getAttribute('width'));
            const bh = parseFloat(bar.getAttribute('height'));
            // Force layout so offsetWidth/offsetHeight reflect actual rendered size
            void pw.offsetWidth;
            const popW = pw.offsetWidth  || 384;
            const popH = pw.offsetHeight || 220;
            const M    = 12;
            // Bar viewport bounds
            const barTop    = svgRect.top  + by;
            const barBottom = barTop  + bh;
            const barLeft   = svgRect.left + bx;
            // Horizontal: center on bar, clamp within viewport
            let left = barLeft + bw / 2 - popW / 2;
            left = Math.max(M, Math.min(left, window.innerWidth - popW - M));
            // Vertical: prefer below bar; flip above if it would go off-screen
            let top = barBottom + M;
            if (top + popH > window.innerHeight - M) {
                top = barTop - popH - M;
            }
            // Clamp top so popup never leaves viewport from any edge
            top = Math.max(M, Math.min(top, window.innerHeight - popH - M));
            pw.style.left = left + 'px';
            pw.style.top  = top  + 'px';
        }
    }

    function scheduleHide() {
        hideTimer = setTimeout(() => { pw.style.display = 'none'; currentId = null; }, 150);
    }
    function cancelHide() { clearTimeout(hideTimer); }

    ganttEl.addEventListener('mouseover', e => {
        const wrapper = e.target.closest('.bar-wrapper');
        if (!wrapper) return;
        cancelHide();
        showPopup(wrapper);
    });
    ganttEl.addEventListener('mouseout', e => {
        const wrapper = e.target.closest('.bar-wrapper');
        if (!wrapper) return;
        if (e.relatedTarget && wrapper.contains(e.relatedTarget)) return;
        scheduleHide();
    });
    pw.addEventListener('mouseover', cancelHide);
    pw.addEventListener('mouseout',  e => {
        if (e.relatedTarget && pw.contains(e.relatedTarget)) return;
        scheduleHide();
    });
}

// Toggle weekend/holiday highlights
function toggleHighlights() {
    highlightsEnabled = !highlightsEnabled;
    console.log(`Highlights ${highlightsEnabled ? 'enabled' : 'disabled'}`);
    
    // Update button appearance
    const toggleBtn = document.querySelector('.btn-toggle-highlights');
    if (toggleBtn) {
        if (highlightsEnabled) {
            toggleBtn.classList.remove('btn-outline-secondary');
            toggleBtn.classList.add('btn-secondary');
        } else {
            toggleBtn.classList.remove('btn-secondary');
            toggleBtn.classList.add('btn-outline-secondary');
        }
    }
    
    // Reapply or remove highlights
    highlightNonWorkingDays();
}

function toggleWorkingDaysOnly() {
    workingDaysOnly = !workingDaysOnly;

    const btn = document.querySelector('.btn-toggle-workdays');
    if (btn) {
        btn.classList.toggle('btn-secondary',        workingDaysOnly);
        btn.classList.toggle('btn-outline-secondary', !workingDaysOnly);
    }

    highlightsEnabled = workingDaysOnly;

    if (workingDaysOnly && window.currentViewMode !== 'Day') {
        changeViewMode('Day');   // re-render in Day view with masks
    } else {
        highlightNonWorkingDays();   // redraw highlights in current view
    }
}

// Change Gantt view mode — re-renders the full chart
function changeViewMode(mode) {
    window.currentViewMode = mode;
    document.querySelectorAll('.view-mode-buttons .btn').forEach(b => {
        b.classList.toggle('active', b.textContent.trim() === mode);
    });
    if (allTasks.length > 0) renderGanttChart(allTasks, true);
}

// Fit all tasks in view — pick best zoom level then re-render
function viewAllTasks() {
    if (!allTasks.length) { showError('No tasks to display'); return; }

    let minStart = null, maxEnd = null;
    allTasks.forEach(t => {
        if (t.start_date) { const d = new Date(t.start_date); if (!minStart || d < minStart) minStart = d; }
        if (t.end_date)   { const d = new Date(t.end_date);   if (!maxEnd   || d > maxEnd  ) maxEnd   = d; }
    });
    if (!minStart || !maxEnd) { showError('No tasks with valid dates found'); return; }

    const days = Math.ceil((maxEnd - minStart) / 86400000);
    const best = days <= 60 ? 'Day' : days <= 200 ? 'Week' : 'Month';
    changeViewMode(best);   // re-renders and calls goToToday (preserveView=false path)
}

// Draw today vertical line in both body and header SVGs
function addTodayLine() {
    if (!ganttChart) return;
    document.querySelectorAll('.today-line').forEach(el => el.remove());

    const dayOff = Math.ceil((new Date() - ganttChart.gantt_start) / 86400000);
    if (dayOff < 0) return;
    const x = dayOff * ganttChart.pixPerDay;

    function mkTodayLine(svgEl, h) {
        if (!svgEl) return;
        const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        l.setAttribute('x1', x); l.setAttribute('y1', 0);
        l.setAttribute('x2', x); l.setAttribute('y2', h);
        l.setAttribute('class', 'today-line');
        l.setAttribute('stroke', '#ef4444');
        l.setAttribute('stroke-width', '2');
        l.setAttribute('stroke-dasharray', '6,4');
        l.setAttribute('opacity', '0.85');
        l.setAttribute('pointer-events', 'none');
        svgEl.appendChild(l);
    }

    mkTodayLine(document.getElementById('gantt-svg'),        ganttChart.tasks.length * ROW_H);
    mkTodayLine(document.getElementById('gantt-header-svg'), HEADER_H);
}

// Centre the chart on today's date
function goToToday() {
    if (!ganttChart) return;
    const bodyScroll = document.getElementById('gantt-body-scroll');
    if (!bodyScroll) return;
    const dayOff = Math.ceil((new Date() - ganttChart.gantt_start) / 86400000);
    const todayX = dayOff * ganttChart.pixPerDay;
    bodyScroll.scrollLeft = Math.max(0, todayX - bodyScroll.offsetWidth / 2);
}

// Modal functions for UI
function showAddTaskModal() {
    console.log('Showing Add Task Modal');
    
    // Reset form
    const form = document.getElementById('taskForm');
    if (form) {
        form.reset();
    }
    
    // Clear any existing data and initialize new task object
    currentEditingTask = {
        dependencies: []  // Initialize with empty dependencies array
    };
    
    // Set modal title
    document.getElementById('taskModalLabel').textContent = 'Add Activity';
    
    // Set current project ID if available
    if (currentProject) {
        document.getElementById('task-project-id').value = currentProject.id;
    }
    
    // Populate team member dropdown
    populateTeamMemberSelect();
    
    // Populate task group dropdown
    populateTaskGroupSelect();
    
    // Populate dependency dropdown
    populateDependencySelect();
    
    // Clear dependencies list
    document.getElementById('dependencies-list').innerHTML = '<p class="text-muted small">No dependencies</p>';

    // Reset assignments
    resetAssignments([]);
    
    // Reset progress slider
    document.getElementById('task-progress').value = 0;
    document.getElementById('task-progress-val').textContent = '0%';

    // Reset milestone checkboxes
    document.getElementById('task-fixed-start').checked = false;
    document.getElementById('task-fixed-end').checked = false;
    
    // Hide delete button for new task
    const deleteBtn = document.getElementById('delete-task-btn');
    if (deleteBtn) {
        deleteBtn.style.display = 'none';
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
}

function showEditTaskModal(taskId) {
    console.log('Showing Edit Task Modal for task:', taskId);
    
    const task = allTasks.find(t => t.id === taskId);
    if (!task) {
        showError('Task not found');
        return;
    }
    
    // Make a deep copy of the task to avoid modifying the original
    currentEditingTask = {
        ...task,
        dependencies: task.dependencies ? task.dependencies.map(dep => ({
            id: dep.id,
            predecessor_id: dep.predecessor_id || dep.id,
            dependency_type: dep.dependency_type || dep.type || 'finish_to_start',
            type: dep.type || dep.dependency_type || 'finish_to_start',
            lag: dep.lag_days || dep.lag || 0
        })) : []
    };
    
    console.log('Editing task (deep copy) with dependencies:', currentEditingTask.dependencies);
    
    // Set modal title
    document.getElementById('taskModalLabel').textContent = 'Edit Activity';
    
    // Populate form fields
    document.getElementById('task-id').value = task.id;
    document.getElementById('task-project-id').value = task.project_id;
    document.getElementById('task-title').value = task.title || '';
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-start-date').value = task.start_date || '';
    document.getElementById('task-end-date').value = task.end_date || '';
    // estimated hours shown as computed display — updated by renderAssignmentsList()
    document.getElementById('task-status').value = task.status || 'Pending';
    document.getElementById('task-priority').value = task.priority || 'Medium';
    const progress = Math.round(task.progress || 0);
    document.getElementById('task-progress').value = progress;
    document.getElementById('task-progress-val').textContent = progress + '%';
    
    // Set milestone checkboxes
    document.getElementById('task-fixed-start').checked = task.fixed_start || false;
    document.getElementById('task-fixed-end').checked = task.fixed_end || false;
    
    // Populate dropdowns
    populateTeamMemberSelect();
    populateTaskGroupSelect();
    populateDependencySelect();
    
    // Set selected values
    if (task.group_id) {
        document.getElementById('task-group').value = task.group_id;
    }
    
    // Load assignments
    resetAssignments(task.assignments || []);

    // Show dependencies
    displayTaskDependencies(task);
    
    // Show delete button for existing task
    const deleteBtn = document.getElementById('delete-task-btn');
    if (deleteBtn) {
        deleteBtn.style.display = 'inline-block';
    }
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('taskModal'));
    modal.show();
}

function populateTeamMemberSelect() {
    const select = document.getElementById('team-member-select');
    if (!select) return;
    
    select.innerHTML = '<option value="">Select team member...</option>';
    allTeamMembers.forEach(member => {
        const option = document.createElement('option');
        option.value = member.id;
        option.textContent = member.name;
        select.appendChild(option);
    });
}

/**
 * Returns tasks and groups in the same display order as the Gantt chart,
 * always fully expanded (collapse state ignored — suitable for dropdowns).
 * [{type:'group', group, depth}, {type:'task', task, indent}, ...]
 */
function buildOrderedItems(tasks, groups) {
    const items = [];
    const groupTaskMap = new Map();
    const ungrouped = [];

    for (const t of tasks) {
        if (t.group_id) {
            if (!groupTaskMap.has(t.group_id)) groupTaskMap.set(t.group_id, []);
            groupTaskMap.get(t.group_id).push(t);
        } else {
            ungrouped.push(t);
        }
    }
    for (const [, arr] of groupTaskMap) arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const rootGroups = groups
        .filter(g => !g.parent_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    function addGroup(group, depth) {
        items.push({ type: 'group', group, depth });
        const groupTasks = groupTaskMap.get(group.id) || [];
        for (const t of groupTasks) items.push({ type: 'task', task: t, indent: depth + 1 });
        const subs = groups
            .filter(g => g.parent_id === group.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        for (const sub of subs) addGroup(sub, depth + 1);
    }

    for (const g of rootGroups) addGroup(g, 0);

    ungrouped.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const t of ungrouped) items.push({ type: 'task', task: t, indent: 0 });

    return items;
}

function populateTaskGroupSelect() {
    const select = document.getElementById('task-group');
    if (!select) return;

    const current = select.value;
    select.innerHTML = '<option value="">No group</option>';

    // Walk groups in Gantt display order (depth-first)
    const rootGroups = allTaskGroups
        .filter(g => !g.parent_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    function addGroupOption(group, depth) {
        const opt = document.createElement('option');
        opt.value = group.id;
        opt.textContent = '\u00a0'.repeat(depth * 4) + (depth > 0 ? '└ ' : '') + group.name;
        opt.style.color = group.color;
        select.appendChild(opt);
        const subs = allTaskGroups
            .filter(g => g.parent_id === group.id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        for (const sub of subs) addGroupOption(sub, depth + 1);
    }

    for (const g of rootGroups) addGroupOption(g, 0);

    if (current) select.value = current;
}

function populateDependencySelect() {
    const select = document.getElementById('dependency-task-select');
    if (!select) return;

    select.innerHTML = '<option value="">Select predecessor task...</option>';

    const ordered = buildOrderedItems(allTasks, allTaskGroups);
    for (const item of ordered) {
        if (item.type === 'group') {
            const og = document.createElement('optgroup');
            og.label = '\u00a0'.repeat((item.depth || 0) * 4) + item.group.name;
            select.appendChild(og);
        } else {
            const task = item.task;
            if (currentEditingTask && task.id === currentEditingTask.id) continue;
            const opt = document.createElement('option');
            opt.value = task.id;
            const pad = '\u00a0'.repeat((item.indent || 0) * 4);
            opt.textContent = `${pad}${task.title}${task.start_date ? ' (' + task.start_date + ')' : ''}`;
            select.appendChild(opt);
        }
    }
}

function displayTaskDependencies(task) {
    const dependenciesList = document.getElementById('dependencies-list');
    if (!dependenciesList) return;
    
    dependenciesList.innerHTML = '';
    
    // Get dependencies from the task data
    const dependencies = task.dependencies || [];
    
    console.log('Displaying dependencies for task:', task.title || task.id);
    console.log('Dependencies data:', dependencies);
    
    if (dependencies.length === 0) {
        dependenciesList.innerHTML = '<p class="text-muted small">No dependencies</p>';
        return;
    }
    
    dependencies.forEach((dep, index) => {
        const predecessorId = dep.id || dep.predecessor_id;
        const depTask = allTasks.find(t => t.id === predecessorId);
        const depType = dep.type || dep.dependency_type || 'finish_to_start';
        const lag = dep.lag_days || dep.lag || 0;
        const lagOnly = dep.maintain_lag_only !== undefined ? dep.maintain_lag_only : true;
        const checkId = `dep-lag-only-${predecessorId}`;
        const depElement = document.createElement('div');
        depElement.className = 'alert alert-info alert-dismissible fade show py-2 pe-5';
        depElement.innerHTML = `
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                <small>
                    <strong>${depTask ? depTask.title : 'Unknown Task'}</strong>
                    (${depType})${lag > 0 ? ` +${lag}d` : ''}
                </small>
                <div class="form-check form-check-inline mb-0 me-4">
                    <input class="form-check-input" type="checkbox" id="${checkId}" ${lagOnly ? 'checked' : ''}>
                    <label class="form-check-label small" for="${checkId}" title="Checked: successor only moves when lag constraint is violated&#10;Unchecked: successor always moves with this predecessor (tight coupling)">
                        <i class="fas fa-link text-info me-1"></i>Min lag only
                    </label>
                </div>
            </div>
            <button type="button" class="btn-close btn-sm" onclick="removeDependency(${predecessorId})" style="font-size: 0.7rem;"></button>
        `;
        dependenciesList.appendChild(depElement);

        // Wire the checkbox to update the dep object in currentEditingTask
        document.getElementById(checkId).addEventListener('change', function() {
            const d = currentEditingTask.dependencies.find(x => (x.id || x.predecessor_id) === predecessorId);
            if (d) d.maintain_lag_only = this.checked;
        });

        console.log(`Displayed dependency ${index + 1}: ${depTask ? depTask.title : 'Unknown'} (ID: ${predecessorId}, Type: ${depType}, Lag: ${lag}, LagOnly: ${lagOnly})`);
    });
}

function addDependency() {
    const taskSelect = document.getElementById('dependency-task-select');
    const typeSelect = document.getElementById('dependency-type-select');
    const lagInput = document.getElementById('dependency-lag');
    
    if (!taskSelect || !typeSelect) return;
    
    const predecessorId = parseInt(taskSelect.value);
    const dependencyType = typeSelect.value;
    const lag = parseInt(lagInput.value) || 0;
    
    if (!predecessorId) {
        showError('Please select a predecessor task');
        return;
    }
    
    // Check for circular dependencies and validate current task
    if (currentEditingTask && predecessorId === currentEditingTask.id) {
        showError('A task cannot depend on itself');
        return;
    }
    
    // Initialize dependencies array if it doesn't exist
    if (!currentEditingTask.dependencies) {
        currentEditingTask.dependencies = [];
    }
    
    // Check if dependency already exists
    const exists = currentEditingTask.dependencies.find(dep => 
        (dep.id === predecessorId || dep.predecessor_id === predecessorId)
    );
    
    if (exists) {
        showError('This dependency already exists');
        return;
    }
    
    // Validate that adding this dependency wouldn't create circular dependencies
    const predecessorTask = allTasks.find(t => t.id === predecessorId);
    if (predecessorTask && predecessorTask.dependencies) {
        const wouldCreateCircular = checkForCircularDependency(currentEditingTask.id, predecessorId, allTasks);
        if (wouldCreateCircular) {
            showError('This dependency would create a circular dependency chain');
            return;
        }
    }
    
    // Add new dependency
    const newDependency = {
        id: predecessorId,
        predecessor_id: predecessorId,
        dependency_type: dependencyType,
        type: dependencyType,
        lag: lag,
        maintain_lag_only: true  // default; user can toggle via checkbox in the list
    };
    
    currentEditingTask.dependencies.push(newDependency);
    
    console.log('Dependency added to editing task:', newDependency);
    console.log('Current dependencies:', currentEditingTask.dependencies);
    
    // Refresh the display
    displayTaskDependencies(currentEditingTask);
    
    // Reset form
    taskSelect.value = '';
    typeSelect.value = 'finish_to_start';
    lagInput.value = '0';
    
    showSuccess('Dependency added to task (click Save to persist changes)');
}

function removeDependency(predecessorId) {
    if (!currentEditingTask || !currentEditingTask.dependencies) return;
    
    // Find the dependency being removed for logging
    const removedDep = currentEditingTask.dependencies.find(dep => 
        (dep.id === predecessorId || dep.predecessor_id === predecessorId)
    );
    
    if (!removedDep) {
        showError('Dependency not found');
        return;
    }
    
    // Remove from temporary list
    currentEditingTask.dependencies = currentEditingTask.dependencies.filter(dep => 
        dep.id !== predecessorId && dep.predecessor_id !== predecessorId
    );
    
    console.log('Dependency removed from editing task:', removedDep);
    console.log('Remaining dependencies:', currentEditingTask.dependencies);
    
    // Refresh the display
    displayTaskDependencies(currentEditingTask);
    
    // Show warning that changes need to be saved
    showSuccess('Dependency removed from task (click Save to persist changes)');
}

// ── Team-member assignment UI ─────────────────────────────────────────────────

function resetAssignments(existingAssignments) {
    currentTaskAssignments = (existingAssignments || []).map(a => ({
        member_id: a.member_id,
        name: a.name,
        planned: a.allocated_hours || 0,
        spent: a.actual_hours || 0
    }));
    renderAssignmentsList();
}

function renderAssignmentsList() {
    // Update the computed "Total Planned Hours" display
    const totalEl = document.getElementById('task-estimated-hours-val');
    if (totalEl) {
        const total = currentTaskAssignments.reduce((s, a) => s + (a.planned || 0), 0);
        totalEl.textContent = total % 1 === 0 ? total : total.toFixed(1);
    }

    const container = document.getElementById('assigned-members-list');
    if (!container) return;
    if (currentTaskAssignments.length === 0) {
        container.innerHTML = '<span class="text-muted">No team members assigned.</span>';
        return;
    }
    container.innerHTML = `
        <table class="table table-sm mb-0">
            <thead><tr>
                <th>Member</th>
                <th class="text-end">Planned hrs</th>
                <th class="text-end">Spent hrs</th>
                <th></th>
            </tr></thead>
            <tbody>
                ${currentTaskAssignments.map((a, i) => `
                    <tr>
                        <td>${escapeHtml(a.name)}</td>
                        <td class="text-end">
                            <input type="number" class="form-control form-control-sm text-end"
                                style="width:80px;display:inline-block;"
                                value="${a.planned}" min="0" step="0.5"
                                onchange="updateAssignment(${i},'planned',this.value)">
                        </td>
                        <td class="text-end">
                            <input type="number" class="form-control form-control-sm text-end"
                                style="width:80px;display:inline-block;"
                                value="${a.spent}" min="0" step="0.5"
                                onchange="updateAssignment(${i},'spent',this.value)">
                        </td>
                        <td>
                            <button type="button" class="btn btn-sm btn-outline-danger" onclick="removeAssignment(${i})">
                                <i class="fas fa-times"></i>
                            </button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function updateAssignment(index, field, value) {
    if (currentTaskAssignments[index]) {
        currentTaskAssignments[index][field] = parseFloat(value) || 0;
        // Refresh total display
        const totalEl = document.getElementById('task-estimated-hours-val');
        if (totalEl) {
            const total = currentTaskAssignments.reduce((s, a) => s + (a.planned || 0), 0);
            totalEl.textContent = total % 1 === 0 ? total : total.toFixed(1);
        }
    }
}

function removeAssignment(index) {
    currentTaskAssignments.splice(index, 1);
    renderAssignmentsList();
}

function addMemberAssignment() {
    const sel = document.getElementById('team-member-select');
    const memberId = parseInt(sel.value);
    if (!memberId) { showError('Select a team member first.'); return; }

    const planned = parseFloat(document.getElementById('member-planned-hours').value) || 0;
    const spent   = parseFloat(document.getElementById('member-spent-hours').value)   || 0;

    if (currentTaskAssignments.find(a => a.member_id === memberId)) {
        showError('This team member is already assigned to this task.');
        return;
    }

    const member = allTeamMembers.find(m => m.id === memberId);
    currentTaskAssignments.push({
        member_id: memberId,
        name: member ? member.name : `Member ${memberId}`,
        planned,
        spent
    });

    // Reset inputs
    sel.value = '';
    document.getElementById('member-planned-hours').value = '';
    document.getElementById('member-spent-hours').value   = '';

    renderAssignmentsList();
}

// ── Budget modal ───────────────────────────────────────────────────────────────

async function showBudgetModal() {
    if (!currentProject) { showError('Select a project first.'); return; }
    try {
        const resp = await fetch(`/api/projects/${currentProject.id}/budget`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();

        document.getElementById('budget-project-name').textContent = data.project_name;

        // Summary cards
        const t = data.totals;
        const budgetPct = data.budget > 0 ? Math.min(100, (t.allocated_cost / data.budget * 100)).toFixed(1) : null;
        document.getElementById('budget-summary-top').innerHTML = `
            <div class="col-md-3">
                <div class="card text-center border-0 bg-light">
                    <div class="card-body py-2">
                        <div class="small text-muted">Project Budget</div>
                        <div class="fs-5 fw-bold">€${fmt(data.budget)}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center border-0 bg-light">
                    <div class="card-body py-2">
                        <div class="small text-muted">Planned Cost</div>
                        <div class="fs-5 fw-bold text-primary">€${fmt(t.allocated_cost)}</div>
                        ${budgetPct !== null ? `<div class="small text-muted">${budgetPct}% of budget</div>` : ''}
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center border-0 bg-light">
                    <div class="card-body py-2">
                        <div class="small text-muted">Spent Cost</div>
                        <div class="fs-5 fw-bold text-warning">€${fmt(t.actual_cost)}</div>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card text-center border-0 bg-light">
                    <div class="card-body py-2">
                        <div class="small text-muted">Hours (planned / spent)</div>
                        <div class="fs-5 fw-bold">${t.allocated_hours}h / ${t.actual_hours}h</div>
                    </div>
                </div>
            </div>
        `;

        const tbody = document.getElementById('budget-table-body');
        const empty = document.getElementById('budget-empty');
        if (data.members.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = '';
        } else {
            empty.style.display = 'none';
            tbody.innerHTML = data.members.map(m => {
                const remaining = m.allocated_hours - m.actual_hours;
                const overrun = remaining < 0;
                return `<tr>
                    <td>${escapeHtml(m.name)}</td>
                    <td>${escapeHtml(m.role)}</td>
                    <td class="text-end">€${fmt(m.hourly_rate)}</td>
                    <td class="text-end">${m.allocated_hours}h</td>
                    <td class="text-end">${m.actual_hours}h</td>
                    <td class="text-end ${overrun ? 'text-danger fw-bold' : ''}">${remaining.toFixed(1)}h${overrun ? ' ⚠' : ''}</td>
                    <td class="text-end">€${fmt(m.allocated_cost)}</td>
                    <td class="text-end">€${fmt(m.actual_cost)}</td>
                </tr>`;
            }).join('');

            document.getElementById('budget-table-foot').innerHTML = `
                <tr>
                    <td colspan="3">Total</td>
                    <td class="text-end">${t.allocated_hours}h</td>
                    <td class="text-end">${t.actual_hours}h</td>
                    <td class="text-end">${(t.allocated_hours - t.actual_hours).toFixed(1)}h</td>
                    <td class="text-end">€${fmt(t.allocated_cost)}</td>
                    <td class="text-end">€${fmt(t.actual_cost)}</td>
                </tr>`;
        }

        new bootstrap.Modal(document.getElementById('budgetModal')).show();
    } catch (err) {
        showError('Failed to load budget: ' + err.message);
    }
}

function fmt(n) {
    return (n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}

/**
 * Given a task (with .dependencies, .start_date, .end_date), return the
 * earliest Date its start must be to satisfy every predecessor, or null
 * if no adjustment is needed.
 */
function computeEarliestStart(task) {
    if (!task.dependencies || task.dependencies.length === 0) return null;

    function wd(from, n) {
        const d = new Date(from);
        let a = 0;
        while (a < n) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) a++; }
        return d;
    }

    const dur = Math.max(1, Math.ceil(
        (new Date(task.end_date) - new Date(task.start_date)) / 86400000
    ));
    let latest = null;

    for (const dep of task.dependencies) {
        const predId = dep.id || dep.predecessor_id;
        const pred   = allTasks.find(t => t.id === predId);
        if (!pred || !pred.start_date || !pred.end_date) continue;
        const lag  = dep.lag || dep.lag_days || 0;
        const type = dep.type || dep.dependency_type || 'finish_to_start';
        let minStart = null;

        if (type === 'finish_to_start') {
            minStart = wd(new Date(pred.end_date), lag + 1);
        } else if (type === 'start_to_start') {
            minStart = wd(new Date(pred.start_date), lag);
        } else if (type === 'finish_to_finish') {
            const minEnd = wd(new Date(pred.end_date), lag);
            minStart = new Date(minEnd); minStart.setDate(minStart.getDate() - dur + 1);
        } else if (type === 'start_to_finish') {
            const minEnd = wd(new Date(pred.start_date), lag);
            minStart = new Date(minEnd); minStart.setDate(minStart.getDate() - dur + 1);
        }

        if (minStart && (!latest || minStart > latest)) latest = minStart;
    }
    return latest;
}

async function saveTask() {
    try {
        console.log('Saving task...');
        
        // Get form data
        const taskData = {
            title: document.getElementById('task-title').value,
            description: document.getElementById('task-description').value,
            start_date: formatDateForAPI(document.getElementById('task-start-date').value),
            end_date: formatDateForAPI(document.getElementById('task-end-date').value),
            estimated_hours: currentTaskAssignments.reduce((s, a) => s + (a.planned || 0), 0),
            status: document.getElementById('task-status').value,
            priority: document.getElementById('task-priority').value,
            progress: parseInt(document.getElementById('task-progress').value) || 0,
            assigned_to: currentTaskAssignments.length > 0 ? currentTaskAssignments[0].member_id : (document.getElementById('team-member-select').value || null),
            group_id: document.getElementById('task-group').value || null,
            assignments: currentTaskAssignments.map(a => ({
                member_id: a.member_id,
                allocated_hours: a.planned,
                actual_hours: a.spent,
                hours_per_week: 0,
                weeks_allocated: 0
            })),
            fixed_start: document.getElementById('task-fixed-start').checked,
            fixed_end: document.getElementById('task-fixed-end').checked
        };
        
        // Add dependencies - always include them, whether editing or creating
        if (currentEditingTask && currentEditingTask.dependencies) {
            taskData.dependencies = currentEditingTask.dependencies.map(dep => ({
                predecessor_id: dep.id || dep.predecessor_id,
                dependency_type: dep.type || dep.dependency_type || 'finish_to_start',
                lag: dep.lag_days || dep.lag || 0,
                maintain_lag_only: dep.maintain_lag_only !== undefined ? dep.maintain_lag_only : true
            }));
            
            console.log('Saving task with dependencies:', taskData.dependencies);
        } else {
            // For new tasks, initialize empty dependencies array
            taskData.dependencies = [];
        }
        
        // Validation
        if (!taskData.title) {
            showError('Task title is required');
            return;
        }
        
        if (!taskData.start_date || !taskData.end_date) {
            showError('Start date and end date are required');
            return;
        }
        
        if (new Date(taskData.start_date) > new Date(taskData.end_date)) {
            showError('Start date must be before end date');
            return;
        }
        
        let response;
        if (currentEditingTask && currentEditingTask.id) {
            // Update existing task
            console.log('Updating task:', currentEditingTask.id);
            response = await fetch(`/api/tasks/${currentEditingTask.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
        } else {
            // Create new task
            console.log('Creating new task for project:', currentProject.id);
            taskData.project_id = currentProject.id;
            response = await fetch('/api/tasks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskData)
            });
        }
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            const isUpdate = currentEditingTask && currentEditingTask.id;
            console.log('Task saved successfully. Response:', result);
            
            // COMPREHENSIVE CASCADING: After saving, validate and cascade dependencies
            if (isUpdate && result.task) {
                console.log('🔄 Triggering comprehensive cascading validation after save...');
                
                // Reload tasks first to get the updated data
                await loadProjectTasks(currentProject.id, true);
                
                // Find the updated task
                const savedTask = allTasks.find(t => t.id === (currentEditingTask.id || result.task.id));
                
                if (savedTask) {
                    // Check if dates changed or dependencies were modified
                    const originalTask = currentEditingTask;
                    const datesChanged = originalTask.start_date !== savedTask.start_date ||
                                       originalTask.end_date !== savedTask.end_date;
                    const dependenciesChanged = JSON.stringify(originalTask.dependencies) !==
                                               JSON.stringify(savedTask.dependencies);

                    console.log(`   Dates changed: ${datesChanged}`);
                    console.log(`   Dependencies changed: ${dependenciesChanged}`);

                    if (datesChanged || dependenciesChanged) {
                        console.log('   Running cascading validation...');

                        // When a dependency was added/changed (without an explicit date move),
                        // push THIS task forward to satisfy its new predecessors — don't touch them.
                        let cascadeStartDate = savedTask.start_date;
                        let cascadeEndDate   = savedTask.end_date;

                        if (dependenciesChanged && !datesChanged) {
                            const requiredStart = computeEarliestStart(savedTask);
                            if (requiredStart && requiredStart > new Date(savedTask.start_date)) {
                                const dur = Math.max(1, Math.ceil(
                                    (new Date(savedTask.end_date) - new Date(savedTask.start_date)) / 86400000
                                ));
                                const newEnd = new Date(requiredStart);
                                newEnd.setDate(newEnd.getDate() + dur - 1);
                                cascadeStartDate = formatDateForAPI(requiredStart);
                                cascadeEndDate   = formatDateForAPI(newEnd);
                                console.log(`   ↪ Pushing saved task to ${cascadeStartDate} → ${cascadeEndDate} to satisfy new predecessor`);
                            }
                        }

                        // First, validate all tasks with the new dates
                        const violations = validateAllTaskDependencies();

                        if (violations.length > 0) {
                            console.warn('   ⚠️  Found dependency violations after save:', violations);

                            // Try to auto-fix by cascading
                            const cascadeResult = applyCascadingDependencyChanges(
                                savedTask.id,
                                cascadeStartDate,
                                cascadeEndDate
                            );
                            
                            if (cascadeResult.success && cascadeResult.updates.length >= 1) {
                                const otherCount = cascadeResult.updates.length - 1;
                                console.log(`   ✓ Auto-fixing ${cascadeResult.updates.length} task(s)...`);

                                // Apply cascaded updates via batch API
                                const batchResponse = await fetch('/api/tasks/batch-update', {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        tasks: cascadeResult.updates.map(u => ({
                                            id: u.task_id,
                                            start_date: u.start_date,
                                            end_date: u.end_date
                                        }))
                                    })
                                });

                                const batchData = await batchResponse.json();

                                if (batchData.success) {
                                    showSuccess(otherCount > 0
                                        ? `Task rescheduled and ${otherCount} related task${otherCount !== 1 ? 's' : ''} updated`
                                        : 'Task rescheduled to satisfy new dependency');
                                    await loadProjectTasks(currentProject.id, true);
                                } else {
                                    showError('Task saved but failed to update related tasks');
                                    await loadProjectTasks(currentProject.id, true);
                                }
                            } else {
                                showSuccess('Task updated successfully');
                            }
                        } else {
                            console.log('   ✓ No violations found - all dependencies valid');
                            showSuccess(isUpdate ? 'Task updated successfully' : 'Task created successfully');
                        }
                    } else {
                        console.log('   ⏭️  No date or dependency changes - skipping cascade');
                        showSuccess(isUpdate ? 'Task updated successfully' : 'Task created successfully');
                    }
                } else {
                    console.warn('   Could not find saved task in allTasks array');
                    showSuccess(isUpdate ? 'Task updated successfully' : 'Task created successfully');
                }
            } else {
                // New task creation - just show success
                showSuccess('Task created successfully');
                await loadProjectTasks(currentProject.id, true);
            }
            
            // Single render after all async work — preserves the user's scroll position
            renderGanttChart(allTasks, true);

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('taskModal'));
            if (modal) {
                modal.hide();
            }
            
        } else {
            console.error('Failed to save task. Response:', result);
            throw new Error(result.message || 'Failed to save task');
        }
        
    } catch (error) {
        console.error('Error saving task:', error);
        showError('Failed to save task: ' + error.message);
    }
}

async function deleteTask(taskId) {
    if (!confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
        return;
    }
    
    try {
        console.log('Deleting task:', taskId);
        
        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (response.ok && result.success) {
            showSuccess('Task deleted successfully');
            
            // Close modal if open
            const modal = bootstrap.Modal.getInstance(document.getElementById('taskModal'));
            if (modal) {
                modal.hide();
            }
            
            // Reload project tasks to refresh the chart
            await loadProjectTasks(currentProject.id);
            renderGanttChart(allTasks, true); // Preserve view after deletion
            
        } else {
            throw new Error(result.message || 'Failed to delete task');
        }
        
    } catch (error) {
        console.error('Error deleting task:', error);
        showError('Failed to delete task: ' + error.message);
    }
}

function _resetGroupForm() {
    document.getElementById('group-editing-id').value = '';
    document.getElementById('group-name').value = '';
    document.getElementById('group-description').value = '';
    document.getElementById('group-color').value = '#667eea';
    document.querySelectorAll('.color-option').forEach(el => el.classList.remove('selected'));
    const first = document.querySelector('.color-option[data-color="#667eea"]');
    if (first) first.classList.add('selected');
    document.getElementById('group-form-title').textContent = 'Add New Group';
    document.getElementById('add-group-btn').innerHTML = '<i class="fas fa-plus me-1"></i> Add Group';
    document.getElementById('cancel-edit-group-btn').classList.add('d-none');
    document.getElementById('group-parent').disabled = false;
}

function _refreshGroupParentSelect(excludeId = null) {
    const parentSel = document.getElementById('group-parent');
    const current = parentSel.value;
    parentSel.innerHTML = '<option value="">None (Root Group)</option>';
    allTaskGroups.forEach(g => {
        if (g.id === excludeId) return;
        const opt = document.createElement('option');
        opt.value = g.id; opt.textContent = g.name;
        parentSel.appendChild(opt);
    });
    if (current) parentSel.value = current;
}

async function showManageGroupsModal() {
    if (!currentProject) { showError('Select a project first.'); return; }

    _resetGroupForm();
    _refreshGroupParentSelect();

    // Color picker interaction
    document.querySelectorAll('.color-option').forEach(el => {
        el.onclick = () => {
            document.querySelectorAll('.color-option').forEach(x => x.classList.remove('selected'));
            el.classList.add('selected');
            document.getElementById('group-color').value = el.dataset.color;
        };
    });

    // Cancel edit
    document.getElementById('cancel-edit-group-btn').onclick = _resetGroupForm;

    // Add / Save button
    document.getElementById('add-group-btn').onclick = async () => {
        const name     = document.getElementById('group-name').value.trim();
        if (!name) { showError('Group name is required.'); return; }
        const color    = document.getElementById('group-color').value || '#667eea';
        const desc     = document.getElementById('group-description').value;
        const editId   = document.getElementById('group-editing-id').value;

        try {
            if (editId) {
                // ── Update existing group ─────────────────────────────────
                const resp = await fetch(`/api/task-groups/${editId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, color, description: desc })
                });
                const data = await resp.json();
                if (!data.success) throw new Error(data.message || 'Failed');
                showSuccess(`Group "${name}" updated`);
            } else {
                // ── Create new group ──────────────────────────────────────
                const parentId = document.getElementById('group-parent').value || null;
                const resp = await fetch(`/api/projects/${currentProject.id}/task-groups`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, color, description: desc,
                        parent_group_id: parentId ? parseInt(parentId) : null,
                        sort_order: allTaskGroups.length * 10 })
                });
                const data = await resp.json();
                if (!data.success) throw new Error(data.message || 'Failed');
                showSuccess(`Group "${name}" created`);
            }

            await loadTaskGroups(currentProject.id);
            _resetGroupForm();
            _refreshGroupParentSelect();
            renderGroupsList();
            populateTaskGroupSelect();
            renderGanttChart(allTasks, true);
        } catch (err) {
            showError(`Failed to ${editId ? 'update' : 'create'} group: ` + err.message);
        }
    };

    renderGroupsList();
    new bootstrap.Modal(document.getElementById('groupsModal')).show();
}

function renderGroupsList() {
    const container = document.getElementById('groups-list');
    if (!container) return;

    if (allTaskGroups.length === 0) {
        container.innerHTML = '<p class="text-muted">No groups yet. Create one above!</p>';
        return;
    }

    container.innerHTML = '';
    allTaskGroups.forEach(g => {
        const taskCount = allTasks.filter(t => t.group_id === g.id).length;
        const item = document.createElement('div');
        item.className = 'group-item' + (g.parent_id ? ' subgroup' : '');
        item.draggable = true;
        item.dataset.groupId = g.id;
        item.style.borderLeftColor = g.color;

        item.innerHTML = `
            <div class="group-item-content">
                <div class="d-flex align-items-center gap-2">
                    <span class="group-grip" title="Drag to reorder">⠿</span>
                    <span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${g.color};flex-shrink:0"></span>
                    <strong>${escapeHtml(g.name)}</strong>
                    <span class="badge bg-secondary" style="font-size:9px">${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
                    ${g.parent_id ? `<span class="badge bg-light text-muted" style="font-size:9px">subgroup</span>` : ''}
                </div>
            </div>
            <div class="group-item-actions ms-auto">
                <button class="btn btn-sm btn-outline-primary" title="Edit group" data-edit-group-id="${g.id}">
                    <i class="fas fa-pencil-alt"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" title="Delete group" data-del-group-id="${g.id}">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;

        item.querySelector('[data-edit-group-id]').addEventListener('click', () => {
            document.getElementById('group-editing-id').value = g.id;
            document.getElementById('group-name').value = g.name;
            document.getElementById('group-description').value = g.description || '';
            document.getElementById('group-color').value = g.color;
            document.querySelectorAll('.color-option').forEach(el => {
                el.classList.toggle('selected', el.dataset.color === g.color);
            });
            document.getElementById('group-form-title').textContent = `Edit Group — ${escapeHtml(g.name)}`;
            document.getElementById('add-group-btn').innerHTML = '<i class="fas fa-save me-1"></i> Save Changes';
            document.getElementById('cancel-edit-group-btn').classList.remove('d-none');
            document.getElementById('group-parent').disabled = true; // can't reparent via edit
            document.getElementById('groupForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });

        item.querySelector('[data-del-group-id]').addEventListener('click', async () => {
            if (!confirm(`Delete group "${g.name}"? Tasks will be ungrouped.`)) return;
            try {
                const resp = await fetch(`/api/task-groups/${g.id}`, { method: 'DELETE' });
                const data = await resp.json();
                if (!data.success) throw new Error(data.message || 'Failed');
                showSuccess(`Group "${g.name}" deleted`);
                await loadTaskGroups(currentProject.id);
                allTasks.forEach(t => {
                    if (t.group_id === g.id) {
                        t.group_id = null; t.group_color = null; t.group_name = null;
                    }
                });
                renderGroupsList();
                populateTaskGroupSelect();
                renderGanttChart(allTasks, true);
            } catch (err) {
                showError('Failed to delete group: ' + err.message);
            }
        });

        // ── Drag-and-drop reordering ──────────────────────────────────
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain', String(g.id));
            e.dataTransfer.effectAllowed = 'move';
            _dragSourceGroupId = g.id;
            requestAnimationFrame(() => item.classList.add('group-item-dragging'));
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('group-item-dragging');
            _dragSourceGroupId = null;
            container.querySelectorAll('.group-item-drag-over').forEach(el =>
                el.classList.remove('group-item-drag-over'));
        });
        item.addEventListener('dragover', e => {
            if (_dragSourceGroupId == null || _dragSourceGroupId === g.id) return;
            const src = allTaskGroups.find(x => x.id === _dragSourceGroupId);
            if (!src || src.parent_id !== g.parent_id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('group-item-drag-over');
        });
        item.addEventListener('dragleave', () =>
            item.classList.remove('group-item-drag-over'));
        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('group-item-drag-over');
            if (_dragSourceGroupId != null && _dragSourceGroupId !== g.id) {
                reorderGroup(_dragSourceGroupId, g.id);
            }
        });

        container.appendChild(item);
    });
}

// Utility functions
function showLoading(show) {
    const spinner = document.querySelector('.loading-spinner');
    if (spinner) {
        if (show) {
            spinner.classList.remove('d-none');
        } else {
            spinner.classList.add('d-none');
        }
    }
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

// Check for circular dependencies
function checkForCircularDependency(taskId, potentialPredecessorId, allTasks, visited = new Set()) {
    // If we've already visited this task, we found a cycle
    if (visited.has(taskId)) {
        return true;
    }
    
    // If we reached the potential predecessor, we found a cycle
    if (taskId === potentialPredecessorId) {
        return true;
    }
    
    visited.add(taskId);
    
    // Find the task
    const task = allTasks.find(t => t.id === taskId);
    if (!task || !task.dependencies) {
        visited.delete(taskId);
        return false;
    }
    
    // Check all of this task's dependencies
    for (const dep of task.dependencies) {
        const depId = dep.id || dep.predecessor_id;
        if (checkForCircularDependency(depId, potentialPredecessorId, allTasks, visited)) {
            return true;
        }
    }
    
    visited.delete(taskId);
    return false;
}

// Show detailed dependency violation information
function showDependencyViolationModal(violations) {
    // Create modal HTML if it doesn't exist
    let modal = document.getElementById('dependency-violation-modal');
    if (!modal) {
        const modalHtml = `
            <div class="modal fade" id="dependency-violation-modal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header bg-danger text-white">
                            <h5 class="modal-title">
                                <i class="fas fa-exclamation-triangle me-2"></i>
                                Dependency Conflicts
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <p><strong>The following dependency conflicts prevent this move:</strong></p>
                            <div id="violation-list"></div>
                            <div class="alert alert-info mt-3">
                                <h6><i class="fas fa-lightbulb me-1"></i> Suggestions:</h6>
                                <ul class="mb-0">
                                    <li>Move dependent tasks to later dates</li>
                                    <li>Adjust the lag time on dependencies</li>
                                    <li>Change the dependency type if appropriate</li>
                                    <li>Remove conflicting dependencies if they're no longer needed</li>
                                </ul>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('dependency-violation-modal');
    }
    
    // Populate violation list
    const violationList = document.getElementById('violation-list');
    if (violationList && violations.length > 0) {
        violationList.innerHTML = violations.map((violation, index) => `
            <div class="alert alert-warning">
                <div class="d-flex align-items-start">
                    <i class="fas fa-link text-warning me-2 mt-1"></i>
                    <div>
                        <strong>Conflict ${index + 1}:</strong> ${violation.message}
                        <br><small class="text-muted">
                            Dependency type: <strong>${violation.type}</strong> | 
                            Required: <strong>${violation.required}</strong> | 
                            Actual: <strong>${violation.actual}</strong>
                        </small>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // Show modal — reuse existing instance to avoid duplicate backdrops
    const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
    bsModal.show();
}

// Check if moving a task would violate its own dependencies
function checkTaskDependencyViolations(taskId, newStartDate, newEndDate, changedField = 'both') {
    const task = allTasks.find(t => t.id === taskId);
    if (!task) {
        return [];
    }
    
    const violations = [];
    const newStart = new Date(newStartDate);
    const newEnd = new Date(newEndDate);
    const originalStart = new Date(task.start_date);
    const originalEnd = new Date(task.end_date);
    
    // Determine what changed if not explicitly specified
    if (changedField === 'both') {
        const startChanged = newStart.getTime() !== originalStart.getTime();
        const endChanged = newEnd.getTime() !== originalEnd.getTime();
        if (startChanged && !endChanged) {
            changedField = 'start';
        } else if (endChanged && !startChanged) {
            changedField = 'end';
        }
    }
    
    console.log(`\n🔍 CHECKING VIOLATIONS FOR TASK ${taskId}: "${task.title}"`);
    console.log(`   New dates: ${newStartDate} → ${newEndDate}`);
    console.log(`   Task dependencies array:`, task.dependencies);
    
    // 1. Check PREDECESSOR constraints (tasks this task depends on)
    if (task.dependencies && task.dependencies.length > 0) {
        console.log(`   Checking ${task.dependencies.length} predecessor(s)...`);
        
        for (const dep of task.dependencies) {
            console.log(`   → RAW dependency object:`, dep);
            const predecessorId = dep.id || dep.predecessor_id;
            const predecessor = allTasks.find(t => t.id === predecessorId);
            
            if (!predecessor) {
                console.warn(`   → Predecessor ${predecessorId} not found!`);
                continue;
            }
            
            const predStart = new Date(predecessor.start_date);
            const predEnd = new Date(predecessor.end_date);
            const depType = dep.type || dep.dependency_type || 'finish_to_start';
            const lag = dep.lag_days || dep.lag || 0;
            
            console.log(`   → Predecessor ${predecessorId} "${predecessor.title}"`);
            console.log(`      Type: ${depType} (raw type: "${dep.type}", dependency_type: "${dep.dependency_type}")`);
            console.log(`      Lag: ${lag} days (lag_days: ${dep.lag_days}, lag: ${dep.lag})`);
            console.log(`      Dates: ${predecessor.start_date} to ${predecessor.end_date}`);
            
            let violation = null;
            
            // Skip checks that don't apply to what changed
            // FS: affects successor START
            // SS: affects successor START  
            // FF: affects successor END
            // SF: affects successor END and START
            if (changedField === 'start' && (depType === 'finish_to_finish')) {
                console.log(`      ⏭️ Skipping ${depType} check - only END is relevant, but START changed`);
                continue;
            }
            if (changedField === 'end' && (depType === 'finish_to_start' || depType === 'start_to_start')) {
                console.log(`      ⏭️ Skipping ${depType} check - only START is relevant, but END changed`);
                continue;
            }
            
            switch (depType) {
                case 'finish_to_start':
                    // Successor must start AFTER predecessor finishes
                    // Successor starts the day after predecessor ends + lag
                    const requiredStart = new Date(predEnd);
                    // Add 1 day so successor starts after predecessor finishes
                    requiredStart.setDate(requiredStart.getDate() + 1);
                    
                    // Then add lag (additional working days)
                    if (lag > 0) {
                        let addedDays = 0;
                        while (addedDays < lag) {
                            requiredStart.setDate(requiredStart.getDate() + 1);
                            // Skip weekends
                            if (requiredStart.getDay() !== 0 && requiredStart.getDay() !== 6) {
                                addedDays++;
                            }
                        }
                    }
                    
                    if (newStart < requiredStart) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot start before "${predecessor.title}" finishes${lag > 0 ? ` (+ ${lag} working days)` : ''}`,
                            type: 'finish_to_start',
                            required: `Start on or after ${requiredStart.toISOString().split('T')[0]}`,
                            actual: `Attempted start: ${newStartDate}`,
                            predecessor: predecessor.title
                        };
                    }
                    break;
                    
                case 'start_to_start':
                    const requiredStartSS = new Date(predStart);
                    if (lag > 0) {
                        let addedDays = 0;
                        while (addedDays < lag) {
                            requiredStartSS.setDate(requiredStartSS.getDate() + 1);
                            if (requiredStartSS.getDay() !== 0 && requiredStartSS.getDay() !== 6) {
                                addedDays++;
                            }
                        }
                    }
                    if (newStart < requiredStartSS) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot start before "${predecessor.title}" starts (+ ${lag} working days)`,
                            type: 'start_to_start',
                            required: `Start on or after ${requiredStartSS.toISOString().split('T')[0]}`,
                            actual: `Attempted start: ${newStartDate}`,
                            predecessor: predecessor.title
                        };
                    }
                    break;
                    
                case 'finish_to_finish':
                    const requiredEndFF = new Date(predEnd);
                    if (lag > 0) {
                        let addedDays = 0;
                        while (addedDays < lag) {
                            requiredEndFF.setDate(requiredEndFF.getDate() + 1);
                            if (requiredEndFF.getDay() !== 0 && requiredEndFF.getDay() !== 6) {
                                addedDays++;
                            }
                        }
                    }
                    if (newEnd < requiredEndFF) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot finish before "${predecessor.title}" finishes (+ ${lag} working days)`,
                            type: 'finish_to_finish',
                            required: `End on or after ${requiredEndFF.toISOString().split('T')[0]}`,
                            actual: `Attempted end: ${newEndDate}`,
                            predecessor: predecessor.title
                        };
                    }
                    break;
                    
                case 'start_to_finish':
                    // SF: Successor ENDS after Predecessor STARTS + lag
                    const requiredEndSF = new Date(predStart);
                    console.log(`      SF Calculation: Successor must end on/after predecessor START (${predStart.toISOString().split('T')[0]}) + ${lag} working days`);
                    if (lag > 0) {
                        let addedDays = 0;
                        while (addedDays < lag) {
                            requiredEndSF.setDate(requiredEndSF.getDate() + 1);
                            if (requiredEndSF.getDay() !== 0 && requiredEndSF.getDay() !== 6) {
                                addedDays++;
                            }
                        }
                    }
                    console.log(`      Required successor END: ${requiredEndSF.toISOString().split('T')[0]}`);
                    console.log(`      Actual successor END: ${newEndDate}`);
                    console.log(`      Comparison: ${newEnd.getTime()} < ${requiredEndSF.getTime()} = ${newEnd < requiredEndSF}`);
                    
                    if (newEnd < requiredEndSF) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot finish before "${predecessor.title}" starts (+ ${lag} working days)`,
                            type: 'start_to_finish',
                            required: `End on or after ${requiredEndSF.toISOString().split('T')[0]}`,
                            actual: `Attempted end: ${newEndDate}`,
                            predecessor: predecessor.title
                        };
                        console.log(`      ⚠️ VIOLATION DETECTED!`);
                    } else {
                        // ADDITIONAL CHECK: For SF, also ensure successor doesn't start before predecessor
                        // when there's positive lag - the successor needs time to complete
                        if (newStart < predStart) {
                            violation = {
                                task: task.title,
                                message: `"${task.title}" cannot start (${newStartDate}) before "${predecessor.title}" starts (${predecessor.start_date}) with SF+${lag} lag - not enough time to reach required end date`,
                                type: 'start_to_finish',
                                required: `Start on or after ${predStart.toISOString().split('T')[0]}`,
                                actual: `Attempted start: ${newStartDate}`,
                                predecessor: predecessor.title
                            };
                            console.log(`      ⚠️ VIOLATION: Successor starts before predecessor with SF+${lag} lag!`);
                        } else {
                            console.log(`      ✓ No violation - successor ends on/after required date`);
                        }
                    }
                    break;
            }
            
            if (violation) {
                console.log(`   ❌ VIOLATION: ${violation.message}`);
                violations.push(violation);
            }
        }
    }
    
    // 2. Check SUCCESSOR constraints (tasks that depend on this task)
    // Find all tasks that have this task as a predecessor
    const successors = allTasks.filter(t => 
        t.dependencies && t.dependencies.some(dep => {
            const predId = dep.id || dep.predecessor_id;
            return predId === taskId;
        })
    );
    
    if (successors.length > 0) {
        console.log(`   Checking ${successors.length} successor(s)...`);
        
        for (const successor of successors) {
            // NEW: Skip if successor is also being validated (part of cascade)
            // This check will be used when called from the cascade validation
            if (window._cascadeMovingTaskIds && window._cascadeMovingTaskIds.has(successor.id)) {
                console.log(`   → Successor ${successor.id} "${successor.title}" is also moving, skipping validation`);
                continue;
            }
            
            const dep = successor.dependencies.find(d => {
                const predId = d.id || d.predecessor_id;
                return predId === taskId;
            });
            
            if (!dep) continue;
            
            const succStart = new Date(successor.start_date);
            const succEnd = new Date(successor.end_date);
            const depType = dep.type || dep.dependency_type || 'finish_to_start';
            const lag = dep.lag_days || dep.lag || 0;
            
            console.log(`   → Successor ${successor.id} (${depType}, lag=${lag}): ${successor.start_date} to ${successor.end_date}`);
            
            let violation = null;
            
            switch (depType) {
                case 'finish_to_start':
                    // Predecessor cannot end after successor starts (minus lag and -1 for gap)
                    const maxEnd = new Date(succStart);
                    maxEnd.setDate(maxEnd.getDate() - 1 - lag); // -1 for gap, -lag for delay
                    // Skip weekends backwards
                    while (maxEnd.getDay() === 0 || maxEnd.getDay() === 6) {
                        maxEnd.setDate(maxEnd.getDate() - 1);
                    }
                    
                    if (newEnd > maxEnd) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot end after "${successor.title}" starts (task depends on this one)`,
                            type: 'finish_to_start',
                            required: `End on or before ${maxEnd.toISOString().split('T')[0]}`,
                            actual: `Attempted end: ${newEndDate}`,
                            successor: successor.title
                        };
                    }
                    break;
                    
                case 'start_to_start':
                    const maxStartSS = new Date(succStart);
                    if (lag > 0) {
                        let subtractedDays = 0;
                        while (subtractedDays < lag) {
                            maxStartSS.setDate(maxStartSS.getDate() - 1);
                            if (maxStartSS.getDay() !== 0 && maxStartSS.getDay() !== 6) {
                                subtractedDays++;
                            }
                        }
                    }
                    if (newStart > maxStartSS) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot start after "${successor.title}" starts (task depends on this one)`,
                            type: 'start_to_start',
                            required: `Start on or before ${maxStartSS.toISOString().split('T')[0]}`,
                            actual: `Attempted start: ${newStartDate}`,
                            successor: successor.title
                        };
                    }
                    break;
                    
                case 'finish_to_finish':
                    const maxEndFF = new Date(succEnd);
                    if (lag > 0) {
                        let subtractedDays = 0;
                        while (subtractedDays < lag) {
                            maxEndFF.setDate(maxEndFF.getDate() - 1);
                            if (maxEndFF.getDay() !== 0 && maxEndFF.getDay() !== 6) {
                                subtractedDays++;
                            }
                        }
                    }
                    if (newEnd > maxEndFF) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot finish after "${successor.title}" finishes (task depends on this one)`,
                            type: 'finish_to_finish',
                            required: `End on or before ${maxEndFF.toISOString().split('T')[0]}`,
                            actual: `Attempted end: ${newEndDate}`,
                            successor: successor.title
                        };
                    }
                    break;
                    
                case 'start_to_finish':
                    const maxStartSF = new Date(succEnd);
                    if (lag > 0) {
                        let subtractedDays = 0;
                        while (subtractedDays < lag) {
                            maxStartSF.setDate(maxStartSF.getDate() - 1);
                            if (maxStartSF.getDay() !== 0 && maxStartSF.getDay() !== 6) {
                                subtractedDays++;
                            }
                        }
                    }
                    if (newStart > maxStartSF) {
                        violation = {
                            task: task.title,
                            message: `"${task.title}" cannot start after "${successor.title}" finishes (task depends on this one)`,
                            type: 'start_to_finish',
                            required: `Start on or before ${maxStartSF.toISOString().split('T')[0]}`,
                            actual: `Attempted start: ${newStartDate}`,
                            successor: successor.title
                        };
                    }
                    break;
            }
            
            if (violation) {
                console.log(`   ❌ SUCCESSOR VIOLATION: ${violation.message}`);
                violations.push(violation);
            }
        }
    }
    
    console.log(`   Result: ${violations.length} violation(s) found`);
    return violations;
}

// Validate all tasks in the project for dependency violations
function validateAllTaskDependencies() {
    console.log('\n🔍 VALIDATING ALL TASK DEPENDENCIES IN PROJECT...');
    const allViolations = [];
    
    for (const task of allTasks) {
        if (!task.start_date || !task.end_date) continue;
        
        const violations = checkTaskDependencyViolations(task.id, task.start_date, task.end_date);
        if (violations.length > 0) {
            allViolations.push(...violations);
        }
    }
    
    console.log(`✅ Validation complete: ${allViolations.length} total violations found`);
    return allViolations;
}

// Apply cascading dependency changes when a task is moved
function applyCascadingDependencyChanges(taskId, newStartDate, newEndDate) {
    console.log(`Applying cascading changes for task ${taskId}...`);
    
    const movedTask = allTasks.find(t => t.id === taskId);
    if (!movedTask) {
        return { success: false, message: 'Task not found', conflicts: [] };
    }
    
    const newStart = new Date(newStartDate);
    const newEnd = new Date(newEndDate);
    const currentStart = new Date(movedTask.start_date);
    const currentEnd = new Date(movedTask.end_date);
    const conflicts = [];
    
    // Calculate which dates changed
    const startChanged = newStart.getTime() !== currentStart.getTime();
    const endChanged = newEnd.getTime() !== currentEnd.getTime();
    const startDiff = newStart.getTime() - currentStart.getTime();
    const endDiff = newEnd.getTime() - currentEnd.getTime();
    
    // Determine the type of drag operation
    let dragType = 'NONE';
    if (startChanged && endChanged) {
        if (Math.abs(startDiff - endDiff) < 1000) { // Within 1 second (same shift)
            dragType = 'MOVE'; // Entire task moved
        } else if (endDiff === 0) {
            dragType = 'RESIZE_START'; // Only start changed (drag left/right edge)
        } else if (startDiff === 0) {
            dragType = 'RESIZE_END'; // Only end changed (drag right/left edge)
        } else {
            dragType = 'RESIZE_BOTH'; // Both changed by different amounts
        }
    } else if (startChanged) {
        dragType = 'RESIZE_START';
    } else if (endChanged) {
        dragType = 'RESIZE_END';
    }
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`🔄 CASCADING ANALYSIS FOR TASK: ${movedTask.title} (ID: ${taskId})`);
    console.log(`   Original: ${movedTask.start_date} (${currentStart.toISOString()}) → ${movedTask.end_date} (${currentEnd.toISOString()})`);
    console.log(`   New:      ${newStartDate} (${newStart.toISOString()}) → ${newEndDate} (${newEnd.toISOString()})`);
    console.log(`   Time diff: START ${startDiff}ms | END ${endDiff}ms`);
    console.log(`   Changes:  START ${startChanged ? '✓ CHANGED' : '✗ same'} | END ${endChanged ? '✓ CHANGED' : '✗ same'}`);
    console.log(`   🎬 DRAG TYPE: ${dragType}`);
    console.log('═══════════════════════════════════════════════════════════════');
    
    // FIRST: Check if the moved task itself has milestone restrictions
    // If so, we can only move it up to the constraint (clamp the movement)
    let constrainedStartDate = newStartDate;
    let constrainedEndDate = newEndDate;
    
    if (movedTask.fixed_start && startChanged) {
        console.log(`⚠️ Task "${movedTask.title}" has FIXED START - clamping to original ${movedTask.start_date}`);
        constrainedStartDate = movedTask.start_date;
        // Recalculate end date to maintain duration
        const duration = Math.ceil((newEnd - newStart) / (24 * 60 * 60 * 1000));
        const clampedStart = new Date(constrainedStartDate);
        const clampedEnd = new Date(clampedStart);
        clampedEnd.setDate(clampedEnd.getDate() + duration);
        constrainedEndDate = formatDateForAPI(clampedEnd);
        console.log(`   → Adjusted to: ${constrainedStartDate} → ${constrainedEndDate} (maintained ${duration} day duration)`);
    }
    
    if (movedTask.fixed_end && endChanged) {
        console.log(`⚠️ Task "${movedTask.title}" has FIXED END - clamping to original ${movedTask.end_date}`);
        constrainedEndDate = movedTask.end_date;
        // Recalculate start date to maintain duration
        const duration = Math.ceil((newEnd - newStart) / (24 * 60 * 60 * 1000));
        const clampedEnd = new Date(constrainedEndDate);
        const clampedStart = new Date(clampedEnd);
        clampedStart.setDate(clampedStart.getDate() - duration);
        constrainedStartDate = formatDateForAPI(clampedStart);
        console.log(`   → Adjusted to: ${constrainedStartDate} → ${constrainedEndDate} (maintained ${duration} day duration)`);
    }
    
    // Check if clamping resulted in no actual change
    if (constrainedStartDate === movedTask.start_date && constrainedEndDate === movedTask.end_date) {
        console.warn('❌ Move blocked - task has fixed dates that prevent any movement');
        return {
            success: false,
            message: `Cannot move "${movedTask.title}" - dates are fixed as milestones`,
            conflicts: [{
                task: movedTask.title,
                message: `Cannot move "${movedTask.title}" - dates are fixed as milestones`,
                type: 'milestone_conflict'
            }],
            updates: []
        };
    }
    
    // Use constrained dates for the rest of the cascade
    newStartDate = constrainedStartDate;
    newEndDate = constrainedEndDate;

    // Helper: add N working days (Mon–Fri) to a date, same logic as Python add_working_days.
    // For FS use addWorkingDays(predEnd, lag+1); for SS/FF/SF use addWorkingDays(anchor, lag).
    function addWorkingDays(fromDate, n) {
        const d = new Date(fromDate);
        let added = 0;
        while (added < n) {
            d.setDate(d.getDate() + 1);
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) added++;
        }
        return d;
    }

    // Inverse of addWorkingDays: subtract N working days (Mon–Fri) from a date.
    function subWorkingDays(fromDate, n) {
        const d = new Date(fromDate);
        let subtracted = 0;
        while (subtracted < n) {
            d.setDate(d.getDate() - 1);
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) subtracted++;
        }
        return d;
    }

    // ── Queue-based bidirectional cascade ──────────────────────────────────────
    // `proposed` holds the latest computed dates for every affected task.
    // `queue` holds task IDs whose dates just changed and whose network
    // neighbours (successors AND predecessors) must be re-evaluated.
    // A task is only re-queued when its proposed dates actually change, so the
    // loop always converges (no processedTasks Set needed — tasks can be
    // revisited if a later backward-cascade gives them new dates).
    const proposed = new Map();
    proposed.set(taskId, { start: new Date(newStartDate), end: new Date(newEndDate) });
    const queue = [taskId];
    const MAX_ITER = 1000;   // hard safety cap against pathological cycles
    let iter = 0;

    while (queue.length > 0 && iter++ < MAX_ITER) {
        const curId = queue.shift();
        const curTask = allTasks.find(t => t.id === curId);
        if (!curTask) continue;
        const curDates = proposed.get(curId);
        if (!curDates) continue;

        // ── FORWARD: push every successor that is now too early ────────────
        const successors = allTasks.filter(t =>
            t.dependencies?.some(dep => (dep.id || dep.predecessor_id) === curId)
        );
        for (const succ of successors) {
            const dep = succ.dependencies.find(d => (d.id || d.predecessor_id) === curId);
            if (!dep) continue;
            const lag         = dep.lag || dep.lag_days || 0;
            const depType     = dep.type || dep.dependency_type || 'finish_to_start';
            const lagOnly     = dep.maintain_lag_only !== undefined ? dep.maintain_lag_only : true;
            const sD          = proposed.get(succ.id) || { start: new Date(succ.start_date), end: new Date(succ.end_date) };
            const dur         = Math.max(1, Math.ceil((sD.end - sD.start) / 86400000));
            let ns = null, ne = null;

            switch (depType) {
                case 'finish_to_start': {
                    const min = addWorkingDays(curDates.end, lag + 1);
                    if (lagOnly ? sD.start < min : min.getTime() !== sD.start.getTime()) {
                        ns = min; ne = new Date(ns); ne.setDate(ne.getDate() + dur - 1);
                    }
                    break;
                }
                case 'start_to_start': {
                    const min = addWorkingDays(curDates.start, lag);
                    if (lagOnly ? sD.start < min : min.getTime() !== sD.start.getTime()) {
                        ns = min; ne = new Date(ns); ne.setDate(ne.getDate() + dur - 1);
                    }
                    break;
                }
                case 'finish_to_finish': {
                    const min = addWorkingDays(curDates.end, lag);
                    if (lagOnly ? sD.end < min : min.getTime() !== sD.end.getTime()) {
                        ne = min; ns = new Date(ne); ns.setDate(ns.getDate() - dur + 1);
                    }
                    break;
                }
                case 'start_to_finish': {
                    const min = addWorkingDays(curDates.start, lag);
                    if (lagOnly ? sD.end < min : min.getTime() !== sD.end.getTime()) {
                        ne = min; ns = new Date(ne); ns.setDate(ns.getDate() - dur + 1);
                    }
                    break;
                }
            }

            if (ns && ne) {
                const fsViol = succ.fixed_start && ns.getTime() !== sD.start.getTime();
                const feViol = succ.fixed_end   && ne.getTime() !== sD.end.getTime();
                if (fsViol || feViol) {
                    if (ns > sD.start) {   // only block when pushing RIGHT
                        conflicts.push({ task: movedTask.title, message: `Cannot move further — "${succ.title}" has a fixed ${fsViol ? 'start' : 'end'} date`, type: 'milestone_conflict' });
                        return { success: false, message: conflicts[0].message, conflicts, updates: [] };
                    }
                    continue;  // moving left past a fixed successor is allowed (slack grows)
                }
                const prev = proposed.get(succ.id);
                if (!prev || prev.start.getTime() !== ns.getTime() || prev.end.getTime() !== ne.getTime()) {
                    proposed.set(succ.id, { start: ns, end: ne });
                    queue.push(succ.id);
                }
            }
        }

        // ── BACKWARD: pull every predecessor that is now in violation ──────
        if (curTask.dependencies) {
            for (const dep of curTask.dependencies) {
                const predId  = dep.id || dep.predecessor_id;
                const pred    = allTasks.find(t => t.id === predId);
                if (!pred) continue;
                const lag     = dep.lag || dep.lag_days || 0;
                const depType = dep.type || dep.dependency_type || 'finish_to_start';
                const lagOnly = dep.maintain_lag_only !== undefined ? dep.maintain_lag_only : true;
                const pD      = proposed.get(predId) || { start: new Date(pred.start_date), end: new Date(pred.end_date) };
                const dur     = Math.max(1, Math.ceil((pD.end - pD.start) / 86400000));
                let ns = null, ne = null;

                switch (depType) {
                    case 'finish_to_start': {
                        const minCur  = addWorkingDays(pD.end, lag + 1);
                        const violated = curDates.start < minCur;
                        if (violated) {
                            if (pred.fixed_end || pred.fixed_start) {
                                conflicts.push({ task: curTask.title, message: `Cannot move "${curTask.title}" — predecessor "${pred.title}" has fixed dates (FS)`, type: 'predecessor_violation' });
                                return { success: false, message: conflicts[0].message, conflicts, updates: [] };
                            }
                            ne = subWorkingDays(curDates.start, lag + 1);
                            ns = new Date(ne); ns.setDate(ns.getDate() - dur + 1);
                        } else if (!lagOnly) {
                            const exact = subWorkingDays(curDates.start, lag + 1);
                            if (exact.getTime() !== pD.end.getTime() && !pred.fixed_end && !pred.fixed_start) {
                                ne = exact; ns = new Date(ne); ns.setDate(ns.getDate() - dur + 1);
                            }
                        }
                        break;
                    }
                    case 'start_to_start': {
                        const minCur  = addWorkingDays(pD.start, lag);
                        const violated = curDates.start < minCur;
                        if (violated) {
                            if (pred.fixed_start) {
                                conflicts.push({ task: curTask.title, message: `Cannot move "${curTask.title}" — predecessor "${pred.title}" has a fixed start (SS)`, type: 'predecessor_violation' });
                                return { success: false, message: conflicts[0].message, conflicts, updates: [] };
                            }
                            ns = subWorkingDays(curDates.start, lag);
                            ne = new Date(ns); ne.setDate(ne.getDate() + dur - 1);
                        } else if (!lagOnly) {
                            const exact = subWorkingDays(curDates.start, lag);
                            if (exact.getTime() !== pD.start.getTime() && !pred.fixed_start) {
                                ns = exact; ne = new Date(ns); ne.setDate(ne.getDate() + dur - 1);
                            }
                        }
                        break;
                    }
                    case 'finish_to_finish': {
                        const minCur  = addWorkingDays(pD.end, lag);
                        const violated = curDates.end < minCur;
                        if (violated) {
                            if (pred.fixed_end || pred.fixed_start) {
                                conflicts.push({ task: curTask.title, message: `Cannot move "${curTask.title}" — predecessor "${pred.title}" has fixed dates (FF)`, type: 'predecessor_violation' });
                                return { success: false, message: conflicts[0].message, conflicts, updates: [] };
                            }
                            ne = subWorkingDays(curDates.end, lag);
                            ns = new Date(ne); ns.setDate(ns.getDate() - dur + 1);
                        } else if (!lagOnly) {
                            const exact = subWorkingDays(curDates.end, lag);
                            if (exact.getTime() !== pD.end.getTime() && !pred.fixed_end && !pred.fixed_start) {
                                ne = exact; ns = new Date(ne); ns.setDate(ns.getDate() - dur + 1);
                            }
                        }
                        break;
                    }
                    case 'start_to_finish': {
                        const minCur  = addWorkingDays(pD.start, lag);
                        const violated = curDates.end < minCur;
                        if (violated) {
                            if (pred.fixed_start) {
                                conflicts.push({ task: curTask.title, message: `Cannot move "${curTask.title}" — predecessor "${pred.title}" has a fixed start (SF)`, type: 'predecessor_violation' });
                                return { success: false, message: conflicts[0].message, conflicts, updates: [] };
                            }
                            ns = subWorkingDays(curDates.end, lag);
                            ne = new Date(ns); ne.setDate(ne.getDate() + dur - 1);
                        } else if (!lagOnly) {
                            const exact = subWorkingDays(curDates.end, lag);
                            if (exact.getTime() !== pD.start.getTime() && !pred.fixed_start) {
                                ns = exact; ne = new Date(ns); ne.setDate(ne.getDate() + dur - 1);
                            }
                        }
                        break;
                    }
                }

                if (ns && ne) {
                    const prev = proposed.get(predId);
                    if (!prev || prev.start.getTime() !== ns.getTime() || prev.end.getTime() !== ne.getTime()) {
                        proposed.set(predId, { start: ns, end: ne });
                        queue.push(predId);
                    }
                }
            }
        }
    }   // end while

    if (iter >= MAX_ITER) {
        return { success: false, message: 'Cascade did not converge — possible circular dependency', conflicts: [{ message: 'Convergence limit reached' }], updates: [] };
    }

    // Build updates array from the proposed-dates map
    const updates = [];
    for (const [tid, dates] of proposed) {
        updates.push({ task_id: tid, start_date: formatDateForAPI(dates.start), end_date: formatDateForAPI(dates.end) });
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`✅ CASCADE COMPLETE (${iter} iterations) — ${updates.length} tasks to update`);
    updates.forEach((u, i) => {
        const t = allTasks.find(task => task.id === u.task_id);
        console.log(`   ${i + 1}. ${t ? t.title : 'Task ' + u.task_id}: ${u.start_date} → ${u.end_date}`);
    });
    console.log('═══════════════════════════════════════════════════════════════');

    return { success: true, message: `Successfully planned updates for ${updates.length} tasks`, conflicts: [], updates };
}


// Global flag to prevent re-entry during update
// Stays true until any deferred re-render (setTimeout) has fired, so that
// concurrent drag callbacks cannot sneak in a second date-change event
// between our `return` and our deferred render.
let isUpdatingTasks = false;
// Set to true when the rejection/error path hands off cleanup to a setTimeout,
// so the finally block knows NOT to clear isUpdatingTasks prematurely.
let _deferredClear = false;

// Handle task date change (drag and drop)
async function handleTaskDateChange(taskId, start, end) {
    try {
        // Prevent re-entry if we're already processing an update
        if (isUpdatingTasks) {
            console.log(`⏭️ Ignoring date change event - already processing update`);
            return;
        }
        
        isUpdatingTasks = true;
        
        console.log('🔴🔴🔴 handleTaskDateChange CALLED - VERSION 2.0 🔴🔴🔴');
        const task = allTasks.find(t => t.id === taskId);
        console.log('\n' + '='.repeat(80));
        console.log(`🎯 DRAG EVENT: Task ${taskId} "${task ? task.title : 'Unknown'}"`);
        console.log(`   Original dates: ${task ? task.start_date : '?'} → ${task ? task.end_date : '?'}`);
        console.log(`   New dates (raw):`, start, end);
        console.log(`   Task dependencies:`, task ? task.dependencies : 'N/A');
        
        let startDate = formatDateForAPI(start);
        let endDate   = formatDateForAPI(end);

        // In 5d (working-days-only) mode, snap dragged dates to working days so the
        // bar never visually jumps two days when it lands on a weekend column.
        if (workingDaysOnly) {
            function snapToWorkingDay(dateStr, snapDirection) {
                const d = new Date(dateStr);
                const dow = d.getDay();
                if (dow === 0) { // Sunday
                    d.setDate(d.getDate() + (snapDirection === 'forward' ? 1 : -2));
                } else if (dow === 6) { // Saturday
                    d.setDate(d.getDate() + (snapDirection === 'forward' ? 2 : -1));
                }
                return formatDateForAPI(d);
            }
            startDate = snapToWorkingDay(startDate, 'forward');
            endDate   = snapToWorkingDay(endDate,   'backward');
            // Guarantee at least 1 working day duration
            if (endDate < startDate) endDate = startDate;
        }
        
        console.log(`   Cleaned dates: ${startDate} → ${endDate}`);
        
        // Apply cascading dependency adjustments WITHOUT validation
        // This will move all dependent tasks and return the full set of updates
        const cascadeResult = applyCascadingDependencyChanges(taskId, startDate, endDate);
        
        if (!cascadeResult.success) {
            console.warn('Cascading dependency adjustment failed:', cascadeResult.conflicts);
            
            if (cascadeResult.conflicts.length > 1) {
                showDependencyViolationModal(cascadeResult.conflicts);
            } else {
                showError(`Cannot move task: ${cascadeResult.message}`);
            }
            
            // Reload to revert the change
            await handleProjectChange();
            return;
        }
        
        console.log(`\n📦 Cascade complete: ${cascadeResult.updates.length} tasks will be updated`);
        // Cascade succeeded — milestone conflicts are already caught inside
        // applyCascadingDependencyChanges. No secondary violation check needed:
        // dependency consistency between cascaded tasks is guaranteed by the cascade itself.
        
        showLoading(true);
        
        // If we have cascaded changes, send them all as a batch
        if (cascadeResult.updates && cascadeResult.updates.length > 1) {
            console.log('Sending batch update for cascaded changes:', cascadeResult.updates);
            
            // ⚡ CRITICAL: Update allTasks array IMMEDIATELY (before async network call)
            // This prevents race condition where next drag sees stale data
            // BUT: Save original dates first for proper logging
            const originalTaskStates = {};
            cascadeResult.updates.forEach(update => {
                const task = allTasks.find(t => t.id === update.task_id);
                if (task) {
                    // Save original state before updating
                    originalTaskStates[update.task_id] = {
                        start_date: task.start_date,
                        end_date: task.end_date
                    };
                }
            });
            
            console.log('🔄 Updating allTasks array immediately (before network call)...');
            cascadeResult.updates.forEach(update => {
                const task = allTasks.find(t => t.id === update.task_id);
                if (task) {
                    task.start_date = update.start_date;
                    task.end_date = update.end_date;
                    const orig = originalTaskStates[update.task_id];
                    console.log(`  ✓ Pre-updated task ${update.task_id}: ${orig.start_date} → ${update.start_date} (${orig.end_date} → ${update.end_date})`);
                }
            });
            console.log('✅ allTasks array updated with new state');
            
            const response = await fetch('/api/tasks/batch-update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    tasks: cascadeResult.updates.map(u => ({
                        id: u.task_id,
                        start_date: u.start_date,
                        end_date: u.end_date,
                        duration_working_days: u.duration_working_days
                    }))
                })
            });
            
            // Check if response is OK
            if (!response.ok) {
                const text = await response.text();
                console.error('Batch update failed:', response.status, text);
                throw new Error(`Server error (${response.status}): ${text.substring(0, 100)}`);
            }
            
            // Try to parse JSON, catch if it's not JSON
            let data;
            try {
                data = await response.json();
            } catch (e) {
                const text = await response.text();
                console.error('Failed to parse response as JSON:', text);
                throw new Error('Server returned invalid response. Expected JSON.');
            }
            
            if (data.success) {
                showSuccess(`Updated ${cascadeResult.updates.length} tasks with cascading dependencies`);
                
                // Log what was saved
                console.log('📊 Batch update succeeded! Saved tasks:');
                cascadeResult.updates.forEach(u => {
                    const task = allTasks.find(t => t.id === u.task_id);
                    console.log(`   Task ${u.task_id} (${task?.title}): ${u.start_date} → ${u.end_date}`);
                });
                
                // allTasks already updated before network call - just refresh the chart
                console.log('🔄 Refreshing chart with updated tasks...');
                
                // Small delay to ensure DOM is ready and avoid Frappe Gantt conflicts
                // Use preserveView=true to maintain scroll position and zoom level
                setTimeout(() => {
                    renderGanttChart(allTasks, true);
                }, 100);
                
                // Verify allTasks has the correct data
                console.log('✅ Verification - allTasks after update:');
                cascadeResult.updates.forEach(u => {
                    const task = allTasks.find(t => t.id === u.task_id);
                    console.log(`   Task ${u.task_id}: start=${task?.start_date}, end=${task?.end_date}`);
                });
            } else {
                throw new Error(data.message || 'Failed to update tasks with dependencies');
            }
        } else {
            // Single task update
            console.log('Sending single task update:', {
                task_id: taskId,
                start_date: startDate,
                end_date: endDate
            });
            
            const response = await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    start_date: startDate,
                    end_date: endDate
                })
            });
            
            const data = await response.json();
            console.log('Task update response:', data);
            
            if (data.success) {
                showSuccess('Task dates updated successfully');
                
                // Update the task in allTasks array to reflect the change
                const task = allTasks.find(t => t.id === taskId);
                if (task) {
                    task.start_date = startDate;
                    task.end_date = endDate;
                    console.log(`Updated task ${taskId} in memory:`, task);
                }
                
                // Refresh chart with view preservation
                renderGanttChart(allTasks, true);
            } else {
                throw new Error(data.message || 'Failed to update task dates');
            }
        }
        
        showLoading(false);
    } catch (error) {
        console.error('Error updating task dates:', error);
        showError(error.message);
        showLoading(false);

        // Defer the revert so we don't block the current call stack.
        _deferredClear = true;
        setTimeout(() => { handleProjectChange(); isUpdatingTasks = false; }, 0);
    } finally {
        // Note: the rejection/error paths clear isUpdatingTasks inside their
        // deferred setTimeout callbacks (above and below), so we only clear
        // here when none of those deferred paths were taken.
        if (!_deferredClear) {
            isUpdatingTasks = false;
        }
        _deferredClear = false;
    }
}

// ── Replan: check dependency integrity and move violations forward ─────────────
// Runs a topological forward pass over all tasks and moves any task whose
// current start date violates a predecessor constraint to the earliest valid
// date.  Fixed-start/fixed-end tasks are reported as warnings but not moved.
async function redrawPlanning() {
    if (isUpdatingTasks) return;

    // ── working-day helper (same rule as applyCascadingDependencyChanges) ──
    function addWD(fromDate, n) {
        const d = new Date(fromDate);
        let added = 0;
        while (added < n) {
            d.setDate(d.getDate() + 1);
            const w = d.getDay();
            if (w !== 0 && w !== 6) added++;
        }
        return d;
    }

    // ── 1. Topological sort (Kahn's algorithm) ────────────────────────────
    const taskMap   = new Map(allTasks.map(t => [t.id, t]));
    const inDegree  = new Map(allTasks.map(t => [t.id, 0]));
    for (const t of allTasks) {
        for (const dep of (t.dependencies || [])) {
            const pid = dep.id || dep.predecessor_id;
            if (taskMap.has(pid)) inDegree.set(t.id, (inDegree.get(t.id) || 0) + 1);
        }
    }
    const sortedTasks = [];
    const topoQueue  = allTasks.filter(t => (inDegree.get(t.id) || 0) === 0).slice();
    while (topoQueue.length) {
        const t = topoQueue.shift();
        sortedTasks.push(t);
        for (const succ of allTasks) {
            if (succ.dependencies?.some(d => (d.id || d.predecessor_id) === t.id)) {
                const nd = (inDegree.get(succ.id) || 0) - 1;
                inDegree.set(succ.id, nd);
                if (nd === 0) topoQueue.push(succ);
            }
        }
    }
    // Append any tasks not reached (cycles / isolated)
    for (const t of allTasks) if (!sortedTasks.includes(t)) sortedTasks.push(t);

    // ── 2. Forward pass ────────────────────────────────────────────────────
    const proposed = new Map();
    for (const t of allTasks) {
        proposed.set(t.id, { start: new Date(t.start_date), end: new Date(t.end_date) });
    }

    const changes  = [];   // { task, oldStart, oldEnd, newStart, newEnd }
    const warnings = [];   // { task, message }  — fixed tasks with violations

    for (const task of sortedTasks) {
        const cur = proposed.get(task.id);
        const dur = Math.max(1, Math.ceil((cur.end - cur.start) / 86400000));
        let minStart = null;

        for (const dep of (task.dependencies || [])) {
            const pid  = dep.id || dep.predecessor_id;
            const pred = proposed.get(pid);
            if (!pred) continue;
            const lag     = dep.lag || dep.lag_days || 0;
            const depType = dep.type || dep.dependency_type || 'finish_to_start';
            let reqStart  = null;

            switch (depType) {
                case 'finish_to_start':
                    reqStart = addWD(pred.end, lag + 1);
                    break;
                case 'start_to_start':
                    reqStart = addWD(pred.start, lag);
                    break;
                case 'finish_to_finish': {
                    const reqEnd = addWD(pred.end, lag);
                    reqStart = new Date(reqEnd);
                    reqStart.setDate(reqStart.getDate() - dur + 1);
                    break;
                }
                case 'start_to_finish': {
                    const reqEnd = addWD(pred.start, lag);
                    reqStart = new Date(reqEnd);
                    reqStart.setDate(reqStart.getDate() - dur + 1);
                    break;
                }
            }
            if (reqStart && (!minStart || formatDateForAPI(reqStart) > formatDateForAPI(minStart))) minStart = reqStart;
        }

        // Compare by date string (YYYY-MM-DD) to avoid false positives from
        // sub-day time-component differences caused by UTC vs. local midnight.
        if (!minStart || formatDateForAPI(minStart) <= formatDateForAPI(cur.start)) continue;

        if (task.fixed_start || task.fixed_end) {
            const predNames = (task.dependencies || []).map(d => {
                const p = taskMap.get(d.id || d.predecessor_id);
                return p ? `"${p.title}"` : '?';
            }).join(', ');
            warnings.push({ task, message: `"${task.title}" violates its predecessor (${predNames}) but has a fixed date — cannot be moved automatically.` });
            continue;
        }

        const newStart = minStart;
        const newEnd   = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + dur - 1);
        proposed.set(task.id, { start: newStart, end: newEnd });
        changes.push({ task, oldStart: cur.start, oldEnd: cur.end, newStart, newEnd });
    }

    // ── 3. Report or confirm ───────────────────────────────────────────────
    if (changes.length === 0 && warnings.length === 0) {
        showToast('Planning is consistent — all dependencies are satisfied.', 'success');
        return;
    }

    showRedrawResultModal(changes, warnings, async () => {
        if (changes.length === 0) return;
        isUpdatingTasks = true;
        showLoading(true);
        try {
            // Update allTasks immediately to avoid stale reads
            for (const c of changes) {
                const t = allTasks.find(x => x.id === c.task.id);
                if (t) { t.start_date = formatDateForAPI(c.newStart); t.end_date = formatDateForAPI(c.newEnd); }
            }
            const resp = await fetch('/api/tasks/batch-update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tasks: changes.map(c => ({
                        id: c.task.id,
                        start_date: formatDateForAPI(c.newStart),
                        end_date:   formatDateForAPI(c.newEnd)
                    }))
                })
            });
            if (!resp.ok) throw new Error(`Server error ${resp.status}`);
            const data = await resp.json();
            if (!data.success) throw new Error(data.message || 'Batch update failed');
            showSuccess(`Replan complete — ${changes.length} task(s) rescheduled.`);
            setTimeout(() => renderGanttChart(allTasks, true), 100);
        } catch (err) {
            showError('Replan failed: ' + err.message);
            await handleProjectChange();
        } finally {
            showLoading(false);
            isUpdatingTasks = false;
        }
    });
}

function showRedrawResultModal(changes, warnings, onConfirm) {
    const id = 'redraw-result-modal';
    if (!document.getElementById(id)) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="${id}" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header" id="${id}-header">
                            <h5 class="modal-title" id="${id}-title"></h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body" id="${id}-body"></div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="${id}-cancel" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-warning"   id="${id}-confirm">
                                <i class="fas fa-project-diagram me-1"></i>Apply fixes
                            </button>
                        </div>
                    </div>
                </div>
            </div>`);
    }
    const modal      = document.getElementById(id);
    const header     = document.getElementById(`${id}-header`);
    const title      = document.getElementById(`${id}-title`);
    const body       = document.getElementById(`${id}-body`);
    const cancelBtn  = document.getElementById(`${id}-cancel`);
    const confirmBtn = document.getElementById(`${id}-confirm`);

    if (changes.length > 0) {
        header.className = 'modal-header bg-warning text-dark';
        title.innerHTML  = `<i class="fas fa-project-diagram me-2"></i>Replan — ${changes.length} violation(s) found`;
    } else {
        header.className = 'modal-header bg-info text-white';
        title.innerHTML  = `<i class="fas fa-info-circle me-2"></i>Replan — warnings only`;
    }

    let html = '';
    if (changes.length > 0) {
        html += `<p class="mb-2">The following tasks start too early given their predecessor constraints and will be moved forward:</p>
                 <div class="table-responsive">
                 <table class="table table-sm table-bordered mb-3">
                   <thead class="table-light">
                     <tr><th>Task</th><th>Current start</th><th>New start</th><th>Shift</th></tr>
                   </thead><tbody>`;
        for (const c of changes) {
            const shiftDays = Math.round((c.newStart - c.oldStart) / 86400000);
            html += `<tr>
                       <td>${c.task.title}</td>
                       <td class="text-muted">${formatDateForAPI(c.oldStart)}</td>
                       <td class="text-danger fw-bold">${formatDateForAPI(c.newStart)}</td>
                       <td class="text-warning fw-semibold">+${shiftDays}d</td>
                     </tr>`;
        }
        html += `</tbody></table></div>`;
    }
    if (warnings.length > 0) {
        html += `<div class="alert alert-warning mb-0">
                   <strong><i class="fas fa-lock me-1"></i>Fixed-date conflicts (not auto-fixed):</strong>
                   <ul class="mb-0 mt-1">`;
        for (const w of warnings) html += `<li>${w.message}</li>`;
        html += `</ul></div>`;
    }
    body.innerHTML = html;

    // Adjust footer based on whether there is anything to apply
    cancelBtn.textContent  = changes.length > 0 ? 'Cancel' : 'Close';
    confirmBtn.style.display = changes.length > 0 ? '' : 'none';

    // Replace confirm button to clear previous event listeners
    const newConfirm = confirmBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
    newConfirm.addEventListener('click', () => {
        bootstrap.Modal.getOrCreateInstance(modal).hide();
        onConfirm();
    });

    bootstrap.Modal.getOrCreateInstance(modal).show();
}

// Handle task progress change
async function handleTaskProgressChange(taskId, progress) {
    try {
        const task = allTasks.find(t => t.id === taskId);
        if (!task) return;

        const response = await fetch(`/api/tasks/${taskId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progress })
        });

        const data = await response.json();

        if (data.success) {
            // Update allTasks so popup and modal immediately reflect the new value
            task.progress = progress;
            showSuccess('Task progress updated');
        } else {
            throw new Error(data.message || 'Failed to update task progress');
        }

    } catch (error) {
        console.error('Error updating task progress:', error);
        showError('Failed to update task progress');
    }
}

// Utility function for date formatting
function formatDateForAPI(dateValue) {
    // Convert any date format to YYYY-MM-DD for API
    // CRITICAL: Use local timezone, not UTC, to avoid off-by-one errors
    if (!dateValue) return null;
    
    if (typeof dateValue === 'string') {
        // If it's already a string, extract just the date part
        return dateValue.split('T')[0];
    } else if (dateValue instanceof Date) {
        // Use local timezone to avoid date shifts
        const year = dateValue.getFullYear();
        const month = String(dateValue.getMonth() + 1).padStart(2, '0');
        const day = String(dateValue.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    return dateValue;
}

function formatDutchDate(dateStr) {
    if (!dateStr) return '';
    const months = ['januari','februari','maart','april','mei','juni',
                    'juli','augustus','september','oktober','november','december'];
    // Parse as local date to avoid UTC shift
    const parts = dateStr.split('T')[0].split('-');
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[0], 10);
    return `${d} ${months[m]} ${y}`;
}

function countWorkingDaysJS(startStr, endStr) {
    if (!startStr || !endStr) return 1;
    const [sy, sm, sd] = startStr.split('T')[0].split('-').map(Number);
    const [ey, em, ed] = endStr.split('T')[0].split('-').map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end   = new Date(ey, em - 1, ed);
    if (start > end) return 1;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) count++;
        cur.setDate(cur.getDate() + 1);
    }
    return count || 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// TASK LIST PANEL
// Builds the left-side task-name column and syncs its vertical scroll with
// the custom Gantt body scroll container.
//
// Row metrics (must match custom Gantt constants):
//   HEADER_H : 50 px
//   BAR_H    : 20 px
//   ROW_PAD  :  9 px  → ROW_H = 38 px
// ─────────────────────────────────────────────────────────────────────────────

const TL_HEADER_H = HEADER_H;  // alias for clarity
const TL_ROW_H    = ROW_H;     // alias for clarity

const STATUS_COLORS = {
    'Completed':   '#22c55e',
    'In Progress': '#3b82f6',
    'Not Started': '#94a3b8',
    'Pending':     '#94a3b8',
    'On Hold':     '#f97316',
};

function buildTaskListPanel() {
    const body = document.getElementById('task-list-body');
    if (!body) return;

    const visibleTasks = ganttChart && ganttChart.tasks
        ? ganttChart.tasks
        : allTasks.filter(t => t.start_date && t.end_date);

    const displayItems = ganttChart && ganttChart.displayItems
        ? ganttChart.displayItems
        : buildDisplayItems(visibleTasks, allTaskGroups);

    body.innerHTML = '';

    displayItems.forEach((item) => {
        if (item.type === 'group') {
            // ── Group header row ──────────────────────────────────────────
            const row = document.createElement('div');
            row.className = 'tl-row tl-group-header';
            row.dataset.groupId = item.group.id;
            row.draggable = true;
            row.style.background = item.group.color + '18';
            row.style.borderLeft  = `4px solid ${item.group.color}`;
            row.style.paddingLeft = (6 + (item.depth || 0) * 16) + 'px';

            const collapsed = _collapsedGroups.has(item.group.id);

            const grip = document.createElement('span');
            grip.className = 'tl-grip';
            grip.textContent = '⠿';
            grip.title = 'Drag to reorder group';

            const toggle = document.createElement('span');
            toggle.className = 'tl-group-toggle';
            toggle.textContent = collapsed ? '▶' : '▼';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tl-name tl-group-name';
            nameSpan.textContent = item.group.name;
            nameSpan.style.color = item.group.color;

            const countBadge = document.createElement('span');
            countBadge.className = 'ms-auto badge rounded-pill';
            countBadge.style.cssText = `background:${item.group.color}30; color:${item.group.color}; font-size:9px;`;
            countBadge.textContent = item.tasks.length;

            row.appendChild(grip);
            row.appendChild(toggle);
            row.appendChild(nameSpan);
            row.appendChild(countBadge);

            row.addEventListener('click', () => toggleGroupCollapse(item.group.id));

            // ── Drag source: group reordering ─────────────────────────────
            row.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', 'group:' + String(item.group.id));
                e.dataTransfer.effectAllowed = 'move';
                _dragSourceGroupId = item.group.id;
                requestAnimationFrame(() => row.classList.add('tl-dragging'));
            });
            row.addEventListener('dragend', () => {
                row.classList.remove('tl-dragging');
                _dragSourceGroupId = null;
                body.querySelectorAll('.tl-drag-over, .tl-drop-target').forEach(el =>
                    el.classList.remove('tl-drag-over', 'tl-drop-target'));
            });

            // ── Drop target: task → group OR group reorder ────────────────
            row.addEventListener('dragover', e => {
                if (_dragSourceTaskId != null) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    row.classList.add('tl-drop-target');
                } else if (_dragSourceGroupId != null && _dragSourceGroupId !== item.group.id) {
                    const src = allTaskGroups.find(g => g.id === _dragSourceGroupId);
                    if (src && src.parent_id === item.group.parent_id) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        row.classList.add('tl-drag-over');
                    }
                }
            });
            row.addEventListener('dragleave', () =>
                row.classList.remove('tl-drop-target', 'tl-drag-over'));
            row.addEventListener('drop', e => {
                e.preventDefault();
                row.classList.remove('tl-drop-target', 'tl-drag-over');
                if (_dragSourceTaskId != null) {
                    const tid = parseInt(e.dataTransfer.getData('text/plain'));
                    if (tid) moveTaskToGroup(tid, item.group.id);
                } else if (_dragSourceGroupId != null && _dragSourceGroupId !== item.group.id) {
                    reorderGroup(_dragSourceGroupId, item.group.id);
                }
            });

            body.appendChild(row);
        } else {
            // ── Task row ──────────────────────────────────────────────────
            const task = item.task;
            const row = document.createElement('div');
            row.className = 'tl-row';
            row.title = task.title;
            row.dataset.taskId = task.id;
            row.draggable = true;

            // Indent grouped tasks
            const indent = item.indent ? 6 + item.indent * 16 : 10;
            row.style.paddingLeft = indent + 'px';

            // Group color left stripe
            if (task.group_color) {
                row.style.borderLeft = `3px solid ${task.group_color}`;
            }

            const dot = document.createElement('span');
            dot.className = 'tl-dot';
            dot.style.background = STATUS_COLORS[task.status] || '#94a3b8';

            const name = document.createElement('span');
            name.className = 'tl-name';
            name.textContent = task.title;

            row.appendChild(dot);
            row.appendChild(name);

            // Member avatars
            const members = task.assignments && task.assignments.length > 0
                ? task.assignments
                : (task.assignee_name ? [{ name: task.assignee_name }] : []);
            if (members.length > 0) {
                const memberSpan = document.createElement('span');
                memberSpan.className = 'tl-members';
                members.forEach((m, i) => {
                    const initials = (m.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    const av = document.createElement('span');
                    av.className = 'tl-avatar';
                    av.style.background = memberColor(m.member_id || m.id, i);
                    av.textContent = initials;
                    av.title = `${m.name}${m.allocated_hours ? ` (${m.allocated_hours}h)` : ''}`;
                    memberSpan.appendChild(av);
                });
                row.appendChild(memberSpan);
            }

            // Click → edit
            row.addEventListener('click', () => showEditTaskModal(task.id));

            // ── Drag source ───────────────────────────────────────────────
            row.addEventListener('dragstart', e => {
                e.dataTransfer.setData('text/plain', String(task.id));
                e.dataTransfer.effectAllowed = 'move';
                _dragSourceTaskId = task.id;
                requestAnimationFrame(() => row.classList.add('tl-dragging'));
            });
            row.addEventListener('dragend', () => {
                row.classList.remove('tl-dragging');
                _dragSourceTaskId = null;
                body.querySelectorAll('.tl-drag-over, .tl-drop-target').forEach(el => {
                    el.classList.remove('tl-drag-over', 'tl-drop-target');
                });
            });

            // ── Drop target: reorder within / between groups ──────────────
            row.addEventListener('dragover', e => {
                if (_dragSourceTaskId == null || _dragSourceTaskId === task.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                body.querySelectorAll('.tl-drag-over').forEach(el => el.classList.remove('tl-drag-over'));
                row.classList.add('tl-drag-over');
            });
            row.addEventListener('dragleave', e => {
                if (!row.contains(e.relatedTarget)) row.classList.remove('tl-drag-over');
            });
            row.addEventListener('drop', e => {
                e.preventDefault();
                row.classList.remove('tl-drag-over');
                const sid = parseInt(e.dataTransfer.getData('text/plain'));
                if (sid && sid !== task.id) reorderTask(sid, task.id, task.group_id || null);
            });

            body.appendChild(row);
        }
    });

    syncTaskListScroll();
}

// AbortController so we can tear down all scroll listeners on each re-init
let _scrollSyncAbort = null;

function syncTaskListScroll() {
    const tlBody     = document.getElementById('task-list-body');
    const bodyScroll = document.getElementById('gantt-body-scroll');
    if (!tlBody || !bodyScroll) return;

    if (_scrollSyncAbort) _scrollSyncAbort.abort();
    _scrollSyncAbort = new AbortController();
    const sig = { signal: _scrollSyncAbort.signal };

    // Vertical sync: task-list ↔ body SVG scroll container
    let vlock = false;
    bodyScroll.addEventListener('scroll', () => {
        if (vlock) return; vlock = true;
        tlBody.scrollTop = bodyScroll.scrollTop;
        vlock = false;
    }, sig);
    tlBody.addEventListener('scroll', () => {
        if (vlock) return; vlock = true;
        bodyScroll.scrollTop = tlBody.scrollTop;
        vlock = false;
    }, sig);
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG DEPENDENCY ARROWS
// Draws FS / SS / FF / SF arrows directly into the custom Gantt body SVG.
// Called after every render and view-mode change.
// ─────────────────────────────────────────────────────────────────────────────

const DEP_COLORS = {
    finish_to_start:  '#3b82f6',  // blue
    start_to_start:   '#22c55e',  // green
    finish_to_finish: '#f97316',  // orange
    start_to_finish:  '#a855f7',  // purple
};

const DEP_LABELS = {
    finish_to_start:  'FS',
    start_to_start:   'SS',
    finish_to_finish: 'FF',
    start_to_finish:  'SF',
};

function drawDependencyArrows() {
    const svg = document.getElementById('gantt-svg');
    if (!svg) return;

    // Remove previous layer
    svg.querySelectorAll('.dep-arrows-layer').forEach(el => el.remove());

    // Ensure <defs> exists with arrowhead markers for each dep type
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    for (const [type, color] of Object.entries(DEP_COLORS)) {
        const markerId = `dep-arrow-${type}`;
        if (!defs.querySelector(`#${markerId}`)) {
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
            marker.setAttribute('id', markerId);
            marker.setAttribute('viewBox', '0 0 8 8');
            marker.setAttribute('refX', '7');
            marker.setAttribute('refY', '4');
            marker.setAttribute('markerWidth', '5');
            marker.setAttribute('markerHeight', '5');
            marker.setAttribute('orient', 'auto');
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            poly.setAttribute('points', '0 0, 8 4, 0 8');
            poly.setAttribute('fill', color);
            marker.appendChild(poly);
            defs.appendChild(marker);
        }
    }

    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('class', 'dep-arrows-layer');
    layer.setAttribute('pointer-events', 'none');

    let drawnCount = 0;

    allTasks.forEach(task => {
        if (!task.dependencies || task.dependencies.length === 0) return;

        const succRect = getBarRect(task.id);
        if (!succRect) return;

        task.dependencies.forEach(dep => {
            const predId = dep.id;          // API returns predecessor_task_id as 'id'
            const depType = dep.type || 'finish_to_start';
            const lag = dep.lag_days || 0;

            const predRect = getBarRect(predId);
            if (!predRect) return;

            const color = DEP_COLORS[depType] || DEP_COLORS.finish_to_start;
            const label = DEP_LABELS[depType] || 'FS';

            const { d, labelX, labelY } = buildArrowPath(predRect, succRect, depType);
            if (!d) return;

            // Arrow path
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('stroke', color);
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('opacity', '0.85');
            path.setAttribute('marker-end', `url(#dep-arrow-${depType})`);
            layer.appendChild(path);

            // Label: "FS", "SS+2d", etc.
            const lagStr = lag > 0 ? `+${lag}d` : '';
            const labelText = label + lagStr;

            const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const PADX = 3, PADY = 1, FONT = 9;
            const textW = labelText.length * (FONT * 0.6);
            bg.setAttribute('x', labelX - PADX);
            bg.setAttribute('y', labelY - FONT + PADY);
            bg.setAttribute('width', textW + PADX * 2);
            bg.setAttribute('height', FONT + PADY * 2);
            bg.setAttribute('rx', '2');
            bg.setAttribute('fill', 'white');
            bg.setAttribute('opacity', '0.85');
            layer.appendChild(bg);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', labelX);
            text.setAttribute('y', labelY);
            text.setAttribute('font-size', FONT);
            text.setAttribute('font-family', 'Segoe UI, sans-serif');
            text.setAttribute('font-weight', '600');
            text.setAttribute('fill', color);
            text.textContent = labelText;
            layer.appendChild(text);

            drawnCount++;
        });
    });

    svg.appendChild(layer);
    if (drawnCount > 0) console.log(`Dependency arrows: drew ${drawnCount} arrow(s)`);
}

/**
 * Get the {x, y, w, h, midY} of a task bar inside our body SVG.
 * Our structure: g.bar-wrapper[data-id="N"] > rect.bar
 */
function getBarRect(taskId) {
    const wrapper = document.querySelector(`#gantt-svg .bar-wrapper[data-id="${taskId}"]`);
    if (!wrapper) return null;
    const bar = wrapper.querySelector('.bar');
    if (!bar) return null;
    const x = parseFloat(bar.getAttribute('x')) || 0;
    const y = parseFloat(bar.getAttribute('y')) || 0;
    const w = parseFloat(bar.getAttribute('width')) || 0;
    const h = parseFloat(bar.getAttribute('height')) || 0;
    return { x, y, w, h, midY: y + h / 2 };
}

/**
 * Build an orthogonal (H→V→H) SVG path between predecessor and successor bars.
 * Returns { d, labelX, labelY } where labelX/Y is a good spot for the type badge.
 *
 * Dependency semantics (exit → entry):
 *   FS: pred right  → succ left
 *   SS: pred left   → succ left
 *   FF: pred right  → succ right
 *   SF: pred left   → succ right
 */
function buildArrowPath(pred, succ, depType) {
    const MARGIN = 14;   // minimum horizontal segment length (px)

    const exitRight  = (depType === 'finish_to_start' || depType === 'finish_to_finish');
    const entryRight = (depType === 'finish_to_finish' || depType === 'start_to_finish');

    // Start / end x (nudged 1px past bar edge so marker doesn't overlap bar)
    const sx = exitRight  ? pred.x + pred.w + 1 : pred.x - 1;
    const ex = entryRight ? succ.x + succ.w - 1 : succ.x + 1;
    const sy = pred.midY;
    const ey = succ.midY;

    let mx;   // x coordinate of the vertical segment

    if (exitRight && !entryRight) {
        // FS: pred-right → succ-left
        if (ex > sx + MARGIN * 2) {
            mx = sx + (ex - sx) / 2;          // simple midpoint
        } else {
            mx = Math.max(sx + MARGIN, ex + MARGIN);  // loop around
        }
    } else if (!exitRight && !entryRight) {
        // SS: pred-left → succ-left; detour to the left of both
        mx = Math.min(sx, ex) - MARGIN;
    } else if (exitRight && entryRight) {
        // FF: pred-right → succ-right; detour to the right of both
        mx = Math.max(sx, ex) + MARGIN;
    } else {
        // SF: pred-left → succ-right; detour left
        mx = Math.min(sx, ex) - MARGIN;
    }

    // Horizontal-only if same row
    let d;
    if (Math.abs(sy - ey) < 1) {
        d = `M ${sx} ${sy} H ${ex}`;
    } else {
        d = `M ${sx} ${sy} H ${mx} V ${ey} H ${ex}`;
    }

    // Label sits at the midpoint of the vertical segment
    const labelX = mx + 2;
    const labelY = (sy + ey) / 2;

    return { d, labelX, labelY };
}

// ─────────────────────────────────────────────────────────────────────────────

// Export all functions for global access
window.ganttChart = ganttChart;
window.addTodayLine = addTodayLine;
window.goToToday = goToToday;
window.showAddTaskModal = showAddTaskModal;
window.showEditTaskModal = showEditTaskModal;
window.showManageGroupsModal = showManageGroupsModal;
window.saveTask = saveTask;
window.deleteTask = deleteTask;
window.viewAllTasks = viewAllTasks;
window.addDependency = addDependency;
window.removeDependency = removeDependency;
window.changeViewMode = changeViewMode;
window.toggleWorkingDaysOnly = toggleWorkingDaysOnly;
window.togglePopup = togglePopup;
window.applyCascadingDependencyChanges = applyCascadingDependencyChanges;
window.showDependencyViolationModal = showDependencyViolationModal;
window.checkForCircularDependency = checkForCircularDependency;
window.checkTaskDependencyViolations = checkTaskDependencyViolations;
window.validateAllTaskDependencies = validateAllTaskDependencies;
window.handleTaskDateChange = handleTaskDateChange;
window.drawDependencyArrows = drawDependencyArrows;
window.buildTaskListPanel = buildTaskListPanel;
window.handleTaskProgressChange = handleTaskProgressChange;
window.showBudgetModal = showBudgetModal;
window.updateAssignment = updateAssignment;
window.removeAssignment = removeAssignment;
window.addMemberAssignment = addMemberAssignment;
window.toggleGroupCollapse = toggleGroupCollapse;
window.moveTaskToGroup = moveTaskToGroup;
window.reorderTask = reorderTask;
window.loadTaskGroups = loadTaskGroups;
window.renderGroupsList = renderGroupsList;

// ── Export ────────────────────────────────────────────────────────────────────

async function exportProject(format = 'json') {
    if (!currentProject) {
        showError('Please select a project first.');
        return;
    }
    try {
        const resp = await fetch(`/api/projects/${currentProject.id}/export?format=${format}`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            showError(err.message || `Export failed (${resp.status})`);
            return;
        }
        const blob = await resp.blob();
        const ext  = format === 'csv' ? 'csv' : 'json';
        const name = (currentProject.name || 'project').replace(/[^a-z0-9\-_ ]/gi, '_');
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${name}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
        showError(`Export failed: ${err.message}`);
    }
}

// ── A3 landscape PDF export ───────────────────────────────────────────────────
// Builds a combined SVG from the header SVG, body SVG, and left label panel,
// renders it to a hi-res canvas, then saves as an A3 landscape PDF via jsPDF.
async function exportGanttPDF() {
    if (!currentProject) { showError('Please select a project first'); return; }
    if (!window.jspdf)   { showError('PDF library not loaded — check your internet connection'); return; }

    const headerSvgEl = document.getElementById('gantt-header-svg');
    const bodySvgEl   = document.getElementById('gantt-svg');
    const tlBody      = document.getElementById('task-list-body');
    const tlPanel     = document.getElementById('task-list-panel');

    if (!headerSvgEl || !bodySvgEl || !tlBody) {
        showError('Gantt chart not loaded — please open a project first');
        return;
    }

    showLoading(true);
    showToast('Building PDF…', 'info');

    try {
        // ── Dimensions ────────────────────────────────────────────────────
        const panelW = tlPanel ? tlPanel.offsetWidth : 240;
        const svgW   = parseFloat(bodySvgEl.getAttribute('width'));
        const svgH   = parseFloat(bodySvgEl.getAttribute('height'));
        const titleH = 38;   // gradient title bar at the top
        const totalW = panelW + svgW;
        const totalH = titleH + HEADER_H + svgH;

        // ── Helpers ───────────────────────────────────────────────────────
        function esc(s) {
            return String(s || '')
                .replace(/&/g,'&amp;').replace(/</g,'&lt;')
                .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
        // Extract the first CSS colour value from a borderLeft string
        function borderColor(el) {
            const m = (el.style.borderLeft || '').match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/i);
            return m ? m[0] : null;
        }
        // Strip 8-digit hex alpha so SVG fill accepts it (SVG 1.1 only supports 6-digit)
        function safeColor(c) {
            if (!c) return null;
            return c.replace(/^(#[0-9a-fA-F]{6})[0-9a-fA-F]{2}$/, '$1');
        }

        // ── Build SVG string ──────────────────────────────────────────────
        const today    = new Date().toLocaleDateString('nl-NL', { day:'2-digit', month:'long', year:'numeric' });
        const projName = esc(currentProject.name || 'Project');

        let s = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
                      width="${totalW}" height="${totalH}"
                      style="font-family:Arial,Helvetica,sans-serif;">`;

        // Title bar (gradient background)
        s += `<defs>
            <linearGradient id="pdf-hdr-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%"   stop-color="#667eea"/>
                <stop offset="100%" stop-color="#764ba2"/>
            </linearGradient>
        </defs>`;
        s += `<rect x="0" y="0" width="${totalW}" height="${titleH}" fill="url(#pdf-hdr-grad)"/>`;
        s += `<text x="14" y="${titleH * 0.62}" font-size="17" font-weight="bold"    fill="white">${projName}</text>`;
        s += `<text x="14" y="${titleH * 0.90}" font-size="10"                       fill="rgba(255,255,255,0.75)">Gantt Planning</text>`;
        s += `<text x="${totalW - 12}" y="${titleH * 0.62}" font-size="11" text-anchor="end" fill="rgba(255,255,255,0.9)">${esc(today)}</text>`;

        // ── Left panel header cell ────────────────────────────────────────
        const panelTop = titleH;
        s += `<rect x="0" y="${panelTop}" width="${panelW}" height="${HEADER_H}" fill="#eef0f5"/>`;
        s += `<text x="12" y="${panelTop + HEADER_H * 0.62}" font-size="12" font-weight="bold" fill="#444">Activiteit</text>`;

        // ── Left panel task rows ──────────────────────────────────────────
        const rowsTop = panelTop + HEADER_H;
        const tlRows  = [...tlBody.children];
        tlRows.forEach((row, i) => {
            const isGroup = row.classList.contains('tl-group-header');
            const ry = rowsTop + i * ROW_H;

            // Background
            let bg = isGroup ? (safeColor(row.style.background) || '#ededf5') : (i % 2 === 0 ? '#ffffff' : '#f8f9fa');
            s += `<rect x="0" y="${ry}" width="${panelW - 1}" height="${ROW_H}" fill="${esc(bg)}"/>`;

            // Left colour stripe from group/task border
            const bc = safeColor(borderColor(row));
            if (bc) {
                s += `<rect x="0" y="${ry}" width="${isGroup ? 4 : 3}" height="${ROW_H}" fill="${esc(bc)}"/>`;
            }

            // Task / group label
            const nameEl  = row.querySelector('.tl-name');
            const label   = nameEl ? nameEl.textContent.trim() : '';
            const indent  = (parseInt(row.style.paddingLeft) || (isGroup ? 8 : 10)) + (bc ? 5 : 2);
            const maxChars = Math.floor((panelW - indent - 6) / (isGroup ? 6.5 : 6));
            const text    = label.length > maxChars ? label.slice(0, maxChars - 1) + '…' : label;
            const nameColor = isGroup ? (safeColor(row.querySelector('.tl-group-name')?.style.color) || '#333') : '#555';
            s += `<text x="${indent}" y="${ry + ROW_H * 0.63}"
                        font-size="${isGroup ? 11 : 10}"
                        font-weight="${isGroup ? 'bold' : 'normal'}"
                        fill="${esc(nameColor)}">${esc(text)}</text>`;

            // Row separator
            s += `<line x1="0" y1="${ry + ROW_H}" x2="${panelW}" y2="${ry + ROW_H}" stroke="#eeeeee" stroke-width="0.5"/>`;
        });

        // Panel / header borders
        s += `<line x1="${panelW}" y1="${panelTop}"    x2="${panelW}"  y2="${totalH}"        stroke="#c8c8d0" stroke-width="1"/>`;
        s += `<line x1="0"        y1="${rowsTop}"      x2="${totalW}"  y2="${rowsTop}"        stroke="#ced4da" stroke-width="2"/>`;

        // ── Embed header and body SVGs ────────────────────────────────────
        s += `<g transform="translate(${panelW},${panelTop})">${headerSvgEl.innerHTML}</g>`;
        s += `<g transform="translate(${panelW},${rowsTop})">${bodySvgEl.innerHTML}</g>`;

        s += '</svg>';

        // ── Render SVG → canvas (2× for crisp output) ────────────────────
        const SCALE   = 2;
        const canvas  = document.createElement('canvas');
        canvas.width  = totalW * SCALE;
        canvas.height = totalH * SCALE;
        const ctx     = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, totalW, totalH);

        const svgBlob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl  = URL.createObjectURL(svgBlob);
        await new Promise((resolve, reject) => {
            const img   = new Image();
            img.onload  = () => { ctx.drawImage(img, 0, 0, totalW, totalH); resolve(); };
            img.onerror = ()  => reject(new Error('SVG-to-canvas rendering failed'));
            img.src = svgUrl;
        });
        URL.revokeObjectURL(svgUrl);

        // ── Create A3 landscape PDF ───────────────────────────────────────
        const { jsPDF } = window.jspdf;
        const pdf  = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
        const pdfW = pdf.internal.pageSize.getWidth();   // 420 mm
        const pdfH = pdf.internal.pageSize.getHeight();  // 297 mm
        const margin = 6;   // mm around the image
        const availW = pdfW - 2 * margin;
        const availH = pdfH - 2 * margin;

        // Scale to fit A3 preserving aspect ratio
        const aspect = totalW / totalH;
        let imgW, imgH;
        if (aspect >= availW / availH) {
            imgW = availW;  imgH = availW  / aspect;
        } else {
            imgH = availH;  imgW = availH * aspect;
        }
        const ix = margin + (availW - imgW) / 2;
        const iy = margin + (availH - imgH) / 2;

        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', ix, iy, imgW, imgH, '', 'FAST');

        const fname = (currentProject.name || 'gantt').replace(/[^a-z0-9\-_ ]/gi, '_');
        pdf.save(`${fname}_gantt_A3.pdf`);
        showSuccess('A3 PDF exported');

    } catch (err) {
        console.error('PDF export error:', err);
        showError('PDF export failed: ' + err.message);
    } finally {
        showLoading(false);
    }
}

// ── Import ────────────────────────────────────────────────────────────────────

let _importData     = null;   // parsed JSON from selected .json file
let _importCsvFile  = null;   // raw File object for .csv import
let _importFileType = null;   // 'json' | 'csv'

function showImportModal() {
    _importData     = null;
    _importCsvFile  = null;
    _importFileType = null;

    const fileInput    = document.getElementById('import-file-input');
    const preview      = document.getElementById('import-preview');
    const errorDiv     = document.getElementById('import-error');
    const btn          = document.getElementById('confirm-import-btn');
    const nameSpan     = document.getElementById('import-current-name');
    const csvNameRow   = document.getElementById('import-csv-project-name-row');

    fileInput.value = '';
    preview.classList.add('d-none');
    errorDiv.classList.add('d-none');
    csvNameRow.classList.add('d-none');
    btn.disabled = true;
    nameSpan.textContent = currentProject ? currentProject.name : '—';

    fileInput.onchange = async () => {
        preview.classList.add('d-none');
        errorDiv.classList.add('d-none');
        csvNameRow.classList.add('d-none');
        btn.disabled = true;
        _importData     = null;
        _importCsvFile  = null;
        _importFileType = null;

        const file = fileInput.files[0];
        if (!file) return;

        const isCsv = file.name.toLowerCase().endsWith('.csv');

        try {
            const text = await file.text();

            if (isCsv) {
                // Parse CSV header to validate and count rows
                const lines = text.trim().split('\n').filter(l => l.trim());
                if (lines.length < 2) throw new Error('CSV has no data rows.');
                const delim = lines[0].includes(';') ? ';' : ',';
                const headers = lines[0].split(delim).map(h => h.trim().replace(/^"|"$/g, ''));
                if (!headers.includes('title')) throw new Error('Missing required column: title');
                const nTasks = lines.length - 1;
                _importCsvFile  = file;
                _importFileType = 'csv';
                document.getElementById('import-preview-text').textContent =
                    ` ${nTasks} tasks from CSV`;
                // Show project name field only when creating new
                const isNew = document.querySelector('input[name="importTarget"]:checked')?.value === 'new';
                if (isNew) csvNameRow.classList.remove('d-none');
            } else {
                // JSON
                const data = JSON.parse(text);
                if (!data.version || !data.tasks) throw new Error('File does not look like a valid project export.');
                _importData     = data;
                _importFileType = 'json';
                const nTasks   = data.tasks.length;
                const nGroups  = (data.groups || []).length;
                const projName = data.project?.name || 'Unknown';
                document.getElementById('import-preview-text').textContent =
                    ` "${projName}" — ${nTasks} tasks, ${nGroups} groups`;
                csvNameRow.classList.add('d-none');
            }

            preview.classList.remove('d-none');
            btn.disabled = false;
        } catch (err) {
            errorDiv.textContent = `Cannot read file: ${err.message}`;
            errorDiv.classList.remove('d-none');
        }
    };

    // Show/hide project name field when target changes
    document.querySelectorAll('input[name="importTarget"]').forEach(r => {
        r.onchange = () => {
            const isNew = r.value === 'new';
            const csvNameRow = document.getElementById('import-csv-project-name-row');
            if (_importFileType === 'csv' && isNew) {
                csvNameRow.classList.remove('d-none');
            } else {
                csvNameRow.classList.add('d-none');
            }
        };
    });

    const modal = new bootstrap.Modal(document.getElementById('importModal'));
    modal.show();
}

async function confirmImport() {
    if (!_importFileType) return;

    const useCurrentProject =
        document.querySelector('input[name="importTarget"]:checked')?.value === 'current';

    const btn = document.getElementById('confirm-import-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Importing…';

    try {
        let resp;
        if (_importFileType === 'csv') {
            const fd = new FormData();
            fd.append('file', _importCsvFile);
            fd.append('target_project_id', useCurrentProject && currentProject ? currentProject.id : '');
            fd.append('project_name', document.getElementById('import-csv-project-name').value.trim() || 'Imported Project');
            resp = await fetch('/api/projects/import-csv', { method: 'POST', body: fd });
        } else {
            const body = {
                data: _importData,
                target_project_id: useCurrentProject && currentProject ? currentProject.id : null,
            };
            resp = await fetch('/api/projects/import', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
        }
        const result = await resp.json();

        if (result.success) {
            bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
            showSuccess(result.message);

            // If a new project was created, switch to it; otherwise reload current
            if (!useCurrentProject && result.project_id) {
                await loadProjects();
                const sel = document.getElementById('project-select');
                if (sel) {
                    sel.value = result.project_id;
                    await handleProjectChange();
                }
            } else {
                await loadProjectTasks(currentProject.id, true);
            }
        } else {
            document.getElementById('import-error').textContent = result.message;
            document.getElementById('import-error').classList.remove('d-none');
        }
    } catch (err) {
        document.getElementById('import-error').textContent = `Request failed: ${err.message}`;
        document.getElementById('import-error').classList.remove('d-none');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-upload me-1"></i>Import';
    }
}

window.exportProject  = exportProject;

// ── Panel resize handles ──────────────────────────────────────────────────────

function initResizeHandles() {
    const STORAGE_H = 'gantt_panel_width';
    const STORAGE_V = 'gantt_chart_height';

    const handleH   = document.getElementById('resize-handle-h');
    const handleV   = document.getElementById('resize-handle-v');
    const panel     = document.getElementById('task-list-panel');
    const chartCard = document.querySelector('.chart-card');

    if (!handleH || !handleV || !panel || !chartCard) return;

    // Restore saved sizes
    const savedW = parseInt(localStorage.getItem(STORAGE_H));
    if (savedW) panel.style.width = savedW + 'px';

    const savedH = parseInt(localStorage.getItem(STORAGE_V));
    if (savedH) chartCard.style.flex = 'none', chartCard.style.height = savedH + 'px';

    // ── Horizontal drag (resize task-list-panel width) ────────────────────────
    handleH.addEventListener('mousedown', function (e) {
        e.preventDefault();
        handleH.classList.add('dragging');
        const startX     = e.clientX;
        const startWidth = panel.offsetWidth;

        function onMove(e) {
            const newW = Math.max(120, Math.min(600, startWidth + (e.clientX - startX)));
            panel.style.width = newW + 'px';
        }

        function onUp() {
            handleH.classList.remove('dragging');
            localStorage.setItem(STORAGE_H, parseInt(panel.style.width));
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            // Redraw dependency arrows after resize
            if (typeof drawDependencyArrows === 'function') drawDependencyArrows();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });

    // ── Vertical drag (resize chart-card height) ──────────────────────────────
    handleV.addEventListener('mousedown', function (e) {
        e.preventDefault();
        handleV.classList.add('dragging');
        const startY      = e.clientY;
        const startHeight = chartCard.offsetHeight;

        function onMove(e) {
            const newH = Math.max(120, startHeight + (e.clientY - startY));
            chartCard.style.flex   = 'none';
            chartCard.style.height = newH + 'px';
        }

        function onUp() {
            handleV.classList.remove('dragging');
            localStorage.setItem(STORAGE_V, chartCard.offsetHeight);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup',   onUp);
            if (typeof drawDependencyArrows === 'function') drawDependencyArrows();
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup',   onUp);
    });
}

// Called after DOM is ready
document.addEventListener('DOMContentLoaded', initResizeHandles);
window.showImportModal = showImportModal;
window.confirmImport  = confirmImport;