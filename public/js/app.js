// ===== AUTH =====
let currentUser = null;

async function initAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) { window.location.href = '/login.html'; return; }
        currentUser = await res.json();
        showUserInfo();
    } catch(err) {
        window.location.href = '/login.html';
    }
}

function showUserInfo() {
    if (!currentUser) return;
    document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
    document.getElementById('userName').textContent = currentUser.fullName || currentUser.username;
    
    const roleLabels = { admin: 'Διαχειριστής', supervisor: 'Επόπτης', technician: 'Τεχνικός' };
    document.getElementById('userRole').textContent = roleLabels[currentUser.role] || currentUser.role;
    
    // Show/hide admin-only buttons
    const isAdmin = currentUser.role === 'admin';
    document.getElementById('adminUsersBtn').style.display = isAdmin ? '' : 'none';
    document.getElementById('uploadMap').parentElement.style.display = isAdmin ? '' : 'none';
    document.getElementById('deleteMapBtn').style.display = isAdmin && currentMapId ? '' : 'none';
    
    // Hide all delete buttons for non-admin/supervisor
    if (currentUser.role === 'technician') {
        document.querySelectorAll('.btn-danger, .btn-delete-eq').forEach(btn => {
            btn.style.display = 'none';
        });
    }
}

function canDelete() {
    return currentUser && ['admin', 'supervisor'].includes(currentUser.role);
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
}

function toggleUserDropdown() {
    document.getElementById('userDropdown').classList.toggle('show');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        document.getElementById('userDropdown')?.classList.remove('show');
    }
});

// ===== CHANGE PASSWORD =====
function showChangePassword() {
    document.getElementById('userDropdown').classList.remove('show');
    document.getElementById('pwForm').reset();
    openModal('pwModal');
}

document.getElementById('pwForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const oldPw = document.getElementById('pwOld').value;
    const newPw = document.getElementById('pwNew').value;
    const confirmPw = document.getElementById('pwConfirm').value;
    
    if (newPw !== confirmPw) { alert('Οι νέοι κωδικοί δεν ταιριάζουν!'); return; }
    
    try {
        const res = await fetch('/api/auth/change-password', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ oldPassword: oldPw, newPassword: newPw })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        alert('✅ Ο κωδικός άλλαξε επιτυχώς!');
        closeModal('pwModal');
    } catch(err) {
        alert('❌ ' + err.message);
    }
});

// ===== USER MANAGEMENT =====
async function openUserManagement() {
    document.getElementById('userDropdown').classList.remove('show');
    await loadUsers();
    openModal('usersModal');
}

