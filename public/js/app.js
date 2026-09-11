// ===== STATE =====
let maps = [], currentMapId = null, equipmentList = [], selectedEq = null, addingMode = false, currentUser = null;
const API = '/api';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    if (await checkAuth()) {
        initEvents();
        loadMaps();
        loadDashboard();
        renderInv();
    }
});

// ===== AUTH =====
async function checkAuth() {
    try {
        const r = await fetch(API + '/auth/me');
        if (!r.ok) { showLogin(); return false; }
        currentUser = await r.json();
        showApp();
        return true;
    } catch (e) { showLogin(); return false; }
}

function showLogin() {
    document.getElementById('loginPage').style.display = '';
    document.getElementById('appContainer').style.display = 'none';
}

function showApp() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('appContainer').style.display = '';
    updateUserUI();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('loginError');
    const btn = e.target.querySelector('button[type="submit"]');
    errEl.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Σύνδεση...';
    try {
        const r = await fetch(API + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: document.getElementById('loginUser').value,
                password: document.getElementById('loginPass').value
            })
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        currentUser = d;
        showApp();
        loadMaps();
        loadDashboard();
        renderInv();
    } catch (err) {
        errEl.textContent = err.message;
        errEl.classList.add('show');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔓 Είσοδος';
    }
});

async function logout() {
    await fetch(API + '/auth/logout', { method: 'POST' });
    currentUser = null;
    currentMapId = null;
    showLogin();
}

function updateUserUI() {
    if (!currentUser) return;
    document.getElementById('userAvatar').textContent = currentUser.username.charAt(0).toUpperCase();
    document.getElementById('userName').textContent = currentUser.fullName || currentUser.username;
    const rl = { admin: 'Διαχειριστής', supervisor: 'Επόπτης', technician: 'Τεχνικός' };
    document.getElementById('userRole').textContent = rl[currentUser.role] || '';
    const isAdmin = currentUser.role === 'admin';
    document.getElementById('adminUsersBtn').style.display = isAdmin ? '' : 'none';
    document.getElementById('uploadLabel').style.display = isAdmin ? '' : 'none';
    document.getElementById('delMapBtn').style.display = (isAdmin && currentMapId) ? '' : 'none';
    document.getElementById('addEquipmentBtn').disabled = !currentMapId;
}

function toggleUserDropdown() {
    document.getElementById('userDropdown').classList.toggle('show');
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) {
        const dd = document.getElementById('userDropdown');
        if (dd) dd.classList.remove('show');
    }
});

// ===== NAVIGATION =====
function initEvents() {
    // View switching
    document.querySelectorAll('[data-view]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(el.dataset.view);
        });
    });

    // Mobile menu
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    // Map image click for adding equipment
    document.getElementById('factoryImage').addEventListener('click', handleImageClick);

    // Map upload
    document.getElementById('uploadMap').addEventListener('change', handleMapUpload);

    // Map selector
    document.getElementById('mapSelector').addEventListener('change', function () {
        currentMapId = this.value ? parseInt(this.value) : null;
        renderMap();
    });

    // Add equipment button
    document.getElementById('addEquipmentBtn').addEventListener('click', () => {
        if (!currentMapId) return;
        addingMode = true;
        document.getElementById('mapHint').textContent = '📌 Κάνε κλικ στο σημείο της εικόνας';
        document.getElementById('mapHint').classList.remove('hidden');
        document.getElementById('factoryImage').style.cursor = 'crosshair';
    });
}

function switchView(v) {
    document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('[data-view]').forEach(x => x.classList.remove('active'));
    const el = document.getElementById('view-' + v);
    if (el) el.classList.add('active');
    document.querySelectorAll('[data-view="' + v + '"]').forEach(x => x.classList.add('active'));
    document.getElementById('sidebar').classList.remove('open');
    if (v === 'dashboard') loadDashboard();
    if (v === 'inventory') renderInv();
}

