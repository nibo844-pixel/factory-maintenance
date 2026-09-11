// ===== STATE =====
let maps=[], currentMapId=null, equipmentList=[], selectedEq=null, addingMode=false, currentUser=null;
const API='/api';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async()=>{ if(await initAuth()){setupEvents();loadMaps();loadDashboard();renderInv();}});

// ===== AUTH =====
async function initAuth(){
    try{const r=await fetch(API+'/auth/me');if(!r.ok){showLogin();return false;}currentUser=await r.json();showApp();return true;}
    catch(e){showLogin();return false;}
}
function showLogin(){document.getElementById('loginPage').style.display='';document.getElementById('appContainer').style.display='none';}
function showApp(){document.getElementById('loginPage').style.display='none';document.getElementById('appContainer').style.display='';updateUserUI();}

document.getElementById('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();document.getElementById('loginError').classList.remove('show');
    try{const r=await fetch(API+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('loginUser').value,password:document.getElementById('loginPass').value})});
    const d=await r.json();if(!r.ok)throw new Error(d.error);currentUser=d;showApp();loadMaps();loadDashboard();renderInv();}
    catch(err){document.getElementById('loginError').textContent=err.message;document.getElementById('loginError').classList.add('show');}
});
async function logout(){await fetch(API+'/auth/logout',{method:'POST'});currentUser=null;showLogin();}

function updateUserUI(){
    if(!currentUser)return;
    document.getElementById('userAvatar').textContent=currentUser.username.charAt(0).toUpperCase();
    document.getElementById('userName').textContent=currentUser.fullName||currentUser.username;
    const rl={admin:'Διαχειριστής',supervisor:'Επόπτης',technician:'Τεχνικός'};
    document.getElementById('userRole').textContent=rl[currentUser.role]||'';
    const a=currentUser.role==='admin';
    document.getElementById('adminUsersBtn').style.display=a?'':'none';
    document.getElementById('uploadLabel').style.display=a?'':'none';
    document.getElementById('delMapBtn').style.display=a&&currentMapId?'':'none';
}
function canDelete(){return currentUser&&['admin','supervisor'].includes(currentUser.role);}

// ===== NAV =====
function setupEvents(){
    document.querySelectorAll('[data-view]').forEach(el=>{el.addEventListener('click',e=>{e.preventDefault();switchView(el.dataset.view);});});
    document.getElementById('menuToggle').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
    document.addEventListener('click',e=>{if(!e.target.closest('.user-menu'))document.getElementById('userDropdown')?.classList.remove('show');});
    document.getElementById('factoryImage').addEventListener('click',handleImageClick);
    document.getElementById('uploadMap').addEventListener('change',handleMapUpload);
    document.getElementById('uploadMapEmpty').addEventListener('change',handleMapUpload);
    document.getElementById('mapSelector').addEventListener('change',function(){currentMapId=this.value?parseInt(this.value):null;renderMap();});
}
function switchView(v){
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('[data-view]').forEach(x=>x.classList.remove('active'));
    const el=document.getElementById('view-'+v);if(el)el.classList.add('active');
    document.querySelectorAll('[data-view="'+v+'"]').forEach(x=>x.classList.add('active'));
    document.getElementById('sidebar').classList.remove('open');
    if(v==='dashboard')loadDashboard();if(v==='inventory')renderInv();
}
function toggleDropdown(){document.getElementById('userDropdown').classList.toggle('show');}

