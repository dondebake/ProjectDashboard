// Team management page JavaScript functionality
let allTeamMembers = [];
let allRoles = [];
let currentEditingMember = null;
let memberModal = null;
let rolesModal = null;
let importModal = null;
let importRows = [];

document.addEventListener('DOMContentLoaded', function () {
    memberModal = new bootstrap.Modal(document.getElementById('member-modal'));
    rolesModal  = new bootstrap.Modal(document.getElementById('roles-modal'));
    importModal = new bootstrap.Modal(document.getElementById('import-modal'));

    document.getElementById('add-member-btn').addEventListener('click', openAddModal);
    document.getElementById('refresh-btn').addEventListener('click', loadTeamMembers);
    document.getElementById('save-member-btn').addEventListener('click', saveMember);
    document.getElementById('delete-member-btn').addEventListener('click', deleteCurrentMember);
    document.getElementById('manage-roles-btn').addEventListener('click', openRolesModal);
    document.getElementById('add-role-btn').addEventListener('click', addRole);
    document.getElementById('new-role-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') addRole();
    });
    document.getElementById('export-btn').addEventListener('click', exportTeamCSV);
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file-input').click());
    document.getElementById('import-file-input').addEventListener('change', handleImportFile);
    document.getElementById('confirm-import-btn').addEventListener('click', confirmImport);

    loadRoles().then(loadTeamMembers);
});

// ── Roles ─────────────────────────────────────────────────────────────────────

async function loadRoles() {
    try {
        const resp = await fetch('/api/roles');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        allRoles = await resp.json();
        populateRoleSelect();
    } catch (err) {
        showError('Failed to load roles: ' + err.message);
    }
}