// ===== MAPS =====
async function loadMaps() {
    const r = await fetch(API + '/maps');
    maps = await r.json();
    const sel = document.getElementById('mapSelector');
    sel.innerHTML = '<option value="">-- Επιλέξτε Χάρτη --</option>';
    maps.forEach(m => {
        sel.innerHTML += '<option value="' + m.id + '">' + m.name + '</option>';
    });
    if (maps.length && !currentMapId) {
        currentMapId = maps[0].id;
    }
    if (currentMapId) sel.value = currentMapId;
    renderMap();
    updateUserUI();
}

async function renderMap() {
    if (!currentMapId) {
        document.getElementById('mapEmpty').style.display = '';
        document.getElementById('mapWrapper').style.display = 'none';
        document.getElementById('markersLayer').innerHTML = '';
        document.getElementById('delMapBtn').style.display = 'none';
        return;
    }

    const r = await fetch(API + '/maps/' + currentMapId);
    const map = await r.json();

    if (map.image_data) {
        document.getElementById('mapEmpty').style.display = 'none';
        document.getElementById('mapWrapper').style.display = '';
        const img = document.getElementById('factoryImage');
        img.src = map.image_data;
        document.getElementById('delMapBtn').style.display =
            (currentUser && currentUser.role === 'admin') ? '' : 'none';
    } else {
        document.getElementById('mapEmpty').style.display = '';
        document.getElementById('mapWrapper').style.display = 'none';
    }

    // Load equipment
    const eqR = await fetch(API + '/equipment?map_id=' + currentMapId);
    equipmentList = await eqR.json();
    renderMarkers();
}

function renderMarkers() {
    const layer = document.getElementById('markersLayer');
    layer.innerHTML = '';
    equipmentList.forEach((eq, idx) => {
        const marker = document.createElement('div');
        marker.className = 'marker marker-' + eq.status;
        marker.style.left = eq.pos_x + '%';
        marker.style.top = eq.pos_y + '%';
        marker.textContent = (idx + 1);
        marker.title = eq.name + ' (' + eq.status + ')';
        marker.addEventListener('click', (e) => {
            e.stopPropagation();
            openEquipmentPanel(eq);
        });
        layer.appendChild(marker);
    });
}

// ===== MAP UPLOAD =====
function compressImage(file, maxWidth, quality) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const img = new Image();
            img.onload = function () {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if (w > maxWidth) { h = h * maxWidth / w; w = maxWidth; }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

async function handleMapUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
        const dataUrl = await compressImage(file, 1200, 0.8);

        if (!currentMapId) {
            // Create new map
            const name = prompt('Όνομα σκάντα:', '1000000876') || 'Σκάντα ' + new Date().toLocaleDateString('el-GR');
            const r = await fetch(API + '/maps', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name, image_data: dataUrl })
            });
            const map = await r.json();
            currentMapId = map.id;
        } else {
            // Update existing map image
            await fetch(API + '/maps/' + currentMapId + '/image', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_data: dataUrl })
            });
        }

        loadMaps();
    } catch (err) {
        alert('Σφάλμα: ' + err.message);
    }
    e.target.value = '';
}

async function deleteMap() {
    if (!currentMapId) return;
    if (!confirm('Διαγραφή αυτού του χάρτη και όλων των μηχανημάτων του;')) return;
    await fetch(API + '/maps/' + currentMapId, { method: 'DELETE' });
    currentMapId = null;
    loadMaps();
}

// ===== IMAGE CLICK → ADD EQUIPMENT =====
function handleImageClick(e) {
    if (!addingMode || !currentMapId) return;
    const img = e.target;
    const rect = img.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
    const y = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);

    addingMode = false;
    document.getElementById('factoryImage').style.cursor = 'default';
    document.getElementById('mapHint').classList.add('hidden');

    document.getElementById('eqId').value = '';
    document.getElementById('equipModalTitle').textContent = 'Νέο Μηχάνημα';
    document.getElementById('equipForm').reset();
    document.getElementById('eqPosX').value = x;
    document.getElementById('eqPosY').value = y;
    document.getElementById('eqStatus').value = 'operational';
    openModal('equipModal');
}