async function loadUsers() {
    const res = await fetch('/api/users');
    const users = await res.json();
    const roleLabels = { admin: 'Διαχειριστής', supervisor: 'Επόπτης', technician: 'Τεχνικός' };
    const roleColors = { admin: 'b-red', supervisor: 'b-orange', technician: 'b-blue' };
    
    let html = '<table style="width:100%;font-size:.85rem;border-collapse:collapse;">';
    html += '<tr style="border-bottom:1px solid var(--gray-200);"><th style="text-align:left;padding:8px;">Username</th><th style="text-align:left;padding:8px;">Όνομα</th><th style="padding:8px;">Ρόλος</th><th style="padding:8px;">Ενέργειες</th></tr>';
    
    users.forEach(u => {
        html += `<tr style="border-bottom:1px solid var(--gray-100);">
            <td style="padding:8px;font-weight:600;">${u.username}</td>
            <td style="padding:8px;">${u.full_name || '-'}</td>
            <td style="padding:8px;text-align:center;"><span class="badge ${roleColors[u.role]}">${roleLabels[u.role]}</span></td>
            <td style="padding:8px;text-align:center;">
                <button class="btn btn-outline btn-sm" onclick='editUser(${JSON.stringify(u)})'>✏️</button>
                ${u.id !== currentUser.id ? `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${u.username}')">🗑️</button>` : ''}
            </td>
        </tr>`;
    });
    html += '</table>';
    document.getElementById('usersList').innerHTML = html;
}

function showAddUserForm() {
    document.getElementById('addUserForm').style.display = '';
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserFullName').value = '';
    document.getElementById('newUserPass').value = '';
    document.getElementById('newUserRole').value = 'technician';
}

async function createUser() {
    const username = document.getElementById('newUserName').value.trim();
    const fullName = document.getElementById('newUserFullName').value.trim();
    const password = document.getElementById('newUserPass').value;
    const role = document.getElementById('newUserRole').value;
    
    if (!username || password.length < 6) {
        alert('Συμπλήρωσε username και κωδικό τουλάχιστον 6 χαρακτήρων!');
        return;
    }
    
    try {
        const res = await fetch('/api/users', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ username, fullName, password, role })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await loadUsers();
        document.getElementById('addUserForm').style.display = 'none';
    } catch(err) {
        alert('❌ ' + err.message);
    }
}

async function deleteUser(id, name) {
    if (!confirm(`Διαγραφή χρήστη "${name}";`)) return;
    try {
        const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        await loadUsers();
    } catch(err) {
        alert('❌ ' + err.message);
    }
}

// ===== INIT APP =====
let maps = [];
let currentMapId = null;
let equipmentList = [];
let selectedEquipment = null;
let isAddingEquipment = false;

const API = '/api';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    await initAuth();
    setupEventListeners();
    loadMaps();
    loadDashboard();
    loadInventory();
});

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('[data-view]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(el.dataset.view);
        });
    });

    // Map selector
    document.getElementById('mapSelector').addEventListener('change', function() {
        currentMapId = this.value ? parseInt(this.value) : null;
        renderMap();
    });

    // Upload map
    const uploadInputs = ['uploadMap', 'uploadMapEmpty'];
    uploadInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', handleMapUpload);
    });

    // Add equipment button
    document.getElementById('addEquipmentBtn').addEventListener('click', () => {
        if (!currentMapId) { alert('Πρώτα φόρτωσε έναν χάρτη!'); return; }
        enableAddMode();
    });

    // Delete map
    document.getElementById('deleteMapBtn').addEventListener('click', deleteCurrentMap);

    // Image click for adding equipment
    document.getElementById('factoryImage').addEventListener('click', handleImageClick);

    // Equipment form
    document.getElementById('equipForm').addEventListener('submit', saveEquipment);

    // Maintenance log form
    document.getElementById('logForm').addEventListener('submit', saveLog);

    // Inventory form
    document.getElementById('invForm').addEventListener('submit', saveInv);

    // Global search
    document.getElementById('globalSearch').addEventListener('input', debounce(handleSearch, 300));
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.header-search')) {
            document.getElementById('searchResults').classList.remove('show');
        }
    });

    // Mobile menu
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
}

// ===== NAVIGATION =====
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link, .sidebar-link').forEach(l => l.classList.remove('active'));
    
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.querySelectorAll(`[data-view="${viewName}"]`).forEach(l => l.classList.add('active'));
    
    document.getElementById('sidebar').classList.remove('open');

    if (viewName === 'dashboard') loadDashboard();
    if (viewName === 'inventory') loadInventory();
}

// ===== MAPS =====
async function loadMaps() {
    try {
        const res = await fetch(`${API}/maps`);
        maps = await res.json();
        renderMapSelector();
        if (maps.length > 0 && !currentMapId) {
            currentMapId = maps[0].id;
            document.getElementById('mapSelector').value = currentMapId;
        }
        renderMap();
    } catch(err) { console.error('Failed to load maps:', err); }
}

async function handleMapUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    formData.append('name', file.name.replace(/\.[^/.]+$/, ''));
    try {
        const res = await fetch(`${API}/maps`, { method: 'POST', body: formData });
        const map = await res.json();
        await loadMaps();
        currentMapId = map.id;
        document.getElementById('mapSelector').value = map.id;
        renderMap();
    } catch(err) { alert('Σφάλμα ανεβάσματος: ' + err.message); }
    e.target.value = '';
}

async function deleteCurrentMap() {
    if (!currentMapId || !canDelete()) return;
    
    const step1 = confirm('⚠️ ΔΙΑΓΡΑΦΗ ΧΑΡΤΗ\n\nΑυτό θα διαγράψει τον χάρτη και ΟΛΑ τα μηχανήματα που είναι πάνω του μαζί με το ιστορικό τους!\n\nΣίγουρα θέλεις να συνεχίσεις;');
    if (!step1) return;
    
    const step2 = prompt('Γράψε "ΔΙΑΓΡΑΦΗ" για επιβεβαίωση:');
    if (step2 !== 'ΔΙΑΓΡΑΦΗ') { alert('Η ενέργεια ακυρώθηκε.'); return; }
    
    await fetch(`${API}/maps/${currentMapId}`, { method: 'DELETE' });
    currentMapId = null;
    await loadMaps();
}

function renderMapSelector() {
    const sel = document.getElementById('mapSelector');
    sel.innerHTML = '<option value="">-- Επιλέξτε Χάρτη --</option>';
    maps.forEach(m => {
        sel.innerHTML += `<option value="${m.id}">${m.name}</option>`;
    });
}

async function renderMap() {
    const emptyEl = document.getElementById('mapEmpty');
    const wrapperEl = document.getElementById('mapWrapper');
    const hintEl = document.getElementById('mapHint');
    const addBtn = document.getElementById('addEquipmentBtn');
    const delBtn = document.getElementById('deleteMapBtn');

    if (!currentMapId) {
        emptyEl.style.display = '';
        wrapperEl.style.display = 'none';
        hintEl.style.display = 'none';
        addBtn.disabled = true;
        delBtn.style.display = 'none';
        return;
    }

    const map = maps.find(m => m.id == currentMapId);
    if (!map) { currentMapId = null; return; }

    emptyEl.style.display = 'none';
    wrapperEl.style.display = '';
    hintEl.style.display = '';
    addBtn.disabled = false;
    delBtn.style.display = '';

    const img = document.getElementById('factoryImage');
    img.src = `/uploads/${map.image_path}`;

    // Load equipment for this map
    const res = await fetch(`${API}/equipment?map_id=${currentMapId}`);
    equipmentList = await res.json();
    renderMarkers();
}

function renderMarkers() {
    const layer = document.getElementById('markersLayer');
    layer.innerHTML = '';
    equipmentList.forEach(eq => {
        const marker = document.createElement('div');
        marker.className = `marker marker-${eq.status}`;
        marker.style.left = eq.pos_x + '%';
        marker.style.top = eq.pos_y + '%';
        marker.textContent = eq.code ? eq.code.substring(0, 2).toUpperCase() : eq.name.charAt(0);
        marker.title = `${eq.name}${eq.code ? ' (' + eq.code + ')' : ''} — ${statusLabel(eq.status)}`;
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            openEquipmentPanel(eq.id);
        });
        layer.appendChild(marker);
    });
}

function statusLabel(s) {
    return { operational:'Λειτουργικό', maintenance:'Συντήρηση', breakdown:'Βλάβη' }[s] || s;
}
function statusColor(s) {
    return { operational:'b-green', maintenance:'b-orange', breakdown:'b-red' }[s] || 'b-gray';
}

function enableAddMode() {
    isAddingEquipment = true;
    document.getElementById('mapHint').textContent = '👆 Κάνε κλικ στο σημείο που θέλεις να προσθέσεις μηχάνημα';
    document.getElementById('mapContainer').style.cursor = 'crosshair';
}

async function handleImageClick(e) {
    if (!isAddingEquipment || !currentMapId) return;
    
    const img = e.target;
    const rect = img.getBoundingClientRect();
    const posX = ((e.clientX - rect.left) / rect.width * 100);
    const posY = ((e.clientY - rect.top) / rect.height * 100);

    // Reset form and set position
    document.getElementById('equipForm').reset();
    document.getElementById('eqId').value = '';
    document.getElementById('eqPosX').value = posX.toFixed(4);
    document.getElementById('eqPosY').value = posY.toFixed(4);
    document.getElementById('equipModalTitle').textContent = 'Νέο Μηχάνημα';

    isAddingEquipment = false;
    document.getElementById('mapHint').textContent = '💡 Κάνε κλικ πάνω στην εικόνα για να προσθέσεις μηχάνημα';
    document.getElementById('mapContainer').style.cursor = '';

    openModal('equipModal');
}

// ===== EQUIPMENT PANEL =====
async function openEquipmentPanel(eqId) {
    const eq = equipmentList.find(e => e.id === eqId);
    if (!eq) return;
    selectedEquipment = eq;

    const logsRes = await fetch(`${API}/maintenance/${eqId}`);
    const logs = await logsRes.json();

    const panel = document.getElementById('equipmentPanel');
    document.getElementById('panelTitle').innerHTML = 
        `<span class="badge ${statusColor(eq.status)}">${statusLabel(eq.status)}</span> ${eq.name}`;

    let html = `
        <div class="eq-status-row">
            <select onchange="changeStatus(${eq.id}, this.value)" style="padding:6px 10px;border-radius:6px;font-size:.82rem;border:1px solid var(--gray-300);">
                <option value="operational" ${eq.status==='operational'?'selected':''}>✅ Λειτουργικό</option>
                <option value="maintenance" ${eq.status==='maintenance'?'selected':''}>🔧 Συντήρηση</option>
                <option value="breakdown" ${eq.status==='breakdown'?'selected':''}>⚡ Βλάβη</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="showLogForm()">+ Καταχώρηση</button>
            <button class="btn btn-outline btn-sm" onclick="editEquipmentFromPanel()">✏️ Επεξ.</button>
            <button class="btn btn-danger btn-sm" onclick="deleteEquipmentFromPanel()" style="${currentUser?.role !== 'admin' ? 'display:none' : ''}">🗑️</button>
        </div>
        <div class="eq-info-grid">
            ${eq.code ? infoItem('Κωδικός', eq.code) : ''}
            ${eq.type ? infoItem('Τύπος', eq.type) : ''}
            ${eq.manufacturer ? infoItem('Κατασκευαστής', eq.manufacturer) : ''}
            ${eq.model ? infoItem('Μοντέλο', eq.model) : ''}
            ${eq.serial ? infoItem('Serial', eq.serial) : ''}
            ${eq.install_date ? infoItem('Εγκατάσταση', formatDate(eq.install_date)) : ''}
        </div>
        ${eq.notes ? `<p style="font-size:.85rem;color:var(--gray-500);margin-bottom:16px;padding:10px;background:var(--gray-50);border-radius:8px;">📝 ${eq.notes}</p>` : ''}
        <div class="section-title">📋 Ιστορικό (${logs.length})</div>
    `;

    if (logs.length === 0) {
        html += '<div class="empty-state">Δεν υπάρχουν καταχωρήσεις ακόμα.<br>Πάτησε "+ Καταχώρηση" για να ξεκινήσεις!</div>';
    } else {
        logs.forEach(log => {
            html += `
                <div class="log-entry log-${log.log_type}">
                    <div class="log-header">
                        <span class="log-title">${logTypeIcon(log.log_type)} ${log.title}</span>
                        <span class="log-date">${formatDate(log.work_date)}</span>
                    </div>
                    ${log.description ? `<div class="log-desc">${log.description}</div>` : ''}
                    <div class="log-meta">
                        ${log.technician ? `<span class="log-tag">👷 ${log.technician}</span>` : ''}
                        ${log.duration_hours ? `<span class="log-tag">⏱️ ${log.duration_hours}ώρ.</span>` : ''}
                        ${log.parts_used ? `<span class="log-tag">⚙️ ${log.parts_used}</span>` : ''}
                        ${log.parts_cost ? `<span class="log-tag">€${log.parts_cost}</span>` : ''}
                        ${log.next_due ? `<span class="log-tag b-orange" style="background:var(--warning-light);color:var(--warning)">📅 Επόμενο: ${formatDate(log.next_due)}</span>` : ''}
                    </div>
                    <div style="margin-top:8px;display:flex;gap:6px;">
                        <button class="btn btn-outline btn-sm" onclick='editLogEntry(${JSON.stringify(log)})'>✏️</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteLogEntry(${log.id})">🗑️</button>
                    </div>
                </div>
            `;
        });
    }

    document.getElementById('panelBody').innerHTML = html;
    document.getElementById('panelOverlay').classList.add('active');
    panel.classList.add('active');
}

function infoItem(label, value) {
    return `<div><div class="eq-info-label">${label}</div><div class="eq-info-value">${value}</div></div>`;
}

function logTypeIcon(type) {
    const icons = {
        maintenance:'🔧', breakdown:'⚡', repair:'🔨',
        inspection:'👁️', lubrication:'🛢️', calibration:'🎯', other:'📝'
    };
    return icons[type] || '📋';
}

function closeEquipmentPanel() {
    document.getElementById('equipmentPanel').classList.remove('active');
    document.getElementById('panelOverlay').classList.remove('active');
}

document.getElementById('panelOverlay')?.addEventListener('click', closeEquipmentPanel);

async function changeStatus(eqId, newStatus) {
    await fetch(`${API}/equipment/${eqId}/status`, {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: newStatus })
    });
    await renderMap();
    openEquipmentPanel(eqId);
}

// ===== EQUIPMENT CRUD =====
async function saveEquipment(e) {
    e.preventDefault();
    const id = document.getElementById('eqId').value;
    const data = {
        map_id: currentMapId,
        name: document.getElementById('eqName').value,
        code: document.getElementById('eqCode').value,
        type: document.getElementById('eqType').value,
        manufacturer: document.getElementById('eqManufacturer').value,
        model: document.getElementById('eqModel').value,
        serial: document.getElementById('eqSerial').value,
        install_date: document.getElementById('eqInstallDate').value,
        notes: document.getElementById('eqNotes').value,
        pos_x: parseFloat(document.getElementById('eqPosX').value),
        pos_y: parseFloat(document.getElementById('eqPosY').value)
    };

    if (id) {
        await fetch(`${API}/equipment/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    } else {
        await fetch(`${API}/equipment`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    }

    closeModal('equipModal');
    await renderMap();
}

function editEquipmentFromPanel() {
    if (!selectedEquipment) return;
    const eq = selectedEquipment;
    document.getElementById('eqId').value = eq.id;
    document.getElementById('eqPosX').value = eq.pos_x;
    document.getElementById('eqPosY').value = eq.pos_y;
    document.getElementById('eqName').value = eq.name;
    document.getElementById('eqCode').value = eq.code || '';
    document.getElementById('eqType').value = eq.type || '';
    document.getElementById('eqManufacturer').value = eq.manufacturer || '';
    document.getElementById('eqModel').value = eq.model || '';
    document.getElementById('eqSerial').value = eq.serial || '';
    document.getElementById('eqInstallDate').value = eq.install_date || '';
    document.getElementById('eqNotes').value = eq.notes || '';
    document.getElementById('equipModalTitle').textContent = 'Επεξεργασία Μηχανήματος';
    closeModal('equipModal');
    openModal('equipModal');
}

// ===== MAINTENANCE LOGS =====
function showLogForm() {
    if (!selectedEquipment) return;
    document.getElementById('logForm').reset();
    document.getElementById('logId').value = '';
    document.getElementById('logEquipId').value = selectedEquipment.id;
    document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('logModalTitle').textContent = `Νέα Καταχώρηση — ${selectedEquipment.name}`;
    closeModal('logModal');
    openModal('logModal');
}

function updateLogTitle() {
    const type = document.getElementById('logType').value;
    const titles = {
        maintenance:'', breakdown:'', repair:'', inspection:'',
        lubrication:'', calibration:'', other:''
    };
}

async function saveLog(e) {
    e.preventDefault();
    const id = document.getElementById('logId').value;
    const data = {
        equipment_id: parseInt(document.getElementById('logEquipId').value),
        log_type: document.getElementById('logType').value,
        title: document.getElementById('logTitle').value,
        description: document.getElementById('logDescription').value,
        technician: document.getElementById('logTechnician').value,
        work_date: document.getElementById('logDate').value,
        duration_hours: document.getElementById('logDuration').value ? parseFloat(document.getElementById('logDuration').value) : null,
        parts_used: document.getElementById('logPartsUsed').value,
        parts_cost: parseFloat(document.getElementById('logPartsCost').value) || 0,
        next_due: document.getElementById('logNextDue').value
    };

    if (id) {
        await fetch(`${API}/maintenance/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    } else {
        await fetch(`${API}/maintenance`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    }

    closeModal('logModal');
    closeEquipmentPanel();
    await renderMap();
    setTimeout(() => openEquipmentPanel(selectedEquipment.id), 200);
}

function editLogEntry(log) {
    document.getElementById('logId').value = log.id;
    document.getElementById('logEquipId').value = log.equipment_id;
    document.getElementById('logType').value = log.log_type;
    document.getElementById('logTitle').value = log.title;
    document.getElementById('logDescription').value = log.description || '';
    document.getElementById('logTechnician').value = log.technician || '';
    document.getElementById('logDate').value = log.work_date || '';
    document.getElementById('logDuration').value = log.duration_hours || '';
    document.getElementById('logPartsUsed').value = log.parts_used || '';
    document.getElementById('logPartsCost').value = log.parts_cost || '';
    document.getElementById('logNextDue').value = log.next_due || '';
    document.getElementById('logModalTitle').textContent = 'Επεξεργασία Καταχώρησης';
    closeModal('logModal');
    openModal('logModal');
}

async function deleteLogEntry(id) {
    if (!canDelete()) { alert('❌ Δεν έχες δικαίωμα διαγραφής καταχωρήσεων.'); return; }
    if (!confirm('⚠️ Διαγραφή αυτής της καταχώρησης ιστορικού;\n\nΗ ενέργεια δεν μπορεί να αναιρεθεί!')) return;
    if (!confirm('Σίγουρα; Πάτησε OK για οριστική διαγραφή.')) return;
    
    await fetch(`${API}/maintenance/${id}`, { method: 'DELETE' });
    closeEquipmentPanel();
    await renderMap();
    setTimeout(() => openEquipmentPanel(selectedEquipment.id), 200);
}

// ===== DELETE EQUIPMENT =====
async function deleteEquipmentFromPanel() {
    if (!selectedEquipment || !canDelete()) return;
    if (currentUser.role !== 'admin') { alert('❌ Μόνο ο Διαχειριστής μπορεί να διαγράψει μηχανήματα.'); return; }
    
    const eq = selectedEquipment;
    if (!confirm(`⚠️ ΔΙΑΓΡΑΦΗ ΜΗΧΑΝΗΜΑΤΟΣ\n\n"${eq.name}"\n\nΘα διαγραφεί το μηχάνημα ΚΑΙ όλο το ιστορικό συντήρησης!\n\nΣυνέχεια;`)) return;
    
    const typed = prompt('Γράψε "ΔΙΑΓΡΑΦΗ" για επιβεβαίωση:');
    if (typed !== 'ΔΙΑΓΡΑΦΗ') { alert('Η ενέργεια ακυρώθηκε.'); return; }
    
    try {
        const res = await fetch(`${API}/equipment/${eq.id}?confirm=true&force=true`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Σφάλμα διαγραφής');
        closeEquipmentPanel();
        await renderMap();
        alert('✅ Το μηχάνημα διαγράφηκε.');
    } catch(err) {
        alert('❌ ' + err.message);
    }
}

// ===== INVENTORY =====
async function loadInventory() {
    const search = document.getElementById('invSearch')?.value.toLowerCase() || '';
    const stockFilter = document.getElementById('invStockFilter')?.value || '';

    const res = await fetch(`${API}/inventory`);
    let items = await res.json();

    items = items.filter(inv => {
        const matchSearch = !search || inv.name.toLowerCase().includes(search) || (inv.code && inv.code.toLowerCase().includes(search));
        let matchStock = true;
        if (stockFilter === 'low') matchStock = inv.quantity <= inv.min_stock && inv.quantity > 0;
        if (stockFilter === 'out') matchStock = inv.quantity === 0;
        return matchSearch && matchStock;
    });

    const listEl = document.getElementById('inventoryList');
    if (items.length === 0) {
        listEl.innerHTML = '<div class="empty-state">Δεν βρέθηκαν είδη στην αποθήκη</div>';
        return;
    }

    listEl.innerHTML = items.map(inv => {
        const stockClass = inv.quantity === 0 ? 'b-red' : inv.quantity <= inv.min_stock ? 'b-orange' : 'b-green';
        const stockLabel = inv.quantity === 0 ? 'Εξαντλημένο' : inv.quantity <= inv.min_stock ? 'Χαμηλό' : 'OK';
        return `
            <div class="inv-item">
                <div>
                    <div class="inv-name">${inv.name}${inv.code ? ` <span style="color:var(--gray-400)">(${inv.code})</span>` : ''}</div>
                    <div class="inv-sub">${inv.supplier ? inv.supplier + ' • ' : ''}${inv.location ? '📍 ' + inv.location + ' • ' : ''}${inv.price ? '€' + inv.price.toFixed(2) : ''}</div>
                </div>
                <div class="inv-stock">
                    <button class="stock-btn" onclick="adjustStock(${inv.id}, -1)">−</button>
                    <span class="stock-num">${inv.quantity}</span>
                    <span style="font-size:.75rem;color:var(--gray-400)">${inv.unit}</span>
                    <button class="stock-btn" onclick="adjustStock(${inv.id}, 1)">+</button>
                </div>
                <span class="badge ${stockClass}">${stockLabel}</span>
                <div style="display:flex;gap:4px">
                    <button class="btn btn-outline btn-sm" onclick='editInventory(${JSON.stringify(inv)})'>✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteInventory(${inv.id})">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function showInventoryForm() {
    document.getElementById('invForm').reset();
    document.getElementById('invId').value = '';
    document.getElementById('invModalTitle').textContent = 'Νέο Είδος';
    openModal('invModal');
}

async function saveInv(e) {
    e.preventDefault();
    const id = document.getElementById('invId').value;
    const data = {
        name: document.getElementById('invName').value,
        code: document.getElementById('invCode').value,
        quantity: parseInt(document.getElementById('invQty').value),
        min_stock: parseInt(document.getElementById('invMinStock').value) || 5,
        price: parseFloat(document.getElementById('invPrice').value) || 0,
        unit: document.getElementById('invUnit').value,
        supplier: document.getElementById('invSupplier').value,
        location: document.getElementById('invLocation').value
    };

    if (id) {
        await fetch(`${API}/inventory/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    } else {
        await fetch(`${API}/inventory`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    }
    closeModal('invModal');
    loadInventory();
}

async function adjustStock(id, delta) {
    await fetch(`${API}/inventory/${id}/stock`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({delta}) });
    loadInventory();
}

function editInventory(inv) {
    document.getElementById('invId').value = inv.id;
    document.getElementById('invName').value = inv.name;
    document.getElementById('invCode').value = inv.code || '';
    document.getElementById('invQty').value = inv.quantity;
    document.getElementById('invMinStock').value = inv.min_stock;
    document.getElementById('invPrice').value = inv.price || '';
    document.getElementById('invUnit').value = inv.unit;
    document.getElementById('invSupplier').value = inv.supplier || '';
    document.getElementById('invLocation').value = inv.location || '';
    document.getElementById('invModalTitle').textContent = 'Επεξεργασία Είδους';
    openModal('invModal');
}

async function deleteInventory(id) {
    if (!canDelete()) { alert('❌ Δεν έχες δικαίωμα διαγραφής.'); return; }
    if (!confirm('⚠️ Διαγραφή είδους από την αποθήκη;')) return;
    if (!confirm('Σίγουρα; Η ενέργεια είναι οριστική.')) return;
    await fetch(`${API}/inventory/${id}`, { method:'DELETE' });
    loadInventory();
}

// ===== DASHBOARD =====
async function loadDashboard() {
    const res = await fetch(`${API}/stats`);
    const s = await res.json();

    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card sc-blue"><div class="stat-num">${s.totalEquipment}</div><div class="stat-label">Σύνολο Μηχανημάτων</div></div>
        <div class="stat-card sc-green"><div class="stat-num">${s.operational}</div><div class="stat-label">Λειτουργικά</div></div>
        <div class="stat-card sc-red"><div class="stat-num">${s.breakdown}</div><div class="stat-label">Βλάβες Τώρα</div></div>
        <div class="stat-card sc-orange"><div class="stat-num">${s.lowStock.length}</div><div class="stat-label">Χαμηλό Stock</div></div>
    `;

    document.getElementById('recentLogs').innerHTML = s.recentLogs.length ?
        s.recentLogs.map(l => `<div class="dash-item"><div class="di-title">${logTypeIcon(l.log_type)} ${l.title}</div><div class="di-sub">${l.equipment_name} • ${formatDate(l.work_date)}${l.technician ? ' • 👷 ' + l.technician : ''}</div></div>`).join('')
        : '<div class="empty-state">Δεν υπάρχουν πρόσφατες εργασίες</div>';

    document.getElementById('lowStockList').innerHTML = s.lowStock.length ?
        s.lowStock.map(i => `<div class="dash-item"><div class="di-title">📦 ${i.name}</div><div class="di-sub">${i.quantity}/${i.min_stock} ${i.unit} — ${i.supplier || 'Χωρίς προμηθευτή'}</div></div>`).join('')
        : '<div class="empty-state">Όλα τα ανταλλακτικά είναι αρκετά ✅</div>';

    document.getElementById('problemEquip').innerHTML = s.problemEquipment.length ?
        s.problemEquipment.map(p => `<div class="dash-item"><div class="di-title">⚠️ ${p.name}${p.code ? ' (' + p.code + ')' : ''}</div><div class="di-sub">${p.breakdown_count} βλάβες</div></div>`).join('')
        : '<div class="empty-state">Δεν υπάρχουν προβληματικά μηχανήματα 🎉</div>';

    document.getElementById('upcomingMaint').innerHTML = s.upcomingMaintenance.length ?
        s.upcomingMaintenance.map(u => `<div class="dash-item"><div class="di-title">📅 ${u.title}</div><div class="di-sub">${u.equipment_name} • ${formatDate(u.next_due)}</div></div>`).join('')
        : '<div class="empty-state">Δεν έχουν προγραμματιστεί επόμενες εργασίες</div>';
}

// ===== SEARCH =====
async function handleSearch(e) {
    const q = e.target.value.trim();
    const resultsEl = document.getElementById('searchResults');
    if (q.length < 2) { resultsEl.classList.remove('show'); return; }

    const res = await fetch(`${API}/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    let html = '';
    if (data.equipment.length > 0) {
        html += '<div style="padding:8px 14px;font-size:.7rem;text-transform:uppercase;color:var(--gray-400);font-weight:700;">Μηχανήματα</div>';
        data.equipment.forEach(eq => {
            html += `<div class="search-result-item" onclick="searchGoToEquipment(${eq.id})"><div class="sr-type">⚙️ ${eq.type || 'Εξοπλισμός'}</div><strong>${eq.name}</strong>${eq.code ? ' (' + eq.code + ')' : ''}</div>`;
        });
    }
    if (data.logs.length > 0) {
        html += '<div style="padding:8px 14px;font-size:.7rem;text-transform:uppercase;color:var(--gray-400);font-weight:700;">Καταχωρήσεις</div>';
        data.logs.forEach(l => {
            html += `<div class="search-result-item" onclick="searchGoToEquipment(${l.equipment_id})"><div class="sr-type">${logTypeIcon(l.log_type)}</div><strong>${l.title}</strong><br><small>${l.equipment_name} • ${formatDate(l.work_date)}</small></div>`;
        });
    }
    if (!html) html = '<div class="empty-state">Δεν βρέθηκαν αποτελέσματα</div>';

    resultsEl.innerHTML = html;
    resultsEl.classList.add('show');
}

async function searchGoToEquipment(eqId) {
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('globalSearch').value = '';
    switchView('map');
    // Find which map has this equipment
    const res = await fetch(`${API}/equipment`);
    const allEq = await res.json();
    const eq = allEq.find(e => e.id === eqId);
    if (eq && eq.map_id != currentMapId) {
        currentMapId = eq.map_id;
        document.getElementById('mapSelector').value = eq.map_id;
        await renderMap();
    }
    setTimeout(() => openEquipmentPanel(eqId), 300);
}

// ===== MODALS =====
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// Close modal on backdrop click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });
});

// ===== UTILS =====
function debounce(fn, delay) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), delay); }; }
function formatDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('el-GR', {day:'2-digit',month:'2-digit',year:'numeric'}); }