function populateRoleSelect(selectedRole) {
    const sel = document.getElementById('member-role');
    const current = selectedRole ?? sel.value;
    sel.innerHTML = '<option value="">Select Role</option>' +
        allRoles.map(r => `<option value="${escapeHtml(r.name)}"${r.name === current ? ' selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
}

function renderRolesList() {
    const ul = document.getElementById('roles-list');
    if (allRoles.length === 0) {
        ul.innerHTML = '<li class="list-group-item text-muted">No roles defined.</li>';
        return;
    }
    ul.innerHTML = allRoles.map(r => `
        <li class="list-group-item d-flex justify-content-between align-items-center">
            <span class="role-label" data-id="${r.id}">${escapeHtml(r.name)}</span>
            <div class="d-flex gap-1">
                <button class="btn btn-sm btn-outline-primary" onclick="startEditRole(${r.id})" title="Rename">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteRole(${r.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </li>
    `).join('');
}

function openRolesModal() {
    renderRolesList();
    document.getElementById('new-role-name').value = '';
    rolesModal.show();
}

async function addRole() {
    const input = document.getElementById('new-role-name');
    const name = input.value.trim();
    if (!name) return;
    try {
        const resp = await fetch('/api/roles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) { showError(data.message || 'Failed to add role'); return; }
        input.value = '';
        await loadRoles();
        renderRolesList();
    } catch (err) {
        showError('Failed to add role: ' + err.message);
    }
}

function startEditRole(roleId) {
    const role = allRoles.find(r => r.id === roleId);
    if (!role) return;
    const li = document.querySelector(`.role-label[data-id="${roleId}"]`).closest('li');
    li.innerHTML = `
        <input type="text" class="form-control form-control-sm me-2" id="edit-role-input-${roleId}" value="${escapeHtml(role.name)}">
        <div class="d-flex gap-1">
            <button class="btn btn-sm btn-success" onclick="saveRoleEdit(${roleId})" title="Save">
                <i class="fas fa-check"></i>
            </button>
            <button class="btn btn-sm btn-secondary" onclick="renderRolesList()" title="Cancel">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;
    document.getElementById(`edit-role-input-${roleId}`).focus();
}

async function saveRoleEdit(roleId) {
    const name = document.getElementById(`edit-role-input-${roleId}`).value.trim();
    if (!name) return;
    try {
        const resp = await fetch(`/api/roles/${roleId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) { showError(data.message || 'Failed to rename role'); return; }
        await loadRoles();
        renderRolesList();
        await loadTeamMembers(); // refresh table in case role names changed
    } catch (err) {
        showError('Failed to rename role: ' + err.message);
    }
}

async function deleteRole(roleId) {
    const role = allRoles.find(r => r.id === roleId);
    if (!confirm(`Delete role "${role?.name}"?`)) return;
    try {
        const resp = await fetch(`/api/roles/${roleId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (!resp.ok || !data.success) { showError(data.message || 'Failed to delete role'); return; }
        await loadRoles();
        renderRolesList();
    } catch (err) {
        showError('Failed to delete role: ' + err.message);
    }
}

// ── Data loading ──────────────────────────────────────────────────────────────

async function loadTeamMembers() {
    try {
        const resp = await fetch('/api/team-members');
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        allTeamMembers = await resp.json();
        renderTable();
        renderStats();
    } catch (err) {
        showError('Failed to load team members: ' + err.message);
    }
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderTable() {
    const tbody = document.getElementById('team-table-body');
    if (!tbody) return;

    if (allTeamMembers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted py-4">No team members found.</td></tr>`;
        return;
    }

    tbody.innerHTML = allTeamMembers.map(m => `
        <tr>
            <td><strong>${escapeHtml(m.name)}</strong></td>
            <td>${escapeHtml(m.role)}</td>
            <td><a href="mailto:${escapeHtml(m.email)}">${escapeHtml(m.email)}</a></td>
            <td>€${(m.hourly_rate || 0).toFixed(2)}/h</td>
            <td>${m.availability_hours_per_week || 0} h/wk</td>
            <td>${m.project_count || 0}</td>
            <td>${m.active_tasks || 0}</td>
            <td><span class="badge bg-success">Active</span></td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="openEditModal(${m.id})" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="confirmDelete(${m.id})" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

async function renderStats() {
    const totalHours = allTeamMembers.reduce((s, m) => s + (m.availability_hours_per_week || 0), 0);

    document.getElementById('total-members').textContent  = allTeamMembers.length;
    document.getElementById('active-members').textContent = allTeamMembers.length; // all returned are active
    document.getElementById('total-hours').textContent    = totalHours;

    // Count active projects from the projects API
    try {
        const resp = await fetch('/api/projects');
        if (resp.ok) {
            const projects = await resp.json();
            const active = projects.filter(p => p.status === 'Active').length;
            document.getElementById('active-projects').textContent = active;
        }
    } catch (_) {
        document.getElementById('active-projects').textContent = '—';
    }
}

// ── Modal helpers ─────────────────────────────────────────────────────────────

function openAddModal() {
    currentEditingMember = null;
    document.getElementById('member-modal-title').textContent = 'Add Team Member';
    document.getElementById('member-form').reset();
    document.getElementById('member-id').value = '';
    document.getElementById('member-availability').value = 40;
    document.getElementById('member-status').value = 'true';
    document.getElementById('delete-member-btn').style.display = 'none';
    populateRoleSelect('');
    memberModal.show();
}

function openEditModal(memberId) {
    const m = allTeamMembers.find(x => x.id === memberId);
    if (!m) return;
    currentEditingMember = m;

    document.getElementById('member-modal-title').textContent = 'Edit Team Member';
    document.getElementById('member-id').value              = m.id;
    document.getElementById('member-name').value            = m.name || '';
    document.getElementById('member-email').value           = m.email || '';
    populateRoleSelect(m.role || '');
    document.getElementById('member-hourly-rate').value     = m.hourly_rate || '';
    document.getElementById('member-availability').value    = m.availability_hours_per_week || 40;
    document.getElementById('member-status').value          = m.is_active === false ? 'false' : 'true';
    document.getElementById('delete-member-btn').style.display = '';
    memberModal.show();
}

// ── Save (create / update) ────────────────────────────────────────────────────

async function saveMember() {
    const name         = document.getElementById('member-name').value.trim();
    const email        = document.getElementById('member-email').value.trim();
    const role         = document.getElementById('member-role').value;
    const hourlyRate   = parseFloat(document.getElementById('member-hourly-rate').value) || 0;
    const availability = parseFloat(document.getElementById('member-availability').value) || 40;
    const isActive     = document.getElementById('member-status').value === 'true';

    if (!name || !email || !role) {
        showError('Name, email, and role are required.');
        return;
    }

    const payload = { name, email, role, hourly_rate: hourlyRate,
                      availability_hours_per_week: availability, is_active: isActive };

    const id = document.getElementById('member-id').value;
    const url    = id ? `/api/team-members/${id}` : '/api/team-members';
    const method = id ? 'PUT' : 'POST';

    try {
        const resp = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            showError(data.message || `Save failed (${resp.status})`);
            return;
        }
        memberModal.hide();
        showSuccess(id ? 'Team member updated.' : 'Team member added.');
        await loadTeamMembers();
    } catch (err) {
        showError('Save failed: ' + err.message);
    }
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteCurrentMember() {
    if (!currentEditingMember) return;
    if (!confirm(`Delete "${currentEditingMember.name}"? This cannot be undone.`)) return;
    await doDelete(currentEditingMember.id);
}

async function confirmDelete(memberId) {
    const m = allTeamMembers.find(x => x.id === memberId);
    if (!m) return;
    if (!confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    await doDelete(memberId);
}

async function doDelete(memberId) {
    try {
        const resp = await fetch(`/api/team-members/${memberId}`, { method: 'DELETE' });
        const data = await resp.json();
        if (!resp.ok || !data.success) {
            showError(data.message || `Delete failed (${resp.status})`);
            return;
        }
        memberModal.hide();
        showSuccess('Team member deleted.');
        await loadTeamMembers();
    } catch (err) {
        showError('Delete failed: ' + err.message);
    }
}

// ── Export ────────────────────────────────────────────────────────────────────

function exportTeamCSV() {
    if (allTeamMembers.length === 0) { showError('No team members to export.'); return; }

    const header = ['Name', 'Email', 'Role', 'Hourly Rate'];
    const rows = allTeamMembers.map(m => [
        csvField(m.name),
        csvField(m.email),
        csvField(m.role),
        (m.hourly_rate || 0).toFixed(2)
    ]);

    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'team_members.csv';
    a.click();
    URL.revokeObjectURL(url);
}

function csvField(val) {
    if (val == null) return '';
    const s = String(val);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"'
        : s;
}

// ── Import ────────────────────────────────────────────────────────────────────

function handleImportFile(event) {
    const file = event.target.files[0];
    event.target.value = '';          // reset so same file can be re-selected
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        try {
            importRows = parseCSV(e.target.result);
            showImportPreview();
        } catch (err) {
            showError('Failed to parse CSV: ' + err.message);
        }
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');

    const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

    const colName  = findCol(headers, ['name']);
    const colEmail = findCol(headers, ['email']);
    const colRole  = findCol(headers, ['role']);
    const colRate  = findCol(headers, ['hourly_rate', 'hourly rate', 'rate']);

    if (colName  === -1) throw new Error('Missing required column: Name');
    if (colEmail === -1) throw new Error('Missing required column: Email');
    if (colRole  === -1) throw new Error('Missing required column: Role');

    return lines.slice(1).map((line, i) => {
        const cols = splitCSVLine(line);
        const name  = (cols[colName]  || '').trim();
        const email = (cols[colEmail] || '').trim();
        const role  = (cols[colRole]  || '').trim();
        const rate  = colRate !== -1 ? parseFloat(cols[colRate]) || 0 : 0;

        const errors = [];
        if (!name)  errors.push('Name required');
        if (!email) errors.push('Email required');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email) errors.push('Invalid email');
        if (!role)  errors.push('Role required');

        return { rowNum: i + 2, name, email, role, hourly_rate: rate, errors };
    }).filter(r => r.name || r.email || r.role); // skip blank lines
}

function findCol(headers, candidates) {
    for (const c of candidates) {
        const idx = headers.indexOf(c);
        if (idx !== -1) return idx;
    }
    return -1;
}

function splitCSVLine(line) {
    const result = [];
    let cur = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(cur); cur = '';
        } else {
            cur += ch;
        }
    }
    result.push(cur);
    return result;
}

function showImportPreview() {
    const tbody = document.getElementById('import-preview-body');
    const valid = importRows.filter(r => r.errors.length === 0).length;

    tbody.innerHTML = importRows.map(r => {
        const ok = r.errors.length === 0;
        const statusHtml = ok
            ? '<span class="badge bg-success">OK</span>'
            : `<span class="badge bg-danger" title="${escapeHtml(r.errors.join(', '))}">${escapeHtml(r.errors.join(', '))}</span>`;
        return `<tr class="${ok ? '' : 'table-warning'}">
            <td>${r.rowNum}</td>
            <td>${escapeHtml(r.name)}</td>
            <td>${escapeHtml(r.email)}</td>
            <td>${escapeHtml(r.role)}</td>
            <td>${r.hourly_rate.toFixed(2)}</td>
            <td>${statusHtml}</td>
        </tr>`;
    }).join('');

    document.getElementById('import-summary').textContent =
        `${importRows.length} row(s) found — ${valid} valid, ${importRows.length - valid} with errors (errors will be skipped).`;
    document.getElementById('confirm-import-btn').disabled = valid === 0;
    importModal.show();
}

async function confirmImport() {
    const valid = importRows.filter(r => r.errors.length === 0);
    if (valid.length === 0) return;

    document.getElementById('confirm-import-btn').disabled = true;
    let succeeded = 0, failed = 0;

    for (const row of valid) {
        try {
            const resp = await fetch('/api/team-members', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: row.name,
                    email: row.email,
                    role: row.role,
                    hourly_rate: row.hourly_rate,
                    availability_hours_per_week: 40
                })
            });
            const data = await resp.json();
            if (resp.ok && data.success) succeeded++;
            else failed++;
        } catch (_) {
            failed++;
        }
    }

    importModal.hide();
    document.getElementById('confirm-import-btn').disabled = false;

    if (succeeded > 0) showSuccess(`Imported ${succeeded} team member(s)${failed > 0 ? `, ${failed} failed` : ''}.`);
    else showError(`Import failed for all ${failed} row(s).`);

    await loadTeamMembers();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escapeHtml(text) {
    if (!text) return '';
    const d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
}

function showError(message) { showToast(message, 'danger'); }
function showSuccess(message) { showToast(message, 'success'); }

function showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        container.style.zIndex = '1055';
        document.body.appendChild(container);
    }
    const id = 'toast-' + Date.now();
    container.insertAdjacentHTML('beforeend', `
        <div id="${id}" class="toast align-items-center text-white bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">${message}</div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `);
    const el = document.getElementById(id);
    new bootstrap.Toast(el, { autohide: true, delay: 4000 }).show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
}