// ===== EQUIPMENT =====
async function openEquipmentPanel(eq) {
    selectedEq = eq;
    document.getElementById('panelTitle').textContent = eq.name;
    const statusLabels = { operational: '✅ Λειτουργικό', breakdown: '❌ Βλάβη', maintenance: '🔧 Σε Συντήρηση' };
    const typeIcons = { maintenance: '🔧', breakdown: '⚡', repair: '🔨', inspection: '👁️', lubrication: '🛢️', calibration: '🎯', other: '📝' };

    let html = '<div style="margin-bottom:12px">';
    html += '<span class="badge b-' + (eq.status === 'operational' ? 'green' : eq.status === 'breakdown' ? 'red' : 'orange') + '">' + (statusLabels[eq.status] || eq.status) + '</span>';
    html += '</div>';

    // Details
    html += '<div style="font-size:.85rem;color:var(--gray-600);margin-bottom:16px">';
    if (eq.code) html += '<div><strong>Κωδικός:</strong> ' + eq.code + '</div>';
    if (eq.type) html += '<div><strong>Τύπος:</strong> ' + eq.type + '</div>';
    if (eq.manufacturer) html += '<div><strong>Κατασκευαστής:</strong> ' + eq.manufacturer + '</div>';
    if (eq.model) html += '<div><strong>Μοντέλο:</strong> ' + eq.model + '</div>';
    if (eq.serial) html += '<div><strong>Serial:</strong> ' + eq.serial + '</div>';
    if (eq.install_date) html += '<div><strong>Εγκατάσταση:</strong> ' + fmtDate(eq.install_date) + '</div>';
    if (eq.notes) html += '<div><strong>Σημειώσεις:</strong> ' + eq.notes + '</div>';
    html += '</div>';

    // Buttons
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">';
    html += '<button class="btn btn-primary btn-sm" onclick="openLogModal()">+ Εργασία</button>';
    if (currentUser && ['admin', 'supervisor'].includes(currentUser.role)) {
        html += '<button class="btn btn-outline btn-sm" onclick="editEquipment()">✏️ Επεξεργασία</button>';
    }
    if (currentUser && currentUser.role === 'admin') {
        html += '<button class="btn btn-danger btn-sm" onclick="deleteEquipment()">🗑️ Διαγραφή</button>';
    }
    html += '</div>';

    // Maintenance log
    html += '<h3 style="font-size:1rem;margin-bottom:10px">📋 Ιστορικό</h3>';
    const logR = await fetch(API + '/maintenance/' + eq.id);
    const logs = await logR.json();

    if (logs.length === 0) {
        html += '<div class="empty-state">Δεν υπάρχουν καταχωρήσεις</div>';
    } else {
        logs.forEach(l => {
            html += '<div class="dash-item" style="border-left:3px solid ' + (l.log_type === 'breakdown' ? 'var(--danger)' : l.log_type === 'maintenance' ? 'var(--success)' : 'var(--primary)') + '">';
            html += '<div class="di-title">' + (typeIcons[l.log_type] || '📋') + ' ' + l.title + '</div>';
            html += '<div class="di-sub">' + fmtDate(l.work_date);
            if (l.technician) html += ' • 👷 ' + l.technician;
            if (l.duration_hours) html += ' • ⏱ ' + l.duration_hours + 'ώρ.';
            html += '</div>';
            if (l.parts_used) html += '<div class="di-sub">📦 ' + l.parts_used + '</div>';
            if (l.description) html += '<div class="di-sub" style="color:var(--gray-500)">' + l.description + '</div>';
            html += '</div>';
        });
    }

    document.getElementById('panelBody').innerHTML = html;
    document.getElementById('equipmentPanel').classList.add('open');
    document.getElementById('panelOverlay').classList.add('show');
}