// ===== MAPS =====
async function loadMaps(){
    const r=await fetch(API+'/maps');maps=await r.json();
    const sel=document.getElementById('mapSelector');
    sel.innerHTML='<option value="">-- Επιλέξτε Χάρτη --</option>';
    maps.forEach(m=>{sel.innerHTML+='<option value="'+m.id+'">'+m.name+'</option>';});
    if(maps.length&&!currentMapId){currentMapId=maps[0].id;}
    if(currentMapId)sel.value=currentMapId;
    renderMap();
}
async function handleMapUpload(e){
    const file=e.target.files[0];if(!file)return;
    // Show loading
    document.getElementById('mapHint').textContent='⏳ Ανέβασμα εικόνας...';
    const reader=new FileReader();
    reader.onload=async ev=>{
        try{
            const r=await fetch(API+'/maps',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name.replace(/\.[^/.]+$/,''),imageData:ev.target.result})});
            if(!r.ok){const err=await r.json();throw new Error(err.error||'Upload failed');}
            const map=await r.json();currentMapId=map.id;loadMaps();
        }catch(err){alert('Σφάλμα: '+err.message);document.getElementById('mapHint').textContent='💡 Κλικ στην εικόνα';}
    };reader.readAsDataURL(file);e.target.value='';
}
async function deleteCurrentMap(){
    if(!currentMapId||currentUser.role!=='admin')return;
    if(!confirm('⚠️ Διαγραφή χάρτη και ΟΛΩΝ των μηχανημάτων;'))return;
    await fetch(API+'/maps/'+currentMapId,{method:'DELETE'});currentMapId=null;loadMaps();
}
async function renderMap(){
    const empty=document.getElementById('mapEmpty'),wrap=document.getElementById('mapWrapper');
    const hint=document.getElementById('mapHint'),addBtn=document.getElementById('addEqBtn');
    const delBtn=document.getElementById('delMapBtn');
    if(!currentMapId){empty.style.display='';wrap.style.display='none';hint.style.display='none';addBtn.disabled=true;delBtn.style.display='none';return;}
    const map=maps.find(m=>m.id==currentMapId);if(!map){currentMapId=null;renderMap();return;}
    empty.style.display='none';wrap.style.display='';hint.style.display='';addBtn.disabled=false;
    delBtn.style.display=currentUser.role==='admin'?'':'none';
    // Load image
    const imgRes=await fetch(API+'/maps/'+currentMapId+'/image');
    if(!imgRes.ok){document.getElementById('mapHint').textContent='⚠️ Σφάλμα φόρτωσης εικόνας';return;}
    const imgData=await imgRes.json();
    document.getElementById('factoryImage').src=imgData.imageData;
    // Load equipment
    const eqRes=await fetch(API+'/equipment?map_id='+currentMapId);equipmentList=await eqRes.json();
    renderMarkers();
}
function renderMarkers(){
    const layer=document.getElementById('markersLayer');layer.innerHTML='';
    equipmentList.forEach(eq=>{
        const m=document.createElement('div');m.className='marker marker-'+eq.status;
        m.style.left=eq.posX+'%';m.style.top=eq.posY+'%';
        m.textContent=eq.code?eq.code.substring(0,2).toUpperCase():eq.name.charAt(0).toUpperCase();
        m.title=eq.name+(eq.code?' ('+eq.code+')':'');
        m.addEventListener('click',e=>{e.stopPropagation();openPanel(eq.id);});layer.appendChild(m);
    });
}
function enableAddMode(){if(!currentMapId){alert('Πρώτα φόρτωσε χάρτη!');return;}addingMode=true;document.getElementById('mapHint').textContent='👆 Κάνε κλικ στο σημείο';document.getElementById('factoryImage').style.cursor='crosshair';}
function handleImageClick(e){
    if(!addingMode||!currentMapId)return;
    const r=e.target.getBoundingClientRect();const px=((e.clientX-r.left)/r.width*100),py=((e.clientY-r.top)/r.height*100);
    document.getElementById('eqForm').reset();document.getElementById('eqId').value='';
    document.getElementById('eqPosX').value=px.toFixed(4);document.getElementById('eqPosY').value=py.toFixed(4);
    document.getElementById('eqModalTitle').textContent='Νέο Μηχάνημα';
    addingMode=false;document.getElementById('mapHint').textContent='💡 Κλικ στην εικόνα';
    document.getElementById('factoryImage').style.cursor='crosshair';openModal('eqModal');
}