function closePanel() {
    document.getElementById('equipmentPanel').classList.remove('open');
    document.getElementById('panelOverlay').classList.remove('show');
    selectedEq = null;
}

function editEquipment() {
    if (!selectedEq) return;
    document.getElementById('eqId').value = selectedEq.id;
    document.getElementById('equipModalTitle').textContent = 'Επεξεργασία Μηχανήματος';
    document.getElementById('eqName').value = selectedEq.name || '';
    document.getElementById('eqCode').value = selectedEq.code || '';
    document.getElementById('eqType').value = selectedEq.type || '';
    document.getElementById('eqManufacturer').value = selectedEq.manufacturer || '';
    document.getElementById('eqModel').value = selectedEq.model || '';
    document.getElementById('eqSerial').value = selectedEq.serial || '';
    document.getElementById('eqInstallDate').value = selectedEq.install_date || '';
    document.getElementById('eqStatus').value = selectedEq.status || 'operational';
    document.getElementById('eqNotes').value = selectedEq.notes || '';
    document.getElementById('eqPosX').value = selectedEq.pos_x;
    document.getElementById('eqPosY').value = selectedEq.pos_y;
    closePanel();
    openModal('equipModal');
}

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
        status: document.getElementById('eqStatus').value,
        notes: document.getElementById('eqNotes').value,
        pos_x: parseFloat(document.getElementById('eqPosX').value),
        pos_y: parseFloat(document.getElementById('eqPosY').value)
    };

    if (id) {
        await fetch(API + '/equipment/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        await fetch(API + '/equipment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    closeModal('equipModal');
    renderMap();
}

async function deleteEquipment() {
    if (!selectedEq) return;
    if (!confirm('Διαγραφή μηχανήματος "' + selectedEq.name + '" και όλου του ιστορικού του;')) return;
    await fetch(API + '/equipment/' + selectedEq.id, { method: 'DELETE' });
    closePanel();
    renderMap();
}

// ===== MAINTENANCE LOGS =====
function openLogModal(log) {
    document.getElementById('logId').value = '';
    document.getElementById('logEquipId').value = selectedEq ? selectedEq.id : '';
    document.getElementById('logModalTitle').textContent = 'Νέα Καταχώρηση - ' + (selectedEq ? selectedEq.name : '');
    document.getElementById('logForm').reset();
    document.getElementById('logDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('logType').value = 'maintenance';

    if (currentUser) {
        document.getElementById('logTechnician').value = currentUser.fullName || currentUser.username;
    }

    openModal('logModal');
}

function updateLogTitle() {
    const type = document.getElementById('logType').value;
    const titles = {
        maintenance: 'Προληπτική Συντήρηση',
        breakdown: 'Βλάβη - Διόρθωση',
        repair: 'Επισκευή',
        inspection: 'Έλεγχος',
        lubrication: 'Λίπανση',
        calibration: 'Βαθμονόμηση',
        other: ''
    };
    if (titles[type]) {
        document.getElementById('logTitle').value = titles[type];
    }
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
        duration_hours: parseFloat(document.getElementById('logDuration').value) || null,
        parts_used: document.getElementById('logPartsUsed').value,
        parts_cost: parseFloat(document.getElementById('logPartsCost').value) || 0,
        next_due: document.getElementById('logNextDue').value
    };

    if (id) {
        await fetch(API + '/maintenance/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        await fetch(API + '/maintenance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    closeModal('logModal');
    if (selectedEq) openEquipmentPanel(selectedEq);
    renderMap();
}

// ===== DASHBOARD =====
async function loadDashboard() {
    const r = await fetch(API + '/stats');
    const s = await r.json();
    document.getElementById('statsGrid').innerHTML =
        '<div class="stat-card sc-blue"><div class="stat-num">' + s.totalEquipment + '</div><div class="stat-label">ΜΗΧΑΝΗΜΑΤΑ</div></div>' +
        '<div class="stat-card sc-green"><div class="stat-num">' + s.operational + '</div><div class="stat-label">ΛΕΙΤΟΥΡΓΙΚΑ</div></div>' +
        '<div class="stat-card sc-red"><div class="stat-num">' + s.breakdown + '</div><div class="stat-label">ΒΛΑΒΕΣ</div></div>' +
        '<div class="stat-card sc-orange"><div class="stat-num">' + s.lowStock.length + '</div><div class="stat-label">LOW STOCK</div></div>';

    const icons = { maintenance: '🔧', breakdown: '⚡', repair: '🔨', inspection: '👁️', lubrication: '🛢️', calibration: '🎯', other: '📝' };
    document.getElementById('recentLogs').innerHTML = s.recentLogs.length ? s.recentLogs.map(l =>
        '<div class="dash-item"><div class="di-title">' + (icons[l.log_type] || '📋') + ' ' + l.title + '</div><div class="di-sub">' + (l.equipment_name || '?') + ' • ' + fmtDate(l.work_date) + (l.technician ? ' • 👷 ' + l.technician : '') + '</div></div>'
    ).join('') : '<div class="empty-state">Δεν υπάρχουν</div>';

    document.getElementById('lowStockList').innerHTML = s.lowStock.length ? s.lowStock.map(i =>
        '<div class="dash-item"><div class="di-title">📦 ' + i.name + '</div><div class="di-sub">' + i.quantity + '/' + i.min_stock + ' ' + i.unit + '</div></div>'
    ).join('') : '<div class="empty-state">OK ✅</div>';

    document.getElementById('problemEquip').innerHTML = s.problemEquipment.length ? s.problemEquipment.map(p =>
        '<div class="dash-item"><div class="di-title">⚠️ ' + p.name + '</div><div class="di-sub">' + p.cnt + ' βλάβες</div></div>'
    ).join('') : '<div class="empty-state">OK 🎉</div>';

    document.getElementById('upcomingMaint').innerHTML = '<div class="empty-state">—</div>';
}

// ===== INVENTORY =====
async function renderInv() {
    const r = await fetch(API + '/inventory');
    const items = await r.json();
    const search = (document.getElementById('invSearch')?.value || '').toLowerCase();
    const filter = document.getElementById('invStockFilter')?.value || '';

    let filtered = items;
    if (search) filtered = filtered.filter(i => i.name.toLowerCase().includes(search) || (i.code || '').toLowerCase().includes(search));
    if (filter === 'low') filtered = filtered.filter(i => i.quantity <= i.min_stock);

    const list = document.getElementById('inventoryList');
    if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:40px;text-align:center;color:var(--gray-400)">📦 Δεν υπάρχουν είδη</div>';
        return;
    }

    let html = '<table style="width:100%;border-collapse:collapse;font-size:.85rem">';
    html += '<tr style="border-bottom:2px solid var(--gray-200);text-align:left"><th style="padding:10px 8px">Όνομα</th><th>Κωδικός</th><th style="text-align:center">Ποσότητα</th><th style="text-align:center">Min</th><th style="text-align:right">Τιμή</th><th>Τοποθεσία</th><th style="text-align:center">-</th></tr>';

    filtered.forEach(i => {
        const low = i.quantity <= i.min_stock;
        html += '<tr style="border-bottom:1px solid var(--gray-100)">';
        html += '<td style="padding:10px 8px;font-weight:600">' + i.name + '</td>';
        html += '<td>' + (i.code || '-') + '</td>';
        html += '<td style="text-align:center"><span class="stock-badge ' + (low ? 'stock-low' : 'stock-ok') + '">' + i.quantity + ' ' + i.unit + '</span></td>';
        html += '<td style="text-align:center;color:var(--gray-400)">' + i.min_stock + '</td>';
        html += '<td style="text-align:right">' + (i.price ? i.price.toFixed(2) + '€' : '-') + '</td>';
        html += '<td>' + (i.location || '-') + '</td>';
        html += '<td style="text-align:center">';
        html += '<button class="btn btn-outline btn-sm" onclick="editInv(' + i.id + ')" style="padding:4px 8px;font-size:.75rem">✏️</button> ';
        html += '<button class="btn btn-outline btn-sm" onclick="adjustStock(' + i.id + ',1)" style="padding:4px 8px;font-size:.75rem">+</button> ';
        html += '<button class="btn btn-outline btn-sm" onclick="adjustStock(' + i.id + ',-1)" style="padding:4px 8px;font-size:.75rem">-</button>';
        if (currentUser && ['admin', 'supervisor'].includes(currentUser.role)) {
            html += ' <button class="btn btn-danger btn-sm" onclick="deleteInv(' + i.id + ')" style="padding:4px 8px;font-size:.75rem">🗑️</button>';
        }
        html += '</td></tr>';
    });

    html += '</table>';
    list.innerHTML = html;
}

function openInvModal(item) {
    document.getElementById('invId').value = '';
    document.getElementById('invModalTitle').textContent = 'Νέο Είδος';
    document.getElementById('invForm').reset();
    document.getElementById('invMinStock').value = 5;
    openModal('invModal');
}

function editInv(id) {
    fetch(API + '/inventory').then(r => r.json()).then(items => {
        const item = items.find(i => i.id === id);
        if (!item) return;
        document.getElementById('invId').value = item.id;
        document.getElementById('invModalTitle').textContent = 'Επεξεργασία Είδους';
        document.getElementById('invName').value = item.name || '';
        document.getElementById('invCode').value = item.code || '';
        document.getElementById('invQty').value = item.quantity || 0;
        document.getElementById('invMinStock').value = item.min_stock || 5;
        document.getElementById('invPrice').value = item.price || 0;
        document.getElementById('invUnit').value = item.unit || 'τεμ';
        document.getElementById('invSupplier').value = item.supplier || '';
        document.getElementById('invLocation').value = item.location || '';
        openModal('invModal');
    });
}

async function saveInv(e) {
    e.preventDefault();
    const id = document.getElementById('invId').value;
    const data = {
        name: document.getElementById('invName').value,
        code: document.getElementById('invCode').value,
        quantity: parseInt(document.getElementById('invQty').value) || 0,
        min_stock: parseInt(document.getElementById('invMinStock').value) || 5,
        price: parseFloat(document.getElementById('invPrice').value) || 0,
        unit: document.getElementById('invUnit').value,
        supplier: document.getElementById('invSupplier').value,
        location: document.getElementById('invLocation').value
    };

    if (id) {
        await fetch(API + '/inventory/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    } else {
        await fetch(API + '/inventory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    closeModal('invModal');
    renderInv();
}

async function adjustStock(id, delta) {
    await fetch(API + '/inventory/' + id + '/stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: delta })
    });
    renderInv();
}

async function deleteInv(id) {
    if (!confirm('Διαγραφή είδους;')) return;
    await fetch(API + '/inventory/' + id, { method: 'DELETE' });
    renderInv();
}

// ===== PASSWORD =====
function showChangePassword() {
    document.getElementById('userDropdown').classList.remove('show');
    document.getElementById('pwForm').reset();
    openModal('pwModal');
}

async function changePw(e) {
    e.preventDefault();
    const n = document.getElementById('pwNew').value;
    if (n !== document.getElementById('pwConfirm').value) {
        alert('Οι κωδικοί δεν ταιριάζουν!');
        return;
    }
    const r = await fetch(API + '/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: document.getElementById('pwOld').value, newPassword: n })
    });
    const d = await r.json();
    if (!r.ok) { alert(d.error); return; }
    alert('✅ Ο κωδικός άλλαξε!');
    closeModal('pwModal');
}

// ===== USER MANAGEMENT =====
function openUserManagement() {
    document.getElementById('userDropdown').classList.remove('show');
    loadUsers();
    openModal('usersModal');
}

async function loadUsers() {
    const r = await fetch(API + '/users');
    const users = await r.json();
    const rl = { admin: 'Διαχειριστής', supervisor: 'Επόπτης', technician: 'Τεχνικός' };
    const rc = { admin: 'b-red', supervisor: 'b-orange', technician: 'b-blue' };
    let h = '<table style="width:100%;font-size:.82rem;border-collapse:collapse">';
    h += '<tr style="border-bottom:1px solid var(--gray-200)"><th style="text-align:left;padding:6px">User</th><th style="text-align:left;padding:6px">Όνομα</th><th style="padding:6px">Ρόλος</th><th style="padding:6px">-</th></tr>';
    users.forEach(u => {
        h += '<tr style="border-bottom:1px solid var(--gray-100)">';
        h += '<td style="padding:6px;font-weight:600">' + u.username + '</td>';
        h += '<td style="padding:6px">' + (u.full_name || '-') + '</td>';
        h += '<td style="padding:6px;text-align:center"><span class="badge ' + (rc[u.role] || '') + '">' + (rl[u.role] || u.role) + '</span></td>';
        h += '<td style="padding:6px;text-align:center">' + (u.id !== currentUser.id ? '<button class="btn btn-danger btn-sm" onclick="delUser(' + u.id + ')" style="padding:3px 8px;font-size:.75rem">🗑️</button>' : '(εσύ)') + '</td>';
        h += '</tr>';
    });
    h += '</table>';
    document.getElementById('usersList').innerHTML = h;
}

function showAddUserForm() {
    document.getElementById('addUserForm').style.display = '';
    document.getElementById('newUserName').value = '';
    document.getElementById('newUserFullName').value = '';
    document.getElementById('newUserPass').value = '';
}

async function createUser() {
    const u = document.getElementById('newUserName').value.trim().toLowerCase();
    const n = document.getElementById('newUserFullName').value.trim();
    const p = document.getElementById('newUserPass').value;
    const r = document.getElementById('newUserRole').value;
    if (!u || p.length < 6) { alert('Username + min 6 chars'); return; }
    const res = await fetch(API + '/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p, fullName: n, role: r })
    });
    if (!res.ok) { const d = await res.json(); alert(d.error); return; }
    document.getElementById('addUserForm').style.display = 'none';
    loadUsers();
}

async function delUser(uid) {
    if (!confirm('Διαγραφή χρήστη;')) return;
    await fetch(API + '/users/' + uid, { method: 'DELETE' });
    loadUsers();
}

// ===== SEARCH =====
function handleSearch(val) {
    const results = document.getElementById('searchResults');
    if (!val.trim()) { results.classList.remove('show'); return; }

    const q = val.toLowerCase();
    const matches = [];

    equipmentList.forEach(eq => {
        if (eq.name.toLowerCase().includes(q) || (eq.code || '').toLowerCase().includes(q) || (eq.type || '').toLowerCase().includes(q)) {
            matches.push({ type: 'Μηχάνημα', name: eq.name, sub: eq.code || eq.type || '', action: () => { switchView('map'); openEquipmentPanel(eq); } });
        }
    });

    if (matches.length === 0) {
        results.innerHTML = '<div class="search-result-item">Δεν βρέθηκε</div>';
    } else {
        results.innerHTML = matches.map((m, i) =>
            '<div class="search-result-item" onclick="window._searchAction(' + i + ')"><div class="sr-type">' + m.type + '</div><div>' + m.name + '</div><div style="color:var(--gray-400);font-size:.8rem">' + m.sub + '</div></div>'
        ).join('');
        window._searchActions = matches.map(m => m.action);
    }
    results.classList.add('show');
}

window._searchAction = function (i) {
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('globalSearch').value = '';
    if (window._searchActions && window._searchActions[i]) window._searchActions[i]();
};

// ===== MODALS =====
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('active'); });
});

// ===== UTILS =====
function fmtDate(d) {
    if (!d) return '';
    return new Date(d).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