// ===== EQUIPMENT =====
async function saveEq(e){
    e.preventDefault();const eid=document.getElementById('eqId').value;
    const d={map_id:currentMapId,name:document.getElementById('eqName').value,code:document.getElementById('eqCode').value,type:document.getElementById('eqType').value,status:'operational',manufacturer:document.getElementById('eqMfr').value,model:document.getElementById('eqModel').value,serial:document.getElementById('eqSerial').value,install_date:document.getElementById('eqDate').value,notes:document.getElementById('eqNotes').value,pos_x:parseFloat(document.getElementById('eqPosX').value),pos_y:parseFloat(document.getElementById('eqPosY').value)};
    if(eid){await fetch(API+'/equipment/'+eid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});}
    else{await fetch(API+'/equipment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});}
    closeModal('eqModal');renderMap();
}
function editEqFromPanel(){if(!selectedEq||currentUser.role==='technician')return;const eq=selectedEq;document.getElementById('eqId').value=eq.id;document.getElementById('eqPosX').value=eq.pos_x;document.getElementById('eqPosY').value=eq.pos_y;document.getElementById('eqName').value=eq.name;document.getElementById('eqCode').value=eq.code||'';document.getElementById('eqType').value=eq.type||'';document.getElementById('eqMfr').value=eq.manufacturer||'';document.getElementById('eqModel').value=eq.model||'';document.getElementById('eqSerial').value=eq.serial||'';document.getElementById('eqDate').value=eq.install_date||'';document.getElementById('eqNotes').value=eq.notes||'';document.getElementById('eqModalTitle').textContent='Επεξεργασία';closePanel();openModal('eqModal');}
async function deleteEqFromPanel(){if(!selectedEq||currentUser.role!=='admin')return;if(!confirm('⚠️ ΔΙΑΓΡΑΦΗ\n\n"'+selectedEq.name+'"\n\nΜαζί με ιστορικό!'))return;await fetch(API+'/equipment/'+selectedEq.id+'?confirm=true',{method:'DELETE'});closePanel();renderMap();}
async function changeStatus(eqId,st){await fetch(API+'/equipment/'+eqId+'/status',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:st})});renderMap();openPanel(eqId);}

// ===== PANEL =====
async function openPanel(eqId){
    const eq=equipmentList.find(x=>x.id===eqId);if(!eq)return;selectedEq=eq;
    const logRes=await fetch(API+'/maintenance/'+eqId);const logs=await logRes.json();
    const sl={operational:'Λειτουργικό',maintenance:'Συντήρηση',breakdown:'Βλάβη'};
    const sc={operational:'b-green',maintenance:'b-orange',breakdown:'b-red'};
    document.getElementById('panelTitle').innerHTML='<span class="badge '+sc[eq.status]+'">'+sl[eq.status]+'</span> '+eq.name;
    let h='<div class="eq-status-row"><select onchange="changeStatus(\''+eq.id+'\',this.value)" style="padding:5px 8px;border-radius:6px;font-size:.8rem;border:1px solid var(--gray-300)">';
    h+='<option value="operational"'+(eq.status==='operational'?' selected':'')+'>✅ OK</option>';
    h+='<option value="maintenance"'+(eq.status==='maintenance'?' selected':'')+'>🔧 Συντήρηση</option>';
    h+='<option value="breakdown"'+(eq.status==='breakdown'?' selected':'')+'>⚡ Βλάβη</option></select>';
    h+='<button class="btn btn-primary btn-sm" onclick="showLogForm()">+ Εργασία</button>';
    if(currentUser.role!=='technician')h+='<button class="btn btn-outline btn-sm" onclick="editEqFromPanel()">✏️</button>';
    if(currentUser.role==='admin')h+='<button class="btn btn-danger btn-sm" onclick="deleteEqFromPanel()">🗑️</button>';
    h+='</div><div class="eq-info-grid">';
    if(eq.code)h+='<div><div class="eq-info-label">Κωδικός</div><div class="eq-info-value">'+eq.code+'</div></div>';
    if(eq.type)h+='<div><div class="eq-info-label">Τύπος</div><div class="eq-info-value">'+eq.type+'</div></div>';
    if(eq.manufacturer)h+='<div><div class="eq-info-label">Κατασκευαστής</div><div class="eq-info-value">'+eq.manufacturer+'</div></div>';
    if(eq.model)h+='<div><div class="eq-info-label">Μοντέλο</div><div class="eq-info-value">'+eq.model+'</div></div>';
    if(eq.serial)h+='<div><div class="eq-info-label">Serial</div><div class="eq-info-value">'+eq.serial+'</div></div>';
    if(eq.install_date)h+='<div><div class="eq-info-label">Εγκατάσταση</div><div class="eq-info-value">'+fmtDate(eq.install_date)+'</div></div>';
    h+='</div>';
    if(eq.notes)h+='<p style="font-size:.82rem;color:var(--gray-500);margin-bottom:12px;padding:8px;background:var(--gray-50);border-radius:6px;">📝 '+eq.notes+'</p>';
    h+='<div class="section-title">📋 Ιστορικό ('+logs.length+')</div>';
    if(!logs.length)h+='<div class="empty-state">Δεν υπάρχουν καταχωρήσεις</div>';
    else logs.forEach(l=>{const icons={maintenance:'🔧',breakdown:'⚡',repair:'🔨',inspection:'👁️',lubrication:'🛢️',calibration:'🎯',other:'📝'};h+='<div class="log-entry log-'+l.log_type+'"><div class="log-header"><span class="log-title">'+(icons[l.log_type]||'📋')+' '+l.title+'</span><span class="log-date">'+fmtDate(l.work_date)+'</span></div>';if(l.description)h+='<div class="log-desc">'+l.description+'</div>';h+='<div class="log-meta">';if(l.technician)h+='<span class="log-tag">👷 '+l.technician+'</span>';if(l.duration_hours)h+='<span class="log-tag">⏱️ '+l.duration_hours+'ώρ.</span>';if(l.parts_used)h+='<span class="log-tag">⚙️ '+l.parts_used+'</span>';if(l.parts_cost)h+='<span class="log-tag">€'+l.parts_cost+'</span>';if(l.next_due)h+='<span class="log-tag b-orange" style="background:var(--warning-light);color:var(--warning)">📅 '+fmtDate(l.next_due)+'</span>';h+='</div>';if(canDelete())h+='<div style="margin-top:6px;display:flex;gap:4px"><button class="btn btn-outline btn-sm" onclick=\'editLog('+JSON.stringify(l)+')\'>✏️</button><button class="btn btn-danger btn-sm" onclick="deleteLog('+l.id+')">🗑️</button></div>';h+='</div>';});
    document.getElementById('panelBody').innerHTML=h;
    document.getElementById('panelOverlay').classList.add('active');document.getElementById('equipPanel').classList.add('active');
}
function closePanel(){document.getElementById('equipPanel').classList.remove('active');document.getElementById('panelOverlay').classList.remove('active');}
document.getElementById('panelOverlay')?.addEventListener('click',closePanel);

// ===== LOGS =====
function showLogForm(){if(!selectedEq)return;document.getElementById('logForm').reset();document.getElementById('logId').value='';document.getElementById('logEquipId').value=selectedEq.id;document.getElementById('logDate').value=new Date().toISOString().split('T')[0];document.getElementById('logModalTitle').textContent='Νέα — '+selectedEq.name;openModal('logModal');}
async function saveLog(e){
    e.preventDefault();const lid=document.getElementById('logId').value;
    const d={equipment_id:document.getElementById('logEquipId').value,log_type:document.getElementById('logType').value,title:document.getElementById('logTitle').value,description:document.getElementById('logDesc').value,technician:document.getElementById('logTech').value,work_date:document.getElementById('logDate').value,duration_hours:document.getElementById('logDur').value?parseFloat(document.getElementById('logDur').value):null,parts_used:document.getElementById('logParts').value,parts_cost:parseFloat(document.getElementById('logCost').value)||0,next_due:document.getElementById('logNext').value};
    if(lid){await fetch(API+'/maintenance/'+lid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});}
    else{await fetch(API+'/maintenance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});}
    closeModal('logModal');closePanel();renderMap();setTimeout(()=>openPanel(d.equipment_id),300);
}
function editLog(l){document.getElementById('logId').value=l.id;document.getElementById('logEquipId').value=l.equipment_id;document.getElementById('logType').value=l.log_type;document.getElementById('logTitle').value=l.title;document.getElementById('logDesc').value=l.description||'';document.getElementById('logTech').value=l.technician||'';document.getElementById('logDate').value=l.work_date||'';document.getElementById('logDur').value=l.duration_hours||'';document.getElementById('logParts').value=l.parts_used||'';document.getElementById('logCost').value=l.parts_cost||'';document.getElementById('logNext').value=l.next_due||'';document.getElementById('logModalTitle').textContent='Επεξεργασία';closePanel();openModal('logModal');}
async function deleteLog(lid){if(!canDelete())return;if(!confirm('Διαγραφή;'))return;await fetch(API+'/maintenance/'+lid,{method:'DELETE'});closePanel();renderMap();setTimeout(()=>openPanel(selectedEq.id),300);}

// ===== INVENTORY =====
async function renderInv(){
    const r=await fetch(API+'/inventory');let items=await r.json();
    const s=(document.getElementById('invSearch')?.value||'').toLowerCase();
    const sf=document.getElementById('invStockFilter')?.value||'';
    items=items.filter(i=>{const ms=!s||i.name.toLowerCase().includes(s)||(i.code&&i.code.toLowerCase().includes(s));let mf=true;if(sf==='low')mf=i.quantity<=i.min_stock&&i.quantity>0;if(sf==='out')mf=i.quantity===0;return ms&&mf;});
    const el=document.getElementById('inventoryList');
    if(!items.length){el.innerHTML='<div class="empty-state">Δεν βρέθηκαν</div>';return;}
    el.innerHTML=items.map(i=>{const sc=i.quantity===0?'b-red':i.quantity<=i.min_stock?'b-orange':'b-green';const sl=i.quantity===0?'Εξαντλημένο':i.quantity<=i.min_stock?'Χαμηλό':'OK';return '<div class="inv-item"><div><div class="inv-name">'+i.name+(i.code?' <span style="color:var(--gray-400)">('+i.code+')</span>':'')+'</div><div class="inv-sub">'+(i.supplier?i.supplier+' • ':'')+(i.location?'📍 '+i.location:'')+(i.price?' • €'+i.price.toFixed(2):'')+'</div></div><div class="inv-stock"><button class="stock-btn" onclick="adjStock('+i.id+','-1+')">−</button><span class="stock-num">'+i.quantity+'</span><span style="font-size:.72rem;color:var(--gray-400)">'+i.unit+'</span><button class="stock-btn" onclick="adjStock('+i.id+',1)">+</button></div><span class="badge '+sc+'">'+sl+'</span><div style="display:flex;gap:4px"><button class="btn btn-outline btn-sm" onclick=\'editInv('+JSON.stringify(i)+')\'>✏️</button>'+(canDelete()?'<button class="btn btn-danger btn-sm" onclick="delInv('+i.id+')">🗑️</button>':'')+'</div></div>';}).join('');
}
function showInvForm(){document.getElementById('invForm').reset();document.getElementById('invId').value='';document.getElementById('invModalTitle').textContent='Νέο Είδος';openModal('invModal');}
async function saveInv(e){
    e.preventDefault();const eid=document.getElementById('invId').value;
    const d={name:document.getElementById('invName').value,code:document.getElementById('invCode').value,quantity:parseInt(document.getElementById('invQty').value)||0,min_stock:parseInt(document.getElementById('invMin').value)||5,price:parseFloat(document.getElementById('invPrice').value)||0,unit:document.getElementById('invUnit').value,supplier:document.getElementById('invSup').value,location:document.getElementById('invLoc').value};
    if(eid){await fetch(API+'/inventory/'+eid,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});}
    else{await fetch(API+'/inventory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)});}
    closeModal('invModal');renderInv();
}
async function adjStock(iid,delta){await fetch(API+'/inventory/'+iid+'/stock',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({delta})});renderInv();}
function editInv(i){document.getElementById('invId').value=i.id;document.getElementById('invName').value=i.name;document.getElementById('invCode').value=i.code||'';document.getElementById('invQty').value=i.quantity;document.getElementById('invMin').value=i.min_stock;document.getElementById('invPrice').value=i.price||'';document.getElementById('invUnit').value=i.unit;document.getElementById('invSup').value=i.supplier||'';document.getElementById('invLoc').value=i.location||'';document.getElementById('invModalTitle').textContent='Επεξεργασία';openModal('invModal');}
async function delInv(iid){if(!canDelete())return;if(!confirm('Διαγραφή;'))return;await fetch(API+'/inventory/'+iid,{method:'DELETE'});renderInv();}

// ===== DASHBOARD =====
async function loadDashboard(){
    const r=await fetch(API+'/stats');const s=await r.json();
    document.getElementById('statsGrid').innerHTML='<div class="stat-card sc-blue"><div class="stat-num">'+s.totalEquipment+'</div><div class="stat-label">ΜΗΧΑΝΗΜΑΤΑ</div></div><div class="stat-card sc-green"><div class="stat-num">'+s.operational+'</div><div class="stat-label">ΛΕΙΤΟΥΡΓΙΚΑ</div></div><div class="stat-card sc-red"><div class="stat-num">'+s.breakdown+'</div><div class="stat-label">ΒΛΑΒΕΣ</div></div><div class="stat-card sc-orange"><div class="stat-num">'+s.lowStock.length+'</div><div class="stat-label">LOW STOCK</div></div>';
    const icons={maintenance:'🔧',breakdown:'⚡',repair:'🔨',inspection:'👁️',lubrication:'🛢️',calibration:'🎯',other:'📝'};
    document.getElementById('recentLogs').innerHTML=s.recentLogs.length?s.recentLogs.map(l=>'<div class="dash-item"><div class="di-title">'+(icons[l.log_type]||'📋')+' '+l.title+'</div><div class="di-sub">'+(l.equipment_name||'?')+' • '+fmtDate(l.work_date)+(l.technician?' • 👷 '+l.technician:'')+'</div></div>').join(''):'<div class="empty-state">Δεν υπάρχουν</div>';
    document.getElementById('lowStockList').innerHTML=s.lowStock.length?s.lowStock.map(i=>'<div class="dash-item"><div class="di-title">📦 '+i.name+'</div><div class="di-sub">'+i.quantity+'/'+i.min_stock+' '+i.unit+'</div></div>').join(''):'<div class="empty-state">OK ✅</div>';
    document.getElementById('problemEquip').innerHTML=s.problemEquipment.length?s.problemEquipment.map(p=>'<div class="dash-item"><div class="di-title">⚠️ '+p.name+'</div><div class="di-sub">'+p.cnt+' βλάβες</div></div>').join(''):'<div class="empty-state">OK 🎉</div>';
    document.getElementById('upcomingMaint').innerHTML='<div class="empty-state">—</div>';
}

// ===== PASSWORD =====
function showChangePw(){document.getElementById('userDropdown').classList.remove('show');document.getElementById('pwForm').reset();openModal('pwModal');}
async function changePw(e){e.preventDefault();const n=document.getElementById('pwNew').value;if(n!==document.getElementById('pwConfirm').value){alert('Δεν ταιριάζουν!');return;}const r=await fetch(API+'/auth/change-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({oldPassword:document.getElementById('pwOld').value,newPassword:n})});const d=await r.json();if(!r.ok){alert(d.error);return;}alert('✅ OK');closeModal('pwModal');}

// ===== USERS =====
async function openUsers(){document.getElementById('userDropdown').classList.remove('show');await loadUsers();openModal('usersModal');}
async function loadUsers(){const r=await fetch(API+'/users');const users=await r.json();const rl={admin:'Διαχειριστής',supervisor:'Επόπτης',technician:'Τεχνικός'};const rc={admin:'b-red',supervisor:'b-orange',technician:'b-blue'};let h='<table style="width:100%;font-size:.82rem;border-collapse:collapse"><tr style="border-bottom:1px solid var(--gray-200)"><th style="text-align:left;padding:6px">User</th><th style="text-align:left;padding:6px">Όνομα</th><th style="padding:6px">Ρόλος</th><th style="padding:6px">-</th></tr>';users.forEach(u=>{h+='<tr style="border-bottom:1px solid var(--gray-100)"><td style="padding:6px;font-weight:600">'+u.username+'</td><td style="padding:6px">'+(u.full_name||'-')+'</td><td style="padding:6px;text-align:center"><span class="badge '+rc[u.role]+'">'+rl[u.role]+'</span></td><td style="padding:6px;text-align:center">'+(u.id!==currentUser.id?'<button class="btn btn-danger btn-sm" onclick="delUser('+u.id+')">🗑️</button>':'')+'</td></tr>';});h+='</table>';document.getElementById('usersList').innerHTML=h;}
function showAddUser(){document.getElementById('addUserForm').style.display='';}
async function createUser(){const u=document.getElementById('newUsername').value.trim().toLowerCase(),n=document.getElementById('newFullName').value.trim(),p=document.getElementById('newPass').value,r=document.getElementById('newRole').value;if(!u||p.length<6){alert('Username + min 6 chars');return;}const res=await fetch(API+'/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p,fullName:n,role:r})});if(!res.ok){const d=await res.json();alert(d.error);return;}await loadUsers();document.getElementById('addUserForm').style.display='none';}
async function delUser(uid){if(!confirm('Διαγραφή;'))return;await fetch(API+'/users/'+uid,{method:'DELETE'});loadUsers();}

// ===== MODALS =====
function openModal(id){document.getElementById(id).classList.add('active');}
function closeModal(id){document.getElementById(id).classList.remove('active');}
document.querySelectorAll('.modal-overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('active');});});

// ===== UTILS =====
function fmtDate(d){if(!d)return'';return new Date(d).toLocaleDateString('el-GR',{day:'2-digit',month:'2-digit',year:'numeric'});}
