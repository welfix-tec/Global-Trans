        let drivers = [];
        let trucks = [];
        let orders = [];
        let jobCards = [];
        let trailers = [];
        let recycleBin = [];  // { id, type, label, deletedAt, data, meta }
        let settings = {};

        const App = (function () {
            drivers = [];
            trucks = [];
            orders = [];
            jobCards = [];
            trailers = [];
            let jcPageTab = 'pipeline';
            let jcStatusFilter = 'Draft';
            let jcMetricsPeriod = 'today';
            const DEFAULT_MAINTENANCE_SERVICES = [
                { key: 'oil-change', name: 'Oil Change', intervalDays: 90 },
                { key: 'tire-rotation', name: 'Tire Rotation', intervalDays: 180 },
                { key: 'air-filter', name: 'Air Filter', intervalDays: 365 },
                { key: 'brake-inspection', name: 'Brake Inspection', intervalDays: 180 },
                { key: 'battery-check', name: 'Battery Check', intervalDays: 365 },
                { key: 'coolant', name: 'Coolant Top-up', intervalDays: 180 },
                { key: 'general-inspection', name: 'General Inspection', intervalDays: 30 }
            ];
            let orderStatusFilter = '';
            let orderDateFilter = ''; // '', 'today', 'week', 'month', 'year', or 'custom'
            let orderDateRangeStart = '';
            let orderDateRangeEnd = '';
            settings = {
                theme: 'default',
                darkMode: true,
                driverStatuses: [
                    { name: 'Online', color: '#22c97a' },
                    { name: 'Offline', color: '#565b6e' },
                    { name: 'On Trip', color: '#3d7fff' },
                    { name: 'Idle', color: '#f59e0b' },
                    { name: 'Suspended', color: '#f04c5a' }
                ],
                violationTypes: [
                    { name: 'Speeding', severity: 'high' },
                    { name: 'Phone use', severity: 'medium' },
                    { name: 'Hard braking', severity: 'low' }
                ],
                riskMediumThreshold: 10,
                riskHighThreshold: 24,
                riskHighCountThreshold: 2,
                docTypes: [
                    { name: 'Insurance', months: 12 },
                    { name: 'Registration', months: 12 },
                    { name: 'Inspection', months: 6 }
                ],
                customFields: [],
                settingsLocked: false
            };
            let driverPage = 1, violationPage = 1;
            let violationSubpage = 'violations';
            let accidentPeriodFilter = 'year';
            let accidentDateRangeStart = '';
            let accidentDateRangeEnd = '';
            let pendingAccidentFiles = [];
            let tempEditingAccidentFiles = [];
            const PAGE_SIZE = 12;
            const PALETTES = [
                { bg: 'rgba(61,127,255,0.18)', color: '#5c9aff' },
                { bg: 'rgba(34,201,122,0.15)', color: '#22c97a' },
                { bg: 'rgba(167,139,250,0.15)', color: '#a78bfa' },
                { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' },
                { bg: 'rgba(240,76,90,0.15)', color: '#f04c5a' },
                { bg: 'rgba(45,212,191,0.15)', color: '#2dd4bf' }
            ];

            let autoLockInterval = null;
            let settingsAutoLockTimer = null;
            let dataReady = false;
            let cachedFgRole = null;
            let _uploadModalTarget = null;
            let bulkAttachmentImportState = null;

            function showUploadLoading(message) {
                const overlay = document.getElementById('upload-loading-msg');
                const textEl = document.getElementById('upload-loading-text');
                if (textEl) textEl.textContent = message || 'Uploading to Google Drive…';
                if (overlay) overlay.style.display = 'flex';
            }

            function hideUploadLoading() {
                const overlay = document.getElementById('upload-loading-msg');
                if (overlay) overlay.style.display = 'none';
            }

            function reopenEntityModal(entityType, idx) {
                if (entityType === 'driver') openDriverModal(idx);
                else if (entityType === 'trailer') openTrailerModal(idx);
                else openTruckModal(idx);
            }

            function startSettingsAutoLockTimer() {
                if (autoLockInterval) clearInterval(autoLockInterval);
                if (settingsAutoLockTimer) clearTimeout(settingsAutoLockTimer);
                
                if (!settings.unlockedAt) {
                    settings.unlockedAt = Date.now();
                    saveAll();
                }
                
                const updateCountdown = () => {
                    const elapsed = Date.now() - settings.unlockedAt;
                    const remaining = (5 * 60 * 1000) - elapsed;
                    
                    if (remaining <= 0) {
                        clearInterval(autoLockInterval);
                        autoLockInterval = null;
                        clearTimeout(settingsAutoLockTimer);
                        settingsAutoLockTimer = null;
                        autoLockSettings();
                    } else {
                        const minutes = Math.floor(remaining / 60000);
                        const seconds = Math.floor((remaining % 60000) / 1000);
                        const secondsStr = seconds < 10 ? '0' + seconds : seconds;
                        const countdownEl = document.getElementById('autoLockCountdown');
                        if (countdownEl) {
                            countdownEl.textContent = `(${minutes}:${secondsStr})`;
                        }
                    }
                };
                
                updateCountdown();
                autoLockInterval = setInterval(updateCountdown, 1000);
                
                const elapsed = Date.now() - settings.unlockedAt;
                const remaining = (5 * 60 * 1000) - elapsed;
                settingsAutoLockTimer = setTimeout(autoLockSettings, Math.max(0, remaining));
            }
            
            function autoLockSettings() {
                settings.settingsLocked = true;
                delete settings.unlockedAt;
                saveAll();
                if (autoLockInterval) {
                    clearInterval(autoLockInterval);
                    autoLockInterval = null;
                }
                if (settingsAutoLockTimer) {
                    clearTimeout(settingsAutoLockTimer);
                    settingsAutoLockTimer = null;
                }
                renderSettings();
                showToast('Settings have been locked automatically after 5 minutes');
            }
            
            function updateLockStatusUI() {
                const locked = settings.settingsLocked === true;
                const settingsPageActive = document.getElementById('page-settings')?.classList.contains('active');
                
                // Update topbar indicator only when settings page is open
                const globalLockStatus = document.getElementById('globalLockStatus');
                if (globalLockStatus) {
                    globalLockStatus.style.display = settingsPageActive ? 'flex' : 'none';
                    if (settingsPageActive) {
                        if (locked) {
                            globalLockStatus.innerHTML = `
                                <span class="badge badge-suspended" style="padding: 6px 12px; font-weight: 500; font-family: var(--font-body); display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(240, 76, 90, 0.2);">
                                    <span class="dot"></span> 🔒 Settings Locked
                                </span>`;
                        } else {
                            globalLockStatus.innerHTML = `
                                <span class="badge badge-online" style="padding: 6px 12px; font-weight: 500; font-family: var(--font-body); display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(34, 201, 122, 0.2);">
                                    <span class="dot"></span> 🔓 Editing Mode <span id="autoLockCountdown" style="font-family: var(--font-mono); margin-left: 4px; font-weight: 600;">(5:00)</span>
                                </span>`;
                        }
                    }
                }

                // Update settings page title badge
                const settingsPageLockBadge = document.getElementById('settingsPageLockBadge');
                if (settingsPageLockBadge) {
                    if (locked) {
                        settingsPageLockBadge.className = "badge badge-suspended";
                        settingsPageLockBadge.innerHTML = `<span class="dot"></span> Locked`;
                    } else {
                        settingsPageLockBadge.className = "badge badge-online";
                        settingsPageLockBadge.innerHTML = `<span class="dot"></span> Editing Mode`;
                    }
                }
            }

        function saveAll() {
            // Purge any expired recycle bin items before saving
            purgeExpiredRecycleBin();

            // Helper to build a lightweight copy for localStorage ONLY, preventing browser 5MB quota overflow
            function buildLightweightCopy(arr) {
                return (arr || []).map(item => {
                    if (!Array.isArray(item.files) || item.files.length === 0) return item;
                    const cleanFiles = item.files.map(f => {
                        if (!f) return null;
                        const isBase64 = typeof f.data === 'string' && f.data.startsWith('data:');
                        return {
                            ...f,
                            data: isBase64 && f.data.length > 300000 ? (f.driveId ? getDrivePreviewUrl(f.driveId) : '__local_file__') : f.data
                        };
                    }).filter(Boolean);
                    return { ...item, files: cleanFiles };
                });
            }

            const safeLocalSet = (key, dataObj) => {
                try {
                    localStorage.setItem(key, JSON.stringify(dataObj));
                } catch (e) {
                    console.warn(`[LocalStorage Quota Warning] Exceeded on ${key}, saving lightweight fallback:`, e);
                    try {
                        const lightweight = Array.isArray(dataObj) ? buildLightweightCopy(dataObj) : dataObj;
                        localStorage.setItem(key, JSON.stringify(lightweight));
                    } catch (_) { /* ignore local storage quota overflow */ }
                }
            };

            safeLocalSet('fg3_drivers', drivers);
            safeLocalSet('fg3_trucks', trucks);
            safeLocalSet('fg3_trailers', trailers);
            safeLocalSet('fg3_settings', settings);
            safeLocalSet('fg3_orders', orders);
            safeLocalSet('fg3_jobcards', jobCards);
            safeLocalSet('fg3_recyclebin', recycleBin);
            safeLocalSet('fg3_hscpolicies', typeof hscPolicies !== 'undefined' ? hscPolicies : []);
            safeLocalSet('fg3_hscmeetings', typeof hscMeetings !== 'undefined' ? hscMeetings : []);

            // Sync to Firebase (per-collection writes — safe for concurrent users)
            if (typeof database !== 'undefined') {
                const updates = {
                    'fleetguard/drivers':     drivers,
                    'fleetguard/trucks':      trucks,
                    'fleetguard/trailers':    trailers,
                    'fleetguard/settings':    settings,
                    'fleetguard/orders':      orders,
                    'fleetguard/jobCards':    jobCards,
                    'fleetguard/recycleBin':  recycleBin,
                    'fleetguard/hscPolicies': typeof hscPolicies !== 'undefined' ? hscPolicies : [],
                    'fleetguard/hscMeetings': typeof hscMeetings !== 'undefined' ? hscMeetings : [],
                    'fleetguard/lastUpdated': Date.now()
                };

                const cleanUpdates = JSON.parse(JSON.stringify(updates));

                database.ref('/').update(cleanUpdates).catch(err => {
                    console.error('Firebase save failed:', err);
                });
            }
        }

            // ═══════════════════════════════════════════════════════
            // ─────────── RECYCLING BIN ENGINE ───────────────────
            // ═══════════════════════════════════════════════════════

            // ═══════════════════════════════════════════════════════
            // ─────────── RECYCLING BIN ENGINE ───────────────────
            // ═══════════════════════════════════════════════════════

            let _recycleFilter = 'all';
            let _recycleSort = 'newest';
            let _selectedRecycleIds = new Set();

            function purgeExpiredRecycleBin() {
                const cutoff = Date.now() - 72 * 60 * 60 * 1000;
                recycleBin = recycleBin.filter(item => item.deletedAt > cutoff);
                _selectedRecycleIds = new Set([..._selectedRecycleIds].filter(id => recycleBin.some(item => item.id === id)));
            }

            function sendToRecycleBin(type, label, data, meta) {
                meta = meta || {};
                recycleBin.push({
                    id: createFileId ? createFileId() : String(Date.now()) + Math.random().toString(36).slice(2),
                    type,
                    label,
                    deletedAt: Date.now(),
                    data: JSON.parse(JSON.stringify(data)),
                    meta
                });
                purgeExpiredRecycleBin();
            }

            function restoreFromRecycleBin(itemId) {
                const item = recycleBin.find(x => x.id === itemId);
                if (!item) { showToast('Item not found in bin'); return; }

                const restored = JSON.parse(JSON.stringify(item.data));

                switch (item.type) {
                    case 'driver':
                        if (drivers.some(d => d._idx === restored._idx)) {
                            restored._idx = drivers.length ? Math.max(...drivers.map(d => d._idx)) + 1 : 0;
                        }
                        drivers.push(restored);
                        break;
                    case 'truck':
                        if (trucks.some(t => t._idx === restored._idx)) {
                            restored._idx = trucks.length ? Math.max(...trucks.map(t => t._idx)) + 1 : 0;
                        }
                        trucks.push(restored);
                        break;
                    case 'trailer':
                        if (trailers.some(t => t._idx === restored._idx)) {
                            restored._idx = trailers.length ? Math.max(...trailers.map(t => t._idx)) + 1 : 0;
                        }
                        trailers.push(restored);
                        break;
                    case 'order':
                        if (orders.some(o => o._idx === restored._idx)) {
                            restored._idx = orders.length ? Math.max(...orders.map(o => o._idx)) + 1 : 0;
                        }
                        orders.push(restored);
                        break;
                    case 'jobcard':
                        if (!jobCards.some(j => j.id === restored.id)) {
                            jobCards.push(restored);
                        }
                        break;
                    case 'violation': {
                        const driver = drivers.find(d => d._idx === item.meta.driverIdx);
                        if (driver) {
                            if (!Array.isArray(driver.violations)) driver.violations = [];
                            driver.violations.push(restored);
                        } else {
                            showToast('⚠ Driver not found — violation could not be restored');
                            return;
                        }
                        break;
                    }
                    default:
                        showToast('Unknown item type, cannot restore');
                        return;
                }

                recycleBin = recycleBin.filter(x => x.id !== itemId);
                _selectedRecycleIds.delete(itemId);
                saveAll();
                renderRecycleBin();
                updateSidebarBadges();
                showToast(`✅ ${item.label} restored successfully`);
            }

            function permanentDeleteFromBin(itemId) {
                const item = recycleBin.find(x => x.id === itemId);
                if (!item) return;
                if (!confirm(`Permanently delete "${item.label}"? This cannot be undone.`)) return;
                recycleBin = recycleBin.filter(x => x.id !== itemId);
                _selectedRecycleIds.delete(itemId);
                saveAll();
                renderRecycleBin();
                updateSidebarBadges();
                showToast('Item permanently deleted');
            }

            function emptyRecycleBin() {
                if (!recycleBin.length) { showToast('Recycling Bin is already empty'); return; }
                if (!confirm(`Permanently delete all ${recycleBin.length} item(s) in the bin? This cannot be undone.`)) return;
                recycleBin = [];
                _selectedRecycleIds.clear();
                saveAll();
                renderRecycleBin();
                updateSidebarBadges();
                showToast('Recycling Bin emptied');
            }

            function setRecycleFilter(filter) {
                _recycleFilter = filter;
                document.querySelectorAll('#recycleBinFilterTabs .rpt-tab').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.rfilter === filter);
                });
                renderRecycleBin();
            }

            function setRecycleSort(sort) {
                _recycleSort = sort;
                renderRecycleBin();
            }

            function toggleRecycleSelectAll(checked) {
                const filtered = _getFilteredRecycleBin();
                if (checked) {
                    filtered.forEach(item => _selectedRecycleIds.add(item.id));
                } else {
                    filtered.forEach(item => _selectedRecycleIds.delete(item.id));
                }
                renderRecycleBin();
            }

            function toggleRecycleItemSelect(itemId, checked) {
                if (checked) {
                    _selectedRecycleIds.add(itemId);
                } else {
                    _selectedRecycleIds.delete(itemId);
                }
                renderRecycleBin();
            }

            function restoreSelectedFromBin() {
                if (!_selectedRecycleIds.size) { showToast('No items selected'); return; }
                const count = _selectedRecycleIds.size;
                if (!confirm(`Restore ${count} selected item(s) back to original locations?`)) return;
                
                const ids = Array.from(_selectedRecycleIds);
                ids.forEach(id => {
                    restoreFromRecycleBin(id);
                });
                showToast(`✅ ${count} item(s) restored successfully`);
            }

            function permanentDeleteSelectedFromBin() {
                if (!_selectedRecycleIds.size) { showToast('No items selected'); return; }
                const count = _selectedRecycleIds.size;
                if (!confirm(`Permanently delete ${count} selected item(s)? This cannot be undone.`)) return;
                
                const ids = Array.from(_selectedRecycleIds);
                recycleBin = recycleBin.filter(x => !ids.includes(x.id));
                _selectedRecycleIds.clear();
                saveAll();
                renderRecycleBin();
                updateSidebarBadges();
                showToast(`${count} item(s) permanently deleted`);
            }

            function previewRecycleItem(itemId) {
                const item = recycleBin.find(x => x.id === itemId);
                if (!item) return;
                
                const ti = _recycleTypeInfo(item.type);
                const cd = _recycleCountdown(item.deletedAt);
                const deletedDate = new Date(item.deletedAt).toLocaleString('en-ZA', { dateStyle: 'full', timeStyle: 'short' });
                
                let detailsHtml = '';
                if (item.data) {
                    const keys = Object.keys(item.data).filter(k => typeof item.data[k] !== 'object' && item.data[k] !== undefined && item.data[k] !== '');
                    detailsHtml = keys.map(k => `
                        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:12.5px">
                            <span style="color:var(--text2);text-transform:capitalize">${xmlEscape(k.replace(/_/g, ' '))}:</span>
                            <span style="font-weight:600;color:var(--text)">${xmlEscape(String(item.data[k]))}</span>
                        </div>
                    `).join('');
                }

                openModal(`
                    <div class="modal-header">
                        <div style="display:flex;align-items:center;gap:10px">
                            <span style="font-size:24px">${ti.icon}</span>
                            <div>
                                <h3 style="font-size:16px;margin:0">${xmlEscape(item.label)}</h3>
                                <span style="font-size:11px;color:var(--text3)">Deleted Item Inspection · ${ti.label}</span>
                            </div>
                        </div>
                        <div class="modal-close" onclick="App.closeModal()">✕</div>
                    </div>
                    <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
                        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;align-items:center;justify-content:space-between">
                            <div>
                                <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em">Deleted Timestamp</div>
                                <div style="font-size:13px;font-weight:600;color:var(--text);margin-top:2px">${deletedDate}</div>
                            </div>
                            <span class="recycle-countdown ${cd.cls}">${cd.text}</span>
                        </div>

                        <div>
                            <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Restoration Snapshot Properties</div>
                            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:0 14px;max-height:260px;overflow-y:auto">
                                ${detailsHtml || '<div style="padding:16px;text-align:center;color:var(--text3);font-size:12px">No property snapshot available</div>'}
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center">
                        <button class="btn btn-ghost" onclick="App.closeModal()">Close</button>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-ghost" style="color:var(--red);border-color:rgba(240,76,90,0.3)" onclick="App.closeModal();App.permanentDeleteFromBin('${item.id}')">🗑 Permanent Delete</button>
                            <button class="btn btn-primary" onclick="App.closeModal();App.restoreFromRecycleBin('${item.id}')">↩ Restore Item</button>
                        </div>
                    </div>
                `);
            }

            function _getFilteredRecycleBin() {
                const search = (document.getElementById('recycleBinSearch')?.value || '').toLowerCase().trim();
                return recycleBin.filter(item => {
                    if (_recycleFilter !== 'all' && item.type !== _recycleFilter) return false;
                    if (search && !item.label.toLowerCase().includes(search) && !item.type.includes(search)) return false;
                    return true;
                }).sort((a, b) => {
                    if (_recycleSort === 'oldest') return a.deletedAt - b.deletedAt;
                    if (_recycleSort === 'expiring') return a.deletedAt - b.deletedAt;
                    if (_recycleSort === 'name') return a.label.localeCompare(b.label);
                    return b.deletedAt - a.deletedAt;
                });
            }

            function _recycleCountdown(deletedAt) {
                const expiresAt = deletedAt + 72 * 60 * 60 * 1000;
                const remaining = expiresAt - Date.now();
                if (remaining <= 0) return { text: 'Expiring now', cls: 'recycle-countdown-critical' };
                const h = Math.floor(remaining / 3600000);
                const m = Math.floor((remaining % 3600000) / 60000);
                if (h < 6) return { text: `${h}h ${m}m remaining`, cls: 'recycle-countdown-critical' };
                if (h < 24) return { text: `${h}h ${m}m remaining`, cls: 'recycle-countdown-warn' };
                return { text: `${h}h ${m}m remaining`, cls: 'recycle-countdown-ok' };
            }

            function _recycleTypeInfo(type) {
                const map = {
                    driver:    { icon: '👤', label: 'Driver',    color: '#3d7fff' },
                    truck:     { icon: '🚛', label: 'Truck',     color: '#22c97a' },
                    trailer:   { icon: '🔗', label: 'Trailer',   color: '#f59e0b' },
                    order:     { icon: '📦', label: 'Order',     color: '#a78bfa' },
                    jobcard:   { icon: '🧾', label: 'Job Card',  color: '#38bdf8' },
                    violation: { icon: '⚠',  label: 'Violation', color: '#f04c5a' }
                };
                return map[type] || { icon: '📁', label: 'Item', color: '#8b90a0' };
            }

            function renderRecycleBin() {
                purgeExpiredRecycleBin();
                const list = document.getElementById('recycleBinList');
                const statsEl = document.getElementById('recycleBinStats');
                if (!list) return;

                const counts = { driver: 0, truck: 0, trailer: 0, order: 0, jobcard: 0, violation: 0 };
                recycleBin.forEach(i => { if (counts[i.type] !== undefined) counts[i.type]++; });
                
                // Update tab counts
                const tabCounts = { all: recycleBin.length, ...counts };
                Object.keys(tabCounts).forEach(k => {
                    const el = document.getElementById(`rTabCount-${k}`);
                    if (el) el.textContent = tabCounts[k];
                });

                // Stats row
                if (statsEl) {
                    const criticalCount = recycleBin.filter(i => (i.deletedAt + 72 * 3600000 - Date.now()) < 6 * 3600000).length;
                    statsEl.innerHTML = `
                        <div class="recycle-stat-card"><div class="recycle-stat-num">${recycleBin.length}</div><div class="recycle-stat-lbl">Total Deleted</div></div>
                        <div class="recycle-stat-card recycle-stat-warn"><div class="recycle-stat-num">${criticalCount}</div><div class="recycle-stat-lbl">Expiring &lt;6h</div></div>
                        <div class="recycle-stat-card"><div class="recycle-stat-num">${counts.driver}</div><div class="recycle-stat-lbl">Drivers</div></div>
                        <div class="recycle-stat-card"><div class="recycle-stat-num">${counts.truck}</div><div class="recycle-stat-lbl">Trucks</div></div>
                        <div class="recycle-stat-card"><div class="recycle-stat-num">${counts.jobcard}</div><div class="recycle-stat-lbl">Job Cards</div></div>
                        <div class="recycle-stat-card"><div class="recycle-stat-num">${counts.violation}</div><div class="recycle-stat-lbl">Violations</div></div>
                    `;
                }

                const filtered = _getFilteredRecycleBin();

                // Update bulk actions visibility & select all checkbox state
                const selectAllCb = document.getElementById('recycleSelectAll');
                const bulkActionsEl = document.getElementById('recycleBulkActions');
                const selectedCountEl = document.getElementById('recycleSelectedCount');
                
                const currentFilteredIds = filtered.map(x => x.id);
                const selectedCountInFilter = currentFilteredIds.filter(id => _selectedRecycleIds.has(id)).length;

                if (selectAllCb) {
                    selectAllCb.checked = filtered.length > 0 && selectedCountInFilter === filtered.length;
                }
                if (bulkActionsEl && selectedCountEl) {
                    if (_selectedRecycleIds.size > 0) {
                        bulkActionsEl.style.display = 'flex';
                        selectedCountEl.textContent = _selectedRecycleIds.size;
                    } else {
                        bulkActionsEl.style.display = 'none';
                    }
                }

                if (!filtered.length) {
                    list.innerHTML = `
                        <div class="recycle-empty">
                            <div class="recycle-empty-icon">🗑</div>
                            <div class="recycle-empty-title">${_recycleFilter === 'all' ? 'Recycling Bin is Empty' : 'No ' + _recycleTypeInfo(_recycleFilter).label + 's in Bin'}</div>
                            <div class="recycle-empty-sub">Deleted items will appear here and be held for 72 hours before permanent automated removal.</div>
                        </div>`;
                    return;
                }

                list.innerHTML = filtered.map(item => {
                    const ti = _recycleTypeInfo(item.type);
                    const cd = _recycleCountdown(item.deletedAt);
                    const deletedDate = new Date(item.deletedAt).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
                    const progressPct = Math.max(0, Math.min(100, ((Date.now() - item.deletedAt) / (72 * 3600000)) * 100));
                    const isChecked = _selectedRecycleIds.has(item.id);

                    return `<div class="recycle-item ${isChecked ? 'selected' : ''}">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="App.toggleRecycleItemSelect('${item.id}', this.checked)" style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent);flex-shrink:0">
                        <div class="recycle-item-type-badge" style="background:${ti.color}22;color:${ti.color};border:1px solid ${ti.color}44">
                            ${ti.icon} ${ti.label}
                        </div>
                        <div class="recycle-item-body">
                            <div class="recycle-item-name">${xmlEscape(item.label)}</div>
                            <div class="recycle-item-meta">
                                <span>Deleted on ${deletedDate}</span>
                                <span>•</span>
                                <span style="color:var(--text2)">72h Retention Lifecycle</span>
                            </div>
                            <div class="recycle-progress-bar">
                                <div class="recycle-progress-fill ${progressPct > 75 ? 'recycle-progress-danger' : progressPct > 40 ? 'recycle-progress-warn' : ''}" style="width:${progressPct.toFixed(1)}%"></div>
                            </div>
                        </div>
                        <div class="recycle-item-right">
                            <span class="recycle-countdown ${cd.cls}">${cd.text}</span>
                            <div class="recycle-item-actions">
                                <button class="btn btn-ghost btn-xs recycle-preview-btn" onclick="App.previewRecycleItem('${item.id}')">👁 Preview</button>
                                <button class="btn btn-ghost btn-xs recycle-restore-btn" onclick="App.restoreFromRecycleBin('${item.id}')">↩ Restore</button>
                                <button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="App.permanentDeleteFromBin('${item.id}')">🗑 Delete</button>
                            </div>
                        </div>
                    </div>`;
                }).join('');
            }

            // ═══════════════════════════════════════════════════════
            function generateSalt() {
                // Cryptographically secure random salt (16 bytes → 32 hex chars)
                const arr = new Uint8Array(16);
                crypto.getRandomValues(arr);
                return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
            }

            async function hashPinAsync(pin, salt) {
                // SHA-256 hash via Web Crypto — one-way, cannot be reversed
                const encoder = new TextEncoder();
                const data = encoder.encode(salt + ':' + pin);
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            }
            function getAdminFailedAttempts() {
                return parseInt(localStorage.getItem('fg3_admin_failed_attempts') || '0', 10);
            }
            function setAdminFailedAttempts(value) {
                localStorage.setItem('fg3_admin_failed_attempts', String(value));
            }
            function getAdminLockoutUntil() {
                return parseInt(localStorage.getItem('fg3_admin_lockout') || '0', 10);
            }
            function isAdminLocked() {
                return getAdminLockoutUntil() > Date.now();
            }
            async function requireAdminPin(promptText) {
                if (!settings.pinHash || !settings.pinSalt) {
                    showToast('Set an admin PIN first');
                    return false;
                }
                if (isAdminLocked()) {
                    const remainingSeconds = Math.max(0, Math.ceil((getAdminLockoutUntil() - Date.now()) / 1000));
                    showToast(`Admin PIN locked for ${remainingSeconds} more seconds`);
                    return false;
                }
                const pin = prompt(promptText || 'Enter your 4-digit admin PIN');
                if (pin === null) return false;
                if (!/^[0-9]{4}$/.test(pin)) {
                    showToast('PIN must be exactly 4 digits');
                    return false;
                }
                const valid = await validateAdminPinAsync(pin);
                if (!valid) {
                    const attempts = getAdminFailedAttempts() + 1;
                    setAdminFailedAttempts(attempts);
                    if (attempts >= 3) {
                        localStorage.setItem('fg3_admin_lockout', String(Date.now() + 5 * 60 * 1000));
                        showToast('Too many failures. Locked for 5 minutes.');
                    } else {
                        showToast(`${3 - attempts} attempt(s) remaining`);
                    }
                    return false;
                }
                setAdminFailedAttempts(0);
                return true;
            }
            async function validateAdminPinAsync(pin) {
                if (!settings.pinHash || !settings.pinSalt) return false;
                const computed = await hashPinAsync(pin, settings.pinSalt);
                return computed === settings.pinHash;
            }
            function updateAdminSectionUI() {
                const adminPinButton = document.getElementById('adminPinButton');
                const restoreBackupButton = document.getElementById('restoreBackupButton');
                const settingsLockButton = document.getElementById('settingsLockButton');
                const adminPinStatus = document.getElementById('adminPinStatus');
                const backupExists = !!localStorage.getItem('fg3_backup');
                if (adminPinButton) adminPinButton.textContent = settings.pinHash ? 'Change PIN' : 'Set Admin PIN';
                if (restoreBackupButton) restoreBackupButton.style.display = backupExists ? 'inline-flex' : 'none';
                if (settingsLockButton) settingsLockButton.textContent = settings.settingsLocked ? 'Unlock Settings' : 'Lock Settings';
                if (adminPinStatus) {
                    if (settings.pinHash) {
                        adminPinStatus.innerHTML = settings.settingsLocked 
                            ? `Admin PIN is set. <span style="color: var(--red); font-weight: 500;">Settings are locked.</span>`
                            : `Admin PIN is set. <span style="color: var(--green); font-weight: 500;">Settings are unlocked (Editing Mode).</span>`;
                    } else {
                        adminPinStatus.innerHTML = `<span style="color: var(--amber);">No admin PIN configured.</span>`;
                    }
                }
                const locked = settings.settingsLocked === true;
                document.querySelectorAll('#page-settings input, #page-settings select, #page-settings textarea, #page-settings button').forEach(el => {
                    if (['adminPinButton', 'restoreBackupButton', 'settingsLockButton'].includes(el.id)) return;
                    el.disabled = locked;
                });
                if (!locked && document.getElementById('page-settings')?.classList.contains('active')) {
                    startSettingsAutoLockTimer();
                }
                updateLockStatusUI();
            }
            function handleAdminPin() {
                if (settings.pinHash) { changeAdminPin(); } else { setAdminPin(); }
            }
            async function setAdminPin() {
                const pin = prompt('Set a new 4-digit admin PIN');
                if (pin === null) return;
                if (!/^[0-9]{4}$/.test(pin)) {
                    showToast('PIN must be exactly 4 digits');
                    return;
                }
                const confirmPin = prompt('Confirm new 4-digit admin PIN');
                if (confirmPin === null) return;
                if (confirmPin !== pin) {
                    showToast('PIN confirmation does not match');
                    return;
                }
                settings.pinSalt = generateSalt();
                settings.pinHash = await hashPinAsync(pin, settings.pinSalt);
                saveAll();
                renderSettings();
                showToast('Admin PIN set');
            }
            async function changeAdminPin() {
                if (!await requireAdminPin('Enter current admin PIN to change it')) return;
                const pin = prompt('Enter a new 4-digit admin PIN');
                if (pin === null) return;
                if (!/^[0-9]{4}$/.test(pin)) {
                    showToast('PIN must be exactly 4 digits');
                    return;
                }
                const confirmPin = prompt('Confirm new 4-digit admin PIN');
                if (confirmPin === null) return;
                if (confirmPin !== pin) {
                    showToast('PIN confirmation does not match');
                    return;
                }
                settings.pinSalt = generateSalt();
                settings.pinHash = await hashPinAsync(pin, settings.pinSalt);
                saveAll();
                renderSettings();
                showToast('Admin PIN changed');
            }
            function backupAndDownload(reason) {
                const payload = {
                    drivers,
                    trucks,
                    trailers,
                    settings,
                    orders,
                    timestamp: new Date().toISOString(),
                    reason
                };
                const backupJson = JSON.stringify(payload, null, 2);
                localStorage.setItem('fg3_backup', backupJson);
                const blob = new Blob([backupJson], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `fleetguard-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
                a.click();
                showToast('Backup created');
                updateAdminSectionUI();
            }
            async function toggleSettingsLock() {
                if (!settings.pinHash) {
                    showToast('Set an admin PIN first');
                    return;
                }
                if (settings.settingsLocked) {
                    if (!await requireAdminPin('Enter admin PIN to unlock settings')) return;
                    settings.settingsLocked = false;
                    settings.unlockedAt = Date.now();
                } else {
                    settings.settingsLocked = true;
                    delete settings.unlockedAt;
                    if (autoLockInterval) { clearInterval(autoLockInterval); autoLockInterval = null; }
                    if (settingsAutoLockTimer) { clearTimeout(settingsAutoLockTimer); settingsAutoLockTimer = null; }
                }
                saveAll();
                renderSettings();
                showToast(settings.settingsLocked ? 'Settings locked' : 'Settings unlocked');
            }
            async function restoreFromBackup() {
                if (!localStorage.getItem('fg3_backup')) {
                    showToast('No backup available');
                    return;
                }
                if (!await requireAdminPin('Enter admin PIN to restore backup')) return;
                try {
                    const backup = JSON.parse(localStorage.getItem('fg3_backup'));
                    drivers = Array.isArray(backup.drivers) ? backup.drivers : [];
                    trucks = Array.isArray(backup.trucks) ? backup.trucks : [];
                    trailers = Array.isArray(backup.trailers) ? backup.trailers : [];
                    orders = Array.isArray(backup.orders) ? backup.orders : [];
                    settings = backup.settings || settings;
                    if (settings.theme === undefined) settings.theme = 'default';
                    if (settings.darkMode === undefined) settings.darkMode = true;
                    if (settings.settingsLocked === undefined) settings.settingsLocked = false;
                    saveAll();
                    applyTheme();
                    renderSettings();
                    showPage('dashboard');
                    showToast('Backup restored');
                } catch (err) {
                    showToast('Backup restore failed');
                }
            }
            function hydrateAttachments(liveArr, localKey) {
                try {
                    const cached = JSON.parse(localStorage.getItem(localKey) || '[]');
                    const cachedMap = {};
                    cached.forEach(item => {
                        if (item._idx !== undefined) cachedMap[item._idx] = item;
                    });
                    liveArr.forEach(item => {
                        const local = cachedMap[item._idx];
                        const localFileMap = {};
                        if (local && Array.isArray(local.files)) {
                            local.files.forEach(f => { localFileMap[f.id] = f; });
                        }
                        if (!Array.isArray(item.files)) return;
                        item.files = item.files.map(f => {
                            const url = resolveDriveUrl(f.data || f.storageUrl || '');
                            if (url) {
                                const driveId = f.driveId || extractDriveFileId(url);
                                return {
                                    id: f.id,
                                    name: f.name,
                                    uploadedAt: f.uploadedAt,
                                    data: url,
                                    driveId: driveId || undefined,
                                    mimeType: f.mimeType,
                                    category: f.category,
                                    uploadedToDrive: f.uploadedToDrive,
                                    uploadError: f.uploadError
                                };
                            }
                            if (f.data === '__local__' && localFileMap[f.id]) {
                                return { ...f, data: localFileMap[f.id].data };
                            }
                            return f;
                        });
                    });
                } catch (e) { /* ignore parse errors */ }
            }

            function loadAll(callback) {
                callback = callback || function(){};
                dataReady = false;

                // Show loading indicator to user
                const loadingEl = document.getElementById('app-loading-msg');
                if (loadingEl) loadingEl.style.display = 'flex';

                // Always try Firebase first (authoritative source)
                if (typeof database !== 'undefined') {
                    database.ref('fleetguard').once('value').then(snapshot => {
                        const data = snapshot.val();
                        if (data) {
                            drivers   = Array.isArray(data.drivers)   ? data.drivers   : [];
                            trucks    = Array.isArray(data.trucks)    ? data.trucks    : [];
                            trailers  = Array.isArray(data.trailers)  ? data.trailers  : [];
                            orders    = Array.isArray(data.orders)    ? data.orders    : [];
                            jobCards  = Array.isArray(data.jobCards)  ? data.jobCards  : [];
                            recycleBin = Array.isArray(data.recycleBin) ? data.recycleBin : [];
                            if (data.settings) settings = data.settings;
                            if (Array.isArray(data.hscPolicies)) hscPolicies = data.hscPolicies;
                            if (Array.isArray(data.hscMeetings)) hscMeetings = data.hscMeetings;
                            hydrateAttachments(drivers, 'fg3_drivers');
                            hydrateAttachments(trucks, 'fg3_trucks');
                            hydrateAttachments(trailers, 'fg3_trailers');
                            // Cache locally for offline fallback
                            localStorage.setItem('fg3_drivers',     JSON.stringify(drivers));
                            localStorage.setItem('fg3_trucks',      JSON.stringify(trucks));
                            localStorage.setItem('fg3_trailers',    JSON.stringify(trailers));
                            localStorage.setItem('fg3_settings',    JSON.stringify(settings));
                            localStorage.setItem('fg3_orders',      JSON.stringify(orders));
                            localStorage.setItem('fg3_jobcards',    JSON.stringify(jobCards));
                            localStorage.setItem('fg3_hscpolicies', JSON.stringify(hscPolicies));
                            localStorage.setItem('fg3_hscmeetings', JSON.stringify(hscMeetings));
                        } else {
                            // Firebase connected but empty (new project) — start clean.
                            // Do NOT fall back to localStorage which may contain data from
                            // a previous Firebase project (e.g. old 3RAG data).
                            drivers = []; trucks = []; trailers = [];
                            orders = []; jobCards = []; recycleBin = [];
                            hscPolicies = []; hscMeetings = [];
                            // Wipe any stale localStorage so it doesn't bleed back in
                            ['fg3_drivers','fg3_trucks','fg3_trailers','fg3_settings',
                             'fg3_orders','fg3_jobcards','fg3_hscpolicies','fg3_hscmeetings',
                             'fg3_recyclebin'].forEach(k => localStorage.removeItem(k));
                            console.log('[FleetGuard] New Firebase project detected — starting with clean data.');
                        }
                        _afterLoad();
                        dataReady = true;
                        if (loadingEl) loadingEl.style.display = 'none';
                        callback();
                    }).catch(() => {
                        // Firebase failed — fall back to localStorage
                        _loadFromLocalStorage();
                        hydrateAttachments(drivers, 'fg3_drivers');
                        hydrateAttachments(trucks, 'fg3_trucks');
                        hydrateAttachments(trailers, 'fg3_trailers');
                        _afterLoad();
                        dataReady = true;
                        if (loadingEl) loadingEl.style.display = 'none';
                        callback();
                    });
                } else {
                    _loadFromLocalStorage();
                    hydrateAttachments(drivers, 'fg3_drivers');
                    hydrateAttachments(trucks, 'fg3_trucks');
                    hydrateAttachments(trailers, 'fg3_trailers');
                    _afterLoad();
                    dataReady = true;
                    if (loadingEl) loadingEl.style.display = 'none';
                    callback();
                }
            }

function _loadFromLocalStorage() {
    const d = localStorage.getItem('fg3_drivers');
    if (d) drivers = JSON.parse(d);
    const t = localStorage.getItem('fg3_trucks');
    if (t) trucks = JSON.parse(t);
    const tr = localStorage.getItem('fg3_trailers');
    if (tr) { try { trailers = JSON.parse(tr); } catch(e) { trailers = []; } } else { trailers = []; }
    const s = localStorage.getItem('fg3_settings');
    if (s) {
        settings = JSON.parse(s);
        if (settings.theme === undefined) settings.theme = 'default';
        if (settings.darkMode === undefined) settings.darkMode = true;
        if (settings.settingsLocked === undefined) settings.settingsLocked = false;
    }
    const o = localStorage.getItem('fg3_orders');
    if (o) { try { orders = JSON.parse(o); } catch(e) { orders = []; } } else { orders = []; }
    const jc = localStorage.getItem('fg3_jobcards');
    if (jc) { try { jobCards = JSON.parse(jc); } catch (e) { jobCards = []; } }
    const rb = localStorage.getItem('fg3_recyclebin');
    if (rb) { try { recycleBin = JSON.parse(rb); } catch (e) { recycleBin = []; } } else { recycleBin = []; }
    purgeExpiredRecycleBin();
}

function ensureSettingsDefaults() {
    settings = settings || {};
    if (settings.theme === undefined) settings.theme = 'default';
    if (settings.darkMode === undefined) settings.darkMode = true;
    if (settings.settingsLocked === undefined) settings.settingsLocked = false;
    if (!Array.isArray(settings.driverStatuses)) {
        settings.driverStatuses = [
            { name: 'Online', color: '#22c97a' },
            { name: 'Offline', color: '#565b6e' },
            { name: 'On Trip', color: '#3d7fff' },
            { name: 'Idle', color: '#f59e0b' },
            { name: 'Suspended', color: '#f04c5a' }
        ];
    }
    if (!Array.isArray(settings.violationTypes)) {
        settings.violationTypes = [
            { name: 'Speeding', severity: 'high' },
            { name: 'Phone use', severity: 'medium' },
            { name: 'Hard braking', severity: 'low' }
        ];
    }
    if (settings.riskMediumThreshold === undefined) settings.riskMediumThreshold = 10;
    if (settings.riskHighThreshold === undefined) settings.riskHighThreshold = 24;
    if (settings.riskHighCountThreshold === undefined) settings.riskHighCountThreshold = 2;
    if (!Array.isArray(settings.docTypes)) {
        settings.docTypes = [
            { name: 'Insurance', months: 12 },
            { name: 'Registration', months: 12 },
            { name: 'Inspection', months: 6 }
        ];
    }
    if (!Array.isArray(settings.customFields)) settings.customFields = [];
    if (!Array.isArray(settings.maintenanceServices) || !settings.maintenanceServices.length) {
        settings.maintenanceServices = DEFAULT_MAINTENANCE_SERVICES.map(s => ({ ...s }));
    }
}

function _afterLoad() {
    migrateAllJobCards();
    ensureSettingsDefaults();
    drivers.forEach(drv => {
        if (!drv.violations) drv.violations = [];
        if (!drv.tripsList) drv.tripsList = [];
        if (!drv.warningsList) drv.warningsList = [];
        if (!drv.suspensionsList) drv.suspensionsList = [];
        if (!drv.accidentsList) drv.accidentsList = [];
        if (!drv.lossesList) drv.lossesList = [];
        if (!drv.trainings) drv.trainings = [];
        if (!drv.files) drv.files = [];
        if (!drv.documents) drv.documents = [];
        if (!Array.isArray(drv.assignmentHistory)) drv.assignmentHistory = [];
        if (drv.license_plate && drv.assignmentHistory.length === 0) {
            drv.assignmentHistory.push({
                truckPlate: drv.license_plate,
                date: drv.hire_date || 'Initial Assignment'
            });
        }
        (drv.violations || []).forEach(v => {
            if (!v.truckPlate && drv.license_plate) v.truckPlate = drv.license_plate;
        });
        (drv.accidentsList || []).forEach(a => {
            if (!a.truckPlate && drv.license_plate) a.truckPlate = drv.license_plate;
        });
        if (drv.phone === undefined) drv.phone = '';
        if (drv.tripsList.length === 0 && typeof drv.trips === 'number') drv.trips = drv.trips || 0;
    });
    trucks.forEach(trk => {
        if (!trk.documents) trk.documents = [];
        if (!trk.issues) trk.issues = [];
        if (!trk.files) trk.files = [];
        if (!trk.custom || typeof trk.custom !== 'object') trk.custom = {};
        if (!trk.status) trk.status = 'Active';
        if (!trk.lastServices) trk.lastServices = {};
        if (!trk.maintenanceLog) trk.maintenanceLog = [];
    });
    if (!Array.isArray(trailers)) trailers = [];
    const currentTrailerIdsInFleet = Array.from(new Set([
        ...trucks.map(t => t.trailer || ''),
        ...drivers.map(d => (d.custom || {}).Trailer || '')
    ].filter(Boolean)));
    currentTrailerIdsInFleet.forEach(id => {
        const exists = trailers.some(tr => String(tr.id).trim().toUpperCase() === id.trim().toUpperCase());
        if (!exists) {
            trailers.push({
                _idx: trailers.length ? Math.max(...trailers.map(x => x._idx)) + 1 : 0,
                id: id,
                brand: 'N/A',
                year: 'N/A',
                logBook: 'N/A',
                status: 'Active',
                documents: [
                    { type: 'Insurance', expiryDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10) },
                    { type: 'Inspection', expiryDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10) }
                ],
                issues: [],
                files: [],
                custom: {}
            });
        }
    });
    trailers.forEach((tr, i) => {
        if (tr._idx === undefined || tr._idx === null) tr._idx = i;
        if (!tr.documents) tr.documents = [];
        if (!tr.issues) tr.issues = [];
        if (!tr.files) tr.files = [];
        if (!tr.custom || typeof tr.custom !== 'object') tr.custom = {};
        if (!tr.status) tr.status = 'Active';
    });
    orders.forEach(ord => {
        if (!ord.priority) ord.priority = 'Medium';
        if (!ord.truckPlate) ord.truckPlate = '';
        if (!ord.status) ord.status = 'Pending';
        if (!ord.date) ord.date = new Date().toISOString().slice(0, 10);
        if (!ord.orderId) ord.orderId = ord.name || '';
        if (!ord.assignedTrucks || !Array.isArray(ord.assignedTrucks)) {
            ord.assignedTrucks = [];
            if (ord.truckPlate) {
                ord.assignedTrucks.push({
                    plate: ord.truckPlate,
                    status: ord.status === 'At Garage' ? 'Offloaded' : ord.status === 'In Transit' ? 'Transit' : 'allocated',
                    active: true,
                    allocatedDate: ord.date
                });
            }
        } else {
            ord.assignedTrucks.forEach(t => {
                if (!t.allocatedDate && ord.date) t.allocatedDate = ord.date;
                if (t.status === 'loaded' && !t.loadedDate && ord.date) t.loadedDate = ord.date;
                if (t.status === 'Offloaded' && !t.offloadDate && ord.date) t.offloadDate = ord.date;
            });
        }
        if (ord.status === 'At Garage' && !ord.completedDate) {
            const offloadDates = (ord.assignedTrucks || []).map(t => t.offloadDate).filter(Boolean).sort();
            if (offloadDates.length) ord.completedDate = offloadDates[0];
        }
        ord.status = deriveOrderStatus(ord);
    });
    applyTheme();
}

            function palette(i) { return PALETTES[i % PALETTES.length]; }
            function initials(name) { return (name || '?').trim().split(/\s+/).map(p => p[0] || '').join('').toUpperCase().slice(0, 2) || '?'; }
            function normStatus(s) { return (s || '').toLowerCase().replace(/\s+/g, '-'); }
            function deriveOrderStatus(order) {
                if (!order || !Array.isArray(order.assignedTrucks) || order.assignedTrucks.length === 0) {
                    return order?.status || 'Pending';
                }
                const activeTrucks = order.assignedTrucks.filter(t => t.active !== false);
                if (activeTrucks.length === 0) return 'Pending';
                if (activeTrucks.every(t => t.status === 'Offloaded')) return 'At Garage';
                if (activeTrucks.some(t => t.status === 'Transit' || t.status === 'In Transit')) return 'In Transit';
                if (activeTrucks.some(t => t.status === 'loaded')) return 'Loading';
                return 'Pending';
            }
            function formatDisplayDate(value) {
                if (!value) return '';
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
                    const [year, month, day] = value.split('-');
                    return `${day}/${month}/${year}`;
                }
                const d = new Date(value);
                if (Number.isNaN(d.getTime())) return value;
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                return `${day}/${month}/${year}`;
            }
            function getOrderStatusText(order) {
                if (!order) return 'Pending';
                const isCompleted = order.status === 'At Garage';
                if (!isCompleted) return order.status || 'Pending';
                const dateText = order.completedDate ? formatDisplayDate(order.completedDate) : '';
                return dateText ? `Completed || ${dateText}` : 'Completed';
            }
            function riskScore(violations) {
                return (violations || []).reduce((s, v) => {
                    const sev = (v.severity || 'low').toLowerCase();
                    return s + (sev === 'high' ? 12 : sev === 'medium' ? 5 : 2);
                }, 0);
            }
            function riskLevel(violations) {
                const s = riskScore(violations);
                const h = (violations || []).filter(v => (v.severity || '').toLowerCase() === 'high').length;
                if (h >= settings.riskHighCountThreshold || s >= settings.riskHighThreshold) return 'high';
                if (h >= 1 || s >= settings.riskMediumThreshold) return 'medium';
                return 'low';
            }
            function riskPct(violations) { return Math.min(Math.round(riskScore(violations) / 60 * 100), 100); }
            function healthScore(truck) {
                if (!truck.issues || truck.issues.length === 0) return 100;
                let sc = 100;
                truck.issues.forEach(i => {
                    if (i.severity === 'high') sc -= 25;
                    else if (i.severity === 'medium') sc -= 10;
                    else sc -= 3;
                });
                return Math.max(0, Math.min(100, sc));
            }
            function healthLabel(sc) { return sc >= 80 ? 'good' : sc >= 50 ? 'warning' : 'critical'; }
            function docStatus(doc) {
                if (!doc || !doc.expiryDate) return 'valid';
                const parsed = new Date(doc.expiryDate);
                if (isNaN(parsed.getTime())) return 'valid';
                const diff = Math.floor((parsed - new Date()) / 86400000);
                if (diff < 0) return 'expired';
                if (diff <= 30) return 'expiring';
                return 'valid';
            }
            function getDriverDocumentAlertStats() {
                const alertDrivers = [];
                drivers.forEach(d => {
                    const docsToCheck = [
                        { label: 'License', date: d.licenseExpiry },
                        { label: 'Passport', date: d.passportExpiry }
                    ];
                    if (Array.isArray(d.documents)) {
                        d.documents.forEach(doc => {
                            if (doc.expiryDate) docsToCheck.push({ label: doc.type || 'Document', date: doc.expiryDate });
                        });
                    }
                    const statuses = docsToCheck.filter(doc => doc.date).map(doc => docStatus({ expiryDate: doc.date }));
                    const expiringCount = statuses.filter(s => s === 'expiring').length;
                    const expiredCount = statuses.filter(s => s === 'expired').length;
                    if (expiredCount > 0 || expiringCount > 0) {
                        alertDrivers.push({ name: d.name, expiredCount, expiringCount });
                    }
                });
                return {
                    driversWithAlerts: alertDrivers.length,
                    expiredDrivers: alertDrivers.filter(d => d.expiredCount > 0).length,
                    expiringDrivers: alertDrivers.filter(d => d.expiringCount > 0).length
                };
            }
            function renderDriverAlertSummary() {
                const bar = document.getElementById('driverExpiryAlertBar');
                if (!bar) return;
                const stats = getDriverDocumentAlertStats();
                if (!stats.driversWithAlerts) {
                    bar.style.display = 'none';
                    bar.innerHTML = '';
                    return;
                }
                const urgencyLabel = stats.expiredDrivers > 0 ? 'expired' : 'expiring';
                bar.style.display = 'flex';
                bar.innerHTML = `<span style="font-size:14px">⚠</span><span><strong>${stats.driversWithAlerts}</strong> driver${stats.driversWithAlerts !== 1 ? 's' : ''} have ${urgencyLabel} document${stats.driversWithAlerts !== 1 ? 's' : ''} requiring attention.</span>`;
            }
            function trainingStatus(training) {
                const date = new Date(training.date || null);
                if (isNaN(date.getTime())) return { valid: false, nextDue: '—' };
                const months = Number(training.validityMonths) || 12;
                const nextDue = new Date(date);
                nextDue.setMonth(nextDue.getMonth() + months);
                return {
                    valid: new Date() <= nextDue,
                    nextDue: nextDue.toISOString().slice(0, 10)
                };
            }
            function violationSummary(violations) {
                const summary = {};
                (violations || []).forEach(v => {
                    const t = v.type || 'Unknown';
                    summary[t] = (summary[t] || 0) + 1;
                });
                return summary;
            }

            let toastTimer;
            function showToast(msg, dur = 2800) {
                const t = document.getElementById('toast');
                document.getElementById('toastMsg').textContent = msg;
                t.classList.add('show');
                clearTimeout(toastTimer);
                toastTimer = setTimeout(() => t.classList.remove('show'), dur);
            }
            // ── Modal Stack ─────────────────────────────────────────
            // Allows sub-modals (violations, trips, etc.) opened from
            // within a parent modal to 'go back' instead of fully closing.
            let _modalStack = [];

            function openModal(html) {
                // Top-level modal — always reset the stack.
                _modalStack = [];
                document.getElementById('modalBox').innerHTML = html;
                document.getElementById('modalOverlay').classList.add('open');
                document.body.style.overflow = 'hidden';
            }
            function pushModal(html) {
                // Sub-modal — save current content so close() can restore it.
                const current = document.getElementById('modalBox').innerHTML;
                _modalStack.push(current);
                document.getElementById('modalBox').innerHTML = html;
                // Overlay is already open; keep it open.
            }
            function closeModal() {
                if (_modalStack.length > 0) {
                    // Restore the previous modal in the stack.
                    document.getElementById('modalBox').innerHTML = _modalStack.pop();
                } else {
                    _modalStack = [];
                    document.getElementById('modalOverlay').classList.remove('open');
                    document.body.style.overflow = '';
                }
            }
            function closeModalClick(e) {
                if (e.target === document.getElementById('modalOverlay')) closeModal();
            }

            // ═══════════ TRUCK ASSIGNMENT DRAWER LOGIC ═══════════
            let selectedDrawerDriverIdx = null;
            let selectedDrawerTruckPlate = "";
            let selectedDrawerTruckSearch = "";
            let isSwapAssignment = true;

            function openTruckAssignmentDrawer(driverIdx = null, preselectedTruckPlate = "") {
                selectedDrawerDriverIdx = driverIdx !== null ? parseInt(driverIdx) : null;
                selectedDrawerTruckSearch = "";
                if (preselectedTruckPlate) {
                    selectedDrawerTruckPlate = preselectedTruckPlate;
                } else if (selectedDrawerDriverIdx !== null) {
                    const drv = drivers.find(d => d._idx === selectedDrawerDriverIdx);
                    selectedDrawerTruckPlate = drv ? drv.license_plate || "" : "";
                } else {
                    selectedDrawerTruckPlate = "";
                }
                isSwapAssignment = true;

                renderTruckAssignmentDrawer();
                document.getElementById('drawerOverlay').classList.add('open');
                document.body.style.overflow = 'hidden';
            }

            function closeTruckAssignmentDrawer() {
                document.getElementById('drawerOverlay').classList.remove('open');
                document.body.style.overflow = '';
            }

            function closeDrawerClick(e) {
                if (e.target === document.getElementById('drawerOverlay')) {
                    closeTruckAssignmentDrawer();
                }
            }

            function handleDrawerDriverChange(val) {
                selectedDrawerDriverIdx = val !== "" ? parseInt(val) : null;
                if (selectedDrawerDriverIdx !== null) {
                    const drv = drivers.find(d => d._idx === selectedDrawerDriverIdx);
                    if (!selectedDrawerTruckPlate) {
                        selectedDrawerTruckPlate = drv ? drv.license_plate || "" : "";
                    }
                }
                renderTruckAssignmentDrawer();
            }

            function handleDrawerTruckChange(val) {
                selectedDrawerTruckPlate = val;
                renderTruckAssignmentDrawer();
            }

            function handleDrawerTruckSearch(val) {
                const searchInput = document.getElementById('drawerTruckSearch');
                const selectionStart = searchInput?.selectionStart;
                const selectionEnd = searchInput?.selectionEnd;

                selectedDrawerTruckSearch = val;
                const exact = trucks.find(t => String(t.plate || '').trim().toUpperCase() === String(val || '').trim().toUpperCase());
                if (exact) {
                    selectedDrawerTruckPlate = exact.plate;
                }
                renderTruckAssignmentDrawer();

                if (searchInput) {
                    const restoredInput = document.getElementById('drawerTruckSearch');
                    if (restoredInput) {
                        restoredInput.focus();
                        if (typeof selectionStart === 'number' && typeof selectionEnd === 'number') {
                            restoredInput.setSelectionRange(selectionStart, selectionEnd);
                        }
                    }
                }
            }

            function handleDrawerSwapChange(val) {
                isSwapAssignment = val;
                renderTruckAssignmentDrawer();
            }

            function renderTruckAssignmentDrawer() {
                const sortedDrivers = [...drivers]
                    .filter(d => !isDriverUnassignStatus(d.status) || d._idx === selectedDrawerDriverIdx)
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                const sortedTrucks = [...trucks].sort((a, b) => (a.plate || '').localeCompare(b.plate || ''));
                const searchTerm = (selectedDrawerTruckSearch || '').trim().toLowerCase();
                const filteredTrucks = searchTerm ? sortedTrucks.filter(t => {
                    const plate = (t.plate || '').toLowerCase();
                    const brand = (t.brand || '').toLowerCase();
                    const model = (t.model || '').toLowerCase();
                    return plate.includes(searchTerm) || brand.includes(searchTerm) || model.includes(searchTerm);
                }) : sortedTrucks;
                const driver = selectedDrawerDriverIdx !== null ? drivers.find(d => d._idx === selectedDrawerDriverIdx) : null;
                const currentTruckPlate = driver ? driver.license_plate || "" : "";
                const truck = selectedDrawerTruckPlate !== "" ? getTruckByPlate(selectedDrawerTruckPlate) : null;
                let currentTruckDriver = null;
                if (selectedDrawerTruckPlate !== "") {
                    currentTruckDriver = drivers.find(d => String(d.license_plate || '').trim().toUpperCase() === selectedDrawerTruckPlate.toUpperCase());
                }

                const driverOptions = ['<option value="">-- Select Driver --</option>', ...sortedDrivers.map(d => {
                    const truckLabel = d.license_plate ? ` (Current: ${d.license_plate})` : ' (No truck)';
                    return `<option value="${d._idx}" ${selectedDrawerDriverIdx === d._idx ? 'selected' : ''}>${xmlEscape(d.name || 'Unknown')} · #${d.id}${truckLabel}</option>`;
                })].join('');

                const truckOptions = ['<option value="">-- Select Truck --</option>', ...filteredTrucks.map(t => {
                    const td = drivers.find(d => String(d.license_plate || '').trim().toUpperCase() === t.plate.toUpperCase());
                    const driverLabel = td ? ` (Driver: ${td.name})` : ' (Unassigned)';
                    return `<option value="${t.plate}" ${selectedDrawerTruckPlate === t.plate ? 'selected' : ''}>${formatTruckLabel(t)}${driverLabel}</option>`;
                })].join('');

                let previewHtml = "";
                if (driver && isDriverUnassignStatus(driver.status)) {
                    previewHtml = `<div style="padding:10px;background:rgba(240,76,90,0.1);border:1px solid var(--red);border-radius:8px;color:var(--red);font-size:12.5px;text-align:center">
                        ❌ Cannot assign truck to a suspended or benched driver.
                    </div>`;
                } else if (driver && truck) {
                    const sameAssignment = currentTruckPlate.toUpperCase() === selectedDrawerTruckPlate.toUpperCase();
                    if (sameAssignment) {
                        previewHtml = `<div style="padding:10px;background:rgba(34,201,122,0.1);border:1px solid var(--green);border-radius:8px;color:var(--green);font-size:12.5px;text-align:center">
                            ✅ This truck is already assigned to this driver. No changes required.
                        </div>`;
                    } else {
                        let swapNote = "";
                        let swapActionDesc = "";
                        if (currentTruckDriver) {
                            if (isSwapAssignment) {
                                const targetNewTruckDesc = currentTruckPlate ? currentTruckPlate : "No truck";
                                swapNote = `<div style="margin-top:6px;font-size:11px;color:var(--amber)">
                                    🔄 <strong>Swap Action:</strong> ${xmlEscape(currentTruckDriver.name)} will be reassigned to: <strong>${targetNewTruckDesc}</strong>.
                                </div>`;
                                swapActionDesc = `will swap and get <strong>${currentTruckPlate ? currentTruckPlate : 'no truck'}</strong>`;
                            } else {
                                swapNote = `<div style="margin-top:6px;font-size:11px;color:var(--red)">
                                    ⚠️ <strong>Release Action:</strong> ${xmlEscape(currentTruckDriver.name)} will be left with <strong>No Truck</strong>.
                                </div>`;
                                swapActionDesc = `will be released (<strong>No truck</strong>)`;
                            }
                        }

                        previewHtml = `
                            <div class="drawer-card">
                                <div style="font-weight:700;font-size:12px;color:var(--text);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.05em">Assignment Preview</div>
                                <div class="drawer-preview-row">
                                    <span style="font-size:12px;color:var(--text2)">Target Driver:</span>
                                    <span style="font-size:12px;font-weight:600">${xmlEscape(driver.name)}</span>
                                </div>
                                <div class="drawer-preview-row">
                                    <span style="font-size:12px;color:var(--text2)">Current Truck:</span>
                                    <span style="font-size:12px;font-weight:600">${currentTruckPlate ? currentTruckPlate : 'None'}</span>
                                </div>
                                <div class="drawer-preview-row" style="border-bottom:1px dashed var(--border);padding-bottom:10px;margin-bottom:10px">
                                    <span style="font-size:12px;color:var(--text2)">Proposed Truck:</span>
                                    <span style="font-size:12px;font-weight:700;color:var(--accent)">${truck.plate} (${truck.brand || 'Volvo'})</span>
                                </div>
                                <div style="font-size:12px;line-height:1.5">
                                    👤 <strong>${xmlEscape(driver.name)}</strong> will drive truck <strong>${truck.plate}</strong>.
                                    ${currentTruckDriver ? `<br>👤 <strong>${xmlEscape(currentTruckDriver.name)}</strong> (current driver of ${truck.plate}) ${swapActionDesc}.` : ''}
                                </div>
                                ${swapNote}
                            </div>
                        `;
                    }
                } else {
                    previewHtml = `<p style="color:var(--text3);font-size:12px;text-align:center;padding:10px">Select a driver and a truck to view assignment preview.</p>`;
                }

                let logs = [];
                try {
                    const rawLogs = localStorage.getItem('fg3_reassignment_log');
                    if (rawLogs) logs = JSON.parse(rawLogs);
                } catch(e) {}

                const logsHtml = logs.length === 0 
                    ? '<p style="color:var(--text3);font-size:11px;text-align:center;padding:10px">No recent assignment logs.</p>'
                    : `<div class="log-list">${logs.map((l, i) => {
                        const dateStr = new Date(l.timestamp).toLocaleString();
                        return `<div class="log-item">
                            <div class="log-item-top">
                                <div>${l.details}</div>
                                <button class="log-item-delete" onclick="App.deleteReassignmentLog(${i})" title="Delete log entry">🗑</button>
                            </div>
                            <div class="log-time">🕒 ${dateStr}</div>
                        </div>`;
                      }).join('')}</div>`;

                document.getElementById('drawerBox').innerHTML = `
                    <div class="drawer-header">
                        <div class="drawer-title">🔁 Truck Assignment Center</div>
                        <div class="drawer-close" onclick="App.closeTruckAssignmentDrawer()">✕</div>
                    </div>
                    <div class="drawer-body">
                        <div class="drawer-section">
                            <label class="drawer-section-title">1. Select Driver</label>
                            <select class="drawer-select" onchange="App.handleDrawerDriverChange(this.value)">
                                ${driverOptions}
                            </select>
                        </div>
                        <div class="drawer-section">
                            <label class="drawer-section-title">2. Select Truck to Assign</label>
                            <input type="text" id="drawerTruckSearch" value="${xmlEscape(selectedDrawerTruckSearch)}" placeholder="Type plate or brand to filter trucks…" oninput="App.handleDrawerTruckSearch(this.value)"
                                style="width:100%;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:13.5px;outline:none;transition:border-color 0.15s;margin-bottom:10px" />
                            <select class="drawer-select" onchange="App.handleDrawerTruckChange(this.value)" ${driver ? '' : 'disabled'}>
                                ${truckOptions}
                            </select>
                        </div>
                        
                        ${driver && currentTruckDriver && currentTruckPlate.toUpperCase() !== selectedDrawerTruckPlate.toUpperCase() ? `
                        <div class="drawer-section" style="background:var(--bg3);border:1px solid var(--border);padding:12px;border-radius:var(--radius)">
                            <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;cursor:pointer;font-weight:600">
                                <input type="checkbox" id="drawerSwapCheckbox" ${isSwapAssignment ? 'checked' : ''} onchange="App.handleDrawerSwapChange(this.checked)" style="width:16px;height:16px;accent-color:var(--accent)">
                                Swap Assignments (recommended)
                            </label>
                            <p style="font-size:11px;color:var(--text3);margin-top:6px;padding-left:24px">
                                If checked, the other driver (${xmlEscape(currentTruckDriver.name)}) will take over the truck (${currentTruckPlate ? currentTruckPlate : 'None'}) previously assigned to ${xmlEscape(driver.name)}. If unchecked, they will be left without a truck.
                            </p>
                        </div>
                        ` : ''}

                        <div class="drawer-section">
                            <label class="drawer-section-title">Assignment State Preview</label>
                            ${previewHtml}
                        </div>

                        <div class="drawer-section" style="border-top:1px dashed var(--border);padding-top:16px;margin-top:10px">
                            <label class="drawer-section-title">Reassignment History Log</label>
                            ${logsHtml}
                        </div>
                    </div>
                    <div class="drawer-footer">
                        <button class="btn btn-ghost" style="flex:1" onclick="App.closeTruckAssignmentDrawer()">Cancel</button>
                        <button class="btn btn-primary" id="drawerConfirmBtn" style="flex:1" onclick="App.confirmTruckAssignment()" ${driver && truck && currentTruckPlate.toUpperCase() !== selectedDrawerTruckPlate.toUpperCase() && !isDriverUnassignStatus(driver.status) ? '' : 'disabled'}>Confirm Assignment</button>
                    </div>
                `;
            }

            function deleteReassignmentLog(index) {
                let logs = [];
                try {
                    const rawLogs = localStorage.getItem('fg3_reassignment_log');
                    if (rawLogs) logs = JSON.parse(rawLogs);
                } catch (e) {}
                if (!Array.isArray(logs) || index < 0 || index >= logs.length) return;
                logs.splice(index, 1);
                localStorage.setItem('fg3_reassignment_log', JSON.stringify(logs));
                showToast('✓ Reassignment log entry deleted');
                if (document.getElementById('drawerOverlay')?.classList.contains('open')) {
                    renderTruckAssignmentDrawer();
                }
            }

            function recordDriverTruckAssignment(driver, truckPlate, assignmentDate) {
                if (!driver) return;
                if (!Array.isArray(driver.assignmentHistory)) driver.assignmentHistory = [];
                const normPlate = String(truckPlate || '').trim();
                const cleanPlate = normPlate || 'Unassigned';
                const lastEntry = driver.assignmentHistory[driver.assignmentHistory.length - 1];
                if (!lastEntry || String(lastEntry.truckPlate).trim().toUpperCase() !== cleanPlate.toUpperCase()) {
                    driver.assignmentHistory.push({
                        truckPlate: cleanPlate,
                        date: assignmentDate || new Date().toISOString().slice(0, 10)
                    });
                }
            }

            function confirmTruckAssignment() {
                if (selectedDrawerDriverIdx === null || !selectedDrawerTruckPlate) {
                    showToast("Please select a driver and a truck");
                    return;
                }

                const driver = drivers.find(d => d._idx === selectedDrawerDriverIdx);
                const truck = trucks.find(t => String(t.plate).trim().toUpperCase() === selectedDrawerTruckPlate.toUpperCase());

                if (!driver || !truck) {
                    showToast("Invalid assignment selection");
                    return;
                }

                if (isDriverUnassignStatus(driver.status)) {
                    showToast("Cannot assign truck to a suspended or benched driver");
                    return;
                }

                const prevTruckPlate = driver.license_plate || "";
                const currentTruckDriver = drivers.find(d => d._idx !== selectedDrawerDriverIdx && String(d.license_plate || '').trim().toUpperCase() === selectedDrawerTruckPlate.toUpperCase());
                const todayStr = new Date().toISOString().slice(0, 10);

                let detailsLog = "";

                if (currentTruckDriver) {
                    if (isSwapAssignment) {
                        driver.license_plate = selectedDrawerTruckPlate;
                        recordDriverTruckAssignment(driver, selectedDrawerTruckPlate, todayStr);
                        syncDriverIdWithTruck(driver);

                        currentTruckDriver.license_plate = prevTruckPlate;
                        recordDriverTruckAssignment(currentTruckDriver, prevTruckPlate, todayStr);
                        syncDriverIdWithTruck(currentTruckDriver);

                        const prevDesc = prevTruckPlate ? prevTruckPlate : "None";
                        detailsLog = `Swapped trucks: Assigned ${driver.name} to ${selectedDrawerTruckPlate} and ${currentTruckDriver.name} to ${prevDesc}.`;
                    } else {
                        driver.license_plate = selectedDrawerTruckPlate;
                        recordDriverTruckAssignment(driver, selectedDrawerTruckPlate, todayStr);
                        syncDriverIdWithTruck(driver);

                        currentTruckDriver.license_plate = "";
                        recordDriverTruckAssignment(currentTruckDriver, "", todayStr);
                        syncDriverIdWithTruck(currentTruckDriver);
                        detailsLog = `Assigned ${driver.name} to ${selectedDrawerTruckPlate} (released ${currentTruckDriver.name}).`;
                    }
                } else {
                    driver.license_plate = selectedDrawerTruckPlate;
                    syncDriverIdWithTruck(driver);
                    detailsLog = `Assigned ${driver.name} to ${selectedDrawerTruckPlate} (was unassigned).`;
                }

                let logs = [];
                try {
                    const rawLogs = localStorage.getItem('fg3_reassignment_log');
                    if (rawLogs) logs = JSON.parse(rawLogs);
                } catch(e) {}

                logs.unshift({
                    timestamp: new Date().toISOString(),
                    details: detailsLog
                });

                if (logs.length > 20) logs = logs.slice(0, 20);
                localStorage.setItem('fg3_reassignment_log', JSON.stringify(logs));

                saveAll();
                closeTruckAssignmentDrawer();
                showToast("Truck assignment updated ✓");

                // Refresh only the components that changed — no page navigation,
                // so the user stays in the same scroll position on the cards grid.
                populateDriverFilters();
                renderDriverMetrics();
                renderDriverCards();
                updateSidebarBadges();
            }

            function showPage(page) {
                ensureSettingsDefaults();
                document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
                document.querySelectorAll('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
                const pg = document.getElementById('page-' + page);
                if (pg) pg.classList.add('active');
                const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
                if (nav) nav.classList.add('active');
                document.getElementById('pageTitle').textContent = {
                    dashboard: 'Command Dashboard', drivers: 'Driver Management',
                    trucks: 'Truck Fleet Health', jobcards: 'Garage Job Cards',
                    violations: 'Violation & Accidents',
                    settings: 'System Settings', hscpolicy: 'HSC Policy',
                    reports: 'Reports Center', orders: 'Cargo & Load Orders',
                    recyclebin: 'Recycling Bin'
                }[page] || 'Dashboard';
                const topbarSub = document.getElementById('topbarSub');
                if (topbarSub) {
                    topbarSub.textContent = {
                        dashboard: 'Overview of all fleet operations',
                        jobcards: 'Maintenance workflow, costing & truck release from garage',
                        recyclebin: 'Restoration & 72-hour automated retention lifecycle'
                    }[page] || '';
                }

                if (page === 'dashboard') renderDashboard();
                else if (page === 'drivers') { populateDriverFilters(); renderDriverMetrics(); renderDriverCards(); }
                else if (page === 'trucks') { setTruckSubTab(activeTruckSubTab); }
                else if (page === 'jobcards') renderJobCardsPage();
                else if (page === 'violations') { populateViolationFilters(); renderViolationMetrics(); switchViolationSubpage(violationSubpage); }
                else if (page === 'settings') renderSettings();
                else if (page === 'hscpolicy') renderHscPolicies();
                else if (page === 'reports') renderReports();
                else if (page === 'orders') { populateOrderClientFilter(); renderOrders(); }
                else if (page === 'recyclebin') renderRecycleBin();
                updateSidebarBadges();
                updateLockStatusUI();
                localStorage.setItem('fg3_active_page', page);
            }
            function updateSidebarBadges() {
                const expiredDocs = trucks.reduce((s, t) => s + (t.documents || []).filter(d => docStatus(d) === 'expired').length, 0);
                const driverAlertStats = getDriverDocumentAlertStats();
                const activeOrders = (orders || []).filter(o => o.status !== 'At Garage').length;
                
                const elTruckWarn = document.getElementById('navTruckWarn');
                if (elTruckWarn) {
                    elTruckWarn.style.display = expiredDocs ? '' : 'none';
                    elTruckWarn.textContent = expiredDocs;
                }

                const elHighRisk = document.getElementById('navHighRisk');
                if (elHighRisk) {
                    elHighRisk.style.display = driverAlertStats.driversWithAlerts ? '' : 'none';
                    elHighRisk.textContent = driverAlertStats.driversWithAlerts;
                }
                
                const navOrd = document.getElementById('navOrdersWarn');
                if (navOrd) {
                    navOrd.style.display = activeOrders ? '' : 'none';
                    navOrd.textContent = activeOrders;
                }
                
                const totalAlerts = expiredDocs + (driverAlertStats.driversWithAlerts || 0);
                const elAlertBadge = document.getElementById('navAlertBadge');
                if (elAlertBadge) {
                    elAlertBadge.style.display = totalAlerts ? '' : 'none';
                    elAlertBadge.textContent = totalAlerts;
                }

                const pendingJc = (jobCards || []).filter(j => j.status === 'Pending-Approval').length;
                const navJc = document.getElementById('navJobCardsBadge');
                if (navJc) {
                    navJc.style.display = pendingJc ? '' : 'none';
                    navJc.textContent = pendingJc;
                }

                purgeExpiredRecycleBin();
                const elSidebarStatus = document.getElementById('sidebarStatus');
                if (elSidebarStatus) {
                    elSidebarStatus.textContent = `${(drivers || []).length} drivers · ${(trucks || []).length} trucks`;
                }
            }

            // ═══════════ DASHBOARD ═══════════
            function renderDashboard() {
                const expiredDocs = trucks.reduce((s, t) => s + t.documents.filter(d => docStatus(d) === 'expired').length, 0);
                const expiringDocs = trucks.reduce((s, t) => s + t.documents.filter(d => docStatus(d) === 'expiring').length, 0);
                const driverDocExpired = drivers.reduce((s, d) => s + (d.licenseExpiry && docStatus({ expiryDate: d.licenseExpiry }) === 'expired' ? 1 : 0) + (d.passportExpiry && docStatus({ expiryDate: d.passportExpiry }) === 'expired' ? 1 : 0), 0);
                const driverDocExpiring = drivers.reduce((s, d) => s + (d.licenseExpiry && docStatus({ expiryDate: d.licenseExpiry }) === 'expiring' ? 1 : 0) + (d.passportExpiry && docStatus({ expiryDate: d.passportExpiry }) === 'expiring' ? 1 : 0), 0);
                const totalExpiredDocs = expiredDocs + driverDocExpired;
                const totalExpiringDocs = expiringDocs + driverDocExpiring;
                const highRiskDrivers = drivers.filter(d => riskLevel(d.violations) === 'high').length;
                const totalViolations = drivers.reduce((s, d) => s + d.violations.length, 0);
                const trucksCritical = trucks.filter(t => healthLabel(healthScore(t)) === 'critical').length;
                const onlineDrivers = drivers.filter(d => ['online', 'on-trip', 'on trip'].includes((d.status || '').toLowerCase())).length;

                let alerts = [];
                trucks.forEach(t => {
                    t.documents.forEach(d => {
                        const st = docStatus(d);
                        if (st === 'expired') alerts.push({ icon: '🔴', title: `${formatTruckLabel(t)}: ${d.type} EXPIRED`, desc: `Expired on ${d.expiryDate}`, action: `App.showPage('trucks');App.openTruckModal(${t._idx})` });
                        else if (st === 'expiring') alerts.push({ icon: '🟡', title: `${formatTruckLabel(t)}: ${d.type} expiring`, desc: `Expires ${d.expiryDate}`, action: `App.showPage('trucks');App.openTruckModal(${t._idx})` });
                    });
                });
                drivers.forEach(d => {
                    [{ label: 'License', date: d.licenseExpiry }, { label: 'Passport', date: d.passportExpiry }].forEach(doc => {
                        if (!doc.date) return;
                        const st = docStatus({ expiryDate: doc.date });
                        if (st === 'expired') alerts.push({ icon: '🔴', title: `${d.name}: ${doc.label} EXPIRED`, desc: `Expired on ${doc.date}`, action: `App.openDriverModalFromAnyPage(${d._idx})` });
                        else if (st === 'expiring') alerts.push({ icon: '🟡', title: `${d.name}: ${doc.label} expiring`, desc: `Expires ${doc.date}`, action: `App.openDriverModalFromAnyPage(${d._idx})` });
                    });
                });
                const now = new Date();
                const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                jobCards.filter(jc => jc.status === 'In-Progress').forEach(jc => {
                    const jcDate = new Date(jc.createdAt || jc.date || now);
                    if (jcDate < sevenDaysAgo) {
                        const daysAtMechanic = Math.floor((now - jcDate) / (24 * 60 * 60 * 1000));
                        const truckInfo = trucks.find(t => t.plate === jc.plate);
                        const truckName = truckInfo ? formatTruckLabel(truckInfo) : xmlEscape(jc.plate || '');
                        alerts.push({ 
                            icon: '🔧', 
                            title: `${truckName}: Job Card in Mechanics`, 
                            desc: `${daysAtMechanic} days at mechanic (since ${jcDate.toLocaleDateString()})`, 
                            action: `App.showPage('jobcards')` 
                        });
                    }
                });
                document.getElementById('dashboardAlerts').innerHTML = alerts.length > 0 ? `
            <div class="alert-panel"><div class="alert-header"><span>🚨 Alerts</span><span class="alert-count">${alerts.length}</span></div>
            <div class="alert-body">${alerts.map(a => `
                <div class="alert-item" onclick="${a.action}">
                    <span class="alert-icon">${a.icon}</span>
                    <div class="alert-info"><div class="alert-title">${a.title}</div><div class="alert-desc">${a.desc}</div></div>
                </div>`).join('')}</div></div>` :
                    '<div class="alert-panel" style="padding:16px;text-align:center;color:var(--text3)">✅ No alerts</div>';

                const pendingOrders = orders.filter(o => o.status === 'Pending').length;
                const loadingOrders = orders.filter(o => o.status === 'Loading').length;
                const transitOrders = orders.filter(o => o.status === 'In Transit').length;
                const completedOrders = orders.filter(o => o.status === 'At Garage' || o.status === 'Completed').length;
                const pendingTotal = pendingOrders + loadingOrders;
                const activeOrders = pendingTotal + transitOrders;

                document.getElementById('dashboardMetrics').innerHTML = `
            <div class="metric-card c-blue"><div class="metric-label">Total Drivers</div><div class="metric-value">${drivers.length}</div><div class="metric-sub">${onlineDrivers} active</div></div>
            <div class="metric-card c-green"><div class="metric-label">Total Trucks</div><div class="metric-value">${trucks.length}</div><div class="metric-sub">${trucksCritical} critical</div></div>
            <div class="metric-card c-red"><div class="metric-label">Total Violations</div><div class="metric-value">${totalViolations}</div><div class="metric-sub">${highRiskDrivers} high-risk drivers</div></div>
            <div class="metric-card c-amber"><div class="metric-label">Expired Docs</div><div class="metric-value">${totalExpiredDocs}</div><div class="metric-sub">${totalExpiringDocs} expiring soon</div></div>
            <div class="metric-card c-purple"><div class="metric-label">Avg Violations</div><div class="metric-value">${drivers.length ? (totalViolations / drivers.length).toFixed(1) : '0'}</div></div>
            <div class="metric-card c-teal" style="cursor:pointer" onclick="App.showPage('orders')"><div class="metric-label">Active Orders</div><div class="metric-value">${activeOrders}</div><div class="metric-sub">${completedOrders} completed, ${pendingTotal} pending</div></div>
        `;

                const docSummaryItems = [
                    ...trucks.map(t => {
                        const expired = t.documents.filter(d => docStatus(d) === 'expired').length;
                        const expiring = t.documents.filter(d => docStatus(d) === 'expiring').length;
                        const worst = expired ? 'expired' : expiring ? 'expiring' : 'valid';
                        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="App.showPage('trucks');App.openTruckModal(${t._idx})">
                <span>🚛</span><div style="flex:1"><strong>${formatTruckLabel(t)}</strong> ${t.model || ''}<br><small>${t.documents.length - expired - expiring} valid, ${expiring} expiring, ${expired} expired</small></div>
                <span class="badge badge-${worst === 'expired' ? 'critical' : worst === 'expiring' ? 'warn' : 'good'}">${worst}</span></div>`;
                    }),
                    ...drivers.map(d => {
                        const licenseStatus = d.licenseExpiry ? docStatus({ expiryDate: d.licenseExpiry }) : 'missing';
                        const passportStatus = d.passportExpiry ? docStatus({ expiryDate: d.passportExpiry }) : 'missing';
                        const expired = [licenseStatus, passportStatus].filter(s => s === 'expired').length;
                        const expiring = [licenseStatus, passportStatus].filter(s => s === 'expiring').length;
                        const valid = [licenseStatus, passportStatus].filter(s => s === 'valid').length;
                        const worst = expired ? 'expired' : expiring ? 'expiring' : 'valid';
                        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="App.openDriverModalFromAnyPage(${d._idx})">
                <span>👤</span><div style="flex:1"><strong>${d.name}</strong><br><small>${valid} valid, ${expiring} expiring, ${expired} expired</small></div>
                <span class="badge badge-${worst === 'expired' ? 'critical' : worst === 'expiring' ? 'warn' : 'good'}">${worst}</span></div>`;
                    })
                ];
                document.getElementById('dashboardDocSummary').innerHTML = docSummaryItems.length ? docSummaryItems.join('') : '<p style="color:var(--text3)">No documents</p>';

                document.getElementById('dashboardRiskSummary').innerHTML = [...drivers].sort((a, b) => riskScore(b.violations) - riskScore(a.violations)).slice(0, 10).map(d => {
                    const rl = riskLevel(d.violations);
                    const rp = riskPct(d.violations);
                    return `<div style="padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="App.openDriverModalFromAnyPage(${d._idx})">
                <span>${d.name}</span> <small>${d.violations.length} violations</small>
                <div class="risk-track"><div class="risk-fill ${rl === 'high' ? 'rf-high' : rl === 'medium' ? 'rf-med' : 'rf-low'}" style="width:${rp}%"></div></div></div>`;
                }).join('') || '<p style="color:var(--text3)">No drivers</p>';

                renderPieChart();
            }

            let pieRange = 'year';
            let pieCustomStartDate = null;
            let pieCustomEndDate = null;
            
            document.getElementById('pieFilter').addEventListener('click', function (e) {
                if (e.target.tagName === 'BUTTON') {
                    document.querySelectorAll('#pieFilter button').forEach(b => b.classList.remove('active'));
                    e.target.classList.add('active');
                    pieRange = e.target.dataset.range;
                    pieCustomStartDate = null;
                    pieCustomEndDate = null;
                    document.getElementById('pieFilterStartDate').value = '';
                    document.getElementById('pieFilterEndDate').value = '';
                    renderPieChart();
                }
            });
            
            function applyCustomDateFilter() {
                const startDateEl = document.getElementById('pieFilterStartDate');
                const endDateEl = document.getElementById('pieFilterEndDate');
                const startVal = startDateEl?.value;
                const endVal = endDateEl?.value;
                
                if (startVal || endVal) {
                    pieCustomStartDate = startVal ? new Date(startVal) : new Date(1970, 0, 1);
                    pieCustomEndDate = endVal ? new Date(endVal) : new Date();
                    pieCustomEndDate.setHours(23, 59, 59, 999);
                    
                    document.querySelectorAll('#pieFilter button').forEach(b => b.classList.remove('active'));
                }
                renderPieChart();
            }
            
            function renderPieChart() {
                const now = new Date();
                let startDate = pieCustomStartDate;
                let endDate = pieCustomEndDate || new Date();
                
                if (!startDate) {
                    startDate = new Date(now);
                    if (pieRange === 'today') startDate.setHours(0, 0, 0, 0);
                    else if (pieRange === 'week') startDate.setDate(now.getDate() - now.getDay());
                    else if (pieRange === 'month') startDate.setDate(1);
                    else startDate.setMonth(0, 1);
                }
                endDate.setHours(23, 59, 59, 999);

                const typeCounts = {};
                drivers.forEach(d => {
                    d.violations.forEach(v => {
                        const vDate = new Date(v.date);
                        if (vDate >= startDate && vDate <= endDate) {
                            const vType = v.type || 'Unknown';
                            typeCounts[vType] = (typeCounts[vType] || 0) + 1;
                        }
                    });
                });
                
                const total = Object.values(typeCounts).reduce((s, v) => s + v, 0);
                const svg = document.getElementById('pieChartSvg');
                const legend = document.getElementById('pieLegend');
                
                if (total === 0) {
                    svg.innerHTML = `<circle cx="90" cy="90" r="80" fill="var(--bg4)" /><text x="90" y="90" text-anchor="middle" fill="var(--text3)" font-size="12" dy=".3em">No data</text>`;
                    legend.innerHTML = '';
                    return;
                }
                
                const typeList = Object.keys(typeCounts).sort();
                const colorMap = {};
                typeList.forEach((type, idx) => {
                    const pal = PALETTES[idx % PALETTES.length];
                    colorMap[type] = pal.color;
                });
                
                let cumulative = 0;
                let paths = '';
                typeList.forEach(type => {
                    const val = typeCounts[type];
                    const pct = val / total;
                    const startAngle = cumulative * 2 * Math.PI;
                    const endAngle = (cumulative + pct) * 2 * Math.PI;
                    const x1 = 90 + 80 * Math.sin(startAngle);
                    const y1 = 90 - 80 * Math.cos(startAngle);
                    const x2 = 90 + 80 * Math.sin(endAngle);
                    const y2 = 90 - 80 * Math.cos(endAngle);
                    const large = pct > 0.5 ? 1 : 0;
                    const d = `M 90 90 L ${x1} ${y1} A 80 80 0 ${large} 1 ${x2} ${y2} Z`;
                    paths += `<path d="${d}" fill="${colorMap[type]}" />`;
                    cumulative += pct;
                });
                svg.innerHTML = paths;
                legend.innerHTML = typeList.map(type => {
                    const val = typeCounts[type];
                    return `<div style="display:flex;align-items:center;gap:8px;margin:6px 0;cursor:pointer" onclick="App.scrollToViolationCard('${type.replace(/'/g, "\\'")}')">
                    <span style="width:12px;height:12px;border-radius:3px;background:${colorMap[type]}"></span>
                    <span style="font-size:13px"><strong>${type}</strong>: ${val} (${((val / total) * 100).toFixed(0)}%)</span>
                </div>`;
                }).join('');

                // ── Render driver violation cards grouped by type ──
                const vdcContainer = document.getElementById('violationDriverCards');
                if (!vdcContainer) return;

                if (total === 0) {
                    vdcContainer.innerHTML = `<div class="vdc-empty"><div class="vdc-empty-icon">📊</div><p>No violations in this period</p></div>`;
                    return;
                }

                // Build per-type driver data
                const driversByType = {};
                typeList.forEach(type => { driversByType[type] = []; });

                drivers.forEach(d => {
                    d.violations.forEach(v => {
                        const vDate = new Date(v.date);
                        if (vDate >= startDate && vDate <= endDate) {
                            const vType = v.type || 'Unknown';
                            if (driversByType[vType]) {
                                let entry = driversByType[vType].find(e => e.driver._idx === d._idx);
                                if (!entry) {
                                    entry = { driver: d, count: 0, severities: [] };
                                    driversByType[vType].push(entry);
                                }
                                entry.count++;
                                entry.severities.push((v.severity || 'low').toLowerCase());
                            }
                        }
                    });
                });

                // Sort drivers within each type by count descending
                typeList.forEach(type => {
                    driversByType[type].sort((a, b) => b.count - a.count);
                });

                const totalDriversWithViolations = new Set();
                typeList.forEach(type => driversByType[type].forEach(e => totalDriversWithViolations.add(e.driver._idx)));

                vdcContainer.innerHTML = `
                    <div class="vdc-section-header">
                        <div class="vdc-section-title">
                            <span>👥</span> Drivers by Violation Type
                        </div>
                        <span class="vdc-section-count">${totalDriversWithViolations.size} driver${totalDriversWithViolations.size !== 1 ? 's' : ''} · ${total} violation${total !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="vdc-grid">
                        ${typeList.map((type, idx) => {
                            const driverEntries = driversByType[type];
                            const typeColor = colorMap[type];
                            const typeTotal = typeCounts[type];
                            const pct = ((typeTotal / total) * 100).toFixed(0);

                            return `<div class="vdc-card" id="vdc-card-${type.replace(/[^a-zA-Z0-9]/g, '_')}">
                                <div class="vdc-card-accent"></div>
                                <div class="vdc-card-title-banner" style="background:${typeColor}">
                                    <span class="vdc-card-title-text">${type}</span>
                                </div>
                                <div class="vdc-card-header">
                                    <div class="vdc-card-stats">
                                        <span class="vdc-card-badge" style="background:${typeColor}20;color:${typeColor}">${typeTotal} violation${typeTotal !== 1 ? 's' : ''}</span>
                                        <span class="vdc-card-badge" style="background:var(--bg4);color:var(--text2)">${pct}%</span>
                                    </div>
                                </div>
                                <div class="vdc-driver-list">
                                    ${driverEntries.length === 0 ? '<div class="vdc-empty"><p>No drivers</p></div>' :
                                      driverEntries.map(entry => {
                                        const d = entry.driver;
                                        const pal = palette(d._idx);
                                        const highCount = entry.severities.filter(s => s === 'high').length;
                                        const medCount = entry.severities.filter(s => s === 'medium').length;
                                        const lowCount = entry.severities.filter(s => s === 'low').length;
                                        const worstSev = highCount > 0 ? 'high' : medCount > 0 ? 'medium' : 'low';
                                        const sevColor = worstSev === 'high' ? 'var(--red)' : worstSev === 'medium' ? 'var(--amber)' : 'var(--green)';
                                        return `<div class="vdc-driver-item" onclick="App.openDriverModalFromAnyPage(${d._idx})">
                                            <div class="vdc-driver-avatar" style="background:${pal.bg};color:${pal.color}">${initials(d.name)}</div>
                                            <div class="vdc-driver-info">
                                                <div class="vdc-driver-name">${d.name || 'Unknown'}</div>
                                                <div class="vdc-driver-meta">#${d.id || 'N/A'} · ${formatDriverVehicleLabel(d) || '—'}</div>
                                            </div>
                                            <span class="vdc-driver-count" style="background:${sevColor}18;color:${sevColor}">${entry.count}×</span>
                                        </div>`;
                                      }).join('')
                                    }
                                </div>
                                ${driverEntries.length > 5 ? `<div class="vdc-card-footer">↕ Scroll to see ${driverEntries.length} driver${driverEntries.length !== 1 ? 's' : ''}</div>` : ''}
                            </div>`;
                        }).join('')}
                    </div>
                `;
            }

            // ═══════════ DRIVERS ═══════════
            function populateDriverFilters() {
                const statuses = Array.isArray(settings.driverStatuses) ? settings.driverStatuses : [];
                const filterEl = document.getElementById('driverStatusFilter');
                if (!filterEl) return;
                filterEl.innerHTML = '<option value="">All statuses</option>' +
                    statuses.map(s => `<option value="${normStatus(s.name)}">${s.name}</option>`).join('');
            }
            function renderDriverMetrics() {
                const online = drivers.filter(d => ['online', 'on-trip', 'on trip'].includes((d.status || '').toLowerCase())).length;
                const totalV = drivers.reduce((s, d) => s + d.violations.length, 0);
                const highRisk = drivers.filter(d => riskLevel(d.violations) === 'high').length;
                const withTruck = drivers.filter(d => d.license_plate && d.license_plate.trim() !== '').length;
                const noTruck = drivers.length - withTruck;
                const driverAlertStats = getDriverDocumentAlertStats();
                document.getElementById('driverMetrics').innerHTML = `
            <div class="metric-card c-blue"><div class="metric-label">Total Drivers</div><div class="metric-value">${drivers.length}</div></div>
            <div class="metric-card c-green"><div class="metric-label">Active</div><div class="metric-value">${online}</div></div>
            <div class="metric-card c-red"><div class="metric-label">Violations</div><div class="metric-value">${totalV}</div></div>
            <div class="metric-card c-amber"><div class="metric-label">Docs Expiring</div><div class="metric-value">${driverAlertStats.driversWithAlerts}</div><div class="metric-sub">${driverAlertStats.expiringDrivers} expiring · ${driverAlertStats.expiredDrivers} expired</div></div>
            <div class="metric-card c-teal" style="cursor:pointer" onclick="App.openTruckAssignmentDrawer()"><div class="metric-label">Trucks Assigned</div><div class="metric-value">${withTruck}</div><div class="metric-sub">${noTruck} unassigned</div></div>`;
                renderDriverAlertSummary();
            }
            function renderDriverCards() {
                const search = (document.getElementById('driverSearch')?.value || '').toLowerCase();
                const statusF = document.getElementById('driverStatusFilter')?.value || '';
                const riskF = document.getElementById('driverRiskFilter')?.value || '';
                const sort = document.getElementById('driverSort')?.value || 'name';

                let list = drivers.filter(d => {
                    const trailer = (getTrailerForPlate(d.license_plate || d.id) || '').toLowerCase();
                    return (!search || (d.name || '').toLowerCase().includes(search) || (d.id || '').toLowerCase().includes(search) || (d.license_plate || '').toLowerCase().includes(search) || trailer.includes(search))
                        && (!statusF || normStatus(d.status) === statusF)
                        && (!riskF || riskLevel(d.violations) === riskF);
                });

                if (sort === 'violations') list.sort((a, b) => b.violations.length - a.violations.length);
                else if (sort === 'risk') list.sort((a, b) => riskScore(b.violations) - riskScore(a.violations));
                else if (sort === 'recent') list.sort((a, b) => {
                    const da = a.violations.map(v => v.date || '').sort().pop() || '';
                    const db = b.violations.map(v => v.date || '').sort().pop() || '';
                    return db.localeCompare(da);
                });
                else list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
                if (driverPage > totalPages) driverPage = 1;
                const paged = list.slice((driverPage - 1) * PAGE_SIZE, driverPage * PAGE_SIZE);
                const grid = document.getElementById('driverCardsGrid');
                grid.innerHTML = paged.length === 0 ? `<div class="empty-state"><div class="e-icon">👤</div><p>No drivers found.</p></div>` :
                    paged.map(d => {
                        const pal = palette(d._idx);
                        const rl = riskLevel(d.violations);
                        const stNorm = normStatus(d.status);
                        const stObj = settings.driverStatuses.find(s => normStatus(s.name) === stNorm);
                        const trainingCount = d.trainings ? d.trainings.length : 0;
                        const accent = rl === 'high' ? 'var(--red)' : rl === 'medium' ? 'var(--amber)' : 'var(--accent)';
                        const summary = violationSummary(d.violations);
                        const summaryHtml = Object.entries(summary).map(([type, cnt]) =>
                            `<span class="vtag vtag-${(settings.violationTypes.find(v => v.name === type)?.severity) || 'low'}">${type}: ${cnt}</span>`
                        ).join('') || '<span class="vtag">No violations</span>';

                        // Document expiry notifications (license, passport and any extra driver documents)
                        const docsToCheck = [
                            { label: 'License', date: d.licenseExpiry },
                            { label: 'Passport', date: d.passportExpiry }
                        ];
                        if (Array.isArray(d.documents)) {
                            d.documents.forEach(doc => { if (doc.expiryDate) docsToCheck.push({ date: doc.expiryDate }); });
                        }
                        const expiringDocs = docsToCheck.filter(doc => doc.date && ['expiring', 'expired'].includes(docStatus({ expiryDate: doc.date })));
                        const expiryCount = expiringDocs.length;
                        const hasExpired = expiringDocs.some(doc => doc.date && docStatus({ expiryDate: doc.date }) === 'expired');
                        const expiryBadgeHtml = expiryCount ? `<div class="card-expiry-badge" style="background:${hasExpired ? 'var(--red)' : 'var(--amber)'}" title="${expiryCount} expiring/expired document(s)">${expiryCount}</div>` : '';

                        return `<div class="card" onclick="App.openDriverModal(${d._idx})">
                    <div class="accent-bar" style="background:${accent}"></div>
                    <div class="card-top">
                        <div class="avatar" style="background:${pal.bg};color:${pal.color}">${initials(d.name)}</div>
                        <div class="card-info">
                            <div class="card-title">${d.name || 'Unknown'}</div>
                            <div class="card-sub" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:2px">
                                <span>#${d.id || 'N/A'}</span>
                                <span>·</span>
                                <span style="display:inline-flex;align-items:center;gap:4px">🚛 ${formatDriverVehicleLabel(d) || 'no truck assigned'}</span>
                                <button class="btn btn-ghost btn-xs" style="padding:2px 6px;font-size:10px;margin-left:4px;border:1px solid var(--border);border-radius:4px;background:var(--bg3)" onclick="event.stopPropagation(); App.openTruckAssignmentDrawer(${d._idx})" title="Change truck">🔁 Reassign</button>
                            </div>
                        </div>
                        <span class="badge" style="background:${(stObj?.color || '#565b6e')}20;color:${stObj?.color || 'var(--text3)'}"><span class="dot" style="background:${stObj?.color || 'var(--text3)'}"></span>${stObj?.name || d.status}</span>
                        ${expiryBadgeHtml}
                    </div>
                    <div style="margin:6px 0;display:flex;flex-wrap:wrap;gap:3px">${summaryHtml}</div>
                    <div class="card-stats"><div class="cstat"><div class="cstat-val">${d.violations.length}</div><div class="cstat-label">violations</div></div><div class="cstat"><div class="cstat-val">${d.tripsList ? d.tripsList.length : (d.trips || 0)}</div><div class="cstat-label">trips</div></div><div class="cstat"><div class="cstat-val">${(d.hire_date || '').slice(0, 7) || '—'}</div><div class="cstat-label">hired</div></div></div>
                </div>`;
                    }).join('');

                renderDriverAlertSummary();
                document.getElementById('driverPagination').innerHTML = totalPages > 1 ? `
            <button class="page-btn" onclick="App.changeDriverPage(-1)" ${driverPage === 1 ? 'disabled' : ''}>← Prev</button>
            <span class="page-info">${driverPage} / ${totalPages}</span>
            <button class="page-btn" onclick="App.changeDriverPage(1)" ${driverPage >= totalPages ? 'disabled' : ''}>Next →</button>
        ` : '';
            }
            function changeDriverPage(dir) {
                const total = drivers.length;
                const totalPages = Math.ceil(total / PAGE_SIZE);
                driverPage = Math.max(1, Math.min(totalPages, driverPage + dir));
                renderDriverCards();
            }

            // Opens the driver modal from ANY page without navigating away.
            // After the modal closes, the user stays on whichever page they were on.
            function openDriverModalFromAnyPage(idx) {
                // Ensure the drivers page is rendered (for modal content) without
                // switching the visible page, so the user's current view is preserved.
                const currentPage = localStorage.getItem('fg3_active_page') || 'dashboard';
                if (currentPage !== 'drivers') {
                    // Silently ensure driver data is ready (already in memory), then open modal.
                    openDriverModal(idx);
                } else {
                    openDriverModal(idx);
                }
            }

            function openDriverModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                const pal = palette(idx);
                const rl = riskLevel(d.violations);
                const stNorm = normStatus(d.status);
                const stObj = settings.driverStatuses.find(s => normStatus(s.name) === stNorm);
                const summary = violationSummary(d.violations);
                const tripsCount = d.tripsList ? d.tripsList.length : (d.trips || 0);
                const warningsCount = d.warningsList ? d.warningsList.length : (d.warnings || 0);
                const suspensionsCount = d.suspensionsList ? d.suspensionsList.length : (d.suspensions || 0);
                const accidentsCount = d.accidentsList ? d.accidentsList.length : (d.accidents || 0);
                const lossesTotal = d.lossesList ? d.lossesList.reduce((s, l) => s + (l.amount || 0), 0) : (d.loss || 0);
                const trainingCount = d.trainings ? d.trainings.length : 0;
                const validTrainingCount = (d.trainings || []).filter(t => trainingStatus(t).valid).length;
                const invalidTrainingCount = trainingCount - validTrainingCount;
                const customHtml = settings.customFields.filter(f => f.target === 'driver').map(f =>
                    `<div class="info-cell info-cell-clickable" onclick="App.editDriverCustomField(${idx}, '${String(f.name).replace(/'/g, "\\'")}')"><div class="il">${f.name}</div><div class="iv">${(d.custom || {})[f.name] || '—'}</div></div>`).join('');

                openModal(`
            <div class="modal-header">
                <div class="avatar avatar-lg" style="background:${pal.bg};color:${pal.color}">${initials(d.name)}</div>
                <div style="flex:1">
                    <div id="modalNameEditWrapper_${idx}" class="modal-name-editable-wrapper" onclick="event.stopPropagation(); App.openDriverEditForm(${idx})">
                        <div class="modal-name">${d.name || 'Unknown'}</div>
                        <button id="modalNameEditButton_${idx}" class="modal-name-edit-icon" type="button" title="Edit driver details" onclick="event.stopPropagation(); App.openDriverEditForm(${idx})">✎</button>
                    </div>
                    <div class="modal-sub" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px">
                        <span>#${d.id || 'N/A'}</span>
                        <span>·</span>
                        <span>Vehicle: ${formatDriverVehicleLabel(d) || '—'}</span>
                        <button class="btn btn-ghost btn-xs" style="padding:2px 6px;font-size:10px;border:1px solid var(--border);border-radius:4px;background:var(--bg3);color:var(--text2);cursor:pointer" onclick="App.openTruckAssignmentDrawer(${idx}); App.closeModal()">🔁 Reassign</button>
                        <span>·</span>
                        <span>Hired: ${d.hire_date || '—'}</span>
                    </div>
                </div>
                <div class="modal-close" onclick="App.closeModal()">✕</div>
            </div>
            <div class="modal-body">
                <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:16px">
                    <div style="display:flex;align-items:center;gap:8px;background:var(--bg3);border:1px solid var(--border2);border-radius:99px;padding:4px 12px 4px 8px">
                        <span class="dot" id="statusDot_${idx}" style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${stObj?.color || 'var(--text3)'}"></span>
                        <select id="statusSelect_${idx}" onchange="App.changeDriverStatus(${idx}, this.value)" style="background:transparent;border:none;outline:none;color:${stObj?.color || 'var(--text3)'};font-size:12px;font-weight:500;font-family:var(--font-body);cursor:pointer;padding:0;appearance:none;-webkit-appearance:none;min-width:80px">
                            ${settings.driverStatuses.map(s => `<option value="${s.name}" ${s.name === (stObj?.name || d.status) ? 'selected' : ''} style="color:var(--text);background:var(--bg2)">${s.name}</option>`).join('')}
                        </select>
                        <span style="font-size:10px;color:var(--text3);pointer-events:none">▾</span>
                    </div>
                    <span class="badge badge-${rl === 'high' ? 'critical' : rl === 'medium' ? 'warn' : 'good'}">${rl.toUpperCase()} Risk · ${riskPct(d.violations)}/100</span>
                </div>
                <div class="section">
                    <div class="section-title">Violation Summary</div>
                    <div style="display:flex;flex-wrap:wrap;gap:6px;">
                        ${Object.keys(summary).length === 0 ? '<span style="color:var(--text3)">No violations</span>' :
                        Object.entries(summary).map(([type, cnt]) => `<span class="vtag vtag-${(settings.violationTypes.find(v => v.name === type)?.severity) || 'low'}">${type}: ${cnt}</span>`).join('')
                    }
                    </div>
                </div>
                <div class="section">
                    <div class="section-title">Driver Overview</div>
                    <div class="info-grid">
                        <div class="info-cell info-cell-clickable" onclick="App.openViolationDetailModal(${idx})"><div class="il">Violations</div><div class="iv">${d.violations.length}</div></div>
                        <div class="info-cell info-cell-clickable" onclick="App.openTripsDetailModal(${idx})"><div class="il">Trips</div><div class="iv">${tripsCount}</div></div>
                        <div class="info-cell info-cell-clickable" onclick="App.openWarningsDetailModal(${idx})"><div class="il">Warnings</div><div class="iv">${warningsCount}</div></div>
                        <div class="info-cell info-cell-clickable" onclick="App.openSuspensionsDetailModal(${idx})"><div class="il">Suspensions</div><div class="iv">${suspensionsCount}</div></div>
                        <div class="info-cell info-cell-clickable" onclick="App.openAccidentsDetailModal(${idx})"><div class="il">Accidents</div><div class="iv">${accidentsCount}</div></div>
                        <div class="info-cell info-cell-clickable" onclick="App.openLossesDetailModal(${idx})"><div class="il">Losses (L)</div><div class="iv">${lossesTotal} L</div></div>
                        <div class="info-cell info-cell-clickable" onclick="App.openTrainingDetailModal(${idx})"><div class="il">Trainings</div><div class="iv">${trainingCount} total · valid: ${validTrainingCount} · expired: ${invalidTrainingCount}</div></div>
                    </div>
                </div>
                <div class="section">
                    <div class="section-title">Personal Details</div>
                    <div class="info-grid">
                        <div class="info-cell"><div class="il">Driving License</div><div class="iv">${d.license || '—'}</div></div>
                        <div class="info-cell"><div class="il">License Expiry</div><div class="iv"><input type="date" value="${d.licenseExpiry || ''}" onchange="App.updateDriverField(${idx}, 'licenseExpiry', this.value)" style="width:100%;background:transparent;border:none;color:var(--text)"></div></div>
                        <div class="info-cell"><div class="il">Passport/Laissez Pass</div><div class="iv">${d.passport || '—'}</div></div>
                        <div class="info-cell"><div class="il">Passport Expiry</div><div class="iv"><input type="date" value="${d.passportExpiry || ''}" onchange="App.updateDriverField(${idx}, 'passportExpiry', this.value)" style="width:100%;background:transparent;border:none;color:var(--text)"></div></div>
                        <div class="info-cell"><div class="il">Phone Number</div><div class="iv"><input type="text" value="${d.phone || ''}" onchange="App.updateDriverField(${idx}, 'phone', this.value)" style="width:100%;background:transparent;border:none;color:var(--text)"></div></div>
                        <div class="info-cell"><div class="il">Blood Group</div><div class="iv"><input type="text" value="${d.bloodGroup || ''}" onchange="App.updateDriverField(${idx}, 'bloodGroup', this.value)" style="width:100%;background:transparent;border:none;color:var(--text)"></div></div>
                        <div class="info-cell"><div class="il">Health Status</div><div class="iv"><input type="text" value="${d.healthStatus || ''}" onchange="App.updateDriverField(${idx}, 'healthStatus', this.value)" style="width:100%;background:transparent;border:none;color:var(--text)"></div></div>
                    </div>
                </div>
                <div class="section">
                    <div class="section-title">Driver Documents</div>
                    <div class="info-grid">
                        <div class="info-cell"><div class="il">License Status</div><div class="iv">${d.licenseExpiry ? docStatus({expiryDate: d.licenseExpiry}) : 'missing'}</div></div>
                        <div class="info-cell"><div class="il">Passport Status</div><div class="iv">${d.passportExpiry ? docStatus({expiryDate: d.passportExpiry}) : 'missing'}</div></div>
                    </div>
                </div>
                <div class="section">
                    <div class="section-title">Attachments <button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="document.getElementById('driverAttachmentInput_${idx}')?.click(); event.stopPropagation()">+ Upload</button></div>
                    <input id="driverAttachmentInput_${idx}" type="file" accept="image/*,application/pdf,.pdf,video/*,.mp4,.mov,.webm,.m4v" multiple style="display:none" onchange="App.handleDriverFileUpload(${idx}, this.files)">
                    ${(d.files || []).map(f => `<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--bg2);" onclick="App.previewAttachment('driver', ${idx}, '${f.id}')" style="cursor:pointer">
                        ${getAttachmentThumbnailHtml(f)}
                        <div style="flex:1;min-width:0;overflow:hidden;cursor:pointer">
                            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${xmlEscape(String(f.name || 'Attachment'))}</div>
                            <div style="font-size:11px;color:var(--text3);margin-top:2px">${getFileTypeLabel(f)} &bull; ${f.uploadedAt}</div>
                        </div>
                        <button class="btn btn-ghost btn-xs" title="Preview" onclick="event.stopPropagation(); App.previewAttachment('driver', ${idx}, '${f.id}')">&#128065;</button>
                        <button class="btn btn-ghost btn-xs" title="Download" onclick="event.stopPropagation(); App.downloadAttachment('driver', ${idx}, '${f.id}')">&#8595;</button>
                        <button class="btn btn-ghost btn-xs" title="Rename" onclick="event.stopPropagation(); App.renameAttachment('driver', ${idx}, '${f.id}')">&#9998;</button>
                        <button class="btn btn-ghost btn-xs" title="Delete" onclick="event.stopPropagation(); App.deleteAttachment('driver', ${idx}, '${f.id}')">&#128465;</button>
                    </div>`).join('') || '<p style="color:var(--text3)">No attachments uploaded.</p>'}
                </div>
                ${customHtml ? `<div class="section"><div class="section-title">Custom Fields <button class="btn btn-ghost btn-xs" onclick="App.editDriverCustom(${idx})">Edit</button></div><div class="info-grid">${customHtml}</div></div>` : ''}
            </div>
            <div class="modal-actions">
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                <button class="btn btn-ghost btn-sm" onclick="App.exportDriverData(${idx})">Export Driver Data</button>
                <button class="btn btn-danger btn-sm" onclick="App.deleteDriver(${idx})">Delete Driver</button>
            </div>`);
            }

            function syncDriverIdWithTruck(d) {
                if (d.license_plate) {
                    d.id = d.license_plate;
                } else {
                    const isPlate = trucks.some(t => String(t.plate).trim().toUpperCase() === String(d.id).trim().toUpperCase());
                    if (isPlate || !d.id) {
                        d.id = `DRV-${Math.floor(Math.random() * 900) + 100}`;
                    }
                }
            }

            function isDriverUnassignStatus(status) {
                const norm = normStatus(status);
                return ['suspended', 'bench', 'onbench', 'on-bench', 'on bench'].includes(norm);
            }

            function changeDriverStatus(idx, newStatus) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                const prevTruckPlate = d.license_plate || '';
                d.status = newStatus;
                if (isDriverUnassignStatus(newStatus) && prevTruckPlate) {
                    d.license_plate = '';
                    recordDriverTruckAssignment(d, '', new Date().toISOString().slice(0, 10));
                    syncDriverIdWithTruck(d);
                    saveAll();
                    const prompt = `Driver status changed to ${newStatus}. Their truck (${prevTruckPlate}) has been unassigned. Assign that truck to another driver now?`;
                    const assignNow = confirm(prompt);
                    if (assignNow) {
                        App.closeModal();
                        App.openTruckAssignmentDrawer(null, prevTruckPlate);
                        return;
                    } else {
                        showToast(`Truck ${prevTruckPlate} released from ${d.name}. Assign later from Truck Assignment Center.`);
                    }
                } else {
                    if (isDriverUnassignStatus(newStatus)) {
                        d.license_plate = '';
                        recordDriverTruckAssignment(d, '', new Date().toISOString().slice(0, 10));
                        syncDriverIdWithTruck(d);
                    }
                    saveAll();
                }
                // Update dot colour live without reopening modal
                const stObj = settings.driverStatuses.find(s => normStatus(s.name) === normStatus(newStatus));
                const dot = document.getElementById('statusDot_' + idx);
                const sel = document.getElementById('statusSelect_' + idx);
                if (dot && stObj) dot.style.background = stObj.color;
                if (sel && stObj) sel.style.color = stObj.color;
                renderDriverCards();
                updateSidebarBadges();
                showToast('Status updated to ' + newStatus);
            }

            function updateDriverField(idx, field, value) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                d[field] = value;
                saveAll();
                renderDriverCards();
                renderDriverMetrics();
                updateSidebarBadges();
                const label = field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                showToast(label + ' updated');
            }

            function showDriverEditPen(idx) {
                const wrapper = document.getElementById('modalNameEditWrapper_' + idx);
                if (!wrapper) return;
                wrapper.classList.toggle('active');
            }

            function openDriverEditForm(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                const statusOptions = settings.driverStatuses.map(s => `<option value="${s.name}" ${s.name === d.status ? 'selected' : ''}>${s.name}</option>`).join('');
                const tripsCount = d.tripsList ? d.tripsList.length : (d.trips || 0);
                pushModal(`
            <div class="modal-header">
                <div class="modal-name">Edit Driver Details</div>
                <div class="modal-close" onclick="App.closeModal()">✕</div>
            </div>
            <div class="modal-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div><label style="font-size:11px">Full Name *</label><input type="text" id="editName_${idx}" value="${xmlEscape(d.name || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px"></div>
                    <div><label style="font-size:11px">Driver ID</label><input type="text" id="editId_${idx}" value="${xmlEscape(d.id || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px"></div>
                    <div><label style="font-size:11px">Status</label><select id="editStatus_${idx}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">${statusOptions}</select></div>
                    <div><label style="font-size:11px">Plate Number</label><input type="text" id="editPlate_${idx}" value="${xmlEscape(d.license_plate || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Driving License</label><input type="text" id="editLicense_${idx}" value="${xmlEscape(d.license || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">License Expiry</label><input type="date" id="editLicenseExpiry_${idx}" value="${xmlEscape(d.licenseExpiry || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Passport / Laissez Pass</label><input type="text" id="editPassport_${idx}" value="${xmlEscape(d.passport || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Passport Expiry</label><input type="date" id="editPassportExpiry_${idx}" value="${xmlEscape(d.passportExpiry || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Phone Number</label><input type="text" id="editPhone_${idx}" value="${xmlEscape(d.phone || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Blood Group</label><input type="text" id="editBlood_${idx}" value="${xmlEscape(d.bloodGroup || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Health Status</label><input type="text" id="editHealth_${idx}" value="${xmlEscape(d.healthStatus || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Hire Date</label><input type="date" id="editHire_${idx}" value="${xmlEscape(d.hire_date || '')}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                </div>
                <div style="margin-top:18px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg3)">
                    <div style="font-size:12px;font-weight:700;margin-bottom:8px">Current Driver Snapshot</div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;color:var(--text3)">
                        <div><strong>Status:</strong> ${xmlEscape(d.status || '—')}</div>
                        <div><strong>Assigned Truck:</strong> ${xmlEscape(formatDriverVehicleLabel(d) || 'None')}</div>
                        <div><strong>Violations:</strong> ${d.violations.length}</div>
                        <div><strong>Trips:</strong> ${tripsCount}</div>
                    </div>
                </div>
                <div style="display:flex;gap:10px;margin-top:16px">
                    <button class="btn btn-primary btn-sm" style="flex:1" onclick="App.saveDriverEditForm(${idx})">Save Changes</button>
                    <button class="btn btn-ghost btn-sm" style="flex:1" onclick="App.closeModal()">Cancel</button>
                </div>
            </div>`);
            }

            function saveDriverEditForm(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                const name = document.getElementById('editName_' + idx)?.value.trim();
                if (!name) { showToast('Name is required'); return; }
                d.name = name;
                const newStatus = document.getElementById('editStatus_' + idx)?.value || d.status;
                d.status = newStatus;
                let plate = document.getElementById('editPlate_' + idx)?.value.trim() || '';
                if (isDriverUnassignStatus(newStatus)) {
                    plate = '';
                }
                const oldPlate = d.license_plate;
                d.license_plate = plate;
                if (oldPlate !== plate) {
                    recordDriverTruckAssignment(d, plate, new Date().toISOString().slice(0, 10));
                }
                d.id = document.getElementById('editId_' + idx)?.value.trim() || d.id;
                syncDriverIdWithTruck(d);
                d.license = document.getElementById('editLicense_' + idx)?.value.trim() || '';
                d.licenseExpiry = document.getElementById('editLicenseExpiry_' + idx)?.value || '';
                d.passport = document.getElementById('editPassport_' + idx)?.value.trim() || '';
                d.passportExpiry = document.getElementById('editPassportExpiry_' + idx)?.value || '';
                d.phone = document.getElementById('editPhone_' + idx)?.value.trim() || '';
                d.bloodGroup = document.getElementById('editBlood_' + idx)?.value.trim() || '';
                d.healthStatus = document.getElementById('editHealth_' + idx)?.value.trim() || '';
                d.hire_date = document.getElementById('editHire_' + idx)?.value || d.hire_date;
                saveAll();
                _modalStack = [];
                openDriverModal(idx);
                renderDriverCards();
                renderDriverMetrics();
                updateSidebarBadges();
                showToast('Driver details updated');
            }

            function deleteDriver(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!confirm(`Move driver "${d.name || d.id || 'Driver'}" to Recycling Bin?`)) return;
                sendToRecycleBin('driver', d.name || d.id || 'Driver', d);
                drivers = drivers.filter(x => x._idx !== idx);
                saveAll();
                closeModal();
                renderDriverCards();
                renderDriverMetrics();
                updateSidebarBadges();
                showToast('Driver moved to Recycling Bin');
            }

            function renderViolationCardItemHtml(d, v, driverIdx, originalIndex) {
                const sevColor = v.severity === 'high' ? 'var(--red)' : v.severity === 'medium' ? 'var(--amber)' : 'var(--green)';
                const truckLabel = v.truckPlate || d.license_plate || '—';
                return `<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
                    <span style="margin-top:4px;color:${sevColor}">●</span>
                    <div style="flex:1;min-width:0">
                        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
                            <div style="min-width:0;">
                                <div style="font-weight:600">${xmlEscape(v.type || 'Violation')} <span style="font-size:11px;color:var(--text3);font-weight:400">(Vehicle: ${xmlEscape(truckLabel)})</span></div>
                                <div style="font-size:12px;color:var(--text3);margin-top:2px">${xmlEscape(v.date || '—')}</div>
                            </div>
                            <span class="vtag vtag-${v.severity || 'low'}" style="white-space:nowrap">${v.severity || 'low'}</span>
                        </div>
                        <div style="margin-top:6px;font-size:13px;color:var(--text2);min-height:18px">
                            ${v.description ? xmlEscape(v.description) : '<span style="color:var(--text3)">No description provided</span>'}
                        </div>
                        ${v.actionTaken ? `<div style="margin-top:6px;padding:6px 10px;background:rgba(34,201,122,0.1);border-left:3px solid var(--green);border-radius:4px;font-size:12px;color:var(--text2)"><strong>Action Taken:</strong> ${xmlEscape(v.actionTaken)}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:4px;flex-shrink:0">
                        <button class="btn btn-xs btn-ghost btn-icon" onclick="App.showEditViolationForm(${driverIdx},${originalIndex})" title="Edit" style="color:var(--accent)">✎</button>
                        <button class="btn btn-xs btn-ghost btn-icon" onclick="App.removeViolation(${driverIdx},${originalIndex})" title="Delete" style="color:var(--red)">✕</button>
                    </div>
                </div>`;
            }

            function openViolationDetailModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!Array.isArray(d.assignmentHistory)) d.assignmentHistory = [];
                if (!d.assignmentHistory.length && d.license_plate) {
                    d.assignmentHistory.push({
                        truckPlate: d.license_plate,
                        date: d.hire_date || 'Initial'
                    });
                }

                const allV = (d.violations || []).map((v, originalIndex) => ({ ...v, originalIndex }));
                // Sort history chronologically descending (newest reassignments first)
                const history = [...d.assignmentHistory].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

                let htmlContent = '';

                if (history.length === 0) {
                    // Fallback if no truck assignment history recorded
                    htmlContent = allV.length
                        ? allV.map(v => renderViolationCardItemHtml(d, v, idx, v.originalIndex)).join('')
                        : '<p style="color:var(--text3)">No violations</p>';
                } else {
                    const matchedIndices = new Set();

                    history.forEach((assignItem, hIdx) => {
                        const truckPlate = assignItem.truckPlate || 'Unassigned';
                        const assignDate = assignItem.date || '—';

                        // Find violations committed during this truck assignment
                        const matching = allV.filter(item => {
                            if (matchedIndices.has(item.originalIndex)) return false;
                            if (item.truckPlate && String(item.truckPlate).trim().toUpperCase() === String(truckPlate).trim().toUpperCase()) {
                                matchedIndices.add(item.originalIndex);
                                return true;
                            }
                            if (!item.truckPlate) {
                                const vDate = item.date || '';
                                const isAfter = !assignDate || vDate >= assignDate;
                                const prevAssign = history[hIdx - 1]; // because history is descending
                                const isBefore = !prevAssign || !prevAssign.date || vDate < prevAssign.date;
                                if (isAfter && isBefore) {
                                    matchedIndices.add(item.originalIndex);
                                    return true;
                                }
                            }
                            return false;
                        });

                        htmlContent += `
                        <div style="background:var(--bg3);border-left:4px solid var(--accent);border-radius:8px;padding:10px 14px;margin:${hIdx === 0 ? '0' : '16px'} 0 10px 0;font-size:12px;font-weight:700;color:var(--text);display:flex;align-items:center;justify-content:space-between">
                            <div style="display:flex;align-items:center;gap:8px">
                                <span style="font-size:14px">🚛</span>
                                <span>Reassigned a <strong>${xmlEscape(truckPlate)}</strong> on <strong>${xmlEscape(assignDate)}</strong></span>
                            </div>
                            <span style="font-size:11px;color:var(--text3);font-weight:500">${matching.length} violation${matching.length === 1 ? '' : 's'}</span>
                        </div>`;

                        if (matching.length) {
                            htmlContent += matching.map(v => renderViolationCardItemHtml(d, v, idx, v.originalIndex)).join('');
                        } else {
                            htmlContent += `<div style="font-size:11px;color:var(--text3);padding:4px 10px 12px 10px;font-style:italic">No violations committed while driving ${xmlEscape(truckPlate)}.</div>`;
                        }
                    });

                    // Remaining unmatched violations if any
                    const leftover = allV.filter(v => !matchedIndices.has(v.originalIndex));
                    if (leftover.length) {
                        htmlContent += `
                        <div style="background:var(--bg3);border-left:4px solid var(--text3);border-radius:8px;padding:10px 14px;margin:16px 0 10px 0;font-size:12px;font-weight:700;color:var(--text)">
                            Other / Historical Violations (${leftover.length})
                        </div>`;
                        htmlContent += leftover.map(v => renderViolationCardItemHtml(d, v, idx, v.originalIndex)).join('');
                    }
                }

                pushModal(`
            <div class="modal-header"><h3>Violations - ${xmlEscape(d.name)}</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                ${htmlContent}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.showAddViolationForm(${idx})">+ Add Violation</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
            }
            function showEditViolationForm(driverIdx, violationIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d || !d.violations || !d.violations[violationIdx]) return;
                const existing = d.violations[violationIdx];
                const typeOptions = settings.violationTypes.map(t => `<option value="${t.name}"${t.name === (existing.type || '') ? ' selected' : ''}>${t.name} (${t.severity})</option>`).join('');
                pushModal(`
            <div class="modal-header"><h3>Edit Violation</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
                <label>Violation Type</label>
                <select id="editVType" onchange="App.autoSetSeverity()">${typeOptions}</select>
                <label>Severity</label>
                <select id="editVSeverity"><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
                <label>Date</label>
                <input type="date" id="editVDate" value="${existing.date || new Date().toISOString().slice(0, 10)}">
                <label>Description (optional)</label>
                <textarea id="editVDescription" rows="3" style="resize:vertical;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">${existing.description || ''}</textarea>
                <label>Action Taken (optional)</label>
                <textarea id="editVActionTaken" rows="2" style="resize:vertical;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)" placeholder="e.g. Written warning issued, Fine applied, etc.">${existing.actionTaken || ''}</textarea>
                <button class="btn btn-primary btn-sm" onclick="App.saveEditedViolation(${driverIdx},${violationIdx})">Save changes</button>
            </div>`);
                document.getElementById('editVSeverity').value = existing.severity || 'medium';
            }
            function saveEditedViolation(driverIdx, violationIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d || !d.violations || !d.violations[violationIdx]) return;
                const type = document.getElementById('editVType')?.value;
                const severity = document.getElementById('editVSeverity')?.value;
                const date = document.getElementById('editVDate')?.value;
                const description = document.getElementById('editVDescription')?.value || '';
                const actionTaken = document.getElementById('editVActionTaken')?.value || '';
                if (!type) return;
                d.violations[violationIdx] = { type, severity, date: date || new Date().toISOString().slice(0, 10), description, actionTaken };
                saveAll();
                App.openViolationDetailModal(driverIdx);
                renderDriverCards(); renderDriverMetrics(); populateViolationFilters(); updateSidebarBadges();
            }
            function openTripsDetailModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.tripsList) d.tripsList = [];
                pushModal(`
            <div class="modal-header"><h3>Trips - ${d.name}</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                ${d.tripsList.length ? d.tripsList.map((t, i) => `<div style="display:flex;gap:12px;padding:6px 0;border-bottom:1px solid var(--border)">
                    <span style="flex:1">Date: ${t.date || '—'}</span><span>Completed: ${t.completed || '—'}</span>
                    <button class="btn btn-xs btn-ghost" onclick="App.removeFromList(${idx},'tripsList',${i})">✕</button></div>`).join('') : '<p style="color:var(--text3)">No trips recorded</p>'}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.addTripItem(${idx})">+ Add Trip</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
            }
            function openWarningsDetailModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.warningsList) d.warningsList = [];
                pushModal(`
            <div class="modal-header"><h3>Warnings - ${d.name}</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                ${d.warningsList.length ? d.warningsList.map((w, i) => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
                    <span style="flex:1"><b>${w.date || '—'}</b>: ${w.reason || 'No reason'}</span>
                    <button class="btn btn-xs btn-ghost" onclick="App.removeFromList(${idx},'warningsList',${i})">✕</button></div>`).join('') : '<p style="color:var(--text3)">No warnings</p>'}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.addWarningItem(${idx})">+ Add Warning</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
            }
            function openSuspensionsDetailModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.suspensionsList) d.suspensionsList = [];
                pushModal(`
            <div class="modal-header"><h3>Suspensions - ${d.name}</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                ${d.suspensionsList.length ? d.suspensionsList.map((s, i) => `<div style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
                    <span style="flex:1"><b>${s.date || '—'}</b>: ${s.reason || 'No reason'}</span>
                    <button class="btn btn-xs btn-ghost" onclick="App.removeFromList(${idx},'suspensionsList',${i})">✕</button></div>`).join('') : '<p style="color:var(--text3)">No suspensions</p>'}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.addSuspensionItem(${idx})">+ Add Suspension</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
            }
            function openAccidentsDetailModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.accidentsList) d.accidentsList = [];
                pushModal(`
            <div class="modal-header"><h3>Accidents - ${d.name}</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                ${d.accidentsList.length ? d.accidentsList.map((a, i) => `<div style="display:flex;flex-direction:column;gap:4px;padding:8px 0;border-bottom:1px solid var(--border)">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                        <span style="flex:1"><b>${a.date || '—'}</b>: ${xmlEscape(String(a.description || 'No details'))}</span>
                        <div style="display:flex;gap:4px;flex-shrink:0">
                            <button class="btn btn-xs btn-ghost btn-icon" onclick="App.openEditAccidentModal(${idx}, ${i})" title="Edit">✎</button>
                            <button class="btn btn-xs btn-ghost btn-icon" onclick="App.removeFromList(${idx},'accidentsList',${i})" title="Delete" style="color:var(--red)">✕</button>
                        </div>
                    </div>
                    ${a.measuresTaken ? `<div style="margin-top:4px;padding:6px 8px;background:rgba(34,201,122,0.06);border-left:2px solid var(--green);border-radius:4px;font-size:11px;color:var(--text2)"><strong>Measures Taken:</strong> ${xmlEscape(String(a.measuresTaken))}</div>` : ''}
                </div>`).join('') : '<p style="color:var(--text3)">No accidents</p>'}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.openAddAccidentModal()">+ Add Accident</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
            }
            function openLossesDetailModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.lossesList) d.lossesList = [];
                const sortedLosses = d.lossesList
                    .map((loss, index) => ({ loss, index }))
                    .sort((a, b) => {
                        if (!a.loss.date) return 1;
                        if (!b.loss.date) return -1;
                        return b.loss.date.localeCompare(a.loss.date);
                    });
                pushModal(`
            <div class="modal-header"><h3>Losses (L) - ${d.name}</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                ${sortedLosses.length ? `
                    <div style="display:grid;grid-template-columns:1.2fr 1.2fr 0.8fr 1.4fr auto;gap:8px;align-items:center;padding:10px 8px;font-weight:600;color:var(--text3);border-bottom:1px solid var(--border)">
                        <span>Date</span><span>Loss Type</span><span>Amount (L)</span><span>Description</span><span></span>
                    </div>
                    ${sortedLosses.map(({ loss: l, index }) => `<div style="display:grid;grid-template-columns:1.2fr 1.2fr 0.8fr 1.4fr auto;gap:8px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
                        <span>${l.date || '—'}</span>
                        <span>${l.type || 'Loss'}</span>
                        <span>${l.amount || 0} L</span>
                        <span style="color:var(--text3);font-size:13px">${l.description || '—'}</span>
                        <div style="display:flex;gap:4px">
                            <button class="btn btn-xs btn-ghost" onclick="App.editLossItem(${idx},${index})" title="Edit">✎</button>
                            <button class="btn btn-xs btn-ghost" onclick="App.removeFromList(${idx},'lossesList',${index})" title="Delete">✕</button>
                        </div></div>`).join('')}` : '<p style="color:var(--text3)">No losses recorded</p>'}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.addLossItem(${idx})">+ Add Loss</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
            }
            function openTrainingDetailModal(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.trainings) d.trainings = [];
                const sorted = [...d.trainings].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                const validTrainingCount = sorted.filter(t => trainingStatus(t).valid).length;
                const invalidTrainingCount = sorted.length - validTrainingCount;
                const rows = sorted.map((t, i) => {
                    const st = trainingStatus(t);
                    const badge = st.valid ? 'good' : 'critical';
                    return `<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 0.8fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border)">
                        <span style="font-weight:600">${t.name || 'Training'}</span>
                        <span>${t.date || '—'}</span>
                        <span>${st.nextDue}</span>
                        <span><span class="vtag vtag-${badge}" style="min-width:70px;text-align:center">${st.valid ? 'Valid' : 'Expired'}</span></span>
                        <button class="btn btn-xs btn-ghost" onclick="App.removeTrainingItem(${idx},${i})">✕</button>
                    </div>`;
                }).join('');
                pushModal(`
            <div class="modal-header"><h3>Trainings - ${d.name}</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                    <div style="margin-bottom:14px;font-size:13px;color:var(--text)">valid: ${validTrainingCount} · expired: ${invalidTrainingCount}</div>
                ${sorted.length ? `<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr 0.8fr auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-weight:600;color:var(--text3)">
                    <span>Name</span><span>Date</span><span>Next due</span><span>Status</span><span></span>
                </div>${rows}` : '<p style="color:var(--text3)">No training records yet.</p>'}
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.addTrainingItem(${idx})">+ Add Training</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
            }
            function addTrainingItem(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                const name = prompt('Training name:', 'Defensive Driving');
                if (!name) return;
                const date = prompt('Training date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                if (!date) return;
                let months = parseInt(prompt('Certificate validity in months:', '12'), 10);
                if (isNaN(months) || months <= 0) months = 12;
                if (!d.trainings) d.trainings = [];
                d.trainings.push({ name, date, validityMonths: months });
                saveAll();
                openTrainingDetailModal(idx);
                renderDriverCards(); renderDriverMetrics(); updateSidebarBadges();
            }
            function removeTrainingItem(driverIdx, trainingIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d || !d.trainings) return;
                d.trainings.splice(trainingIdx, 1);
                saveAll();
                openTrainingDetailModal(driverIdx);
                renderDriverCards(); renderDriverMetrics(); updateSidebarBadges();
            }

            function removeFromList(driverIdx, listName, itemIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d) return;
                d[listName].splice(itemIdx, 1);
                saveAll();
                const modalMap = {
                    tripsList: openTripsDetailModal,
                    warningsList: openWarningsDetailModal,
                    suspensionsList: openSuspensionsDetailModal,
                    accidentsList: openAccidentsDetailModal,
                    lossesList: openLossesDetailModal
                };
                if (modalMap[listName]) modalMap[listName](driverIdx);
                else closeModal();
                renderDriverCards(); renderDriverMetrics(); updateSidebarBadges();
            }

            function addTripItem(idx) {
                const date = prompt('Trip date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                if (!date) return;
                const completed = prompt('Completed date:', '');
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.tripsList) d.tripsList = [];
                d.tripsList.push({ date, completed });
                saveAll();
                openTripsDetailModal(idx);
                renderDriverCards(); renderDriverMetrics();
            }
            function addWarningItem(idx) {
                const reason = prompt('Warning reason:');
                if (!reason) return;
                const date = prompt('Date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                if (!date) return;
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.warningsList) d.warningsList = [];
                d.warningsList.push({ date, reason });
                saveAll();
                openWarningsDetailModal(idx);
                renderDriverCards(); renderDriverMetrics();
            }
            function addSuspensionItem(idx) {
                const reason = prompt('Suspension reason:');
                if (!reason) return;
                const date = prompt('Date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                if (!date) return;
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.suspensionsList) d.suspensionsList = [];
                d.suspensionsList.push({ date, reason });
                saveAll();
                openSuspensionsDetailModal(idx);
                renderDriverCards(); renderDriverMetrics();
            }
            function addAccidentItem(idx) {
                const desc = prompt('Accident description:');
                if (!desc) return;
                const date = prompt('Date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                if (!date) return;
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.accidentsList) d.accidentsList = [];
                d.accidentsList.push({ date, description: desc });
                saveAll();
                openAccidentsDetailModal(idx);
                renderDriverCards(); renderDriverMetrics();
            }
            function addLossItem(idx) {
                const type = prompt('Type of loss (e.g. Cargo damage):');
                if (!type) return;
                const amount = parseFloat(prompt('Amount (L):'));
                if (isNaN(amount)) return;
                const date = prompt('Date (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
                if (!date) return;
                const description = prompt('Description:');
                if (description === null) return;
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!d.lossesList) d.lossesList = [];
                d.lossesList.push({ date, type, amount, description });
                saveAll();
                openLossesDetailModal(idx);
                renderDriverCards(); renderDriverMetrics();
            }
            function editLossItem(driverIdx, lossIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d || !d.lossesList || !d.lossesList[lossIdx]) return;
                const loss = d.lossesList[lossIdx];
                const type = prompt('Type of loss (e.g. Cargo damage):', loss.type);
                if (!type) return;
                const amount = parseFloat(prompt('Amount (L):', String(loss.amount)));
                if (isNaN(amount)) return;
                const date = prompt('Date (YYYY-MM-DD):', loss.date);
                if (!date) return;
                const description = prompt('Description:', loss.description || '');
                if (description === null) return;
                d.lossesList[lossIdx] = { date, type, amount, description };
                saveAll();
                openLossesDetailModal(driverIdx);
                renderDriverCards(); renderDriverMetrics();
            }

            function showAddViolationForm(driverIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                const typeOptions = settings.violationTypes.map(t => `<option value="${t.name}">${t.name} (${t.severity})</option>`).join('');
                openModal(`
            <div class="modal-header"><h3>Add Violation</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
                <div style="display:flex;flex-direction:column;gap:4px;padding:12px;border:1px solid var(--border2);border-radius:12px;background:rgba(255,255,255,0.02)">
                    <div style="font-size:12px;color:var(--text3);">Selected driver</div>
                    <div style="font-weight:600">${d?.name || 'Unknown'}</div>
                    <div style="font-size:13px;color:var(--text2)">Vehicle: ${formatDriverVehicleLabel(d) || '—'} · ID: ${d?.id || '—'}</div>
                </div>
                <label>Violation Type</label>
                <select id="addVType" onchange="App.autoSetSeverity()">${typeOptions}</select>
                <label>Severity</label>
                <select id="addVSeverity"><option>low</option><option selected>medium</option><option>high</option></select>
                <label>Date</label>
                <input type="date" id="addVDate" value="${new Date().toISOString().slice(0, 10)}">
                <label>Description (optional)</label>
                <textarea id="addVDescription" rows="3" style="resize:vertical;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)"></textarea>
                <label>Action Taken (optional)</label>
                <textarea id="addVActionTaken" rows="2" style="resize:vertical;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)" placeholder="e.g. Written warning issued, Fine applied, etc."></textarea>
                <button class="btn btn-primary btn-sm" onclick="App.addViolationFromForm(${driverIdx})">Save</button>
            </div>`);
            }
            function autoSetSeverity() {
                const type = document.getElementById('addVType')?.value || document.getElementById('editVType')?.value;
                const vt = settings.violationTypes.find(t => t.name === type);
                const severityEl = document.getElementById('addVSeverity') || document.getElementById('editVSeverity');
                if (vt && severityEl) severityEl.value = vt.severity;
            }
            function addViolationFromForm(idx) {
                const type = document.getElementById('addVType')?.value;
                const severity = document.getElementById('addVSeverity')?.value;
                const date = document.getElementById('addVDate')?.value;
                const description = document.getElementById('addVDescription')?.value || '';
                const actionTaken = document.getElementById('addVActionTaken')?.value || '';
                if (!type) return;
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                d.violations.push({
                    type,
                    severity,
                    date: date || new Date().toISOString().slice(0, 10),
                    description,
                    actionTaken,
                    truckPlate: d.license_plate || 'Unassigned'
                });
                saveAll();
                closeModal();
                openViolationDetailModal(idx);
                renderDriverCards();
                renderDriverMetrics();
                populateViolationFilters();
                updateSidebarBadges();
            }
            function removeViolation(driverIdx, violIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d || !d.violations || !d.violations[violIdx]) return;
                const v = d.violations[violIdx];
                if (!confirm(`Move violation "${v.type || 'Violation'}" to Recycling Bin?`)) return;
                sendToRecycleBin('violation', `${v.type || 'Violation'} (${d.name || 'Driver'})`, v, { driverIdx });
                d.violations.splice(violIdx, 1);
                saveAll();
                closeModal();
                renderViolationList();
                renderDriverCards();
                renderDriverMetrics();
                populateViolationFilters();
                updateSidebarBadges();
                showToast('Violation moved to Recycling Bin');
            }

            function openDriverAddForm() {
                const statusOptions = settings.driverStatuses.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
                openModal(`
            <div class="modal-header"><h3>Enroll New Driver</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div><label style="font-size:11px">Full Name *</label><input type="text" id="newName" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px" placeholder="Jean Hategeka"></div>
                    <div><label style="font-size:11px">Driver ID</label><input type="text" id="newId" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px" placeholder="Auto-generated if empty"></div>
                    <div><label style="font-size:11px">Status</label><select id="newStatus" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)">${statusOptions}</select></div>
                    <div><label style="font-size:11px">Plate Number</label><input type="text" id="newPlate" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="RAC 123 A"></div>
                    <div><label style="font-size:11px">Driving License</label><input type="text" id="newLicense" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="DL1234"></div>
                    <div><label style="font-size:11px">License Expiry</label><input type="date" id="newLicenseExpiry" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Passport / Laissez Pass</label><input type="text" id="newPassport" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="PP1234"></div>
                    <div><label style="font-size:11px">Passport Expiry</label><input type="date" id="newPassportExpiry" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Phone Number</label><input type="text" id="newPhone" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="+250 7XX XXX XXX"></div>
                    <div><label style="font-size:11px">Hire Date</label><input type="date" id="newHireDate" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                    <div><label style="font-size:11px">Blood Group</label><input type="text" id="newBlood" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="A+"></div>
                    <div><label style="font-size:11px">Health Status</label><input type="text" id="newHealth" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="Fit"></div>
                    <div><label style="font-size:11px">Trips</label><input type="number" id="newTrips" value="0" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"></div>
                </div>
                <button class="btn btn-primary btn-sm" style="margin-top:16px;width:100%" onclick="App.createDriverFromForm()">Save Driver</button>
            </div>`);
            }
            function createDriverFromForm() {
                const name = document.getElementById('newName')?.value.trim();
                if (!name) { showToast('Name is required'); return; }
                const status = document.getElementById('newStatus')?.value || settings.driverStatuses[0]?.name;
                let plate = document.getElementById('newPlate')?.value.trim() || '';
                if (isDriverUnassignStatus(status)) {
                    plate = '';
                }
                const id = document.getElementById('newId')?.value.trim() || `DRV-${Math.floor(Math.random() * 900) + 100}`;
                const newD = {
                    _idx: drivers.length ? Math.max(...drivers.map(d => d._idx)) + 1 : 0,
                    name, id,
                    status,
                    license: document.getElementById('newLicense')?.value.trim() || '',
                    licenseExpiry: document.getElementById('newLicenseExpiry')?.value || '',
                    passport: document.getElementById('newPassport')?.value.trim() || '',
                    passportExpiry: document.getElementById('newPassportExpiry')?.value || '',
                    phone: document.getElementById('newPhone')?.value.trim() || '',
                    license_plate: plate,
                    hire_date: document.getElementById('newHireDate')?.value || new Date().toISOString().slice(0, 10),
                    bloodGroup: document.getElementById('newBlood')?.value.trim() || '',
                    healthStatus: document.getElementById('newHealth')?.value.trim() || '',
                    trips: parseInt(document.getElementById('newTrips')?.value) || 0,
                    tripsList: [],
                    violations: [],
                    warningsList: [],
                    suspensionsList: [],
                    accidentsList: [],
                    lossesList: [],
                    documents: [],
                    files: [],
                    custom: {}
                };
                syncDriverIdWithTruck(newD);
                drivers.push(newD);
                saveAll();
                closeModal();
                renderDriverCards(); renderDriverMetrics(); updateSidebarBadges();
                showToast('Driver enrolled successfully');
            }

            // ═══════════ TRUCKS ═══════════
            function renderTruckMetrics() {
                const total = trucks.length;
                const good = trucks.filter(t => healthLabel(healthScore(t)) === 'good').length;
                const crit = trucks.filter(t => healthLabel(healthScore(t)) === 'critical').length;
                const expiredDocs = trucks.reduce((s, t) => s + t.documents.filter(d => docStatus(d) === 'expired').length, 0);
                document.getElementById('truckMetrics').innerHTML = `
            <div class="metric-card c-blue"><div class="metric-label">Total Trucks</div><div class="metric-value">${total}</div></div>
            <div class="metric-card c-green"><div class="metric-label">Healthy</div><div class="metric-value">${good}</div></div>
            <div class="metric-card c-red"><div class="metric-label">Critical</div><div class="metric-value">${crit}</div></div>
            <div class="metric-card c-amber"><div class="metric-label">Expired Docs</div><div class="metric-value">${expiredDocs}</div></div>`;
            }
            function renderTruckCards() {
                const search = (document.getElementById('truckSearch')?.value || '').toLowerCase();
                const healthF = document.getElementById('truckHealthFilter')?.value || '';
                const docF = document.getElementById('truckDocFilter')?.value || '';
                let list = trucks.filter(t => {
                    const ms = !search || (t.plate || '').toLowerCase().includes(search) || (t.brand || '').toLowerCase().includes(search) || (t.chassisNo || '').toLowerCase().includes(search);
                    const mh = !healthF || healthLabel(healthScore(t)) === healthF;
                    let md = true;
                    if (docF === 'expired') md = t.documents.some(d => docStatus(d) === 'expired');
                    else if (docF === 'expiring') md = t.documents.some(d => docStatus(d) === 'expiring');
                    else if (docF === 'valid') md = t.documents.every(d => docStatus(d) === 'valid');
                    return ms && mh && md;
                });
                document.getElementById('truckCardsGrid').innerHTML = list.length === 0 ? `<div class="empty-state"><div class="e-icon">🚛</div><p>No trucks found.</p></div>` :
                    list.map(t => {
                        const hl = healthLabel(healthScore(t));
                        const accent = hl === 'critical' ? 'var(--red)' : hl === 'warning' ? 'var(--amber)' : 'var(--green)';
                        const expired = t.documents.filter(d => docStatus(d) === 'expired').length;
                        const expiring = t.documents.filter(d => docStatus(d) === 'expiring').length;
                        const truckStatus = t.status || 'Active';
                        const truckStatusClass = truckStatus === 'In Maintenance' ? 'badge-suspended' : truckStatus === 'On Trip' ? 'badge-trip' : 'badge-online';
                        return `<div class="card" onclick="App.openTruckModal(${t._idx})">
                    <div class="accent-bar" style="background:${accent}"></div>
                    <div class="card-top">
                        <div class="avatar" style="background:rgba(255,255,255,0.05);font-size:18px">🚛</div>
                        <div class="card-info"><div class="card-title">${formatTruckLabel(t)}</div><div class="card-sub">${t.brand || 'N/A'}</div></div>
                        <span class="badge badge-${hl === 'critical' ? 'critical' : hl === 'warning' ? 'warn' : 'good'}">${healthScore(t)}%</span>
                    </div>
                    <div style="margin-bottom:6px"><span class="badge ${truckStatusClass}" style="font-size:10px"><span class="dot"></span>${truckStatus}</span></div>
                    <div style="background:var(--bg4);border-radius:var(--radius);padding:10px;margin:8px 0;font-size:11px;line-height:1.6">
                        <div><strong>Chassis:</strong> ${t.chassisNo || 'N/A'}</div>
                        <div><strong>Year:</strong> ${t.year || 'N/A'}</div>
                        <div><strong>Log Book:</strong> ${t.logBook || 'N/A'}</div>
                        <div><strong>Trailer:</strong> ${t.trailer || '—'}</div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0">${t.documents.slice(0, 3).map(d => {
                            const st = docStatus(d);
                            return `<span class="vtag vtag-${st === 'expired' ? 'high' : st === 'expiring' ? 'medium' : 'low'}" style="font-size:9px">${d.type}</span>`;
                        }).join('')}${t.documents.length > 3 ? `<span class="vtag" style="font-size:9px;color:var(--text3)">+${t.documents.length - 3}</span>` : ''}</div>
                    ${(expired + expiring) > 0 ? `<div style="font-size:10px;color:var(--red);margin-top:4px">⚠ ${expired} expired, ${expiring} expiring</div>` : ''}
                    <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap" onclick="event.stopPropagation()">
                        <button class="btn btn-ghost btn-xs" onclick="App.startJobCardForTruck('${xmlEscape(t.plate)}')">🧾 Job Card</button>
                        ${truckStatus === 'In Maintenance' ? '<span style="font-size:10px;color:var(--amber);align-self:center">In garage</span>' : ''}
                    </div>
                </div>`;
                    }).join('');
            }

            // ═══════════ TRUCK / TRAILER SUB-TABS ═══════════
            let activeTruckSubTab = 'trucks';
            function setTruckSubTab(tab) {
                activeTruckSubTab = tab || 'trucks';
                const truckPage = document.getElementById('page-trucks');
                const truckBtn = document.getElementById('truckSubTab-trucks');
                const trailerBtn = document.getElementById('truckSubTab-trailers');
                const truckPanel = document.getElementById('trucks-panel');
                const trailerPanel = document.getElementById('trailers-panel');
                if (!truckPanel || !trailerPanel) { renderTruckMetrics(); renderTruckCards(); return; }
                if (activeTruckSubTab === 'trailers') {
                    truckPage?.classList.add('trailers-active');
                    truckPanel.style.display = 'none';
                    trailerPanel.style.display = '';
                    if (truckBtn) truckBtn.classList.remove('active');
                    if (trailerBtn) trailerBtn.classList.add('active');
                    renderTrailerMetrics();
                    renderTrailerCards();
                } else {
                    truckPage?.classList.remove('trailers-active');
                    truckPanel.style.display = '';
                    trailerPanel.style.display = 'none';
                    if (truckBtn) truckBtn.classList.add('active');
                    if (trailerBtn) trailerBtn.classList.remove('active');
                    renderTruckMetrics();
                    renderTruckCards();
                }
            }

            // ═══════════ TRAILERS ═══════════
            function trailerDocHealth(tr) {
                if (!Array.isArray(tr.documents) || tr.documents.length === 0) return 100;
                const expired = tr.documents.filter(d => docStatus(d) === 'expired').length;
                const expiring = tr.documents.filter(d => docStatus(d) === 'expiring').length;
                if (expired) return Math.max(0, 100 - expired * 30 - expiring * 10);
                if (expiring) return Math.max(50, 100 - expiring * 10);
                return 100;
            }
            function trailerHealthLabel(score) {
                if (score <= 40) return 'critical';
                if (score <= 70) return 'warning';
                return 'good';
            }
            function getAssignedTruckForTrailer(trailerId) {
                if (!trailerId) return null;
                return trucks.find(t => String(t.trailer || '').trim().toUpperCase() === String(trailerId).trim().toUpperCase());
            }
            function renderTrailerMetrics() {
                const total = trailers.length;
                const active = trailers.filter(t => (t.status || 'Active') === 'Active').length;
                const inMaint = trailers.filter(t => t.status === 'In Maintenance').length;
                const expiredDocs = trailers.reduce((s, t) => s + (t.documents || []).filter(d => docStatus(d) === 'expired').length, 0);
                const el = document.getElementById('trailerMetrics');
                if (!el) return;
                el.innerHTML = `
            <div class="metric-card c-blue"><div class="metric-label">Total Trailers</div><div class="metric-value">${total}</div></div>
            <div class="metric-card c-green"><div class="metric-label">Active</div><div class="metric-value">${active}</div></div>
            <div class="metric-card c-amber"><div class="metric-label">In Maintenance</div><div class="metric-value">${inMaint}</div></div>
            <div class="metric-card c-red"><div class="metric-label">Expired Docs</div><div class="metric-value">${expiredDocs}</div></div>`;
            }
            function renderTrailerCards() {
                const search = (document.getElementById('trailerSearch')?.value || '').toLowerCase();
                const docF = document.getElementById('trailerDocFilter')?.value || '';
                let list = trailers.filter(t => {
                    const ms = !search || (t.id || '').toLowerCase().includes(search) || (t.brand || '').toLowerCase().includes(search);
                    let md = true;
                    if (docF === 'expired') md = (t.documents || []).some(d => docStatus(d) === 'expired');
                    else if (docF === 'expiring') md = (t.documents || []).some(d => docStatus(d) === 'expiring');
                    else if (docF === 'valid') md = (t.documents || []).length > 0 && (t.documents || []).every(d => docStatus(d) === 'valid');
                    return ms && md;
                });
                const el = document.getElementById('trailerCardsGrid');
                if (!el) return;
                if (list.length === 0) {
                    el.innerHTML = `<div class="empty-state"><div class="e-icon">🛞</div><p>No trailers found.</p></div>`;
                    return;
                }
                el.innerHTML = list.map(t => {
                    const score = trailerDocHealth(t);
                    const hl = trailerHealthLabel(score);
                    const accent = hl === 'critical' ? 'var(--red)' : hl === 'warning' ? 'var(--amber)' : 'var(--green)';
                    const expired = (t.documents || []).filter(d => docStatus(d) === 'expired').length;
                    const expiring = (t.documents || []).filter(d => docStatus(d) === 'expiring').length;
                    const tStatus = t.status || 'Active';
                    const tStatusClass = tStatus === 'In Maintenance' ? 'badge-suspended' : tStatus === 'On Trip' ? 'badge-trip' : 'badge-online';
                    const assignedTruck = getAssignedTruckForTrailer(t.id);
                    return `<div class="card" onclick="App.openTrailerModal(${t._idx})">
                    <div class="accent-bar" style="background:${accent}"></div>
                    <div class="card-top">
                        <div class="avatar" style="background:rgba(255,255,255,0.05);font-size:18px">🛞</div>
                        <div class="card-info"><div class="card-title">${xmlEscape(t.id || '—')}</div><div class="card-sub">${xmlEscape(t.brand || 'N/A')}</div></div>
                        <span class="badge badge-${hl === 'critical' ? 'critical' : hl === 'warning' ? 'warn' : 'good'}">${score}%</span>
                    </div>
                    <div style="margin-bottom:6px"><span class="badge ${tStatusClass}" style="font-size:10px"><span class="dot"></span>${tStatus}</span></div>
                    <div style="background:var(--bg4);border-radius:var(--radius);padding:10px;margin:8px 0;font-size:11px;line-height:1.6">
                        <div><strong>Year:</strong> ${xmlEscape(String(t.year || 'N/A'))}</div>
                        <div><strong>Log Book:</strong> ${xmlEscape(t.logBook || 'N/A')}</div>
                        <div><strong>Assigned Truck:</strong> ${assignedTruck ? xmlEscape(assignedTruck.plate) : '—'}</div>
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0">${(t.documents || []).slice(0, 3).map(d => {
                        const st = docStatus(d);
                        return `<span class="vtag vtag-${st === 'expired' ? 'high' : st === 'expiring' ? 'medium' : 'low'}" style="font-size:9px">${d.type}</span>`;
                    }).join('')}${(t.documents || []).length > 3 ? `<span class="vtag" style="font-size:9px;color:var(--text3)">+${t.documents.length - 3}</span>` : ''}</div>
                    ${(expired + expiring) > 0 ? `<div style="font-size:10px;color:var(--red);margin-top:4px">⚠ ${expired} expired, ${expiring} expiring</div>` : ''}
                </div>`;
                }).join('');
            }
            function openTrailerModal(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const score = trailerDocHealth(t);
                const hl = trailerHealthLabel(score);
                const assignedTruck = getAssignedTruckForTrailer(t.id);
                const customHtml = (settings.customFields || []).filter(f => f.target === 'trailer').map(f =>
                    `<div class="info-cell"><div class="il">${xmlEscape(f.name)}</div><div class="iv">${xmlEscape((t.custom || {})[f.name] || '—')}</div></div>`).join('');
                openModal(`
            <div class="modal-header">
                <div class="avatar avatar-lg" style="background:rgba(255,255,255,0.05);font-size:20px">🛞</div>
                <div style="flex:1"><div class="modal-name">${xmlEscape(t.id || '—')}</div><div class="modal-sub">${xmlEscape(t.brand || 'N/A')} | Doc Health: ${score}% (${hl})</div></div>
                <div class="modal-close" onclick="App.closeModal()">✕</div>
            </div>
            <div class="modal-body">
                <div class="section">
                    <div class="section-title" style="display:flex;align-items:center;gap:6px">
                        Essential Details
                        <span id="editTrailerEssentialBtn_${idx}" style="cursor:pointer;font-size:12px;color:var(--text3);transition:color 0.2s;user-select:none" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'" onclick="App.editTrailerEssentialDetails(${idx})" title="Edit Details">✎</span>
                    </div>
                    <div id="trailerEssentialContainer_${idx}" style="background:var(--bg3);border-radius:var(--radius-lg);padding:14px;border:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                        <div style="display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Brand</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text)">${xmlEscape(t.brand || 'N/A')}</span>
                        </div>
                        <div style="display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Year</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text)">${xmlEscape(String(t.year || 'N/A'))}</span>
                        </div>
                        <div style="grid-column:1/-1;display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Log Book</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text)">${xmlEscape(t.logBook || 'N/A')}</span>
                        </div>
                        <div style="grid-column:1/-1;display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Assigned Truck</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text)">${assignedTruck ? `<a href="#" style="color:var(--amber);text-decoration:none" onclick="event.preventDefault();App.closeModal();App.showPage('trucks');App.setTruckSubTab('trucks');setTimeout(()=>App.openTruckModal(${assignedTruck._idx}),100)">${xmlEscape(assignedTruck.plate)}</a>` : '—'}</span>
                        </div>
                    </div>
                </div>
                <div class="section">
                    <div class="section-title">Documents <button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="App.addDocToTrailer(${idx});event.stopPropagation()">+ Add</button></div>
                    ${(t.documents || []).map((d, i) => {
                        const st = docStatus(d);
                        return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
                            <span style="color:${st === 'expired' ? 'var(--red)' : st === 'expiring' ? 'var(--amber)' : 'var(--green)'}">●</span>
                            <span style="flex:1;font-size:13px">${xmlEscape(d.type)}</span>
                            <input type="date" value="${d.expiryDate}" onchange="App.updateTrailerDocExpiry(${idx},${i},this.value)" style="width:140px;padding:4px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                            <span class="vtag vtag-${st === 'expired' ? 'high' : st === 'expiring' ? 'medium' : 'low'}">${st}</span>
                            <span style="cursor:pointer;color:var(--text3)" onclick="App.removeDocFromTrailer(${idx},${i});event.stopPropagation()">✕</span>
                        </div>`;
                    }).join('') || '<p style="color:var(--text3)">No documents</p>'}
                </div>
                <div class="section">
                    <div class="section-title">Attachments <button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="document.getElementById('trailerAttachInput_${idx}')?.click();event.stopPropagation()">+ Upload</button></div>
                    <input id="trailerAttachInput_${idx}" type="file" accept="image/*,application/pdf" multiple style="display:none" onchange="App.handleTrailerFileUpload(${idx},this.files)">
                    ${(t.files || []).map(f => `<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--bg2);cursor:pointer" onclick="App.previewTrailerAttachment(${idx},'${f.id}')">
                        ${getAttachmentThumbnailHtml(f)}
                        <div style="flex:1;min-width:0;overflow:hidden;cursor:pointer">
                            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${xmlEscape(String(f.name || 'Attachment'))}</div>
                            <div style="font-size:11px;color:var(--text3);margin-top:2px">${getFileTypeLabel(f)} &bull; ${f.uploadedAt || ''}</div>
                        </div>
                        <button class="btn btn-ghost btn-xs" title="Preview" onclick="event.stopPropagation();App.previewTrailerAttachment(${idx},'${f.id}')">&#128065;</button>
                        <button class="btn btn-ghost btn-xs" title="Download" onclick="event.stopPropagation();App.downloadAttachment('trailer',${idx},'${f.id}')">&#8595;</button>
                        <button class="btn btn-ghost btn-xs" title="Rename" onclick="event.stopPropagation();App.renameTrailerAttachment(${idx},'${f.id}')">&#9998;</button>
                        <button class="btn btn-ghost btn-xs" title="Delete" onclick="event.stopPropagation();App.deleteTrailerAttachment(${idx},'${f.id}')">&#128465;</button>
                    </div>`).join('') || '<p style="color:var(--text3)">No attachments uploaded.</p>'}
                </div>
                <div class="section">
                    <div class="section-title">Mechanical Issues <button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="App.addTrailerIssue(${idx});event.stopPropagation()">+ Add</button></div>
                    ${(t.issues || []).map((iss, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
                        <span style="color:${iss.severity === 'high' ? 'var(--red)' : 'var(--amber)'}">●</span>
                        <span style="flex:1">${xmlEscape(iss.description)}</span><small style="color:var(--text3)">${iss.date}</small>
                        <span style="cursor:pointer;color:var(--text3)" onclick="App.removeTrailerIssue(${idx},${i});event.stopPropagation()">✕</span>
                    </div>`).join('') || '<p style="color:var(--text3)">No issues logged</p>'}
                </div>
                <div class="section">
                    <div class="section-title">Fleet Status</div>
                    <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
                        <select id="trailerStatusSelect_${idx}" onchange="App.updateTrailerStatus(${idx},this.value)" style="flex:1;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" onclick="event.stopPropagation()">
                            <option value="Active" ${(t.status||'Active')==='Active'?'selected':''}>Active</option>
                            <option value="In Maintenance" ${(t.status||'')==='In Maintenance'?'selected':''}>In Maintenance</option>
                            <option value="On Trip" ${(t.status||'')==='On Trip'?'selected':''}>On Trip</option>
                            <option value="In Yard" ${(t.status||'')==='In Yard'?'selected':''}>In Yard</option>
                        </select>
                        <span class="badge ${(t.status||'Active')==='In Maintenance'?'badge-suspended':(t.status||'Active')==='On Trip'?'badge-trip':'badge-online'}" style="font-size:10px"><span class="dot"></span>${t.status||'Active'}</span>
                    </div>
                </div>
                ${customHtml ? `<div class="section"><div class="section-title">Custom Fields <button class="btn btn-ghost btn-xs" onclick="App.editTrailerCustom(${idx})">Edit</button></div><div class="info-grid">${customHtml}</div></div>` : ''}
            </div>
            <div class="modal-actions">
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                <button class="btn btn-ghost btn-sm" onclick="App.exportTrailerData(${idx})">Export Data</button>
                <button class="btn btn-danger btn-sm" onclick="App.deleteTrailer(${idx})">Delete Trailer</button>
            </div>`);
            }
            function addTrailerForm() {
                openModal(`
            <div class="modal-header"><h3>Add New Trailer</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--amber)">Trailer ID / Plate *</label><input type="text" id="newTrailerId" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="e.g. RL1234"></div>
                    <div><label style="font-size:11px;color:var(--amber)">Brand</label><input type="text" id="newTrailerBrand" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="Schmitz, Krone, etc."></div>
                    <div><label style="font-size:11px;color:var(--amber)">Year</label><input type="number" id="newTrailerYear" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="2020" min="1990" max="2099"></div>
                    <div style="grid-column:1/-1"><label style="font-size:11px;color:var(--amber)">Log Book</label><input type="text" id="newTrailerLogBook" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="Log book number"></div>
                </div>
                <button class="btn btn-primary btn-sm" style="margin-top:16px;width:100%" onclick="App.createTrailerFromForm()">Save Trailer</button>
            </div>`);
            }
            function createTrailerFromForm() {
                const id = document.getElementById('newTrailerId')?.value.trim();
                const brand = document.getElementById('newTrailerBrand')?.value.trim() || 'N/A';
                const year = document.getElementById('newTrailerYear')?.value.trim() || 'N/A';
                const logBook = document.getElementById('newTrailerLogBook')?.value.trim() || 'N/A';
                if (!id) { showToast('Trailer ID is required'); return; }
                if (trailers.some(t => String(t.id).trim().toUpperCase() === id.toUpperCase())) { showToast('Trailer ID already exists'); return; }
                const newT = {
                    _idx: trailers.length ? Math.max(...trailers.map(x => x._idx)) + 1 : 0,
                    id, brand, year, logBook, status: 'Active',
                    documents: [
                        { type: 'Insurance', expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) },
                        { type: 'Inspection', expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10) }
                    ],
                    issues: [], files: [], custom: {}
                };
                trailers.push(newT);
                saveAll();
                closeModal();
                renderTrailerMetrics(); renderTrailerCards();
                showToast('Trailer added successfully');
            }
            function deleteTrailer(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                if (!confirm(`Move trailer "${t.id || 'Trailer'}" to Recycling Bin?`)) return;
                sendToRecycleBin('trailer', t.id || 'Trailer', t);
                trailers = trailers.filter(x => x._idx !== idx);
                saveAll();
                closeModal();
                renderTrailerMetrics(); renderTrailerCards();
                showToast('Trailer moved to Recycling Bin');
            }
            function updateTrailerStatus(idx, newStatus) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                t.status = newStatus;
                saveAll();
                renderTrailerCards();
                showToast(`Trailer ${t.id} status set to: ${newStatus}`);
            }
            function addDocToTrailer(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const type = prompt('Document type (e.g. Insurance, Inspection, Registration):');
                if (!type) return;
                const expiry = prompt('Expiry date (YYYY-MM-DD):', new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
                if (!expiry) return;
                t.documents.push({ type, expiryDate: expiry });
                saveAll();
                openTrailerModal(idx);
                renderTrailerCards();
            }
            function updateTrailerDocExpiry(idx, docIdx, newDate) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                t.documents[docIdx].expiryDate = newDate;
                saveAll();
                renderTrailerCards();
            }
            function removeDocFromTrailer(idx, docIdx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                t.documents.splice(docIdx, 1);
                saveAll();
                openTrailerModal(idx);
                renderTrailerCards();
            }
            function addTrailerIssue(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const desc = prompt('Describe the issue:');
                if (!desc) return;
                const sev = prompt('Severity (high/medium/low):', 'medium') || 'medium';
                t.issues.push({ description: desc, severity: sev, date: new Date().toISOString().slice(0, 10) });
                saveAll();
                openTrailerModal(idx);
            }
            function removeTrailerIssue(idx, issIdx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                t.issues.splice(issIdx, 1);
                saveAll();
                openTrailerModal(idx);
            }
            function renameTrailerAttachment(idx, fileId) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const f = (t.files || []).find(x => x.id === fileId);
                if (!f) return;
                const newName = prompt('Rename attachment:', f.name);
                if (newName !== null && newName.trim()) { f.name = newName.trim(); saveAll(); openTrailerModal(idx); }
            }
            function deleteTrailerAttachment(idx, fileId) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                if (!confirm('Delete this attachment?')) return;
                t.files = (t.files || []).filter(x => x.id !== fileId);
                saveAll();
                openTrailerModal(idx);
            }
            function previewTrailerAttachment(idx, fileId) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const f = (t.files || []).find(x => x.id === fileId);
                if (!f) return;
                const data = f.data || f.storageUrl || '';
                if (!data) return;

                const shareUrl = resolveDriveUrl(data) || data;
                const driveId = f.driveId || extractDriveFileId(shareUrl);
                const mimeType = f.mimeType || getAttachmentMimeType(f);
                const isPdf = mimeType === 'application/pdf';
                const isVideo = mimeType.startsWith('video/');
                const isImage = mimeType.startsWith('image/') || data.startsWith('data:image') || /\.(jpe?g|png|gif|webp)/i.test(data);

                let previewContent = '';
                if (driveId) {
                    previewContent = `
                        <iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${xmlEscape(String(f.name || 'Attachment'))}" style="width:100%;height:70vh;border:none;border-radius:16px;background:#111"></iframe>
                        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;align-items:center">
                            <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                        </div>`;
                } else if (isPdf) {
                    previewContent = `
                        <iframe src="${shareUrl}" title="${xmlEscape(String(f.name || 'Attachment'))}" style="width:100%;height:70vh;border:none;border-radius:16px;background:#fff"></iframe>
                        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;align-items:center">
                            <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                        </div>`;
                } else if (isVideo) {
                    previewContent = `
                        <video controls playsinline style="width:100%;max-height:70vh;border-radius:16px;background:#000">
                            <source src="${shareUrl}" type="${mimeType}">
                        </video>
                        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;align-items:center">
                            <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                        </div>`;
                } else if (isImage) {
                    previewContent = `
                        <img src="${shareUrl}" alt="${xmlEscape(String(f.name || 'Attachment'))}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:16px;border:1px solid var(--border)">
                        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;align-items:center">
                            <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                        </div>`;
                } else {
                    previewContent = `
                        <p style="color:var(--text3);font-size:13px">Preview is not available for this file type.</p>
                        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;align-items:center">
                            <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                        </div>`;
                }

                openModal(`
                <div class="modal-header">
                    <div><div class="modal-name">${xmlEscape(String(f.name || 'Attachment'))}</div><div class="modal-sub">${getFileTypeLabel(f)}</div></div>
                    <div class="modal-close" onclick="App.closeModal()">✕</div>
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
                    ${previewContent}
                </div>`);
            }
            function editTrailerCustom(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                (settings.customFields || []).filter(f => f.target === 'trailer').forEach(f => {
                    const val = prompt(`Value for "${f.name}":`, (t.custom || {})[f.name] || '');
                    if (val !== null) { if (!t.custom) t.custom = {}; t.custom[f.name] = val; }
                });
                saveAll();
                openTrailerModal(idx);
            }
            function exportTrailerData(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `trailer-${t.id}-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                showToast('Trailer data exported');
            }
            function editTrailerEssentialDetails(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const container = document.getElementById(`trailerEssentialContainer_${idx}`);
                if (!container) return;
                container.innerHTML = `
                    <div style="display:flex;flex-direction:column;grid-column:1/-1">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Trailer ID</label>
                        <input type="text" id="editTrailerId_${idx}" value="${xmlEscape(t.id || '')}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="display:flex;flex-direction:column">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Brand</label>
                        <input type="text" id="editTrailerBrand_${idx}" value="${xmlEscape(t.brand || '')}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="display:flex;flex-direction:column">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Year</label>
                        <input type="text" id="editTrailerYear_${idx}" value="${xmlEscape(String(t.year || ''))}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="grid-column:1/-1;display:flex;flex-direction:column">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Log Book</label>
                        <input type="text" id="editTrailerLogBook_${idx}" value="${xmlEscape(t.logBook || '')}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="grid-column:1/-1;display:flex;gap:8px;margin-top:4px">
                        <button class="btn btn-primary btn-xs" onclick="App.saveTrailerEssentialDetails(${idx})">Save</button>
                        <button class="btn btn-ghost btn-xs" onclick="App.cancelEditTrailerEssentialDetails(${idx})">Cancel</button>
                    </div>`;
                const editBtn = document.getElementById(`editTrailerEssentialBtn_${idx}`);
                if (editBtn) editBtn.style.display = 'none';
            }
            function saveTrailerEssentialDetails(idx) {
                const t = trailers.find(x => x._idx === idx);
                if (!t) return;
                const id = document.getElementById(`editTrailerId_${idx}`)?.value.trim();
                const brand = document.getElementById(`editTrailerBrand_${idx}`)?.value.trim();
                const year = document.getElementById(`editTrailerYear_${idx}`)?.value.trim();
                const logBook = document.getElementById(`editTrailerLogBook_${idx}`)?.value.trim();
                if (!id) { showToast('Trailer ID is required'); return; }
                t.id = id; t.brand = brand || 'N/A'; t.year = year || 'N/A'; t.logBook = logBook || 'N/A';
                saveAll();
                openTrailerModal(idx);
                renderTrailerCards();
                showToast('Trailer details updated');
            }
            function cancelEditTrailerEssentialDetails(idx) { openTrailerModal(idx); }

            function openTruckModal(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                const hl = healthLabel(healthScore(t));
                const customHtml = settings.customFields.filter(f => f.target === 'truck').map(f =>
                    `<div class="info-cell"><div class="il">${f.name}</div><div class="iv">${(t.custom || {})[f.name] || '—'}</div></div>`).join('');
                const trailerIds = Array.from(new Set([
                    ...trailers.map(x => x.id || ''),
                    ...trucks.map(x => x.trailer || ''),
                    ...drivers.map(x => (x.custom || {}).Trailer || '')
                ].filter(Boolean))).sort();
                const trailerOptions = [
                    '<option value="">None</option>',
                    '<option value="__CREATE_NEW__">Create New</option>',
                    ...trailerIds.map(id =>
                        `<option value="${xmlEscape(id)}"${id === t.trailer ? ' selected' : ''}>${xmlEscape(id)}</option>`
                    )
                ].join('');
                openModal(`
            <div class="modal-header">
                <div class="avatar avatar-lg" style="background:rgba(255,255,255,0.05);font-size:20px">🚛</div>
                <div style="flex:1"><div class="modal-name">${formatTruckLabel(t)}</div><div class="modal-sub">${t.brand || 'N/A'} | Health: ${healthScore(t)}% (${hl})</div></div>
                <div class="modal-close" onclick="App.closeModal()">✕</div>
            </div>
            <div class="modal-body">
                <div class="section">
                    <div class="section-title" style="display:flex;align-items:center;gap:6px">
                        Essential Details
                        <span id="editEssentialBtn_${idx}" style="cursor:pointer;font-size:12px;color:var(--text3);transition:color 0.2s;user-select:none" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'" onclick="App.editTruckEssentialDetails(${idx})" title="Edit Details">✎</span>
                    </div>
                    <div id="essentialDetailsContainer_${idx}" style="background:var(--bg3);border-radius:var(--radius-lg);padding:14px;border:1px solid var(--border);display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
                        <div style="display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Chassis No</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text)">${t.chassisNo || 'N/A'}</span>
                        </div>
                        <div style="display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Year</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text)">${t.year || 'N/A'}</span>
                        </div>
                        <div style="grid-column:1/-1;display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Log Book</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text)">${t.logBook || 'N/A'}</span>
                        </div>
                        <div style="grid-column:1/-1;display:flex;flex-direction:column">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Trailer</span>
                            <span style="font-size:13px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:6px">
                                ${t.trailer ? `<span onclick="App.unassignTrailer(${idx})" style="cursor:pointer;color:var(--red);font-weight:bold;margin-right:2px;user-select:none" title="Unassign Trailer">✕</span> ${t.trailer}` : '—'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="section">
                    <div class="section-title">Documents <button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="App.addDocToTruck(${idx});event.stopPropagation()">+ Add</button></div>
                    ${(t.documents || []).map((d, i) => {
                    const st = docStatus(d);
                    return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
                            <span style="color:${st === 'expired' ? 'var(--red)' : st === 'expiring' ? 'var(--amber)' : 'var(--green)'}">●</span>
                            <span style="flex:1">${d.type}</span>
                            <input type="date" value="${d.expiryDate}" onchange="App.updateDocExpiry(${idx},${i},this.value)" style="width:140px">
                            <span class="vtag vtag-${st === 'expired' ? 'high' : st === 'expiring' ? 'medium' : 'low'}">${st}</span>
                            <span style="cursor:pointer" onclick="App.removeDocFromTruck(${idx},${i});event.stopPropagation()">✕</span>
                        </div>`;
                }).join('') || '<p style="color:var(--text3)">No documents</p>'}
                </div>
                <div class="section">
                    <div class="section-title">Attachments <button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="document.getElementById('truckAttachmentInput_${idx}')?.click(); event.stopPropagation()">+ Upload</button></div>
                    <input id="truckAttachmentInput_${idx}" type="file" accept="image/*,application/pdf,.pdf" multiple style="display:none" onchange="App.handleTruckFileUpload(${idx}, this.files)">
                    ${(t.files || []).map(f => `<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:var(--bg2);" onclick="App.previewAttachment('truck', ${idx}, '${f.id}')" style="cursor:pointer">
                        ${getAttachmentThumbnailHtml(f)}
                        <div style="flex:1;min-width:0;overflow:hidden;cursor:pointer">
                            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${xmlEscape(String(f.name || 'Attachment'))}</div>
                            <div style="font-size:11px;color:var(--text3);margin-top:2px">${getFileTypeLabel(f)} &bull; ${f.uploadedAt}</div>
                        </div>
                        <button class="btn btn-ghost btn-xs" title="Preview" onclick="event.stopPropagation(); App.previewAttachment('truck', ${idx}, '${f.id}')">&#128065;</button>
                        <button class="btn btn-ghost btn-xs" title="Download" onclick="event.stopPropagation(); App.downloadAttachment('truck', ${idx}, '${f.id}')">&#8595;</button>
                        <button class="btn btn-ghost btn-xs" title="Rename" onclick="event.stopPropagation(); App.renameAttachment('truck', ${idx}, '${f.id}')">&#9998;</button>
                        <button class="btn btn-ghost btn-xs" title="Delete" onclick="event.stopPropagation(); App.deleteAttachment('truck', ${idx}, '${f.id}')">&#128465;</button>
                    </div>`).join('') || '<p style="color:var(--text3)">No attachments uploaded.</p>'}
                </div>
                <div class="section">
                    <div class="section-title">Mechanical Issues <button class="btn btn-ghost btn-xs" style="margin-left:8px" onclick="App.addIssue(${idx});event.stopPropagation()">+ Add</button></div>
                    ${(t.issues || []).map((iss, i) => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0">
                        <span style="color:${iss.severity === 'high' ? 'var(--red)' : 'var(--amber)'}">●</span>
                        <span style="flex:1">${iss.description}</span><small>${iss.date}</small>
                        <span style="cursor:pointer" onclick="App.removeIssue(${idx},${i});event.stopPropagation()">✕</span>
                    </div>`).join('') || '<p style="color:var(--text3)">No issues</p>'}
                </div>
                <div class="section">
                    <div class="section-title">Fleet Status</div>
                    <div style="display:flex;align-items:center;gap:10px;margin-top:6px">
                        <select id="truckStatusSelect_${idx}" onchange="App.updateTruckStatus(${idx}, this.value)" style="flex:1;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" onclick="event.stopPropagation()">
                            <option value="Active" ${(t.status||'Active')==='Active'?'selected':''}>Active</option>
                            <option value="In Maintenance" ${(t.status||'')==='In Maintenance'?'selected':''}>In Maintenance</option>
                            <option value="On Trip" ${(t.status||'')==='On Trip'?'selected':''}>On Trip</option>
                            <option value="In Yard" ${(t.status||'')==='In Yard'?'selected':''}>In Yard</option>
                        </select>
                        <span class="badge ${(t.status||'Active')==='In Maintenance'?'badge-suspended':(t.status||'Active')==='On Trip'?'badge-trip':'badge-online'}" style="font-size:10px"><span class="dot"></span>${t.status||'Active'}</span>
                    </div>
                </div>
                <div class="section">
                    <div class="section-title">Trailer Assignment</div>
                    <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
                        <div style="display:flex;gap:8px;align-items:center">
                            <select id="truckTrailerInput_${idx}" onchange="App.handleTrailerSelectChange(${idx}, this.value)" style="flex:1;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" onclick="event.stopPropagation()">
                                ${trailerOptions}
                            </select>
                            <button id="deleteTrailerBtn_${idx}" class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); App.deleteTrailerFromFleet(${idx})" style="display:${t.trailer ? 'inline-block' : 'none'};color:var(--red);padding:6px 10px;" title="Delete Trailer from Fleet">✕</button>
                            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.saveTrailerAssignment(${idx})">Save</button>
                        </div>
                        <div id="newTrailerTextInputContainer_${idx}" style="display:none;gap:8px;align-items:center">
                            <input id="newTrailerTextInput_${idx}" type="text" placeholder="Enter New Trailer ID (e.g. RL1234)" style="flex:1;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" onclick="event.stopPropagation()">
                        </div>
                    </div>
                    <p style="font-size:11px;color:var(--text3);margin-top:8px">Select the trailer assigned to this truck. Existing trailer IDs are loaded from the fleet.</p>
                </div>
                ${customHtml ? `<div class="section"><div class="section-title">Custom Fields <button class="btn btn-ghost btn-xs" onclick="App.editTruckCustom(${idx})">Edit</button></div><div class="info-grid">${customHtml}</div></div>` : ''}
            </div>
            <div class="modal-actions">
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                <button class="btn btn-primary btn-sm" onclick="App.startJobCardForTruck('${xmlEscape(t.plate)}')">🧾 Job Card</button>
                <button class="btn btn-ghost btn-sm" onclick="App.exportTruckData(${idx})">Export Truck Data</button>
                <button class="btn btn-danger btn-sm" onclick="App.deleteTruck(${idx})">Delete Truck</button>
            </div>`);
            }
            function addTruckForm() {
                openModal(`
            <div class="modal-header"><h3>Add New Truck</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                    <div><label style="font-size:11px;color:var(--amber)">Number Plate *</label><input type="text" id="newTruckPlate" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="RAC 123 A"></div>
                    <div><label style="font-size:11px;color:var(--amber)">Brand *</label><input type="text" id="newTruckBrand" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="Volvo, Scania, etc"></div>
                    <div><label style="font-size:11px;color:var(--amber)">Chassis No *</label><input type="text" id="newTruckChassisNo" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="Chassis number"></div>
                    <div><label style="font-size:11px;color:var(--amber)">Year of Manufacture *</label><input type="number" id="newTruckYear" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="2020" min="1990" max="2099"></div>
                    <div colspan="2" style="grid-column:1/-1"><label style="font-size:11px;color:var(--amber)">Log Book *</label><input type="text" id="newTruckLogBook" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="Log book number"></div>
                </div>
                <button class="btn btn-primary btn-sm" style="margin-top:16px;width:100%" onclick="App.createTruckFromForm()">Save Truck</button>
            </div>`);
            }
            function createTruckFromForm() {
                const plate = document.getElementById('newTruckPlate')?.value.trim();
                const brand = document.getElementById('newTruckBrand')?.value.trim();
                const chassisNo = document.getElementById('newTruckChassisNo')?.value.trim();
                const year = document.getElementById('newTruckYear')?.value.trim();
                const logBook = document.getElementById('newTruckLogBook')?.value.trim();
                
                if (!plate) { showToast('Number plate is required'); return; }
                if (!brand) { showToast('Brand is required'); return; }
                if (!chassisNo) { showToast('Chassis no is required'); return; }
                if (!year) { showToast('Year of manufacture is required'); return; }
                if (!logBook) { showToast('Log book is required'); return; }
                
                const newT = {
                    _idx: trucks.length ? Math.max(...trucks.map(t => t._idx)) + 1 : 0,
                    plate, brand, chassisNo, year: parseInt(year), logBook,
                    documents: settings.docTypes.map(dt => ({
                        type: dt.name,
                        expiryDate: new Date(Date.now() + dt.months * 30 * 86400000).toISOString().slice(0, 10)
                    })),
                    issues: [],
                    files: [],
                    custom: {}
                };
                trucks.push(newT);
                saveAll();
                closeModal();
                renderTruckCards(); renderTruckMetrics(); updateSidebarBadges();
                showToast('Truck added successfully');
            }
            function deleteTruck(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                if (!confirm(`Move truck "${t.plate || 'Truck'}" to Recycling Bin?`)) return;
                sendToRecycleBin('truck', t.plate || 'Truck', t);
                trucks = trucks.filter(x => x._idx !== idx);
                saveAll();
                closeModal();
                renderTruckCards(); renderTruckMetrics(); updateSidebarBadges();
                showToast('Truck moved to Recycling Bin');
            }
            function updateTruckStatus(idx, newStatus) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                t.status = newStatus;
                saveAll();
                renderTruckCards();
                showToast(`Truck ${t.plate} status set to: ${newStatus}`);
            }
            function updateTruckTrailer(idx, newTrailer) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                const trimmed = String(newTrailer || '').trim();
                if (trimmed) {
                    const existing = trucks.find(x => x._idx !== idx && String(x.trailer || '').trim().toUpperCase() === trimmed.toUpperCase());
                    if (existing) {
                        const confirmReassign = confirm(`Trailer ${trimmed} is already assigned to ${existing.plate}. Reassign it to ${t.plate}?`);
                        if (!confirmReassign) return;
                        existing.trailer = '';
                    }
                }
                t.trailer = trimmed;
                saveAll();
                // refresh UI
                openTruckModal(idx);
                renderTruckCards();
                showToast(`Trailer for ${t.plate} updated to: ${trimmed || '—'}`);
            }
            function handleTrailerSelectChange(idx, val) {
                const textInput = document.getElementById(`newTrailerTextInputContainer_${idx}`);
                const deleteBtn = document.getElementById(`deleteTrailerBtn_${idx}`);
                
                if (val === '__CREATE_NEW__') {
                    if (textInput) textInput.style.display = 'flex';
                    if (deleteBtn) deleteBtn.style.display = 'none';
                    const input = document.getElementById(`newTrailerTextInput_${idx}`);
                    if (input) input.focus();
                } else {
                    if (textInput) textInput.style.display = 'none';
                    if (deleteBtn) {
                        deleteBtn.style.display = val ? 'inline-block' : 'none';
                    }
                }
            }
            function saveTrailerAssignment(idx) {
                const selectEl = document.getElementById(`truckTrailerInput_${idx}`);
                if (!selectEl) return;
                
                let val = selectEl.value;
                if (val === '__CREATE_NEW__') {
                    const inputEl = document.getElementById(`newTrailerTextInput_${idx}`);
                    if (!inputEl) return;
                    val = inputEl.value.trim();
                    if (!val) {
                        showToast('Please enter a trailer ID');
                        return;
                    }
                    // Auto-register in global trailers array if not present
                    const alreadyExists = trailers.some(t => String(t.id || '').trim().toUpperCase() === val.toUpperCase());
                    if (!alreadyExists) {
                        trailers.push({
                            _idx: trailers.length ? Math.max(...trailers.map(x => x._idx)) + 1 : 0,
                            id: val, brand: 'N/A', year: 'N/A', logBook: 'N/A', status: 'Active',
                            documents: [
                                { type: 'Insurance', expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10) },
                                { type: 'Inspection', expiryDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10) }
                            ],
                            issues: [], files: [], custom: {}
                        });
                    }
                }
                updateTruckTrailer(idx, val);
            }
            function deleteTrailerFromFleet(idx) {
                const selectEl = document.getElementById(`truckTrailerInput_${idx}`);
                if (!selectEl) return;
                const trailerId = selectEl.value;
                if (!trailerId || trailerId === '__CREATE_NEW__') return;
                
                if (!confirm(`Are you sure you want to delete trailer "${trailerId}" from the fleet? This will unassign it from all trucks and drivers.`)) return;
                
                trucks.forEach(t => {
                    if (String(t.trailer || '').trim().toUpperCase() === trailerId.trim().toUpperCase()) {
                        t.trailer = '';
                    }
                });
                drivers.forEach(d => {
                    if (d.custom && String(d.custom.Trailer || '').trim().toUpperCase() === trailerId.trim().toUpperCase()) {
                        d.custom.Trailer = '';
                    }
                });
                
                saveAll();
                showToast(`Trailer "${trailerId}" removed from fleet list`);
                
                openTruckModal(idx);
                renderTruckCards();
            }
            function unassignTrailer(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                const oldTrailer = t.trailer;
                t.trailer = '';
                saveAll();
                openTruckModal(idx);
                renderTruckCards();
                showToast(`Trailer "${oldTrailer}" unassigned from truck`);
            }
            function editTruckEssentialDetails(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                const container = document.getElementById(`essentialDetailsContainer_${idx}`);
                if (!container) return;
                
                container.innerHTML = `
                    <div style="display:flex;flex-direction:column;grid-column:1/-1">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Number Plate</label>
                        <input type="text" id="editTruckPlate_${idx}" value="${xmlEscape(t.plate || '')}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="display:flex;flex-direction:column;grid-column:1/-1">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Brand</label>
                        <input type="text" id="editTruckBrand_${idx}" value="${xmlEscape(t.brand || '')}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="display:flex;flex-direction:column">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Chassis No</label>
                        <input type="text" id="editTruckChassisNo_${idx}" value="${xmlEscape(t.chassisNo || '')}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="display:flex;flex-direction:column">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Year</label>
                        <input type="number" id="editTruckYear_${idx}" value="${t.year || ''}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="grid-column:1/-1;display:flex;flex-direction:column">
                        <label style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Log Book</label>
                        <input type="text" id="editTruckLogBook_${idx}" value="${xmlEscape(t.logBook || '')}" style="width:100%;padding:6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text)">
                    </div>
                    <div style="grid-column:1/-1;display:flex;gap:8px;margin-top:4px">
                        <button class="btn btn-primary btn-xs" onclick="App.saveTruckEssentialDetails(${idx})">Save</button>
                        <button class="btn btn-ghost btn-xs" onclick="App.cancelEditTruckEssentialDetails(${idx})">Cancel</button>
                    </div>
                `;
                
                const editBtn = document.getElementById(`editEssentialBtn_${idx}`);
                if (editBtn) editBtn.style.display = 'none';
            }
            function saveTruckEssentialDetails(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                
                const plate = document.getElementById(`editTruckPlate_${idx}`)?.value.trim();
                const brand = document.getElementById(`editTruckBrand_${idx}`)?.value.trim();
                const chassisNo = document.getElementById(`editTruckChassisNo_${idx}`)?.value.trim();
                const year = document.getElementById(`editTruckYear_${idx}`)?.value.trim();
                const logBook = document.getElementById(`editTruckLogBook_${idx}`)?.value.trim();
                
                if (!plate) { showToast('Number plate is required'); return; }
                if (!brand) { showToast('Brand is required'); return; }
                if (!chassisNo) { showToast('Chassis no is required'); return; }
                if (!year) { showToast('Year of manufacture is required'); return; }
                if (!logBook) { showToast('Log book is required'); return; }
                
                t.plate = plate;
                t.brand = brand;
                t.chassisNo = chassisNo;
                t.year = parseInt(year);
                t.logBook = logBook;
                
                saveAll();
                openTruckModal(idx);
                renderTruckCards();
                renderTruckMetrics();
                updateSidebarBadges();
                showToast('Essential details updated successfully');
            }
            function cancelEditTruckEssentialDetails(idx) {
                openTruckModal(idx);
            }
            function addDocToTruck(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                const type = prompt('Document type (e.g. Insurance):');
                if (!type) return;
                const expiry = prompt('Expiry date (YYYY-MM-DD):', new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10));
                if (!expiry) return;
                t.documents.push({ type, expiryDate: expiry });
                saveAll();
                openTruckModal(idx);
                renderTruckCards();
                updateSidebarBadges();
            }
            function updateDocExpiry(truckIdx, docIdx, newDate) {
                const t = trucks.find(x => x._idx === truckIdx);
                if (!t) return;
                t.documents[docIdx].expiryDate = newDate;
                saveAll();
                renderTruckCards();
                updateSidebarBadges();
            }
            function removeDocFromTruck(truckIdx, docIdx) {
                const t = trucks.find(x => x._idx === truckIdx);
                if (!t) return;
                t.documents.splice(docIdx, 1);
                saveAll();
                openTruckModal(truckIdx);
                renderTruckCards();
                updateSidebarBadges();
            }
            function addIssue(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                const desc = prompt('Issue description:');
                if (!desc) return;
                const sev = prompt('Severity (low/medium/high):', 'medium');
                t.issues.push({ description: desc, severity: sev || 'medium', date: new Date().toISOString().slice(0, 10) });
                saveAll();
                openTruckModal(idx);
            }
            function removeIssue(truckIdx, issueIdx) {
                const t = trucks.find(x => x._idx === truckIdx);
                if (!t) return;
                t.issues.splice(issueIdx, 1);
                saveAll();
                openTruckModal(truckIdx);
            }
            function editTruckCustom(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) return;
                settings.customFields.filter(f => f.target === 'truck').forEach(f => {
                    const val = prompt(`Value for "${f.name}":`, t.custom[f.name] || '');
                    if (val !== null) t.custom[f.name] = val;
                });
                saveAll();
                openTruckModal(idx);
            }

            function editDriverCustom(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                settings.customFields.filter(f => f.target === 'driver').forEach(f => {
                    const val = prompt(`Value for "${f.name}":`, (d.custom || {})[f.name] || '');
                    if (val !== null) {
                        if (!d.custom || typeof d.custom !== 'object') d.custom = {};
                        d.custom[f.name] = val;
                    }
                });
                saveAll();
                openDriverModal(idx);
            }

            function editDriverCustomField(idx, fieldName) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) return;
                if (!fieldName) return;
                if (!d.custom || typeof d.custom !== 'object') d.custom = {};
                const current = d.custom[fieldName] || '';
                const val = prompt(`Value for "${fieldName}":`, current);
                if (val === null) return;
                d.custom[fieldName] = val;
                saveAll();
                openDriverModal(idx);
            }

            // ═══════════ VIOLATIONS ═══════════
            function populateViolationFilters() {
                const types = [...new Set((Array.isArray(settings.violationTypes) ? settings.violationTypes : []).map(v => v.name))];
                const filterEl = document.getElementById('violationTypeFilter');
                if (filterEl) {
                    const aliasOptions = [
                        { value: 'Long Hours Driving in a Day', label: 'Long Hours Driving in a Day' },
                        { value: 'Early Driving', label: 'Early Driving' }
                    ];
                    filterEl.innerHTML = '<option value="">All types</option>' +
                        aliasOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('') +
                        types.map(t => `<option value="${t}">${t}</option>`).join('');
                }
            }
            function renderViolationMetrics() {
                const total = drivers.reduce((s, d) => s + d.violations.length, 0);
                const high = drivers.reduce((s, d) => s + d.violations.filter(v => (v.severity || 'low').toLowerCase() === 'high').length, 0);
                const accidents = drivers.reduce((s, d) => s + (Array.isArray(d.accidentsList) ? d.accidentsList.length : 0), 0);
                document.getElementById('violationMetrics').innerHTML = `
            <div class="metric-card c-red"><div class="metric-label">Total Violations</div><div class="metric-value">${total}</div></div>
            <div class="metric-card c-amber"><div class="metric-label">High Severity</div><div class="metric-value">${high}</div></div>
            <div class="metric-card c-purple"><div class="metric-label">Accidents</div><div class="metric-value">${accidents}</div></div>`;
            }
            function switchViolationSubpage(subpage) {
                violationSubpage = subpage;
                const host = document.getElementById('violationSubpageContent');
                if (host) {
                    host.classList.toggle('accident-subpage-active', subpage === 'accidents');
                }
                ['violations', 'accidents'].forEach(key => {
                    const btn = document.getElementById(`violationTab-${key}`);
                    if (btn) btn.classList.toggle('active', key === subpage);
                });
                renderViolationSubpage();
            }
            function renderViolationSubpage() {
                const host = document.getElementById('violationSubpageContent');
                if (!host) return;
                if (violationSubpage === 'accidents') {
                    renderAccidentsSubpage();
                    return;
                }
                host.innerHTML = `
                    <div class="toolbar">
                        <div class="search-wrap"><span class="search-icon">⌕</span><input type="text" id="violationSearch" placeholder="Search violations…" oninput="App.renderViolationList()"></div>
                        <select id="violationTypeFilter" onchange="App.renderViolationList()"><option value="">All types</option></select>
                        <select id="violationSeverityFilter" onchange="App.renderViolationList()">
                            <option value="">All severities</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                        </select>
                        <div style="display:flex;align-items:center;gap:6px"><label style="font-size:11px;color:var(--text3)">From</label><input type="date" id="violationDateFrom" onchange="App.renderViolationList()" style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);color:var(--text);font-size:12px"></div>
                        <div style="display:flex;align-items:center;gap:6px"><label style="font-size:11px;color:var(--text3)">To</label><input type="date" id="violationDateTo" onchange="App.renderViolationList()" style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);color:var(--text);font-size:12px"></div>
                        <div class="toolbar-right"><button class="btn btn-primary btn-sm" onclick="App.openAddViolationModal()">+ Add Violation</button></div>
                    </div>
                    <div id="violationListContainer" style="background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;"></div>
                    <div class="pagination" id="violationPagination"></div>`;
                populateViolationFilters();
                renderViolationList();
            }
            function parseAccidentDateValue(value) {
                if (!value) return null;
                const trimmed = String(value).trim();
                if (!trimmed) return null;
                if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                    const [y, m, d] = trimmed.split('-').map(Number);
                    return new Date(y, m - 1, d);
                }
                const parsed = new Date(trimmed);
                return Number.isNaN(parsed.getTime()) ? null : parsed;
            }
            function getAccidentDateRange() {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (accidentPeriodFilter === 'week') {
                    const start = new Date(today);
                    const day = today.getDay();
                    const diff = day === 0 ? -6 : 1 - day;
                    start.setDate(today.getDate() + diff);
                    const end = new Date(start);
                    end.setDate(start.getDate() + 7);
                    return { start, end };
                }
                if (accidentPeriodFilter === 'month') {
                    const start = new Date(today.getFullYear(), today.getMonth(), 1);
                    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1);
                    return { start, end };
                }
                if (accidentPeriodFilter === 'year') {
                    const start = new Date(today.getFullYear(), 0, 1);
                    const end = new Date(today.getFullYear() + 1, 0, 1);
                    return { start, end };
                }
                if (accidentPeriodFilter === 'custom') {
                    const start = accidentDateRangeStart ? new Date(accidentDateRangeStart + 'T00:00:00') : null;
                    const end = accidentDateRangeEnd ? new Date(accidentDateRangeEnd + 'T23:59:59') : null;
                    return { start, end };
                }
                return null;
            }
            function captureAccidentFilterState() {
                const periodEl = document.getElementById('accidentPeriodFilter');
                if (periodEl) accidentPeriodFilter = periodEl.value || accidentPeriodFilter;
                const fromEl = document.getElementById('accidentDateFrom');
                const toEl = document.getElementById('accidentDateTo');
                if (fromEl) accidentDateRangeStart = fromEl.value || '';
                if (toEl) accidentDateRangeEnd = toEl.value || '';
            }
            function handleAccidentPeriodFilter(value) {
                accidentPeriodFilter = value || 'year';
                if (accidentPeriodFilter !== 'custom') {
                    accidentDateRangeStart = '';
                    accidentDateRangeEnd = '';
                }
                renderAccidentsSubpage();
            }
            function handleAccidentDateFilter() {
                captureAccidentFilterState();
                renderAccidentsSubpage();
            }
            function renderAccidentsSubpage() {
                captureAccidentFilterState();
                const host = document.getElementById('violationSubpageContent');
                if (!host) return;
                const list = drivers.flatMap(d => (Array.isArray(d.accidentsList) ? d.accidentsList.map((a, i) => ({ ...a, driver: d, driverIdx: d._idx, accidentIdx: i })) : []));
                const search = (document.getElementById('accidentSearch')?.value || '').trim().toLowerCase();
                const range = getAccidentDateRange();
                const visibleList = list.filter(item => {
                    const text = `${item.driver?.name || ''} ${item.truckPlate || item.driver?.license_plate || ''} ${item.description || ''}`.toLowerCase();
                    const matchesSearch = !search || text.includes(search);
                    const dateValue = parseAccidentDateValue(item.date);
                    let matchesPeriod = true;
                    if (range) {
                        if (range.start && range.end) {
                            matchesPeriod = dateValue && dateValue >= range.start && dateValue <= range.end;
                        } else if (range.start) {
                            matchesPeriod = !!dateValue && dateValue >= range.start;
                        } else if (range.end) {
                            matchesPeriod = !!dateValue && dateValue <= range.end;
                        }
                    }
                    return matchesSearch && matchesPeriod;
                }).sort((a, b) => {
                    const da = parseAccidentDateValue(a.date);
                    const db = parseAccidentDateValue(b.date);
                    if (da && db) return db - da;
                    if (da) return -1;
                    if (db) return 1;
                    return String(a.driver?.name || '').localeCompare(String(b.driver?.name || ''));
                });
                host.innerHTML = `
                    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">
                        <div>
                            <div style="font-size:12px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em">Incident Log</div>
                            <div style="font-size:18px;font-family:var(--font-display);font-weight:700;color:var(--text)">Accidents &amp; Incidents</div>
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="App.openAddAccidentModal()">+ Add Accident</button>
                    </div>
                    <div class="toolbar" style="margin-bottom:12px;flex-wrap:wrap;gap:10px">
                        <div class="search-wrap"><span class="search-icon">⌕</span><input type="text" id="accidentSearch" placeholder="Search by driver or truck…" value="${xmlEscape(String(document.getElementById('accidentSearch')?.value || ''))}" oninput="App.renderAccidentsSubpage()" style="min-width:220px"></div>
                        <select id="accidentPeriodFilter" onchange="App.handleAccidentPeriodFilter(this.value)" style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);color:var(--text);font-size:12px">
                            <option value="week" ${accidentPeriodFilter === 'week' ? 'selected' : ''}>This week</option>
                            <option value="month" ${accidentPeriodFilter === 'month' ? 'selected' : ''}>This month</option>
                            <option value="year" ${accidentPeriodFilter === 'year' ? 'selected' : ''}>This year</option>
                            <option value="custom" ${accidentPeriodFilter === 'custom' ? 'selected' : ''}>Custom dates</option>
                        </select>
                        <div id="accidentCustomDateRange" style="display:${accidentPeriodFilter === 'custom' ? 'flex' : 'none'};align-items:center;gap:8px;flex-wrap:wrap">
                            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:11px;color:var(--text3)">From</label><input type="date" id="accidentDateFrom" value="${xmlEscape(String(accidentDateRangeStart))}" onchange="App.handleAccidentDateFilter()" style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);color:var(--text);font-size:12px"></div>
                            <div style="display:flex;align-items:center;gap:6px"><label style="font-size:11px;color:var(--text3)">To</label><input type="date" id="accidentDateTo" value="${xmlEscape(String(accidentDateRangeEnd))}" onchange="App.handleAccidentDateFilter()" style="padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg3);color:var(--text);font-size:12px"></div>
                        </div>
                    </div>
                    <div style="display:grid;gap:12px">
                        ${visibleList.length ? visibleList.map(item => `
                            <div class="accident-card" style="background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px">
                                <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
                                    <div>
                                        <div class="accident-badge" style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em">Driver</div>
                                        <div style="font-size:15px;font-weight:700;color:var(--text)">${xmlEscape(String(item.driver?.name || 'Unknown'))}</div>
                                    </div>
                                    <div>
                                        <div class="accident-badge" style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em">Truck Plate</div>
                                        <div style="font-size:15px;font-weight:700;color:var(--accent)">${xmlEscape(String(item.truckPlate || item.driver?.license_plate || '—'))}</div>
                                    </div>
                                    <div style="text-align:right">
                                        <div class="accident-badge" style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em">Date</div>
                                        <div style="font-size:13px;font-weight:600;color:var(--text2)">${item.date || '—'}</div>
                                    </div>
                                </div>
                                <div style="font-size:13px;color:var(--text2);line-height:1.6">${xmlEscape(String(item.description || 'No details recorded.'))}</div>
                                ${item.measuresTaken ? `
                                    <div style="margin-top:8px;padding:10px;border-left:3px solid var(--green);background:rgba(34,201,122,0.06);border-radius:6px;font-size:12px;color:var(--text2)">
                                        <strong>Measures Taken:</strong> ${xmlEscape(String(item.measuresTaken))}
                                    </div>` : ''}
                                ${item.files && item.files.length ? `
                                    <div style="display:flex;flex-direction:column;gap:8px">
                                        <div style="font-size:11px;color:var(--text3);font-weight:700;text-transform:uppercase;letter-spacing:0.04em">Attached Files</div>
                                        <div style="display:flex;flex-direction:column;gap:8px">
                                            ${item.files.map(f => `
                                                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;border:1px solid var(--border);border-radius:10px;background:var(--bg3)">
                                                    <div style="display:flex;align-items:center;gap:10px;min-width:0">
                                                        ${getAttachmentThumbnailHtml(f)}
                                                        <div style="min-width:0">
                                                            <div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${xmlEscape(String(f.name || 'Attachment'))}</div>
                                                            <div style="font-size:10px;color:var(--text3)">${getFileTypeLabel(f)} • ${f.uploadedAt || '—'}</div>
                                                        </div>
                                                    </div>
                                                    <div style="display:flex;gap:6px;flex-shrink:0">
                                                        <button class="btn btn-ghost btn-xs" onclick="App.previewAccidentAttachment(${item.driverIdx}, ${item.accidentIdx}, '${f.id}')">Preview</button>
                                                        <button class="btn btn-ghost btn-xs" onclick="App.downloadAccidentAttachment(${item.driverIdx}, ${item.accidentIdx}, '${f.id}')">Download</button>
                                                    </div>
                                                </div>`).join('')}
                                        </div>
                                    </div>` : '<div style="font-size:12px;color:var(--text3)">No attachments uploaded.</div>'}
                                <div style="display:flex;justify-content:flex-end;gap:8px">
                                    <button class="btn btn-ghost btn-xs" style="color:var(--accent)" onclick="App.openEditAccidentModal(${item.driverIdx}, ${item.accidentIdx})">✎ Edit</button>
                                    <button class="btn btn-ghost btn-xs" style="color:var(--red)" onclick="App.deleteAccidentEntry(${item.driverIdx}, ${item.accidentIdx})">Delete</button>
                                </div>
                            </div>`).join('') : '<div class="empty-state"><div class="e-icon">🚗</div><p>No accident records match the current filters.</p></div>'}
                    </div>`;
            }
            function renderViolationList() {
                const search = (document.getElementById('violationSearch')?.value || '').toLowerCase();
                const typeF = document.getElementById('violationTypeFilter')?.value || '';
                const sevF = document.getElementById('violationSeverityFilter')?.value || '';
                const dateFrom = document.getElementById('violationDateFrom')?.value || '';
                const dateTo = document.getElementById('violationDateTo')?.value || '';
                let allViolations = [];

                const matchesViolationType = (violationType, selectedType) => {
                    if (!selectedType) return true;
                    const selectedValue = String(selectedType).trim().toLowerCase();
                    const violationValue = String(violationType || '').trim().toLowerCase();
                    const aliasMap = {
                        'long hours driving in a day': ['excess driving hours'],
                        'early driving': ['early morning driving'],
                        'excess driving hours': ['excess driving hours', 'long hours driving in a day'],
                        'early morning driving': ['early morning driving', 'early driving']
                    };
                    const aliasList = aliasMap[selectedValue] || [selectedValue];
                    return aliasList.includes(violationValue);
                };

                const parseDateValue = (value) => {
                    if (!value) return null;
                    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
                        const [y, m, d] = value.trim().split('-').map(Number);
                        return new Date(y, m - 1, d);
                    }
                    const parsed = new Date(value);
                    return Number.isNaN(parsed.getTime()) ? null : parsed;
                };

                drivers.forEach(d => {
                    d.violations.forEach((v, vi) => allViolations.push({
                        ...v,
                        truckPlate: v.truckPlate || d.license_plate || 'Unassigned',
                        driverName: d.name,
                        driverId: d.id,
                        driverIdx: d._idx,
                        violationIdx: vi
                    }));
                });
                allViolations = allViolations.filter(v => {
                    const dateValue = parseDateValue(v.date);
                    const startDate = parseDateValue(dateFrom);
                    const endDate = parseDateValue(dateTo);
                    const matchesDate = !startDate && !endDate ? true :
                        startDate && !endDate ? dateValue >= startDate :
                        !startDate && endDate ? dateValue <= endDate :
                        startDate && endDate ? (dateValue >= startDate && dateValue <= endDate) : true;
                    return (!search || (v.type || '').toLowerCase().includes(search) || (v.driverName || '').toLowerCase().includes(search) || (v.truckPlate || '').toLowerCase().includes(search))
                        && matchesViolationType(v.type, typeF)
                        && (!sevF || (v.severity || 'low').toLowerCase() === sevF)
                        && matchesDate;
                });
                allViolations.sort((a, b) => (new Date(b.date || 0) - new Date(a.date || 0)));
                const total = allViolations.length;
                const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
                if (violationPage > totalPages) violationPage = 1;
                const paged = allViolations.slice((violationPage - 1) * PAGE_SIZE, violationPage * PAGE_SIZE);
                const listHost = document.getElementById('violationListContainer');
                if (!listHost) return;
                listHost.innerHTML = `
            <div style="overflow-x:auto">
                <table style="width:100%;border-collapse:collapse;font-size:12px">
                    <thead><tr style="background:var(--bg3);text-align:left">
                        <th style="padding:12px 14px;color:var(--text3);text-transform:uppercase;font-size:10px">Date</th>
                        <th style="padding:12px 14px;color:var(--text3);text-transform:uppercase;font-size:10px">Driver</th>
                        <th style="padding:12px 14px;color:var(--text3);text-transform:uppercase;font-size:10px">Truck Plate</th>
                        <th style="padding:12px 14px;color:var(--text3);text-transform:uppercase;font-size:10px">Type</th>
                        <th style="padding:12px 14px;color:var(--text3);text-transform:uppercase;font-size:10px">Severity</th>
                        <th style="padding:12px 14px;color:var(--text3);text-transform:uppercase;font-size:10px">Action Taken</th>
                        <th style="padding:12px 14px;color:var(--text3);text-transform:uppercase;font-size:10px">Actions</th>
                    </tr></thead>
                    <tbody>${paged.length === 0 ? `<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text3)">No violations found.</td></tr>` :
                        paged.map(v => {
                            const sevColor = v.severity === 'high' ? 'var(--red)' : v.severity === 'medium' ? 'var(--amber)' : 'var(--green)';
                            return `<tr style="border-bottom:1px solid var(--border)">
                            <td style="padding:10px 14px;font-family:var(--font-mono)">${xmlEscape(v.date || '—')}</td>
                            <td style="padding:10px 14px;cursor:pointer;color:var(--accent2)" onclick="App.openDriverModal(${v.driverIdx})">${xmlEscape(v.driverName || 'Unknown')}</td>
                            <td style="padding:10px 14px;font-weight:600;color:var(--accent)">${xmlEscape(v.truckPlate || '—')}</td>
                            <td style="padding:10px 14px">${xmlEscape(v.type || 'Violation')}</td>
                            <td style="padding:10px 14px"><span style="color:${sevColor};font-weight:500">${xmlEscape(v.severity || 'low')}</span></td>
                            <td style="padding:10px 14px;color:var(--text2);font-size:11px">${xmlEscape(v.actionTaken || '—')}</td>
                            <td style="padding:10px 14px;display:flex;gap:6px">
                                <button class="btn btn-ghost btn-xs btn-icon" onclick="App.showEditViolationForm(${v.driverIdx},${v.violationIdx})" title="Edit" style="color:var(--accent)">✎</button>
                                <button class="btn btn-ghost btn-xs btn-icon" onclick="App.removeViolation(${v.driverIdx},${v.violationIdx})" title="Delete" style="color:var(--red)">✕</button>
                            </td>
                        </tr>`;
                        }).join('')}</tbody>
                </table>
            </div>`;
                const pager = document.getElementById('violationPagination');
                if (pager) pager.innerHTML = totalPages > 1 ? `
            <button class="page-btn" onclick="App.changeViolationPage(-1)" ${violationPage === 1 ? 'disabled' : ''}>← Prev</button>
            <span class="page-info">${violationPage} / ${totalPages}</span>
            <button class="page-btn" onclick="App.changeViolationPage(1)" ${violationPage >= totalPages ? 'disabled' : ''}>Next →</button>` : '';
            }
            function changeViolationPage(dir) {
                const totalViolations = drivers.reduce((s, d) => s + d.violations.length, 0);
                const totalPages = Math.max(1, Math.ceil(totalViolations / PAGE_SIZE));
                violationPage = Math.max(1, Math.min(totalPages, violationPage + dir));
                renderViolationList();
            }
            function findDriverByQuery(query) {
                const search = String(query || '').trim().toLowerCase();
                if (!search) return null;
                const matchesDriver = d => {
                    const trailer = (getTrailerForPlate(d.license_plate || d.id) || '').toLowerCase();
                    return (d.license_plate || '').toLowerCase() === search ||
                        (d.id || '').toLowerCase() === search ||
                        (d.name || '').toLowerCase() === search ||
                        trailer === search;
                };
                const includesDriver = d => {
                    const trailer = (getTrailerForPlate(d.license_plate || d.id) || '').toLowerCase();
                    return (d.license_plate || '').toLowerCase().includes(search) ||
                        (d.id || '').toLowerCase().includes(search) ||
                        (d.name || '').toLowerCase().includes(search) ||
                        trailer.includes(search);
                };
                const exactMatch = drivers.find(matchesDriver);
                if (exactMatch) return exactMatch;
                const partial = drivers.filter(includesDriver);
                if (partial.length === 1) return partial[0];
                return partial.length ? partial : null;
            }

            function openAddViolationModal() {
                const driverOptions = drivers.map(d => `<option value="${d.license_plate}">${d.name} · ${formatDriverVehicleLabel(d)}</option>`).join('');
                openModal(`
            <div class="modal-header"><h3>Add Violation</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
                <label>Driver name or truck plate</label>
                <input type="text" id="addVDriverSearch" placeholder="Type plate or driver name" list="driverMatches" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">
                <datalist id="driverMatches">${driverOptions}</datalist>
                <button class="btn btn-primary btn-sm" onclick="App.selectAddViolationDriver()">Continue</button>
                <div style="font-size:12px;color:var(--text3);">Search by truck/trailer plate, driver ID, or driver name.</div>
            </div>`);
            }

            function selectAddViolationDriver() {
                const query = document.getElementById('addVDriverSearch')?.value || '';
                const match = findDriverByQuery(query);
                if (!match) return showToast('No matching driver found. Try the truck plate or full driver name.');
                if (Array.isArray(match)) return showToast('Multiple matches found. Please type a full plate number or full driver name.');
                showAddViolationForm(match._idx);
            }

            function openAddAccidentModal() {
                const driverOptions = drivers.map(d => `<option value="${d.name}">${d.name} · ${formatDriverVehicleLabel(d)}</option>`).join('');
                pendingAccidentFiles = [];
                openModal(`
                <div class="modal-header"><h3>Add Accident</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
                    <label>Driver's name</label>
                    <input type="text" id="addAccidentDriverSearch" placeholder="Type driver name" list="accidentDriverMatches" oninput="App.syncAccidentDriverSelection()" onchange="App.syncAccidentDriverSelection()" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">
                    <datalist id="accidentDriverMatches">${driverOptions}</datalist>
                    <label>Truck plate number</label>
                    <input type="text" id="addAccidentTruckPlate" placeholder="Plate will fill automatically" readonly style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">
                    <label>Date</label>
                    <input type="date" id="addAccidentDate" value="${new Date().toISOString().slice(0, 10)}" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">
                    <label>Description</label>
                    <textarea id="addAccidentDescription" rows="4" placeholder="Describe the incident" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)"></textarea>
                    <label>Measures Taken</label>
                    <textarea id="addAccidentMeasures" rows="3" placeholder="Measures taken after the accident" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)"></textarea>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('accidentFilesInput').click()">📎 Add File</button>
                        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('accidentVideoInput').click()">🎬 Add Video</button>
                        <input id="accidentFilesInput" type="file" accept="image/*,application/pdf,.pdf" multiple style="display:none" onchange="App.handleAccidentFileSelection(this.files)">
                        <input id="accidentVideoInput" type="file" accept="video/*,.mp4,.mov,.webm,.m4v" multiple style="display:none" onchange="App.handleAccidentVideoSelection(this.files)">
                    </div>
                    <div style="font-size:11px;color:var(--text3)">Add files for images or PDFs, or add video clips for the incident. Videos must be 60 seconds or less.</div>
                    <div id="accidentSelectedFiles" style="font-size:12px;color:var(--text2)"></div>
                    <button id="saveAccidentButton" class="btn btn-primary btn-sm" onclick="App.saveAccidentFromForm()">Save Accident</button>
                </div>`);
            }
            function syncAccidentDriverSelection() {
                const driverInput = document.getElementById('addAccidentDriverSearch');
                const plateInput = document.getElementById('addAccidentTruckPlate');
                if (!driverInput || !plateInput) return;
                const query = (driverInput.value || '').trim();
                if (!query) {
                    plateInput.value = '';
                    return;
                }
                const match = findDriverByQuery(query);
                if (match && !Array.isArray(match)) {
                    plateInput.value = match.license_plate || '';
                }
            }
            function getAccidentFileExtension(file) {
                const name = String(file?.name || '');
                const match = name.match(/\.([a-z0-9]+)$/i);
                if (match) return match[1].toLowerCase();
                if (file?.type === 'application/pdf') return 'pdf';
                if (file?.type?.startsWith('video/')) return 'mp4';
                if (file?.type?.startsWith('image/')) return 'jpg';
                return 'bin';
            }
            function sanitizeAccidentFileName(value, file) {
                const raw = String(value || '').trim();
                const clean = raw.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_') || 'attachment';
                const ext = getAccidentFileExtension(file);
                return clean.includes('.') ? clean : `${clean}.${ext}`;
            }
            function buildPendingAccidentAttachment(file) {
                return {
                    file,
                    name: sanitizeAccidentFileName(file?.name || 'Attachment', file),
                    size: file?.size || 0,
                    lastModified: file?.lastModified || 0,
                    type: file?.type || ''
                };
            }
            function mergeAccidentAttachments(files) {
                const nextFiles = Array.from(files || []);
                if (!nextFiles.length) return;
                const seen = new Set(pendingAccidentFiles.map(f => `${f.name}:${f.size}:${f.lastModified}`));
                nextFiles.forEach(file => {
                    const key = `${file.name}:${file.size}:${file.lastModified}`;
                    if (!seen.has(key)) {
                        pendingAccidentFiles.push(buildPendingAccidentAttachment(file));
                        seen.add(key);
                    }
                });
            }
            function renameAccidentFileAt(i) {
                const item = pendingAccidentFiles[i];
                if (!item) return;
                const currentName = item.name || item.file?.name || 'Attachment';
                const renamed = window.prompt('Rename attachment before upload', currentName);
                if (renamed === null) return;
                const trimmed = String(renamed).trim();
                if (!trimmed) return;
                item.name = sanitizeAccidentFileName(trimmed, item.file);
                updateAccidentFilesDisplay();
            }
            function updateAccidentFilesDisplay() {
                const el = document.getElementById('accidentSelectedFiles');
                if (!el) return;
                if (!pendingAccidentFiles.length) {
                    el.innerHTML = '';
                    return;
                }
                el.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">${
                    pendingAccidentFiles.map((f, i) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);font-size:12px">
                        <span style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${xmlEscape(f.name)}</span>
                        <span style="color:var(--text3);flex-shrink:0;display:flex;align-items:center;gap:6px">
                            <button style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;padding:0;line-height:1" onclick="App.renameAccidentFileAt(${i})" title="Rename">✎</button>
                            <span>${(f.size / 1024).toFixed(0)} KB</span>
                            <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;padding:0 0 0 2px;line-height:1" onclick="App.removeAccidentFileAt(${i})">✕</button>
                        </span>
                    </div>`).join('')
                }</div>`;
            }
            function removeAccidentFileAt(i) {
                pendingAccidentFiles.splice(i, 1);
                updateAccidentFilesDisplay();
            }
            function handleAccidentFileSelection(files) {
                mergeAccidentAttachments(files);
                updateAccidentFilesDisplay();
            }
            function handleAccidentVideoSelection(files) {
                mergeAccidentAttachments(files);
                updateAccidentFilesDisplay();
            }
            async function saveAccidentFromForm() {
                const saveButton = document.getElementById('saveAccidentButton');
                if (saveButton) {
                    saveButton.disabled = true;
                    saveButton.textContent = 'Uploading…';
                }
                const query = document.getElementById('addAccidentDriverSearch')?.value || '';
                const match = findDriverByQuery(query);
                if (!match) {
                    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Accident'; }
                    return showToast('No matching driver found. Try the truck plate or full driver name.');
                }
                if (Array.isArray(match)) {
                    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Accident'; }
                    return showToast('Multiple matches found. Please type a full plate number or full driver name.');
                }
                const truckPlate = document.getElementById('addAccidentTruckPlate')?.value.trim() || match.license_plate || '';
                const date = document.getElementById('addAccidentDate')?.value || new Date().toISOString().slice(0, 10);
                const description = document.getElementById('addAccidentDescription')?.value.trim();
                const measuresTaken = document.getElementById('addAccidentMeasures')?.value.trim() || '';
                if (!description) {
                    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Accident'; }
                    return showToast('Please add an incident description.');
                }
                if (!match.accidentsList) match.accidentsList = [];
                const accidentRecord = {
                    date,
                    description,
                    truckPlate,
                    measuresTaken,
                    files: []
                };
                try {
                    if (pendingAccidentFiles.length) {
                        showUploadLoading('Uploading accident files…');
                        const uploaded = [];
                        for (const entry of pendingAccidentFiles) {
                            const file = entry.file;
                            const validation = await validateAttachmentFile(file);
                            if (!validation.ok) {
                                showToast(validation.error);
                                continue;
                            }
                            const name = entry.name || file.name || `Attachment ${formatDate()}`;
                            const fileId = createFileId();
                            const dataUrl = await readFileAsDataUrl(file);
                            const mimeType = file.type || (isPdfFile(file) ? 'application/pdf' : isVideoFile(file) ? 'video/mp4' : 'image/jpeg');
                            const ext = isPdfFile(file) ? 'pdf' : isVideoFile(file) ? (file.type === 'video/quicktime' ? 'mov' : file.type === 'video/webm' ? 'webm' : 'mp4') : 'jpg';
                            const safeFileName = `${name.replace(/[^\w.-]+/g, '_') || fileId}.${ext}`;
                            let driveUrl = null;
                            let driveId = null;
                            try {
                                const result = await uploadToGoogleDrive({ base64: dataUrlToBase64(dataUrl), fileName: safeFileName, mimeType, folder: `fleetguard/attachments/accident/${match._idx}` });
                                driveUrl = result.url;
                                driveId = result.id || extractDriveFileId(result.url) || undefined;
                            } catch (_) {}
                            uploaded.push({ id: fileId, name, mimeType, uploadedAt: formatDate(), data: driveUrl || dataUrl, driveId });
                        }
                        accidentRecord.files = uploaded;
                    }
                    match.accidentsList.push(accidentRecord);
                    saveAll();
                    closeModal();
                    renderViolationMetrics();
                    renderAccidentsSubpage();
                    showToast('Accident record saved');
                } finally {
                    hideUploadLoading();
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.textContent = 'Save Accident';
                    }
                }
            }
            function previewAccidentAttachment(driverIdx, accidentIdx, fileId) {
                const d = drivers.find(x => x._idx === driverIdx);
                const file = d?.accidentsList?.[accidentIdx]?.files?.find(f => f.id === fileId);
                if (!file) return;
                const shareUrl = resolveDriveUrl(file.data || file.storageUrl || '') || file.data || '';
                const driveId = file.driveId || extractDriveFileId(shareUrl);
                const mimeType = getAttachmentMimeType(file);
                const isPdf = mimeType === 'application/pdf';
                const isVideo = mimeType.startsWith('video/');
                let previewContent = '';
                if (driveId) {
                    previewContent = `<iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${xmlEscape(String(file.name || 'Attachment'))}" style="width:100%;height:70vh;border:none;border-radius:16px;background:#111"></iframe>`;
                } else if (typeof shareUrl === 'string' && shareUrl.startsWith('data:')) {
                    if (isPdf) previewContent = `<iframe src="${shareUrl}" title="${xmlEscape(String(file.name || 'PDF'))}" style="width:100%;height:70vh;border:none;border-radius:16px;background:#fff"></iframe>`;
                    else if (isVideo) previewContent = `<video controls playsinline style="width:100%;max-height:70vh;border-radius:16px;background:#000"><source src="${shareUrl}" type="${mimeType}"></video>`;
                    else previewContent = `<img src="${shareUrl}" alt="${xmlEscape(String(file.name || 'Attachment'))}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:16px;border:1px solid var(--border)">`;
                } else {
                    previewContent = `<p style="color:var(--text3);font-size:13px">Preview unavailable for this attachment.</p>`;
                }
                openModal(`
                    <div class="modal-header"><div><div class="modal-name">${xmlEscape(String(file.name || 'Attachment'))}</div><div class="modal-sub">${getFileTypeLabel(file)} • ${file.uploadedAt || '—'}</div></div><div class="modal-close" onclick="App.closeModal()">✕</div></div>
                    <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
                        ${previewContent}
                        <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
                            <button class="btn btn-primary btn-sm" onclick="App.downloadAccidentAttachment(${driverIdx}, ${accidentIdx}, '${fileId}')">⬇ Download</button>
                            <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                        </div>
                    </div>`);
            }
            function downloadAccidentAttachment(driverIdx, accidentIdx, fileId) {
                const d = drivers.find(x => x._idx === driverIdx);
                const file = d?.accidentsList?.[accidentIdx]?.files?.find(f => f.id === fileId);
                if (!file) return;
                const shareUrl = resolveDriveUrl(file.data || file.storageUrl || '') || file.data || '';
                const driveId = file.driveId || extractDriveFileId(shareUrl);
                const mimeType = getAttachmentMimeType(file);
                const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : mimeType === 'video/mp4' ? 'mp4' : mimeType === 'video/quicktime' ? 'mov' : mimeType === 'video/webm' ? 'webm' : mimeType.startsWith('video/') ? 'mp4' : 'jpg';
                const safeName = (file.name || 'attachment').replace(/[^\w\s.-]/g, '_').trim() || 'attachment';
                const fileName = safeName.includes('.') ? safeName : `${safeName}.${ext}`;
                if (driveId) {
                    const a = document.createElement('a');
                    a.href = `https://drive.google.com/uc?export=download&id=${driveId}`;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.click();
                } else if (typeof shareUrl === 'string' && shareUrl.startsWith('data:')) {
                    const a = document.createElement('a');
                    a.href = shareUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else if (shareUrl) {
                    window.open(shareUrl, '_blank', 'noopener');
                } else {
                    showToast('No file data available to download.');
                }
            }
            function deleteAccidentEntry(driverIdx, accidentIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d || !Array.isArray(d.accidentsList)) return;
                if (!confirm('Delete this accident record?')) return;
                d.accidentsList.splice(accidentIdx, 1);
                saveAll();
                renderViolationMetrics();
                renderAccidentsSubpage();
                showToast('Accident record deleted');
            }

            function openEditAccidentModal(driverIdx, accidentIdx) {
                const d = drivers.find(x => x._idx === driverIdx);
                if (!d || !d.accidentsList || !d.accidentsList[accidentIdx]) return;
                const accident = d.accidentsList[accidentIdx];
                const driverOptions = drivers.map(drv => `<option value="${drv.name}">${drv.name} · ${formatDriverVehicleLabel(drv)}</option>`).join('');
                
                pendingAccidentFiles = [];
                tempEditingAccidentFiles = [...(accident.files || [])];

                openModal(`
                <div class="modal-header"><h3>Edit Accident</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:10px">
                    <label>Driver's name</label>
                    <input type="text" id="editAccidentDriverSearch" value="${xmlEscape(d.name)}" placeholder="Type driver name" list="accidentDriverMatches" oninput="App.syncEditAccidentDriverSelection()" onchange="App.syncEditAccidentDriverSelection()" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">
                    <datalist id="accidentDriverMatches">${driverOptions}</datalist>
                    <label>Truck plate number</label>
                    <input type="text" id="editAccidentTruckPlate" value="${xmlEscape(accident.truckPlate || '')}" placeholder="Plate will fill automatically" readonly style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">
                    <label>Date</label>
                    <input type="date" id="editAccidentDate" value="${accident.date || ''}" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">
                    <label>Description</label>
                    <textarea id="editAccidentDescription" rows="4" placeholder="Describe the incident" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">${xmlEscape(accident.description || '')}</textarea>
                    <label>Measures Taken</label>
                    <textarea id="editAccidentMeasures" rows="3" placeholder="Measures taken after the accident" style="width:100%;padding:10px;border:1px solid var(--border2);border-radius:10px;background:var(--bg3);color:var(--text)">${xmlEscape(accident.measuresTaken || '')}</textarea>
                    
                    <div style="font-size:11px;color:var(--text3);margin-top:6px;font-weight:700">Existing Attachments</div>
                    <div id="editAccidentExistingFiles" style="display:flex;flex-direction:column;gap:6px"></div>

                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px">
                        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('editAccidentFilesInput').click()">📎 Add File</button>
                        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('editAccidentVideoInput').click()">🎬 Add Video</button>
                        <input id="editAccidentFilesInput" type="file" accept="image/*,application/pdf,.pdf" multiple style="display:none" onchange="App.handleEditAccidentFileSelection(this.files)">
                        <input id="editAccidentVideoInput" type="file" accept="video/*,.mp4,.mov,.webm,.m4v" multiple style="display:none" onchange="App.handleEditAccidentVideoSelection(this.files)">
                    </div>
                    <div style="font-size:11px;color:var(--text3)">Add files for images or PDFs, or add video clips. Videos must be 60 seconds or less.</div>
                    <div id="editAccidentSelectedFiles" style="font-size:12px;color:var(--text2)"></div>
                    <button id="saveEditAccidentButton" class="btn btn-primary btn-sm" onclick="App.saveEditAccidentForm(${driverIdx}, ${accidentIdx})">Save Changes</button>
                </div>`);

                App.renderEditAccidentExistingFiles();
            }

            function syncEditAccidentDriverSelection() {
                const driverInput = document.getElementById('editAccidentDriverSearch');
                const plateInput = document.getElementById('editAccidentTruckPlate');
                if (!driverInput || !plateInput) return;
                const query = (driverInput.value || '').trim();
                if (!query) {
                    plateInput.value = '';
                    return;
                }
                const match = findDriverByQuery(query);
                if (match && !Array.isArray(match)) {
                    plateInput.value = match.license_plate || '';
                }
            }

            function renderEditAccidentExistingFiles() {
                const container = document.getElementById('editAccidentExistingFiles');
                if (!container) return;
                if (!tempEditingAccidentFiles.length) {
                    container.innerHTML = '<div style="font-size:11px;color:var(--text3)">No existing attachments.</div>';
                    return;
                }
                container.innerHTML = tempEditingAccidentFiles.map((f, i) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);font-size:12px">
                        <span style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${xmlEscape(f.name || 'Attachment')}</span>
                        <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;padding:0 0 0 6px;line-height:1" onclick="App.removeEditAccidentExistingFileAt(${i})">✕</button>
                    </div>
                `).join('');
            }

            function removeEditAccidentExistingFileAt(i) {
                tempEditingAccidentFiles.splice(i, 1);
                App.renderEditAccidentExistingFiles();
            }

            function updateEditAccidentFilesDisplay() {
                const el = document.getElementById('editAccidentSelectedFiles');
                if (!el) return;
                if (!pendingAccidentFiles.length) {
                    el.innerHTML = '';
                    return;
                }
                el.innerHTML = `<div style="display:flex;flex-direction:column;gap:4px;margin-top:4px">${
                    pendingAccidentFiles.map((f, i) => `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);font-size:12px">
                        <span style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${xmlEscape(f.name)}</span>
                        <span style="color:var(--text3);flex-shrink:0;display:flex;align-items:center;gap:6px">
                            <button style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:12px;padding:0;line-height:1" onclick="App.renameAccidentFileAt(${i})" title="Rename">✎</button>
                            <span>${(f.size / 1024).toFixed(0)} KB</span>
                            <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:13px;padding:0 0 0 2px;line-height:1" onclick="App.removeEditAccidentFileAt(${i})">✕</button>
                        </span>
                    </div>`).join('')
                }</div>`;
            }

            function removeEditAccidentFileAt(i) {
                pendingAccidentFiles.splice(i, 1);
                updateEditAccidentFilesDisplay();
            }

            function handleEditAccidentFileSelection(files) {
                mergeAccidentAttachments(files);
                updateEditAccidentFilesDisplay();
            }

            function handleEditAccidentVideoSelection(files) {
                mergeAccidentAttachments(files);
                updateEditAccidentFilesDisplay();
            }

            async function saveEditAccidentForm(originalDriverIdx, accidentIdx) {
                const saveButton = document.getElementById('saveEditAccidentButton');
                if (saveButton) {
                    saveButton.disabled = true;
                    saveButton.textContent = 'Uploading…';
                }
                const query = document.getElementById('editAccidentDriverSearch')?.value || '';
                const match = findDriverByQuery(query);
                if (!match) {
                    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Changes'; }
                    return showToast('No matching driver found. Try the truck plate or full driver name.');
                }
                if (Array.isArray(match)) {
                    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Changes'; }
                    return showToast('Multiple matches found. Please type a full plate number or full driver name.');
                }

                const truckPlate = document.getElementById('editAccidentTruckPlate')?.value.trim() || match.license_plate || '';
                const date = document.getElementById('editAccidentDate')?.value || new Date().toISOString().slice(0, 10);
                const description = document.getElementById('editAccidentDescription')?.value.trim();
                const measuresTaken = document.getElementById('editAccidentMeasures')?.value.trim() || '';
                if (!description) {
                    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Changes'; }
                    return showToast('Please add an incident description.');
                }

                const originalDriver = drivers.find(x => x._idx === originalDriverIdx);
                if (!originalDriver || !originalDriver.accidentsList || !originalDriver.accidentsList[accidentIdx]) {
                    if (saveButton) { saveButton.disabled = false; saveButton.textContent = 'Save Changes'; }
                    return;
                }

                let updatedFiles = [...tempEditingAccidentFiles];

                try {
                    if (pendingAccidentFiles.length) {
                        showUploadLoading('Uploading accident files…');
                        const uploaded = [];
                        for (const entry of pendingAccidentFiles) {
                            const file = entry.file;
                            const validation = await validateAttachmentFile(file);
                            if (!validation.ok) {
                                showToast(validation.error);
                                continue;
                            }
                            const name = entry.name || file.name || `Attachment ${formatDate()}`;
                            const fileId = createFileId();
                            const dataUrl = await readFileAsDataUrl(file);
                            const mimeType = file.type || (isPdfFile(file) ? 'application/pdf' : isVideoFile(file) ? 'video/mp4' : 'image/jpeg');
                            const ext = isPdfFile(file) ? 'pdf' : isVideoFile(file) ? (file.type === 'video/quicktime' ? 'mov' : file.type === 'video/webm' ? 'webm' : 'mp4') : 'jpg';
                            const safeFileName = `${name.replace(/[^\w.-]+/g, '_') || fileId}.${ext}`;
                            let driveUrl = null;
                            let driveId = null;
                            try {
                                const result = await uploadToGoogleDrive({ base64: dataUrlToBase64(dataUrl), fileName: safeFileName, mimeType, folder: `fleetguard/attachments/accident/${match._idx}` });
                                driveUrl = result.url;
                                driveId = result.id || extractDriveFileId(result.url) || undefined;
                            } catch (_) {}
                            uploaded.push({ id: fileId, name, mimeType, uploadedAt: formatDate(), data: driveUrl || dataUrl, driveId });
                        }
                        updatedFiles = updatedFiles.concat(uploaded);
                    }

                    const updatedRecord = {
                        date,
                        description,
                        truckPlate,
                        measuresTaken,
                        files: updatedFiles
                    };

                    if (originalDriverIdx !== match._idx) {
                        originalDriver.accidentsList.splice(accidentIdx, 1);
                        if (!match.accidentsList) match.accidentsList = [];
                        match.accidentsList.push(updatedRecord);
                    } else {
                        originalDriver.accidentsList[accidentIdx] = updatedRecord;
                    }

                    saveAll();
                    closeModal();
                    renderViolationMetrics();
                    renderAccidentsSubpage();
                    showToast('Accident record updated');
                } finally {
                    hideUploadLoading();
                    if (saveButton) {
                        saveButton.disabled = false;
                        saveButton.textContent = 'Save Changes';
                    }
                }
            }

            // ═══════════ SETTINGS ═══════════
            function renderSettings() {
                settings = settings || {};
                const themeInput = document.getElementById('settingTheme');
                const darkModeInput = document.getElementById('settingDarkMode');
                const statusChips = document.getElementById('settingStatusChips');
                const violationChips = document.getElementById('settingViolationChips');
                const docTypeChips = document.getElementById('settingDocTypeChips');
                const customFieldChips = document.getElementById('settingCustomFieldChips');
                if (themeInput) themeInput.value = settings.theme || 'default';
                if (darkModeInput) darkModeInput.value = settings.darkMode === false ? 'false' : 'true';
                const statusList = Array.isArray(settings.driverStatuses) ? settings.driverStatuses : [];
                const violationList = Array.isArray(settings.violationTypes) ? settings.violationTypes : [];
                const docTypeList = Array.isArray(settings.docTypes) ? settings.docTypes : [];
                const customFieldList = Array.isArray(settings.customFields) ? settings.customFields : [];
                if (statusChips) {
                    statusChips.innerHTML = statusList.map((s, i) => `
                <span class="chip"><span style="width:8px;height:8px;border-radius:50%;background:${s.color};display:inline-block"></span>${s.name}
                <span class="chip-remove" onclick="App.removeDriverStatus(${i})">✕</span></span>`).join('');
                }
                if (violationChips) {
                    violationChips.innerHTML = violationList.map((v, i) => `
                <span class="chip severity-${v.severity}">${v.name} <span style="font-size:9px">[${v.severity}]</span>
                <span class="chip-remove" onclick="App.removeViolationType(${i})">✕</span></span>`).join('');
                }
                if (docTypeChips) {
                    docTypeChips.innerHTML = docTypeList.map((d, i) => `
                <span class="chip">📄 ${d.name} <span style="font-size:9px">(${d.months}mo)</span>
                <span class="chip-remove" onclick="App.removeDocType(${i})">✕</span></span>`).join('');
                }
                if (customFieldChips) {
                    customFieldChips.innerHTML = customFieldList.map((f, i) => `
                <span class="chip">${f.target === 'driver' ? '👤' : f.target === 'truck' ? '🚛' : '🛞'} ${f.name}
                <span class="chip-remove" onclick="App.removeCustomField(${i})">✕</span></span>`).join('');
                }
                renderMaintenanceServices();
                updateAdminSectionUI();
            }
            function updateTheme() {
                settings.theme = document.getElementById('settingTheme')?.value || 'default';
                settings.darkMode = document.getElementById('settingDarkMode')?.value === 'true';
                saveAll();
                applyTheme();
            }
            function applyTheme() {
                const root = document.documentElement;
                const isDark = settings.darkMode !== false;

                if (!isDark) {
                    // ── Light mode backgrounds & borders ──
                    root.style.setProperty('--bg', '#f0f2f5');
                    root.style.setProperty('--bg2', '#ffffff');
                    root.style.setProperty('--bg3', '#f4f6f9');
                    root.style.setProperty('--bg4', '#e2e8f0');
                    root.style.setProperty('--border', 'rgba(0,0,0,0.09)');
                    root.style.setProperty('--border2', 'rgba(0,0,0,0.15)');
                    // ── Light mode text ──
                    root.style.setProperty('--text', '#111827');
                    root.style.setProperty('--text2', '#374151');
                    root.style.setProperty('--text3', '#6b7280');

                    // ── Topbar ──
                    document.querySelectorAll('.topbar').forEach(el => {
                        el.style.background = 'rgba(240,242,245,0.95)';
                        el.style.borderBottom = '1px solid rgba(0,0,0,0.09)';
                    });
                    document.querySelectorAll('.topbar-title').forEach(el => {
                        el.style.color = '#111827';
                    });
                    document.querySelectorAll('.topbar-sub').forEach(el => {
                        el.style.color = '#6b7280';
                    });

                    // ── Sidebar ──
                    document.querySelectorAll('.sidebar').forEach(el => {
                        el.style.background = '#ffffff';
                        el.style.borderRight = '1px solid rgba(0,0,0,0.09)';
                    });
                    document.querySelectorAll('.logo-text').forEach(el => el.style.color = '#111827');
                    document.querySelectorAll('.sidebar-section').forEach(el => el.style.color = '#9ca3af');
                    document.querySelectorAll('.sidebar-footer').forEach(el => el.style.color = '#9ca3af');
                    document.querySelectorAll('.nav-item').forEach(el => {
                        if (!el.classList.contains('active')) el.style.color = '#374151';
                    });

                } else {
                    // ── Dark mode backgrounds & borders ──
                    root.style.setProperty('--bg', '#0d0f14');
                    root.style.setProperty('--bg2', '#13161e');
                    root.style.setProperty('--bg3', '#1a1e28');
                    root.style.setProperty('--bg4', '#222635');
                    root.style.setProperty('--border', 'rgba(255,255,255,0.07)');
                    root.style.setProperty('--border2', 'rgba(255,255,255,0.13)');
                    // ── Dark mode text ──
                    root.style.setProperty('--text', '#e8eaf0');
                    root.style.setProperty('--text2', '#8b90a0');
                    root.style.setProperty('--text3', '#565b6e');

                    // ── Topbar ──
                    document.querySelectorAll('.topbar').forEach(el => {
                        el.style.background = 'rgba(13,15,20,0.88)';
                        el.style.borderBottom = '1px solid rgba(255,255,255,0.07)';
                    });
                    document.querySelectorAll('.topbar-title').forEach(el => {
                        el.style.color = '#e8eaf0';
                    });
                    document.querySelectorAll('.topbar-sub').forEach(el => {
                        el.style.color = '#565b6e';
                    });

                    // ── Sidebar ──
                    document.querySelectorAll('.sidebar').forEach(el => {
                        el.style.background = '#13161e';
                        el.style.borderRight = '1px solid rgba(255,255,255,0.07)';
                    });
                    document.querySelectorAll('.logo-text').forEach(el => el.style.color = '#e8eaf0');
                    document.querySelectorAll('.sidebar-section').forEach(el => el.style.color = '#565b6e');
                    document.querySelectorAll('.sidebar-footer').forEach(el => el.style.color = '#565b6e');
                    document.querySelectorAll('.nav-item').forEach(el => {
                        if (!el.classList.contains('active')) el.style.color = '#8b90a0';
                    });
                }

                // ── Colour theme accents ──
                if (settings.theme === 'neon') {
                    root.style.setProperty('--accent', '#e53935');
                    root.style.setProperty('--accent2', '#ff6b6b');
                    root.style.setProperty('--purple', '#e53935');
                } else if (settings.theme === 'oceanic') {
                    root.style.setProperty('--accent', '#3d7fff');
                    root.style.setProperty('--accent2', '#5c9aff');
                    root.style.setProperty('--purple', '#a78bfa');
                } else {
                    // Reset to default accents
                    root.style.setProperty('--accent', '#3d7fff');
                    root.style.setProperty('--accent2', '#5c9aff');
                    root.style.setProperty('--purple', '#a78bfa');
                }
            }

            function saveSettings() {
                settings.riskMediumThreshold = parseInt(document.getElementById('riskMediumThreshold')?.value) || 10;
                settings.riskHighThreshold = parseInt(document.getElementById('riskHighThreshold')?.value) || 24;
                settings.riskHighCountThreshold = parseInt(document.getElementById('riskHighCountThreshold')?.value) || 2;
                saveAll();
            }
            function addDriverStatus() {
                const name = document.getElementById('newStatusName')?.value.trim();
                const color = document.getElementById('newStatusColor')?.value.trim() || '#8b90a0';
                if (!name) return;
                settings.driverStatuses.push({ name, color });
                saveAll(); renderSettings(); populateDriverFilters();
                document.getElementById('newStatusName').value = '';
                document.getElementById('newStatusColor').value = '';
                showToast('Status added');
            }
            function removeDriverStatus(i) { settings.driverStatuses.splice(i, 1); saveAll(); renderSettings(); populateDriverFilters(); }
            function addViolationType() {
                const name = document.getElementById('newViolationType')?.value.trim();
                const severity = document.getElementById('newViolationSeverity')?.value || 'medium';
                if (!name) return;
                settings.violationTypes.push({ name, severity });
                saveAll(); renderSettings(); populateViolationFilters();
                document.getElementById('newViolationType').value = '';
                showToast('Violation type added');
            }
            function removeViolationType(i) { settings.violationTypes.splice(i, 1); saveAll(); renderSettings(); populateViolationFilters(); }
            function addDocType() {
                const name = document.getElementById('newDocTypeName')?.value.trim();
                const months = parseInt(document.getElementById('newDocTypeMonths')?.value) || 12;
                if (!name) return;
                settings.docTypes.push({ name, months });
                saveAll(); renderSettings();
                document.getElementById('newDocTypeName').value = '';
                document.getElementById('newDocTypeMonths').value = '12';
                showToast('Document type added');
            }
            function removeDocType(i) { settings.docTypes.splice(i, 1); saveAll(); renderSettings(); }
            function addCustomField() {
                const name = document.getElementById('newCustomField')?.value.trim();
                const target = document.getElementById('newCustomFieldTarget')?.value || 'driver';
                if (!name) return;
                settings.customFields.push({ name, target });
                saveAll(); renderSettings();
                document.getElementById('newCustomField').value = '';
                showToast('Custom field added');
            }
            function removeCustomField(i) { settings.customFields.splice(i, 1); saveAll(); renderSettings(); }

                // ═══════════ Maintenance / Job Card Management Helpers ═══════════
                function renderMaintenanceServices() {
                    const list = getServiceCatalog();
                    const container = document.getElementById('settingMaintenanceServices');
                    if (!container) return;
                    container.innerHTML = list.map((s, i) => `
                        <span class="chip" style="margin-right:8px">${xmlEscape(s.name)} <span style="font-size:11px;color:var(--text3)">(${getServiceDisplayInterval(s)})</span>
                        <span class="chip-remove" onclick="App.removeMaintenanceService(${i})">✕</span></span>
                    `).join('');
                    const truckSelect = document.getElementById('applyServiceTruckSelect');
                    if (truckSelect) {
                        const opts = trucks.map(t => `<option value="${xmlEscape(t.plate)}">${formatTruckPickerLabel(t)}</option>`).join('');
                        truckSelect.innerHTML = `<option value="">Select truck</option>${opts}`;
                    }
                    const applySelect = document.getElementById('applyServiceSelect');
                    if (applySelect) {
                        applySelect.innerHTML = `<option value="">Select service</option>` + list.map((s, i) => `<option value="${xmlEscape(s.name)}" data-index="${i}">${xmlEscape(s.name)} (${getServiceDisplayInterval(s)})</option>`).join('');
                    }
                    updateApplyDueInputs();
                }

                function addMaintenanceService() {
                    const name = document.getElementById('newServiceName')?.value.trim();
                    const intervalValue = parseInt(document.getElementById('newServiceIntervalValue')?.value) || 0;
                    const intervalUnit = document.getElementById('newServiceIntervalUnit')?.value || 'days';
                    if (!name) return showToast('Service name required');
                    if (intervalValue <= 0) return showToast('Interval must be at least 1');
                    if (!settings.maintenanceServices) settings.maintenanceServices = [];
                    const isDuplicate = settings.maintenanceServices.some(s => normalizeServiceKey(s.name) === normalizeServiceKey(name));
                    if (isDuplicate) return showToast('Service already exists');
                    const obj = { key: normalizeServiceKey(name), name, intervalValue, intervalUnit };
                    settings.maintenanceServices.push(obj);
                    saveAll(); renderSettings();
                    document.getElementById('newServiceName').value = ''; document.getElementById('newServiceIntervalValue').value = '';
                    showToast('Service added');
                }

                function removeMaintenanceService(i) {
                    if (!settings.maintenanceServices) return;
                    settings.maintenanceServices.splice(i, 1);
                    saveAll(); renderSettings();
                    showToast('Service removed');
                }

                function updateApplyDueInputs() {
                    const t = document.getElementById('applyServiceDueType')?.value || 'date';
                    const dateEl = document.getElementById('applyServiceDate');
                    const valEl = document.getElementById('applyServiceDueValue');
                    if (t === 'date') { if (dateEl) dateEl.style.display = ''; if (valEl) valEl.style.display = 'none'; }
                    else { if (dateEl) dateEl.style.display = 'none'; if (valEl) valEl.style.display = ''; }
                }

                function applySelectedServicesToTruck() {
                    const plate = document.getElementById('applyServiceTruckSelect')?.value;
                    if (!plate) return showToast('Select a truck');
                    const svcName = document.getElementById('applyServiceSelect')?.value;
                    if (!svcName) return showToast('Select a service');
                    const dueType = document.getElementById('applyServiceDueType')?.value || 'date';
                    const dueValue = document.getElementById('applyServiceDueValue')?.value;
                    const dateVal = document.getElementById('applyServiceDate')?.value || new Date().toISOString().slice(0,10);
                    const svcList = (settings.maintenanceServices && settings.maintenanceServices.length) ? settings.maintenanceServices : DEFAULT_MAINTENANCE_SERVICES;
                    const s = svcList.find(x => x.name === svcName) || { name: svcName };
                    const trk = trucks.find(t => t.plate === plate);
                    if (!trk) return showToast('Truck not found');
                    if (!trk.lastServices) trk.lastServices = {};
                    if (!trk.maintenanceLog) trk.maintenanceLog = [];
                    trk.lastServices[s.name] = dateVal;
                    if (!trk.lastServicesMeta) trk.lastServicesMeta = {};
                    trk.lastServicesMeta[s.name] = { dueType: dueType, dueValue: dueType === 'date' ? null : dueValue };
                    const jcActive = getActiveJobCardForTruck(plate);
                    if (jcActive) {
                        migrateJobCard(jcActive);
                        const dl = (jcActive.driverLines || []).find(d => normalizeServiceKey(d.name) === normalizeServiceKey(s.name));
                        let mech = (jcActive.mechanicLines || []).find(m => m.driverLineId === (dl ? dl.lineId : null) && (dl ? !m.unplanned : true));
                        const completedAt = dateVal;
                        if (!mech) {
                            const newMech = { driverLineId: dl ? dl.lineId : newLineId(), done: true, actualHours: 0, partsCost: 0, labourCost: 0, actualCost: 0, mechanic: 'Admin', completedAt, notDoneReason: '', unplanned: !dl };
                            jcActive.mechanicLines = jcActive.mechanicLines || [];
                            jcActive.mechanicLines.push(newMech);
                        } else {
                            mech.done = true; mech.completedAt = completedAt; mech.mechanic = mech.mechanic || 'Admin';
                        }
                    }
                    trk.maintenanceLog.push({ date: dateVal, service: s.name, jobCardId: jcActive ? jcActive.id : null, cost: 0, mechanic: 'Admin' });
                    saveAll(); renderJobCardsPage(); renderMaintenanceServices(); showToast('Service applied');
                }

            // ═══════════ ORDERS MODULE ═══════════
            function populateOrderClientFilter() {
                const clients = [...new Set(orders.map(o => o.client).filter(Boolean))];
                const el = document.getElementById('orderClientFilter');
                if (el) {
                    el.innerHTML = '<option value="">All Clients</option>' +
                        clients.map(c => `<option value="${c}">${c}</option>`).join('');
                }
            }

            function setOrderStatusFilter(status) {
                orderStatusFilter = status;
                renderOrders();
            }

            function handleOrderDateFilter(value) {
                orderDateFilter = value;
                const customRange = document.getElementById('orderCustomDateRange');
                if (value === 'custom') {
                    if (customRange) customRange.style.display = 'flex';
                } else {
                    if (customRange) customRange.style.display = 'none';
                    orderDateRangeStart = '';
                    orderDateRangeEnd = '';
                }
                renderOrders();
            }

            function getOrderDateRange(filter) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                if (filter === 'today') {
                    return { start: today, end: tomorrow };
                } else if (filter === 'week') {
                    const weekStart = new Date(today);
                    const day = today.getDay();
                    weekStart.setDate(today.getDate() - day);
                    const weekEnd = new Date(weekStart);
                    weekEnd.setDate(weekStart.getDate() + 7);
                    return { start: weekStart, end: weekEnd };
                } else if (filter === 'month') {
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
                    return { start: monthStart, end: monthEnd };
                } else if (filter === 'year') {
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    const yearEnd = new Date(today.getFullYear() + 1, 0, 1);
                    return { start: yearStart, end: yearEnd };
                } else if (filter === 'custom') {
                    const startEl = document.getElementById('orderDateStart');
                    const endEl = document.getElementById('orderDateEnd');
                    if (startEl?.value && endEl?.value) {
                        const start = new Date(startEl.value);
                        start.setHours(0, 0, 0, 0);
                        const end = new Date(endEl.value);
                        end.setHours(23, 59, 59, 999);
                        return { start, end };
                    }
                }
                return null;
            }

            function renderOrders() {
                // Ensure order status is always derived from assigned truck offload state.
                orders.forEach(o => {
                    o.status = deriveOrderStatus(o);
                });
                
                // Render the dynamic Quick View filters below the header
                const counts = { All: orders.length, Pending: 0, Completed: 0 };
                orders.forEach(o => {
                    if (o.status === 'Pending') counts.Pending++;
                    else if (o.status === 'At Garage' || o.status === 'Completed') counts.Completed++;
                });

                const filters = [
                    { key: '', label: 'All Orders', count: counts.All, color: 'var(--accent)', bg: 'rgba(61,127,255,0.1)' },
                    { key: 'Pending', label: 'Pending', count: counts.Pending, color: 'var(--amber)', bg: 'rgba(245,158,11,0.1)' },
                    { key: 'At Garage', label: 'Completed', count: counts.Completed, color: 'var(--green)', bg: 'rgba(16,185,129,0.1)' }
                ];

                const quickFilterEl = document.getElementById('orderQuickViewFilters');
                if (quickFilterEl) {
                    quickFilterEl.innerHTML = filters.map(f => {
                        const isActive = orderStatusFilter === f.key;
                        return `<div onclick="App.setOrderStatusFilter('${f.key}')" 
                                    style="flex:1;min-width:110px;background:var(--bg3);border:2px solid ${isActive ? f.color : 'var(--border)'};border-radius:12px;padding:12px 14px;cursor:pointer;transition:all 0.2s;position:relative;overflow:hidden;box-shadow:${isActive ? '0 4px 12px ' + f.color + '22' : 'none'}"
                                    onmouseenter="this.style.transform='translateY(-2px)';this.style.borderColor='${f.color}'"
                                    onmouseleave="this.style.transform='none';this.style.borderColor='${isActive ? f.color : 'var(--border)'}'">
                                    <div style="position:absolute;right:-10px;top:-10px;width:40px;height:40px;background:${f.bg};border-radius:50%;z-index:0"></div>
                                    <div style="font-size:22px;font-weight:800;color:var(--text);position:relative;z-index:1">${f.count}</div>
                                    <div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em;margin-top:4px;position:relative;z-index:1;white-space:nowrap">${f.label}</div>
                                    <div style="position:absolute;bottom:0;left:0;height:4px;width:100%;background:${f.color}"></div>
                               </div>`;
                    }).join('');
                }

                const search = (document.getElementById('orderSearch')?.value || '').toLowerCase();
                const clientF = document.getElementById('orderClientFilter')?.value || '';
                const priorityF = document.getElementById('orderPriorityFilter')?.value || '';
                const dateRange = getOrderDateRange(orderDateFilter);
                const grid = document.getElementById('orderCardsGrid');
                if (!grid) return;

                let list = orders.filter(o => {
                    const ms = !search || (o.name || '').toLowerCase().includes(search) || (o.client || '').toLowerCase().includes(search) || (o.orderId || '').toLowerCase().includes(search);
                    const mc = !clientF || o.client === clientF;
                    const mp = !priorityF || (o.priority || 'Medium') === priorityF;
                    const msf = !orderStatusFilter || o.status === orderStatusFilter;
                    let md = true;
                    if (dateRange && orderDateFilter !== '') {
                        const oDate = new Date(o.date);
                        oDate.setHours(0, 0, 0, 0);
                        md = oDate >= dateRange.start && oDate < dateRange.end;
                    }
                    return ms && mc && mp && msf && md;
                });

                if (list.length === 0) {
                    grid.innerHTML = `<div class="empty-state"><div class="e-icon">📦</div><p>No orders match current filters. Click <strong>+ Add Order</strong> to create one.</p></div>`;
                    return;
                }

                const priorityTagClass = { High: 'vtag-high', Medium: 'vtag-medium', Low: 'vtag-low' };
                const statusBadgeClass = {
                    'Pending': 'badge-warn',
                    'Loading': 'badge-idle',
                    'In Transit': 'badge-trip',
                    'At Garage': 'badge-good'
                };
                const statusAccent = {
                    'Pending': 'var(--amber)',
                    'Loading': 'var(--purple)',
                    'In Transit': 'var(--accent)',
                    'At Garage': 'var(--green)'
                };

                grid.innerHTML = list.map(o => {
                    const priority = o.priority || 'Medium';
                    const pClass = priorityTagClass[priority] || 'vtag-medium';
                    const bClass = statusBadgeClass[o.status] || 'badge-warn';
                    const aColor = statusAccent[o.status] || 'var(--amber)';
                    const numAssigned = o.assignedTrucks ? o.assignedTrucks.filter(t => t.active !== false).length : 0;
                    const assignedPreview = (o.assignedTrucks || [])
                        .filter(t => t.active !== false)
                        .map(t => formatTruckLabelFromPlate(t.plate))
                        .slice(0, 3);
                    const trucksPreview = assignedPreview.length
                        ? assignedPreview.join(', ') + (numAssigned > 3 ? ` +${numAssigned - 3} more` : '')
                        : '';
                    
                    // Determine animation class
                    let animationClass = '';
                    if (o.status === 'Pending') animationClass = 'card-pending';
                    else if (o.status === 'At Garage') animationClass = 'card-completed';

                    return `<div class="card ${animationClass}" onclick="App.openOrderDetailsModal(${o._idx})" style="cursor:pointer">
                        <div class="accent-bar" style="background:${aColor}"></div>
                        <div class="card-top" style="margin-bottom:8px">
                            <div class="avatar" style="background:rgba(61,127,255,0.1);font-size:18px">📦</div>
                            <div class="card-info" style="flex:1; min-width:0">
                                <div class="card-title" style="display:flex;flex-direction:column;gap:3px;font-family:var(--font-display);font-size:14px;overflow:hidden;white-space:normal;word-break:break-word">
                                    <span style="color:var(--accent);font-weight:700">${o.name || o.orderId || 'Order'}</span>
                                    <span style="overflow:hidden;text-overflow:ellipsis;opacity:0.75">Client: ${o.client || 'Unknown'}</span>
                                </div>
                            </div>
                            <div onclick="event.stopPropagation()" style="display:flex;align-items:center;flex-shrink:0;margin-left:8px;position:relative">
                                <select onchange="App.updateOrderStatus(${o._idx}, this.value)" class="badge ${bClass}" style="border:1px solid var(--border);outline:none;background:var(--bg3);color:inherit;cursor:pointer;padding:4px 20px 4px 8px;border-radius:6px;font-size:10px;font-weight:700;-webkit-appearance:none;-moz-appearance:none;appearance:none">
                                    <option value="Pending" ${o.status === 'Pending' || o.status === 'Loading' || o.status === 'In Transit' ? 'selected' : ''}>Pending</option>
                                    <option value="At Garage" ${o.status === 'At Garage' ? 'selected' : ''}>Completed</option>
                                </select>
                                <span style="position:absolute;right:8px;font-size:8px;pointer-events:none;color:inherit;opacity:0.8">▼</span>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap">
                            <span class="vtag ${pClass}">▲ ${priority} Priority</span>
                            <span class="vtag" style="background:rgba(13,200,200,0.1);color:var(--teal)">🚛 ${numAssigned} Assigned</span>
                        </div>
                        ${trucksPreview ? `<div style="font-size:11px;color:var(--text2);margin-bottom:8px;line-height:1.5">🚛 ${trucksPreview}</div>` : ''}
                        <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.6">
                            <div style="margin-top:2px">📅 Created: ${o.date || '—'}</div>
                            <div style="margin-top:2px">📌 Status: ${getOrderStatusText(o)}</div>
                        </div>
                        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding-top:8px;border-top:1px solid var(--border)">
                            <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em">🔍 Click for details</span>
                            <button class="btn btn-danger btn-xs" onclick="App.deleteOrder(${o._idx}); event.stopPropagation()">✕ Expunge</button>
                        </div>
                    </div>`;
                }).join('');
            }

            // ── Truck Picker Helpers ──
            function buildTruckPickerHtml(pickerId, excludePlates) {
                const excl = excludePlates || [];
                const availTrucks = trucks.filter(t => t.plate && !excl.includes(t.plate));
                const rows = availTrucks.map(t => {
                    const inMaint = t.status === 'In Maintenance';
                    const searchText = `${t.plate || ''} ${t.brand || ''} ${t.model || ''} ${t.chassisNo || ''}`.toLowerCase();
                    return `<label class="tp-row" data-plate="${t.plate.toLowerCase()}" data-search="${searchText}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;cursor:${inMaint ? 'not-allowed' : 'pointer'};opacity:${inMaint ? '0.45' : '1'};transition:all 0.15s"
                                onmouseenter="if(!this.querySelector('input').disabled){this.style.background='var(--bg3)';this.style.borderColor='var(--accent)'}"
                                onmouseleave="this.style.background='var(--bg4)';this.style.borderColor='var(--border)'">
                                <input type="checkbox" value="${t.plate}" class="tpCb_${pickerId}" ${inMaint ? 'disabled' : ''}
                                    onchange="App.syncPickerFromCheckbox('${pickerId}')"
                                    style="accent-color:var(--accent);width:15px;height:15px;flex-shrink:0;cursor:${inMaint ? 'not-allowed' : 'pointer'}">
                                <span style="font-size:13px;color:var(--text);white-space:nowrap">${formatTruckPickerLabel(t)}</span>
                                ${inMaint ? '<span style="font-size:9px;color:var(--amber);margin-left:auto;white-space:nowrap">🔧 Maintenance</span>'
                                           : '<span style="font-size:9px;color:var(--green);margin-left:auto;white-space:nowrap">✓ Available</span>'}
                            </label>`;
                }).join('');
                return `<div style="display:flex;flex-direction:column;gap:8px" id="truckPicker_${pickerId}">
                    <div style="position:relative">
                        <input type="text" id="tpInput_${pickerId}" placeholder="Search by plate number and add more with commas…"
                            oninput="App.syncPickerFromInput('${pickerId}')"
                            style="width:100%;padding:9px 12px 9px 32px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none;transition:border-color 0.2s"
                            onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
                        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none">🔍</span>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 2px">
                        <span style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em">Fleet Trucks</span>
                        <span id="tpCount_${pickerId}" style="font-size:10px;color:var(--accent);font-weight:700">0 selected</span>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:5px;max-height:170px;overflow-y:auto;padding:2px 0" id="tpList_${pickerId}">
                        ${rows || '<p style="color:var(--text3);font-size:12px;text-align:center;padding:10px 0">No trucks available.</p>'}
                    </div>
                </div>`;
            }

            function toggleTruckPickerRow(pickerId, plate) {
                const cb = document.querySelector(`.tpCb_${pickerId}[value="${plate}"]`);
                if (!cb || cb.disabled) return;
                cb.checked = !cb.checked;
                syncPickerFromCheckbox(pickerId);
            }

            function syncPickerFromInput(pickerId) {
                const input = document.getElementById(`tpInput_${pickerId}`);
                if (!input) return;
                const typed = input.value.split(/[,\n]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
                const cbs = document.querySelectorAll(`.tpCb_${pickerId}`);
                cbs.forEach(cb => {
                    if (!cb.disabled) cb.checked = typed.includes(cb.value.toUpperCase());
                });

                const rawValue = input.value.trim();
                const lastTerm = rawValue.split(/[,\n]+/).map(s => s.trim()).filter(Boolean).pop() || '';
                const searchTerm = lastTerm.toLowerCase();
                const rows = document.querySelectorAll(`#tpList_${pickerId} .tp-row`);
                rows.forEach(row => {
                    const searchText = row.getAttribute('data-search') || '';
                    const shouldShow = !searchTerm || searchText.includes(searchTerm);
                    row.style.display = shouldShow ? 'flex' : 'none';
                });
                updatePickerCount(pickerId);
            }

            function syncPickerFromCheckbox(pickerId) {
                const cbs = document.querySelectorAll(`.tpCb_${pickerId}:checked`);
                const plates = Array.from(cbs).map(cb => cb.value);
                const input = document.getElementById(`tpInput_${pickerId}`);
                if (input) {
                    const nextValue = plates.length ? `${plates.join(', ')}, ` : '';
                    input.value = nextValue;
                }
                const rows = document.querySelectorAll(`#tpList_${pickerId} .tp-row`);
                rows.forEach(row => row.style.display = 'flex');
                updatePickerCount(pickerId);
            }

            function updatePickerCount(pickerId) {
                const cbs = document.querySelectorAll(`.tpCb_${pickerId}:checked`);
                const el = document.getElementById(`tpCount_${pickerId}`);
                if (el) el.textContent = `${cbs.length} selected`;
            }

            function getPickerPlates(pickerId) {
                const cbs = document.querySelectorAll(`.tpCb_${pickerId}:checked`);
                const cbPlates = Array.from(cbs).map(cb => cb.value);
                const input = document.getElementById(`tpInput_${pickerId}`);
                const typed = input ? input.value.split(/[,\n]+/).map(s => s.trim()).filter(Boolean) : [];
                const allKnownPlates = trucks.map(t => t.plate?.toUpperCase()).filter(Boolean);
                const validTyped = typed.filter(p => allKnownPlates.includes(p.toUpperCase()));
                const merged = [...new Set([...cbPlates, ...validTyped.map(p => {
                    const match = trucks.find(t => t.plate.toUpperCase() === p.toUpperCase());
                    return match ? match.plate : p;
                })])];
                return merged;
            }

            function openAddOrderModal() {
                const pickerHtml = buildTruckPickerHtml('newOrder', []);
                openModal(`
                    <div class="modal-header">
                        <div class="avatar avatar-lg" style="background:rgba(61,127,255,0.12);font-size:20px">📦</div>
                        <div style="flex:1"><div class="modal-name">New Cargo Order</div><div class="modal-sub">Create a new logistics contract</div></div>
                        <div class="modal-close" onclick="App.closeModal()">✕</div>
                    </div>
                    <div class="modal-body">
                        <div style="display:flex;flex-direction:column;gap:12px">
                            <div>
                                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Order Name / Load ID *</label>
                                <input type="text" id="newOrderName" style="width:100%;padding:9px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none;transition:border-color 0.2s" placeholder="e.g. Steel Girders Delivery" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
                            </div>
                            <div>
                                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Client Name *</label>
                                <input type="text" id="newOrderClient" style="width:100%;padding:9px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none;transition:border-color 0.2s" placeholder="e.g. Acme Infrastructure" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
                            </div>
                            <div>
                                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Priority Level *</label>
                                <select id="newOrderPriority" style="width:100%;padding:9px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
                                    <option value="Low">🟢 Low Priority</option>
                                    <option value="Medium" selected>🟡 Medium Priority</option>
                                    <option value="High">🔴 High Priority</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:11px;color:var(--text2);display:block;margin-bottom:4px">Assign Fleet Trucks</label>
                                ${pickerHtml}
                            </div>
                            <button class="btn btn-primary btn-sm" style="margin-top:6px;width:100%" onclick="App.createOrderFromForm()">📦 Create Contract Order</button>
                        </div>
                    </div>`);
            }

            function createOrderFromForm() {
                const name = document.getElementById('newOrderName')?.value.trim();
                const client = document.getElementById('newOrderClient')?.value.trim();
                const priority = document.getElementById('newOrderPriority')?.value || 'Medium';

                if (!name) { showToast('⚠ Order name is required'); return; }
                if (!client) { showToast('⚠ Client name is required'); return; }

                // Collect plates from the unified picker
                const selectedPlates = getPickerPlates('newOrder');
                // Filter out maintenance trucks
                const validPlates = selectedPlates.filter(p => {
                    const trk = trucks.find(t => t.plate === p);
                    return !trk || trk.status !== 'In Maintenance';
                });

                const newIdx = orders.length ? Math.max(...orders.map(o => o._idx)) + 1 : 0;
                const orderDate = new Date().toISOString().slice(0, 10);
                const assignedTrucks = validPlates.map(plate => ({
                    plate,
                    status: 'allocated',
                    active: true,
                    allocatedDate: orderDate
                }));

                const newOrder = {
                    _idx: newIdx,
                    orderId: name,
                    name, client, priority,
                    truckPlate: validPlates[0] || '',
                    status: 'Pending',
                    assignedTrucks,
                    date: orderDate
                };
                orders.push(newOrder);
                saveAll();
                closeModal();
                populateOrderClientFilter();
                renderOrders();
                showToast(`✓ Order "${name}" created with ${validPlates.length} truck${validPlates.length !== 1 ? 's' : ''}`);
            }

            function updateOrderStatus(idx, newStatus) {
                const order = orders.find(o => o._idx === idx);
                if (!order) return;

                // Sync active assigned trucks based on the new order status
                if (order.assignedTrucks && order.assignedTrucks.length) {
                    let hasBlocked = false;
                    order.assignedTrucks.forEach(t => {
                        if (t.active !== false) {
                            const trk = trucks.find(x => x.plate === t.plate);
                            if (newStatus === 'In Transit') {
                                if (trk && trk.status === 'In Maintenance') {
                                    showToast(`🚫 Cannot move to In Transit — ${t.plate} is In Maintenance`);
                                    hasBlocked = true;
                                    return;
                                }
                                t.status = 'Transit';
                                if (trk) trk.status = 'On Trip';
                            } else if (newStatus === 'At Garage') {
                                t.status = 'Offloaded';
                                if (trk && trk.status === 'On Trip') trk.status = 'Active';
                            } else if (newStatus === 'Loading') {
                                t.status = 'loaded';
                            } else if (newStatus === 'Pending') {
                                t.status = 'allocated';
                                if (trk && trk.status === 'On Trip') trk.status = 'Active';
                            }
                        }
                    });
                    if (hasBlocked) return;
                } else {
                    // For backwards compatibility if assignedTrucks is empty
                    if (newStatus === 'In Transit' && order.truckPlate) {
                        const trk = trucks.find(t => t.plate === order.truckPlate);
                        if (trk && trk.status === 'In Maintenance') {
                            showToast(`🚫 Cannot move to In Transit — ${order.truckPlate} is In Maintenance`);
                            return;
                        }
                        if (trk) trk.status = 'On Trip';
                    }
                    if (newStatus === 'At Garage' && order.truckPlate) {
                        const trk = trucks.find(t => t.plate === order.truckPlate);
                        if (trk && trk.status === 'On Trip') trk.status = 'Active';
                    }
                }

                if (newStatus === 'At Garage' && !order.completedDate) {
                    order.completedDate = new Date().toISOString().slice(0, 10);
                }

                order.status = deriveOrderStatus(order);
                saveAll();
                renderOrders();
                showToast(`Order status → ${order.status === 'At Garage' ? 'Completed' : order.status}`);
            }

            function deleteOrder(idx) {
                const order = orders.find(o => o._idx === idx);
                if (!order) return;
                if (!confirm(`Move order "${order.ref || order.clientName || 'Order'}" to Recycling Bin?`)) return;
                sendToRecycleBin('order', order.ref || order.clientName || `Order #${order._idx}`, order);
                if (order) {
                    // Release ALL active assigned trucks back to Active if they were On Trip
                    if (order.assignedTrucks && order.assignedTrucks.length) {
                        order.assignedTrucks.forEach(t => {
                            if (t.active !== false) {
                                const trk = trucks.find(x => x.plate === t.plate);
                                if (trk && trk.status === 'On Trip') trk.status = 'Active';
                            }
                        });
                    } else if (order.truckPlate && order.status === 'In Transit') {
                        // Legacy fallback
                        const trk = trucks.find(t => t.plate === order.truckPlate);
                        if (trk && trk.status === 'On Trip') trk.status = 'Active';
                    }
                }
                orders = orders.filter(o => o._idx !== idx);
                saveAll();
                populateOrderClientFilter();
                renderOrders();
                showToast('Order moved to Recycling Bin');
            }

            function openOrderDetailsModal(idx) {
                const o = orders.find(x => x._idx === idx);
                if (!o) return;
                
                if (!o.assignedTrucks) o.assignedTrucks = [];
                
                const priorityTagClass = { High: 'vtag-high', Medium: 'vtag-medium', Low: 'vtag-low' };
                const pClass = priorityTagClass[o.priority || 'Medium'] || 'vtag-medium';
                
                // Build trucks list HTML
                const statusColors = { allocated: 'var(--amber)', loaded: 'var(--purple)', Transit: 'var(--accent)', Offloaded: 'var(--green)' };
                const statusIcons = { allocated: '📋', loaded: '📦', Transit: '🚚', Offloaded: '✅' };
                let trucksHtml = '';
                if (o.assignedTrucks.length === 0) {
                    trucksHtml = `<div style="text-align:center;padding:20px 0">
                        <div style="font-size:28px;margin-bottom:6px">🚛</div>
                        <p style="color:var(--text3);font-size:13px">No trucks assigned to this order yet.</p>
                        <p style="color:var(--text3);font-size:11px;margin-top:4px">Click <strong>+ Add Truck</strong> above to assign fleet vehicles.</p>
                    </div>`;
                } else {
                    // Separate active from historical
                    const activeTrucks = o.assignedTrucks.map((t, i) => ({...t, _tIdx: i})).filter(t => t.active !== false);
                    const historyTrucks = o.assignedTrucks.map((t, i) => ({...t, _tIdx: i})).filter(t => t.active === false);

                    const buildRow = (t, isActive) => {
                        const sColor = statusColors[t.status] || 'var(--text3)';
                        const sIcon = statusIcons[t.status] || '🔹';
                        const truckInfo = trucks.find(x => x.plate === t.plate);
                        const modelLabel = truckInfo && truckInfo.model ? truckInfo.model : '';
                        const selectHtml = isActive
                            ? `<select onchange="App.updateOrderTruckStatus(${idx}, ${t._tIdx}, this.value)" style="padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;cursor:pointer;font-weight:600">
                                   <option value="allocated" ${t.status === 'allocated' ? 'selected' : ''}>📋 Allocated</option>
                                   <option value="loaded" ${t.status === 'loaded' ? 'selected' : ''}>📦 Loaded</option>
                                   <option value="Transit" ${t.status === 'Transit' ? 'selected' : ''}>🚚 Transit</option>
                                   <option value="Offloaded" ${t.status === 'Offloaded' ? 'selected' : ''}>✅ Offloaded</option>
                               </select>`
                            : `<span style="font-size:11px;color:var(--text3);font-style:italic">${t.status}</span>`;

                        // Calculate transit days
                        const allocDate = t.allocatedDate || o.date;
                        const loadDate = t.loadedDate;
                        const offloadDate = t.offloadDate;
                        let transitDays = '—';
                        if (loadDate && offloadDate) {
                            const load = new Date(loadDate);
                            const offload = new Date(offloadDate);
                            const daysInTransit = Math.ceil((offload - load) / (1000 * 60 * 60 * 24));
                            transitDays = `${daysInTransit} day${daysInTransit !== 1 ? 's' : ''}`;
                        }

                        return `<div style="${!isActive ? 'opacity:0.45;' : ''}display:flex;align-items:stretch;gap:12px;padding:12px;background:var(--bg4);border-left:3px solid ${isActive ? sColor : 'var(--border)'};border-radius:8px;transition:all 0.15s"
                                    onmouseenter="if(${isActive}) this.style.background='var(--bg3)'" onmouseleave="this.style.background='var(--bg4)'">
                            <div style="width:36px;height:36px;border-radius:8px;background:${isActive ? sColor : 'var(--border)'}22;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
                                ${isActive ? sIcon : '🚛'}
                            </div>
                            <div style="flex:1;min-width:0">
                                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                                    <span style="font-weight:700;font-size:13px;color:var(--text)">${formatTruckLabelFromPlate(t.plate)}</span>
                                    ${modelLabel ? '<span style="font-size:11px;color:var(--text3)">' + modelLabel + '</span>' : ''}
                                </div>
                                <div style="font-size:10px;color:${isActive ? sColor : 'var(--text3)'};margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.03em">
                                    ${isActive ? '● Active' : '○ Switched Out'}
                                </div>
                                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:6px;font-size:10px">
                                    <div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:5px">
                                        <div style="color:var(--text3);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:2px">Allocated</div>
                                        <div style="color:var(--text2);font-weight:600">${allocDate || '—'}</div>
                                    </div>
                                    <div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:5px">
                                        <div style="color:var(--text3);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:2px">Loaded</div>
                                        <div style="color:var(--text2);font-weight:600">${loadDate || '—'}</div>
                                    </div>
                                    <div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:5px">
                                        <div style="color:var(--text3);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:2px">Offloaded</div>
                                        <div style="color:var(--text2);font-weight:600">${offloadDate || '—'}</div>
                                    </div>
                                    <div style="background:rgba(255,255,255,0.05);padding:6px;border-radius:5px">
                                        <div style="color:var(--text3);text-transform:uppercase;letter-spacing:0.02em;margin-bottom:2px">In Transit</div>
                                        <div style="color:var(--accent);font-weight:600">${transitDays}</div>
                                    </div>
                                </div>
                            </div>
                            <div style="flex-shrink:0;display:flex;flex-direction:column;justify-content:flex-end;min-width:120px">
                                ${selectHtml}
                            </div>
                        </div>`;
                    };

                    let html = activeTrucks.map(t => buildRow(t, true)).join('');
                    if (historyTrucks.length) {
                        html += `<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.05em;padding:10px 0 6px 0;border-top:1px dashed var(--border);margin-top:6px">History — Switched Out</div>`;
                        html += `<div style="display:flex;flex-wrap:wrap;gap:6px;padding-top:4px">`;
                        html += historyTrucks.map(t => {
                            const textLabel = t.switchedTo ? `${formatTruckLabelFromPlate(t.plate)} to ${formatTruckLabelFromPlate(t.switchedTo)}` : formatTruckLabelFromPlate(t.plate);
                            return `<div style="display:inline-flex;align-items:center;padding:4px 10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;font-size:11px;color:var(--text2);font-weight:500;opacity:0.7;transition:all 0.15s"
                                        onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.7'">
                                <span>${textLabel}</span>
                            </div>`;
                        }).join('');
                        html += `</div>`;
                    }
                    trucksHtml = html;
                }
                
                openModal(`
                    <div class="modal-header">
                        <div class="avatar avatar-lg" style="background:rgba(61,127,255,0.1);font-size:20px">📦</div>
                        <div style="flex:1">
                            <div class="modal-name" style="display:flex;flex-direction:column;gap:6px">
                                <span style="color:var(--accent);font-weight:700">${o.name || o.orderId || 'Order'}</span>
                                <span style="color:var(--text);font-weight:600">Client: ${o.client || 'Unknown'}</span>
                            </div>
                        </div>
                        <div class="modal-close" onclick="App.closeModal()">✕</div>
                    </div>
                    <div class="modal-body">
                        <div style="display:flex;flex-direction:column;gap:16px">
                            <div style="display:flex;gap:12px;flex-wrap:wrap">
                                <div style="flex:1;min-width:120px;background:var(--bg3);padding:10px;border-radius:8px;border:1px solid var(--border)">
                                    <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Order Status</div>
                                    <div style="font-size:13px;font-weight:700;color:var(--accent);margin-top:4px">${getOrderStatusText(o)}</div>
                                </div>
                                <div style="flex:1;min-width:120px;background:var(--bg3);padding:10px;border-radius:8px;border:1px solid var(--border)">
                                    <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Priority</div>
                                    <div style="margin-top:4px"><span class="vtag ${pClass}">▲ ${o.priority || 'Medium'}</span></div>
                                </div>
                                <div style="flex:1;min-width:120px;background:var(--bg3);padding:10px;border-radius:8px;border:1px solid var(--border)">
                                    <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Date Created</div>
                                    <div style="font-size:13px;font-weight:700;margin-top:4px">${o.date || '—'}</div>
                                </div>
                            </div>
                            
                            <div class="section">
                                <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
                                    <span>Assigned Fleet Trucks <span style="font-size:11px;color:var(--text3);font-weight:400;margin-left:4px">(${o.assignedTrucks.filter(t=>t.active!==false).length} active)</span></span>
                                    <div style="display:flex;gap:6px">
                                        <button class="btn btn-primary btn-xs" onclick="App.addTruckToOrderForm(${idx})" style="gap:4px">➕ Add Truck</button>
                                        <button class="btn btn-ghost btn-xs" onclick="App.switchOrderTruckForm(${idx})">⇄ Switch Truck</button>
                                    </div>
                                </div>
                                <div id="addTruckContainer_${idx}" style="display:none;margin-bottom:12px;padding:14px;background:var(--bg3);border:1px solid var(--accent);border-radius:10px">
                                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                                        <span style="font-size:14px">➕</span>
                                        <span style="font-size:12px;font-weight:700;color:var(--text)">Add Trucks to Order</span>
                                    </div>
                                    <div id="addTruckPickerSlot_${idx}"></div>
                                    <div style="display:flex;gap:8px;margin-top:10px">
                                        <button class="btn btn-primary btn-xs" onclick="App.confirmAddTruck(${idx})" style="flex:1">✓ Add Selected Trucks</button>
                                        <button class="btn btn-ghost btn-xs" onclick="document.getElementById('addTruckContainer_${idx}').style.display='none'">Cancel</button>
                                    </div>
                                </div>
                                <div id="switchTruckContainer_${idx}" style="display:none;margin-bottom:12px;padding:14px;background:var(--bg3);border:1px solid var(--accent);border-radius:10px">
                                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                                        <span style="font-size:14px">⇄</span>
                                        <span style="font-size:12px;font-weight:700;color:var(--text)">Switch Fleet Truck</span>
                                    </div>
                                    <div style="display:flex;gap:10px;margin-bottom:10px">
                                        <div style="flex:1">
                                            <label style="font-size:10px;color:var(--text2);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">Assigned Truck (From)</label>
                                            <input type="text" id="switchTruckFrom_${idx}" placeholder="e.g. RAD001A"
                                                style="width:100%;padding:8px 12px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;outline:none;transition:border-color 0.2s"
                                                onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
                                        </div>
                                        <div style="flex:1">
                                            <label style="font-size:10px;color:var(--text2);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.04em">Replacement Truck (To)</label>
                                            <input type="text" id="switchTruckTo_${idx}" placeholder="e.g. RAD002B"
                                                style="width:100%;padding:8px 12px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;outline:none;transition:border-color 0.2s"
                                                onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border)'">
                                        </div>
                                    </div>
                                    <div style="display:flex;gap:8px">
                                        <button class="btn btn-primary btn-xs" onclick="App.confirmSwitchTruck(${idx})" style="flex:1">✓ Confirm Switch</button>
                                        <button class="btn btn-ghost btn-xs" onclick="document.getElementById('switchTruckContainer_${idx}').style.display='none'">Cancel</button>
                                    </div>
                                </div>
                                <div style="display:flex;flex-direction:column;gap:6px">
                                    ${trucksHtml}
                                </div>
                            </div>
                        </div>
                    </div>
                `);
            }

            function addTruckToOrderForm(idx) {
                const o = orders.find(x => x._idx === idx);
                if (!o) return;

                const container = document.getElementById(`addTruckContainer_${idx}`);
                const slot = document.getElementById(`addTruckPickerSlot_${idx}`);
                if (!container || !slot) return;

                // Hide the switch form if it's open
                const switchC = document.getElementById(`switchTruckContainer_${idx}`);
                if (switchC) switchC.style.display = 'none';

                // Get plates already actively assigned to this order
                const activeAssignedPlates = (o.assignedTrucks || []).filter(t => t.active !== false).map(t => t.plate);

                // Build picker excluding already assigned plates
                const pickerId = `addTo_${idx}`;
                slot.innerHTML = buildTruckPickerHtml(pickerId, activeAssignedPlates);

                container.style.display = 'block';
            }

            function confirmAddTruck(idx) {
                const o = orders.find(x => x._idx === idx);
                if (!o) return;

                const pickerId = `addTo_${idx}`;
                const selectedPlates = getPickerPlates(pickerId);
                if (selectedPlates.length === 0) {
                    showToast('⚠ Select at least one truck to add');
                    return;
                }

                if (!o.assignedTrucks) o.assignedTrucks = [];
                let addedCount = 0;
                const todayDate = new Date().toISOString().slice(0, 10);

                selectedPlates.forEach(plate => {
                    // Safety: skip maintenance trucks
                    const trk = trucks.find(t => t.plate === plate);
                    if (trk && trk.status === 'In Maintenance') return;
                    // Skip if already actively assigned
                    if (o.assignedTrucks.find(t => t.plate === plate && t.active !== false)) return;

                    o.assignedTrucks.push({
                        plate,
                        status: 'allocated',
                        active: true,
                        allocatedDate: todayDate
                    });
                    addedCount++;
                });

                if (addedCount === 0) {
                    showToast('⚠ No new trucks were added (already assigned or in maintenance)');
                    return;
                }

                saveAll();
                openOrderDetailsModal(idx);
                renderOrders();
                showToast(`✓ ${addedCount} truck${addedCount !== 1 ? 's' : ''} added to order`);
            }

            function switchOrderTruckForm(idx) {
                const o = orders.find(x => x._idx === idx);
                if (!o) return;
                
                const container = document.getElementById(`switchTruckContainer_${idx}`);
                const fromInput = document.getElementById(`switchTruckFrom_${idx}`);
                const toInput = document.getElementById(`switchTruckTo_${idx}`);
                if (!container || !fromInput || !toInput) return;
                
                // Hide the add form if open
                const addC = document.getElementById(`addTruckContainer_${idx}`);
                if (addC) addC.style.display = 'none';

                // Get list of active plates currently assigned to this order
                const activeAssignedPlates = (o.assignedTrucks || []).filter(t => t.active !== false).map(t => t.plate);
                
                // Prefill the 'From' input with the first active truck (if any) to make it easier, but let user type
                fromInput.value = activeAssignedPlates[0] || '';
                toInput.value = '';
                
                container.style.display = 'block';
            }

            function confirmSwitchTruck(idx) {
                const o = orders.find(x => x._idx === idx);
                if (!o) return;
                
                const fromInput = document.getElementById(`switchTruckFrom_${idx}`);
                const toInput = document.getElementById(`switchTruckTo_${idx}`);
                const fromPlate = fromInput?.value.trim().toUpperCase();
                const toPlate = toInput?.value.trim().toUpperCase();
                
                if (!fromPlate) {
                    showToast('⚠ Enter the assigned truck plate to switch out');
                    return;
                }
                if (!toPlate) {
                    showToast('⚠ Enter the replacement truck plate');
                    return;
                }
                
                if (fromPlate === toPlate) {
                    showToast('⚠ Cannot switch a truck to itself');
                    return;
                }

                // Check if the fromPlate is actively assigned to this order
                const activeItem = (o.assignedTrucks || []).find(t => t.plate.toUpperCase() === fromPlate && t.active !== false);
                if (!activeItem) {
                    showToast(`⚠ Truck ${fromPlate} is not actively assigned to this order`);
                    return;
                }
                
                // Validate if target truck exists in the fleet
                const targetTrk = trucks.find(t => t.plate.toUpperCase() === toPlate);
                if (!targetTrk) {
                    showToast(`🚫 Replacement truck ${toPlate} does not exist in the fleet`);
                    return;
                }
                
                // Check if target truck is in maintenance
                if (targetTrk.status === 'In Maintenance') {
                    showToast(`🚫 Cannot assign: ${toPlate} is currently In Maintenance`);
                    return;
                }
                
                // Check if target truck is already actively assigned to this order
                const alreadyActive = o.assignedTrucks.find(t => t.plate.toUpperCase() === toPlate && t.active !== false);
                if (alreadyActive) {
                    showToast(`⚠ Truck ${targetTrk.plate} is already actively assigned to this order`);
                    return;
                }
                
                // Execute Switch:
                const todayDate = new Date().toISOString().slice(0, 10);
                activeItem.active = false;
                activeItem.switchedTo = targetTrk.plate;
                
                const oldTrkGlobal = trucks.find(x => x.plate.toUpperCase() === fromPlate);
                if (oldTrkGlobal && oldTrkGlobal.status === 'On Trip') {
                    oldTrkGlobal.status = 'Active';
                }
                
                o.assignedTrucks.push({
                    plate: targetTrk.plate,
                    status: 'allocated',
                    active: true,
                    allocatedDate: todayDate
                });
                
                // Update truckPlate string for backwards compatibility
                o.truckPlate = targetTrk.plate;
                
                saveAll();
                openOrderDetailsModal(idx);
                renderOrders();
                showToast(`✓ Switched ${activeItem.plate} to ${targetTrk.plate}`);
            }

            function updateOrderTruckStatus(orderIdx, truckIdx, newStatus) {
                const o = orders.find(x => x._idx === orderIdx);
                if (!o || !o.assignedTrucks || !o.assignedTrucks[truckIdx]) return;
                
                const assignment = o.assignedTrucks[truckIdx];
                const todayDate = new Date().toISOString().slice(0, 10);
                const trk = trucks.find(t => t.plate === assignment.plate);

                if (trk && trk.status === 'In Maintenance' && newStatus === 'Transit') {
                    showToast(`🚫 Cannot set to Transit — ${trk.plate} is In Maintenance`);
                    assignment.status = 'allocated';
                    openOrderDetailsModal(orderIdx);
                    return;
                }

                assignment.status = newStatus;
                if (newStatus === 'loaded' && !assignment.loadedDate) assignment.loadedDate = todayDate;
                if ((newStatus === 'Transit' || newStatus === 'Offloaded') && !assignment.loadedDate) assignment.loadedDate = todayDate;
                if (newStatus === 'Offloaded' && !assignment.offloadDate) assignment.offloadDate = todayDate;

                if (trk) {
                    if (newStatus === 'Transit') {
                        trk.status = 'On Trip';
                    } else if (newStatus === 'Offloaded') {
                        if (trk.status === 'On Trip') {
                            trk.status = 'Active';
                        }
                    }
                }

                o.status = deriveOrderStatus(o);
                saveAll();
                openOrderDetailsModal(orderIdx);
                renderOrders();
                showToast(`Truck ${assignment.plate} status → ${newStatus}`);
            }


            // ═══════════ HSC POLICY & MEETINGS ═══════════
            let hscActiveSubpage = 'rules';
            let hscMeetingsFilter = 'recent'; // Filter state: 'recent', 'day', 'week', 'month', 'year'
            let hscPolicies = JSON.parse(localStorage.getItem('fg3_hscpolicies') || '[]');
            let hscMeetings = JSON.parse(localStorage.getItem('fg3_hscmeetings') || '[]');
            
            const DEFAULT_PDF_DATA = 'data:application/pdf;base64,JVBERi0xLjQKMSAwIG9iagogIDw8IC9UeXBlIC9DYXRhbG9nCiAgICAgL1BhZ2VzIDIgMCBSCiAgPj4KZW5kb2JqCjIgMCBvYmoKICA8PCAvVHlwZSAvUGFnZXMKICAgICAvS2lkcyBbIDMgMCBSIF0KICAgICAvQ291bnQgMQogID4+CmVuZG9iagozIDAgb2JqCiAgPDwgL1R5cGUgL1BhZ2UKICAgICAvUGFyZW50IDIgMCBSCiAgICAgL01lZGlhQm94IFsgMCAwIDU5NSA4NDIgXQogICAgIC9SZXNvdXJjZXMgPDwKICAgICAgICAvRm9udCA8PAogICAgICAgICAgIC9GMSA0IDAgUiAKICAgICAgICA+PgogICAgID4+CiAgICAgL0NvbnRlbnRzIDUgMCBSCiAgPj4KZW5kb2JqCjQgMCBvYmoKICA8PCAvVHlwZSAvRm9udAogICAgIC9TdWJ0eXBlIC9UeXBlMQogICAgIC9CYXNlRm9udCAvSGVsdmV0aWNhCiAgPj4KZW5kb2JqCjUgMCBvYmoKICA8PCAvTGVuZ3RoIDQ0ID4+CnN0cmVhbQpCVAovRjEgMjQgVGYKNzAgNzIwIFRkCihIU0UgTWVldGluZyBSZXBvcnQpIFRqCkVUCmVuZHN0cmVhbQplbmRvYmoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDE5IDAwMDAwIG4gCjAwMDAwMDAwNzAgMDAwMDAgbiAKMDAwMDAwMTM2IDAwMDAwIG4gCjAwMDAwMDAyNDkgMDAwMDAgbiAKMDAwMDAwMzA1IDAwMDAwIG4gCnRyYWlsZXIKICA8PCAvU2l6ZSA2CiAgICAgL1Jvb3QgMSAwIFIKICA+PgpzdGFydHhyZWYKIDQwOAolJUVPRgo=';

            function saveHscPolicies() {
                localStorage.setItem('fg3_hscpolicies', JSON.stringify(hscPolicies));
                if (typeof database !== 'undefined') {
                    database.ref('fleetguard/hscPolicies').set(hscPolicies).catch(err => {
                        console.error('HSC policy sync failed:', err);
                    });
                }
            }

            function saveHscMeetings() {
                localStorage.setItem('fg3_hscmeetings', JSON.stringify(hscMeetings));
                if (typeof database !== 'undefined') {
                    database.ref('fleetguard/hscMeetings').set(hscMeetings).catch(err => {
                        console.error('HSC meeting sync failed:', err);
                    });
                }
            }
            
            function filterMeetingsByDateRange(meetings, filterType) {
                const now = new Date();
                const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const startOfWeek = new Date(startOfToday);
                startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                const startOfYear = new Date(now.getFullYear(), 0, 1);
                
                return meetings.filter(m => {
                    if (!m.date) return false;
                    const meetingDate = new Date(m.date);
                    switch(filterType) {
                        case 'day':
                            return meetingDate >= startOfToday && meetingDate < new Date(startOfToday.getTime() + 24*60*60*1000);
                        case 'week':
                            return meetingDate >= startOfWeek;
                        case 'month':
                            return meetingDate >= startOfMonth;
                        case 'year':
                            return meetingDate >= startOfYear;
                        case 'recent':
                        default:
                            return true;
                    }
                });
            }
            
            function setHscMeetingsFilter(filterType) {
                hscMeetingsFilter = filterType;
                renderHscPolicies();
            }
            
            function switchHscSubpage(subpage) {
                hscActiveSubpage = subpage;
                const tabRules = document.getElementById('hscTab-rules');
                const tabMeetings = document.getElementById('hscTab-meetings');
                if (tabRules) tabRules.classList.toggle('active', subpage === 'rules');
                if (tabMeetings) tabMeetings.classList.toggle('active', subpage === 'meetings');
                renderHscPolicies();
            }

            function renderHscPolicies() {
                const el = document.getElementById('hscSubpageContent');
                if (!el) return;
                
                if (hscActiveSubpage === 'rules') {
                    const sortedPolicies = hscPolicies
                        .map((p, i) => ({ ...p, originalIndex: i }))
                        .sort((a, b) => {
                            const rA = typeof a.rank === 'number' ? a.rank : 999;
                            const rB = typeof b.rank === 'number' ? b.rank : 999;
                            return rA - rB;
                        });
                        
                    let html = `
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">
                            <div>
                                <div style="font-size:12px;color:var(--text2);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">HSE Policy Library</div>
                                <div style="font-size:18px;font-family:var(--font-display);color:var(--text);font-weight:700">Company Approved Policies (${sortedPolicies.length})</div>
                                <div style="font-size:12px;color:var(--text3);margin-top:4px">Reference the active HSE rules and the enforcement measures attached to each policy.</div>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="App.openAddHscPolicy()">+ Add Policy</button>
                        </div>
                        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:16px">
                            <div style="background:linear-gradient(135deg, rgba(34,201,122,0.12), rgba(34,201,122,0.04));border:1px solid rgba(34,201,122,0.2);border-radius:12px;padding:12px">
                                <div style="font-size:10px;text-transform:uppercase;color:var(--green);font-weight:700;letter-spacing:0.05em">Policy Count</div>
                                <div style="font-size:20px;font-weight:800;color:var(--text);margin-top:4px">${sortedPolicies.length}</div>
                            </div>
                            <div style="background:linear-gradient(135deg, rgba(255,193,7,0.14), rgba(255,193,7,0.04));border:1px solid rgba(255,193,7,0.2);border-radius:12px;padding:12px">
                                <div style="font-size:10px;text-transform:uppercase;color:var(--amber);font-weight:700;letter-spacing:0.05em">High Priority</div>
                                <div style="font-size:20px;font-weight:800;color:var(--text);margin-top:4px">${sortedPolicies.filter(p => (p.severity || '').toLowerCase() === 'high').length}</div>
                            </div>
                        </div>
                    `;
                    
                    if (sortedPolicies.length === 0) {
                        html += '<p style="color:var(--text3);font-size:13px;padding:20px 0">No policies added yet. Click "+ Add Policy" to begin.</p>';
                    } else {
                        html += sortedPolicies.map((p) => {
                            const rankText = typeof p.rank === 'number' ? `Rank ${p.rank}` : 'Unranked';
                            return `
                            <div class="settings-section" style="position:relative; margin-bottom:16px; border-left:4px solid ${p.severity === 'high' ? 'var(--red)' : (p.severity === 'medium' ? 'var(--amber)' : 'var(--accent)')}; box-shadow:0 10px 24px rgba(0,0,0,0.06)">
                                <div style="display:flex;align-items:flex-start;gap:14px">
                                    <div style="font-size:28px;line-height:1;background:var(--bg3);padding:10px;border-radius:var(--radius);border:1px solid var(--border)">${p.icon || '📋'}</div>
                                    <div style="flex:1">
                                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                                            <span class="badge" style="background:var(--bg4);border:1px solid var(--border);color:var(--text);font-weight:700;font-size:10px;padding:3px 6px">${rankText}</span>
                                            <h3 style="margin:0;font-size:15px;font-family:var(--font-display)">${xmlEscape(p.title || 'Untitled Policy')}</h3>
                                        </div>
                                        <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
                                            <span class="vtag vtag-${p.severity || 'low'}" style="font-size:9px">${(p.severity || 'low').toUpperCase()}</span>
                                            <span style="font-size:10px;color:var(--text3)">📅 Effective: ${xmlEscape(p.effectiveDate || '—')}</span>
                                            <span style="font-size:10px;color:var(--text3)">🏷 Category: ${xmlEscape(p.category || 'General')}</span>
                                        </div>
                                        <p style="font-size:12.5px;color:var(--text2);line-height:1.6;margin:0 0 12px 0">${xmlEscape(p.description || '')}</p>
                                        
                                        <div style="background:rgba(240,76,90,0.06);border-left:3px solid var(--red);padding:10px 12px;border-radius:0 var(--radius) var(--radius) 0;margin-top:10px">
                                            <div style="font-weight:700;font-size:10.5px;color:var(--red);margin-bottom:6px;display:flex;align-items:center;gap:4px;text-transform:uppercase;letter-spacing:0.04em">
                                                <span>⚠ Violation Measure Taken</span>
                                            </div>
                                            ${(() => {
                                                const lines = (p.violationMeasure || 'Once committed the driver is given a written warning\nTwice a written warning\nThird time he is fined with 50,000')
                                                    .split('\n')
                                                    .map(line => line.trim())
                                                    .filter(Boolean)
                                                    .map(line => {
                                                        const cleaned = line.replace(/^[\u2022\.\s-]+/, '');
                                                        return `<div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:4px"><span style="color:var(--text3);font-size:12px;line-height:1.5">•</span><span style="font-size:12px;color:var(--text2);line-height:1.5">${xmlEscape(cleaned)}</span></div>`;
                                                    })
                                                    .join('');
                                                return lines;
                                            })()}
                                        </div>
                                        
                                        <div style="margin-top:12px;display:flex;align-items:center;justify-content:flex-start;flex-wrap:wrap;gap:8px">
                                            ${getHscPdfUrl(p) ? `<button class="btn btn-primary btn-xs" onclick="App.viewPolicyPdf(${p.originalIndex})">📖 Read Policy</button>
                                            <button class="btn btn-ghost btn-xs" onclick="App.downloadPolicyPdf(${p.originalIndex})">📥 Download PDF</button>` : '<div style="font-size:11px;color:var(--text3);">No signed PDF attached</div>'}
                                            <button class="btn btn-danger btn-xs" onclick="App.deleteHscPolicy(${p.originalIndex})">✕ Remove Policy</button>
                                        </div>
                                    </div>
                                </div>
                            </div>`;
                        }).join('');
                    }
                    el.innerHTML = html;
                } else if (hscActiveSubpage === 'meetings') {
                    const filteredMeetings = filterMeetingsByDateRange(hscMeetings, hscMeetingsFilter);
                    const sortedMeetings = filteredMeetings
                        .map((m, i) => ({ ...m, originalIndex: hscMeetings.indexOf(m) }))
                        .sort((a, b) => {
                            const dateA = a.date ? new Date(a.date).getTime() : 0;
                            const dateB = b.date ? new Date(b.date).getTime() : 0;
                            return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
                        });
                        
                    let html = `
                        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">
                            <div>
                                <div style="font-size:12px;color:var(--text2);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:6px">HSE Meeting Briefs</div>
                                <div style="font-size:18px;font-family:var(--font-display);color:var(--text);font-weight:700">Meeting Reports (${sortedMeetings.length})</div>
                                <div style="font-size:12px;color:var(--text3);margin-top:4px">Open each card to review the meeting summary and access the attached report.</div>
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="App.openAddHscMeeting()">+ Add Meeting Report</button>
                        </div>
                        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
                            <button class="btn btn-sm ${hscMeetingsFilter === 'recent' ? 'btn-primary' : 'btn-secondary'}" onclick="App.setHscMeetingsFilter('recent')" style="font-size:11px;padding:6px 12px">📅 All (Recent)</button>
                            <button class="btn btn-sm ${hscMeetingsFilter === 'day' ? 'btn-primary' : 'btn-secondary'}" onclick="App.setHscMeetingsFilter('day')" style="font-size:11px;padding:6px 12px">🕐 Today</button>
                            <button class="btn btn-sm ${hscMeetingsFilter === 'week' ? 'btn-primary' : 'btn-secondary'}" onclick="App.setHscMeetingsFilter('week')" style="font-size:11px;padding:6px 12px">📆 This Week</button>
                            <button class="btn btn-sm ${hscMeetingsFilter === 'month' ? 'btn-primary' : 'btn-secondary'}" onclick="App.setHscMeetingsFilter('month')" style="font-size:11px;padding:6px 12px">📊 This Month</button>
                            <button class="btn btn-sm ${hscMeetingsFilter === 'year' ? 'btn-primary' : 'btn-secondary'}" onclick="App.setHscMeetingsFilter('year')" style="font-size:11px;padding:6px 12px">📈 This Year</button>
                        </div>
                    `;
                    
                    if (sortedMeetings.length === 0) {
                        html += '<p style="color:var(--text3);font-size:13px;padding:20px 0">No meeting reports added yet. Click "+ Add Meeting Report" to record a meeting.</p>';
                    } else {
                        html += `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">`;
                        html += sortedMeetings.map((m) => {
                            const dateLabel = m.date ? new Date(m.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date pending';
                            const previewText = (m.summary || 'No brief report was provided.').split(/\n+/).filter(Boolean)[0] || 'No brief report was provided.';
                            const summaryLines = (m.summary || 'No brief report was provided.').split('\n').map(line => line.trim()).filter(Boolean);
                            const summaryMarkup = summaryLines.length ? summaryLines.map(line => `<div style="margin-bottom:6px">${xmlEscape(line)}</div>`).join('') : '<div style="font-size:12px;color:var(--text3)">No brief report was provided for this meeting.</div>';
                            const attachmentCount = (Array.isArray(m.attachments) && m.attachments.length) ? m.attachments.length : (m.pdfFileName ? 1 : 0);
                            
                            return `
                            <div class="settings-section" style="position:relative; padding:14px; overflow:hidden; border-left:4px solid var(--accent); box-shadow:0 10px 24px rgba(0,0,0,0.05)">
                                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
                                    <div style="min-width:0;flex:1">
                                        <div style="font-size:10px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px">${xmlEscape(dateLabel)}</div>
                                        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">${xmlEscape(m.title || 'Untitled Meeting')}</div>
                                        <div style="font-size:11px;color:var(--text3);display:flex;gap:8px;flex-wrap:wrap">
                                            <span>👥 ${xmlEscape(m.membersPresent || 'General HSE Members')}</span>
                                            <span>📄 ${attachmentCount > 0 ? `${attachmentCount} attachment${attachmentCount > 1 ? 's' : ''}` : 'No attachments'}</span>
                                        </div>
                                    </div>
                                    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
                                        <button class="btn btn-xs" style="background:var(--red);color:#fff;border:none;font-weight:600;padding:6px 12px" onclick="event.stopPropagation(); App.openHscMeetingDetailModal(${m.originalIndex})">📖 Open Full Brief</button>
                                        <button class="btn btn-ghost btn-xs" style="padding:6px 8px" onclick="event.stopPropagation(); App.deleteHscMeeting(${m.originalIndex})" title="Delete meeting">✕</button>
                                    </div>
                                </div>
                            </div>`;
                        }).join('');
                        html += '</div>';
                    }
                    el.innerHTML = html;
                }
            }

            function openHscMeetingDetailModal(idx) {
                const meeting = hscMeetings[idx];
                if (!meeting) return;
                const summaryLines = (meeting.summary || 'No brief report was provided for this meeting.').split('\n').map(line => line.trim()).filter(Boolean);
                const summaryMarkup = summaryLines.length ? summaryLines.map(line => `<div style="margin-bottom:8px">${xmlEscape(line)}</div>`).join('') : '<div style="font-size:13px;color:var(--text3)">No brief report was provided for this meeting.</div>';
                const dateLabel = meeting.date ? new Date(meeting.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Date pending';

                // Build attachments array — support both old pdfFileName/pdfUrl and new attachments[]
                const allAttachments = Array.isArray(meeting.attachments) && meeting.attachments.length
                    ? meeting.attachments
                    : (meeting.pdfFileName ? [{ name: meeting.pdfFileName, url: meeting.pdfUrl, type: 'pdf' }] : []);

                const attachmentBlock = allAttachments.length ? `
                    <div>
                        <div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Attachments (${allAttachments.length})</div>
                        <div style="display:flex;flex-direction:column;gap:8px">
                            ${allAttachments.map((f, fi) => {
                                const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.name) || (f.mimeType || '').startsWith('image/');
                                const isPdf = /\.pdf$/i.test(f.name) || f.type === 'pdf' || (f.mimeType || '') === 'application/pdf';
                                const driveId = f.driveId || extractDriveFileId(f.url || '');
                                const icon = isPdf ? '📄' : isImage ? '🖼️' : '📎';
                                let previewHtml = '';
                                if (isImage && f.url) {
                                    if (driveId) {
                                        previewHtml = `<img src="https://drive.google.com/thumbnail?id=${driveId}&sz=w120" alt="${xmlEscape(f.name)}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0" onerror="this.style.display='none'">`;
                                    } else if ((f.url || '').startsWith('data:')) {
                                        previewHtml = `<img src="${f.url}" alt="${xmlEscape(f.name)}" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border);flex-shrink:0">`;
                                    }
                                }
                                const viewUrl = driveId ? `https://drive.google.com/file/d/${driveId}/preview` : (f.url || '');
                                const dlUrl = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : (f.url || '');
                                return `<div style="display:flex;align-items:center;gap:10px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px;flex-wrap:wrap">
                                    ${previewHtml ? previewHtml : `<span style="font-size:22px;flex-shrink:0">${icon}</span>`}
                                    <div style="flex:1;min-width:0">
                                        <div style="font-size:12px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${xmlEscape(f.name)}">${xmlEscape(f.name)}</div>
                                        <div style="font-size:10px;color:var(--text3)">${isPdf ? 'PDF Document' : isImage ? 'Image' : 'File'} · ${f.uploadedAt || 'Attached'}</div>
                                    </div>
                                    <div style="display:flex;gap:6px;flex-shrink:0">
                                        ${viewUrl ? `<button class="btn btn-ghost btn-xs" onclick="App.previewMeetingAttachment(${idx},${fi})">👁 View</button>` : ''}
                                        ${dlUrl ? `<button class="btn btn-ghost btn-xs" onclick="App.downloadMeetingAttachment(${idx},${fi})">📥 Download</button>` : ''}
                                    </div>
                                </div>`;
                            }).join('')}
                        </div>
                    </div>` : '<div style="font-size:12px;color:var(--text3)">No attachments for this meeting.</div>';

                openModal(`
                <div class="modal-header">
                    <div>
                        <div style="font-size:10px;color:var(--accent);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px">HSE Meeting Brief</div>
                        <div class="modal-name">${xmlEscape(meeting.title || 'Untitled Meeting')}</div>
                    </div>
                    <div class="modal-close" onclick="App.closeModal()">✕</div>
                </div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px">
                        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px">
                            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em">Meeting Date</div>
                            <div style="font-size:13px;font-weight:700;color:var(--text);margin-top:4px">${xmlEscape(dateLabel)}</div>
                        </div>
                        <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:10px">
                            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.04em">Members Present</div>
                            <div style="font-size:13px;font-weight:700;color:var(--text);margin-top:4px">${xmlEscape(meeting.membersPresent || 'General HSE Members')}</div>
                        </div>
                    </div>
                    <div style="background:linear-gradient(135deg, rgba(37,99,235,0.1), rgba(34,201,122,0.08));border:1px solid rgba(37,99,235,0.16);border-radius:12px;padding:14px">
                        <div style="font-size:10px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px">Brief Report / Summary</div>
                        <div style="font-size:13px;color:var(--text2);line-height:1.8;white-space:pre-wrap">${summaryMarkup}</div>
                    </div>
                    ${attachmentBlock}
                </div>
                <div class="modal-actions">
                    <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                </div>`);
            }

            function previewMeetingAttachment(meetingIdx, fileIdx) {
                const meeting = hscMeetings[meetingIdx];
                if (!meeting) return;
                const allAttachments = Array.isArray(meeting.attachments) && meeting.attachments.length
                    ? meeting.attachments
                    : (meeting.pdfFileName ? [{ name: meeting.pdfFileName, url: meeting.pdfUrl, type: 'pdf' }] : []);
                const f = allAttachments[fileIdx];
                if (!f) return;
                const driveId = f.driveId || extractDriveFileId(f.url || '');
                const mimeType = f.mimeType || ((/\.pdf$/i.test(f.name) || f.type === 'pdf') ? 'application/pdf' : (/\.(jpg|jpeg|png|gif|webp)$/i.test(f.name) ? 'image/jpeg' : 'application/octet-stream'));
                const isPdf = mimeType === 'application/pdf' || f.type === 'pdf';
                const isImage = mimeType.startsWith('image/');
                let previewContent = '';
                if (driveId) {
                    previewContent = `<iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${xmlEscape(f.name)}" style="width:100%;height:70vh;border:none;border-radius:12px;background:#111"></iframe>`;
                } else if (f.url && f.url.startsWith('data:')) {
                    if (isPdf) previewContent = `<iframe src="${f.url}" title="${xmlEscape(f.name)}" style="width:100%;height:70vh;border:none;border-radius:12px"></iframe>`;
                    else if (isImage) previewContent = `<img src="${f.url}" alt="${xmlEscape(f.name)}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:12px;border:1px solid var(--border)">`;
                    else previewContent = `<div style="color:var(--text3);font-size:13px;padding:20px">Preview not available for this file type.</div>`;
                } else {
                    previewContent = `<div style="color:var(--text3);font-size:13px;padding:20px">Preview unavailable.</div>`;
                }
                pushModal(`
                <div class="modal-header"><div><div class="modal-name">${xmlEscape(f.name)}</div><div class="modal-sub">${isPdf ? 'PDF Document' : isImage ? 'Image' : 'File'} · ${f.uploadedAt || ''}</div></div><div class="modal-close" onclick="App.closeModal()">✕</div></div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
                    ${previewContent}
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-primary btn-sm" onclick="App.downloadMeetingAttachment(${meetingIdx},${fileIdx})">📥 Download</button>
                        <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Back</button>
                    </div>
                </div>`);
            }

            function downloadMeetingAttachment(meetingIdx, fileIdx) {
                const meeting = hscMeetings[meetingIdx];
                if (!meeting) return;
                const allAttachments = Array.isArray(meeting.attachments) && meeting.attachments.length
                    ? meeting.attachments
                    : (meeting.pdfFileName ? [{ name: meeting.pdfFileName, url: meeting.pdfUrl, type: 'pdf' }] : []);
                const f = allAttachments[fileIdx];
                if (!f || !f.url) { showToast('No file data available.'); return; }
                const driveId = f.driveId || extractDriveFileId(f.url || '');
                if (driveId) {
                    window.open(`https://drive.google.com/uc?export=download&id=${driveId}`, '_blank', 'noopener');
                } else {
                    const a = document.createElement('a');
                    a.href = f.url;
                    a.download = f.name || 'attachment';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
            }

            function openAddHscPolicy() {
                tempPolicyPdfUrl = '';
                tempPolicyPdfName = '';
                openModal(`
                <div class="modal-header"><h3>Add HSC Policy</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
                    <div><label style="font-size:11px">Policy Title *</label><input type="text" id="hscTitle" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="e.g. Seatbelt Compliance"></div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                        <div><label style="font-size:11px">Category</label><input type="text" id="hscCategory" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="e.g. Safety"></div>
                        <div><label style="font-size:11px">Rank / Priority (number) *</label><input type="number" id="hscRank" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" value="${hscPolicies.length + 1}"></div>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                        <div><label style="font-size:11px">Severity</label><select id="hscSeverity" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>
                        <div><label style="font-size:11px">Effective Date</label><input type="date" id="hscDate" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" value="${new Date().toISOString().slice(0, 10)}"></div>
                    </div>
                    <div>
                        <label style="font-size:11px">Upload Signed PDF</label>
                        <div style="display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap">
                            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('hscPolicyPdfInput').click();">Upload PDF</button>
                            <span id="policyPdfStatus" style="font-size:11px;color:var(--text3)">No signed PDF attached</span>
                        </div>
                        <input id="hscPolicyPdfInput" type="file" accept="application/pdf" style="display:none" onchange="App.handlePolicyPdfSelect(event)">
                    </div>
                    <div><label style="font-size:11px">Icon (emoji)</label><input type="text" id="hscIcon" style="width:80px;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);text-align:center" value="📋"></div>
                    <div><label style="font-size:11px">Description *</label><textarea id="hscDesc" rows="3" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);resize:vertical;font-family:var(--font-body);font-size:13px" placeholder="Describe the policy and its implications…"></textarea></div>
                    <div><label style="font-size:11px">Violation Measures Taken *</label><textarea id="hscViolationMeasure" rows="2" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);resize:vertical;font-family:var(--font-body);font-size:13px" placeholder="Describe the disciplinary action taken if this rule is violated…"></textarea></div>
                    <button class="btn btn-primary btn-sm" style="width:100%" onclick="App.saveHscPolicyFromForm()">Save Policy</button>
                </div>`);
            }

            async function saveHscPolicyFromForm() {
                const title = document.getElementById('hscTitle')?.value.trim();
                const desc = document.getElementById('hscDesc')?.value.trim();
                const violationMeasure = document.getElementById('hscViolationMeasure')?.value.trim();
                if (!title || !desc) { showToast('Title and description required'); return; }
                
                const rankInput = document.getElementById('hscRank')?.value;
                const rank = rankInput !== '' ? parseInt(rankInput, 10) : (hscPolicies.length + 1);
                const newPolicy = {
                    title, description: desc,
                    category: document.getElementById('hscCategory')?.value.trim() || 'General',
                    severity: document.getElementById('hscSeverity')?.value || 'medium',
                    effectiveDate: document.getElementById('hscDate')?.value || new Date().toISOString().slice(0, 10),
                    icon: document.getElementById('hscIcon')?.value.trim() || '📋',
                    pdfFileName: tempPolicyPdfName,
                    pdfUrl: tempPolicyPdfUrl,
                    committed: false,
                    rank: isNaN(rank) ? 999 : rank,
                    violationMeasure: violationMeasure || 'Subject to formal warning and disciplinary review.'
                };
                hscPolicies.push(newPolicy);
                saveHscPolicies();
                closeModal();
                renderHscPolicies();
                showToast('Policy added');
            }

            function commitHscPolicy(i) {
                hscPolicies[i].committed = true;
                saveHscPolicies();
                renderHscPolicies();
                showToast('Policy marked as committed');
            }

            function deleteHscPolicy(i) {
                if (!confirm('Remove this policy?')) return;
                hscPolicies.splice(i, 1);
                saveHscPolicies();
                renderHscPolicies();
            }

            let tempPdfUrl = '';
            let tempPdfName = '';
            let tempPolicyPdfUrl = '';
            let tempPolicyPdfName = '';
            let pendingMeetingFiles = [];

            async function handlePolicyPdfSelect(e) {
                const file = e.target.files[0];
                const statusEl = document.getElementById('policyPdfStatus');
                if (!file) {
                    tempPolicyPdfUrl = '';
                    tempPolicyPdfName = '';
                    if (statusEl) statusEl.textContent = 'No signed PDF attached';
                    return;
                }
                if (!isPdfFile(file)) {
                    showToast('Please upload a valid PDF file');
                    e.target.value = '';
                    tempPolicyPdfUrl = '';
                    tempPolicyPdfName = '';
                    if (statusEl) statusEl.textContent = 'Error: Invalid file type';
                    return;
                }
                if (file.size > 100 * 1024 * 1024) {
                    showToast('PDF file size exceeds 100MB limit. Please select a smaller file.');
                    e.target.value = '';
                    tempPolicyPdfUrl = '';
                    tempPolicyPdfName = '';
                    if (statusEl) statusEl.textContent = 'Error: File too large';
                    return;
                }
                if (statusEl) statusEl.textContent = 'Uploading to Google Drive...';

                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    try {
                        const result = await uploadToGoogleDrive({
                            base64: dataUrlToBase64(dataUrl),
                            fileName: file.name,
                            mimeType: 'application/pdf',
                            folder: 'fleetguard/hsc/policies'
                        });
                        tempPolicyPdfUrl = result.url;
                        tempPolicyPdfName = file.name;
                        if (statusEl) {
                            statusEl.innerHTML = `<span style="color:var(--green)">✓ Uploaded to Drive: ${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>`;
                        }
                        showToast('PDF uploaded to Google Drive');
                    } catch (driveErr) {
                        tempPolicyPdfUrl = '';
                        tempPolicyPdfName = '';
                        e.target.value = '';
                        if (statusEl) {
                            statusEl.innerHTML = `<span style="color:var(--red)">❌ Upload failed: ${driveErr.message || 'Network error'}</span>`;
                        }
                        showToast('Google Drive upload failed');
                    }
                } catch (err) {
                    tempPolicyPdfUrl = '';
                    tempPolicyPdfName = '';
                    e.target.value = '';
                    if (statusEl) statusEl.textContent = 'Error: File read failed';
                    showToast('Unable to read PDF file');
                }
            }
            
            function openAddHscMeeting() {
                pendingMeetingFiles = [];
                openModal(`
                <div class="modal-header"><h3>Record HSE Meeting Report</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
                <div class="modal-body" style="display:flex;flex-direction:column;gap:12px">
                    <div>
                        <label style="font-size:11px">Meeting Title / Topic *</label>
                        <input type="text" id="meetingTitle" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="e.g. Monthly Safety Review &amp; Training Alignment">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:12px">
                        <div>
                            <label style="font-size:11px">Meeting Date</label>
                            <input type="date" id="meetingDate" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" value="${new Date().toISOString().slice(0, 10)}">
                        </div>
                        <div>
                            <label style="font-size:11px">Members Present</label>
                            <input type="text" id="meetingMembers" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text)" placeholder="e.g. Marcus V., Sarah J., Clara O.">
                        </div>
                    </div>
                    <div>
                        <label style="font-size:11px">Brief Report / Summary *</label>
                        <textarea id="meetingSummary" rows="4" style="width:100%;padding:8px;margin-top:4px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;color:var(--text);resize:vertical;font-family:var(--font-body);font-size:13px" placeholder="Describe the discussion, decisions, and outcomes of the meeting\u2026"></textarea>
                    </div>
                    <div>
                        <label style="font-size:11px;display:block;margin-bottom:6px;font-weight:600">Attach Files <span style="font-weight:400;color:var(--text3)">(PDFs, attendance lists, photos \u2014 multiple allowed)</span></label>
                        <input type="file" id="meetingFilesInput" accept="image/*,application/pdf,.pdf" multiple style="display:none" onchange="App.handleMeetingFileSelect(this.files)">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('meetingFilesInput').click()">📎 Add Files</button>
                            <span style="font-size:10px;color:var(--text3)">PDF, JPG, PNG accepted \u2022 Max 100MB each</span>
                        </div>
                        <div id="meetingFilesList" style="margin-top:8px;display:flex;flex-direction:column;gap:6px"></div>
                    </div>
                    <button class="btn btn-primary btn-sm" style="width:100%;margin-top:6px" onclick="App.saveHscMeetingFromForm()">Save Meeting Report</button>
                </div>`);
            }

            function handleMeetingFileSelect(files) {
                const nextFiles = Array.from(files || []);
                if (!nextFiles.length) return;
                const seen = new Set(pendingMeetingFiles.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
                for (const file of nextFiles) {
                    const key = `${file.name}:${file.size}:${file.lastModified}`;
                    if (seen.has(key)) continue;
                    if (file.size > 100 * 1024 * 1024) {
                        showToast(`"${file.name}" exceeds 100MB limit and was skipped.`);
                        continue;
                    }
                    const displayName = prompt(`Enter display name for "${file.name}"`, file.name || '');
                    if (displayName === null) continue; // user cancelled prompt
                    const extMatch = file.name.match(/\.([a-zA-Z0-9]+)$/);
                    const ext = extMatch ? extMatch[0] : '';
                    let finalName = displayName.trim() || file.name;
                    if (ext && !finalName.toLowerCase().endsWith(ext.toLowerCase())) {
                        finalName = finalName + ext;
                    }
                    pendingMeetingFiles.push({ file, customName: finalName });
                    seen.add(key);
                }
                updateMeetingFilesDisplay();
                const inp = document.getElementById('meetingFilesInput');
                if (inp) inp.value = '';
            }

            function updateMeetingFilesDisplay() {
                const el = document.getElementById('meetingFilesList');
                if (!el) return;
                if (!pendingMeetingFiles.length) { el.innerHTML = ''; return; }
                el.innerHTML = pendingMeetingFiles.map((item, i) => {
                    const f = item.file;
                    const displayName = item.customName || f.name;
                    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.name);
                    const icon = /\.pdf$/i.test(f.name) ? '📄' : isImage ? '🖼️' : '📎';
                    return `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 10px;border:1px solid var(--border);border-radius:8px;background:var(--bg3);font-size:12px">
                        <div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1">
                            <span style="font-size:16px;flex-shrink:0">${icon}</span>
                            <div style="min-width:0;flex:1">
                                <div style="font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${xmlEscape(displayName)}">${xmlEscape(displayName)}</div>
                                <div style="color:var(--text3);font-size:10px">Original: ${xmlEscape(f.name)} (${(f.size/1024).toFixed(0)} KB)</div>
                            </div>
                        </div>
                        <button style="background:none;border:none;color:var(--red);cursor:pointer;font-size:14px;padding:0 0 0 6px;flex-shrink:0" onclick="App.removeMeetingFileAt(${i})" title="Remove file">✕</button>
                    </div>`;
                }).join('');
            }

            function renameMeetingFileAt(i, newName) {
                if (pendingMeetingFiles[i]) {
                    const trimmed = (newName || '').trim();
                    if (trimmed) {
                        const origName = pendingMeetingFiles[i].file.name;
                        const extMatch = origName.match(/\.([a-zA-Z0-9]+)$/);
                        const ext = extMatch ? extMatch[0] : '';
                        if (ext && !trimmed.toLowerCase().endsWith(ext.toLowerCase())) {
                            pendingMeetingFiles[i].customName = trimmed + ext;
                        } else {
                            pendingMeetingFiles[i].customName = trimmed;
                        }
                    }
                    updateMeetingFilesDisplay();
                }
            }

            function removeMeetingFileAt(i) {
                pendingMeetingFiles.splice(i, 1);
                updateMeetingFilesDisplay();
            }
            
            async function handleMeetingPdfSelect(e) {
                const file = e.target.files[0];
                const statusEl = document.getElementById('meetingPdfStatus');
                if (!file) {
                    tempPdfUrl = '';
                    tempPdfName = '';
                    if (statusEl) statusEl.textContent = 'No PDF attached (Max size 100MB)';
                    return;
                }
                if (!isPdfFile(file)) {
                    showToast('Please upload a valid PDF file');
                    e.target.value = '';
                    tempPdfUrl = '';
                    tempPdfName = '';
                    if (statusEl) statusEl.textContent = 'Error: Invalid file type';
                    return;
                }
                if (file.size > 100 * 1024 * 1024) {
                    showToast('PDF file size exceeds 100MB limit. Please select a smaller file.');
                    e.target.value = '';
                    tempPdfUrl = '';
                    tempPdfName = '';
                    if (statusEl) statusEl.textContent = 'Error: File too large';
                    return;
                }

                if (statusEl) statusEl.textContent = 'Uploading to Google Drive...';

                try {
                    const dataUrl = await readFileAsDataUrl(file);
                    try {
                        const result = await uploadToGoogleDrive({
                            base64: dataUrlToBase64(dataUrl),
                            fileName: file.name,
                            mimeType: 'application/pdf',
                            folder: 'fleetguard/hsc/meetings'
                        });
                        tempPdfUrl = result.url;
                        tempPdfName = file.name;
                        if (statusEl) {
                            statusEl.innerHTML = `<span style="color:var(--green)">✓ Uploaded to Drive: ${file.name} (${(file.size / 1024).toFixed(1)} KB)</span>`;
                        }
                        showToast('PDF uploaded to Google Drive');
                    } catch (driveErr) {
                        tempPdfUrl = '';
                        tempPdfName = '';
                        e.target.value = '';
                        if (statusEl) {
                            statusEl.innerHTML = `<span style="color:var(--red)">❌ Upload failed: ${driveErr.message || 'Network error'}</span>`;
                        }
                        showToast('Google Drive upload failed');
                    }
                } catch (err) {
                    tempPdfUrl = '';
                    tempPdfName = '';
                    e.target.value = '';
                    if (statusEl) statusEl.textContent = 'Error: File read failed';
                    showToast('Unable to read PDF file');
                }
            }
            
            async function saveHscMeetingFromForm() {
                const title = document.getElementById('meetingTitle')?.value.trim();
                const date = document.getElementById('meetingDate')?.value || new Date().toISOString().slice(0, 10);
                const membersPresent = document.getElementById('meetingMembers')?.value.trim() || 'General HSE Members';
                const summary = document.getElementById('meetingSummary')?.value.trim();

                if (!title || !summary) {
                    showToast('Meeting title and summary are required');
                    return;
                }

                // Upload all pending files
                const attachments = [];
                if (pendingMeetingFiles.length) {
                    showUploadLoading('Uploading meeting files\u2026');
                    try {
                        for (const item of pendingMeetingFiles) {
                            const file = item.file;
                            const customName = item.customName || file.name;
                            const isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
                            const isImage = file.type.startsWith('image/');
                            if (!isPdf && !isImage) {
                                showToast(`"${customName}" skipped \u2014 unsupported type.`);
                                continue;
                            }
                            try {
                                const dataUrl = await readFileAsDataUrl(file);
                                const mimeType = file.type || (isPdf ? 'application/pdf' : 'image/jpeg');
                                const ext = isPdf ? 'pdf' : (file.name.split('.').pop() || 'jpg');
                                const safeFileName = customName.replace(/[^\w.-]+/g, '_') || `file.${ext}`;
                                let uploadedUrl = null;
                                let driveId = null;
                                try {
                                    const result = await uploadToGoogleDrive({
                                        base64: dataUrlToBase64(dataUrl),
                                        fileName: safeFileName,
                                        mimeType,
                                        folder: 'fleetguard/hsc/meetings'
                                    });
                                    uploadedUrl = result.url;
                                    driveId = result.id || extractDriveFileId(result.url) || undefined;
                                } catch (_) {
                                    uploadedUrl = dataUrl;
                                }
                                attachments.push({
                                    name: customName,
                                    mimeType,
                                    type: isPdf ? 'pdf' : 'image',
                                    url: uploadedUrl,
                                    driveId,
                                    uploadedAt: formatDate()
                                });
                            } catch (err) {
                                showToast(`Failed to read "${customName}". Skipped.`);
                            }
                        }
                    } finally {
                        hideUploadLoading();
                    }
                }

                const newMeeting = {
                    title,
                    date,
                    membersPresent,
                    summary,
                    attachments,
                    // Legacy fields for backward compat
                    pdfFileName: attachments.find(a => a.type === 'pdf')?.name || '',
                    pdfUrl: attachments.find(a => a.type === 'pdf')?.url || ''
                };

                hscMeetings.push(newMeeting);
                saveHscMeetings();
                closeModal();
                renderHscPolicies();
                showToast('Meeting report saved');
            }
            
            function openPdfDocument(item, missingMessage) {
                const pdfUrl = getHscPdfUrl(item);
                if (!pdfUrl) {
                    showToast(missingMessage || 'No PDF attached');
                    return;
                }
                if (pdfUrl.startsWith('data:')) {
                    const newTab = window.open();
                    if (!newTab) {
                        showToast('Pop-up blocked. Please enable pop-ups.');
                        return;
                    }
                    newTab.document.write(`
                        <html>
                            <head>
                                <title>${item.pdfFileName || 'Document'}</title>
                                <style>
                                    body, html { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background-color: #525659; }
                                    iframe { border: none; width: 100%; height: 100%; }
                                </style>
                            </head>
                            <body>
                                <iframe src="${pdfUrl}"></iframe>
                            </body>
                        </html>
                    `);
                    newTab.document.close();
                    return;
                }
                const opened = window.open(getDrivePreviewUrl(pdfUrl), '_blank');
                if (!opened) showToast('Pop-up blocked. Please enable pop-ups.');
            }

            function downloadPdfDocument(item, missingMessage) {
                const pdfUrl = getHscPdfUrl(item);
                if (!pdfUrl) {
                    showToast(missingMessage || 'No PDF attached');
                    return;
                }
                const link = document.createElement('a');
                link.href = pdfUrl.startsWith('data:') ? pdfUrl : getDrivePreviewUrl(pdfUrl);
                link.target = '_blank';
                link.rel = 'noopener';
                if (item.pdfFileName) link.download = item.pdfFileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast(`Opening ${item.pdfFileName || 'PDF'}`);
            }

            function viewMeetingPdf(idx) {
                openPdfDocument(hscMeetings[idx], 'No PDF attached');
            }
            
            function downloadMeetingPdf(idx) {
                downloadPdfDocument(hscMeetings[idx], 'No PDF attached');
            }

            function viewPolicyPdf(idx) {
                openPdfDocument(hscPolicies[idx], 'No signed PDF attached');
            }

            function downloadPolicyPdf(idx) {
                downloadPdfDocument(hscPolicies[idx], 'No signed PDF attached');
            }
            
            function deleteHscMeeting(idx) {
                if (!confirm('Are you sure you want to remove this meeting report?')) return;
                hscMeetings.splice(idx, 1);
                saveHscMeetings();
                renderHscPolicies();
                showToast('Meeting report removed');
            }

            // ═══════════ FILE UPLOAD (Settings) ═══════════
            function handleSettingsFileUpload(e) {
                const file = e.target.files[0];
                if (!file) return;
                const statusEl = document.getElementById('settingsFileStatus');
                const resultEl = document.getElementById('settingsFileResult');
                statusEl.textContent = file.name;
                const reader = new FileReader();
                reader.onload = ev => {
                    try {
                        let updatedDrivers = 0, updatedTrucks = 0, addedDrivers = 0, addedTrucks = 0;
                        const data = JSON.parse(ev.target.result);
                        // Full export format
                        if (data.drivers || data.trucks) {
                            if (data.drivers) {
                                data.drivers.forEach(nd => {
                                    const ex = drivers.find(d => d.id === nd.id || d.name === nd.name);
                                    if (ex) { Object.assign(ex, nd); updatedDrivers++; }
                                    else { nd._idx = drivers.length ? Math.max(...drivers.map(d => d._idx)) + 1 : 0; drivers.push(nd); addedDrivers++; }
                                });
                            }
                            if (data.trucks) {
                                data.trucks.forEach(nt => {
                                    const ex = trucks.find(t => t.plate === nt.plate || t.vin === nt.vin);
                                    if (ex) { Object.assign(ex, nt); updatedTrucks++; }
                                    else { nt._idx = trucks.length ? Math.max(...trucks.map(t => t._idx)) + 1 : 0; trucks.push(nt); addedTrucks++; }
                                });
                            }
                            if (data.settings) Object.assign(settings, data.settings);
                        } else if (Array.isArray(data)) {
                            // Array of drivers or trucks
                            data.forEach(item => {
                                if (item.plate !== undefined || item.vin !== undefined) {
                                    const ex = trucks.find(t => t.plate === item.plate || t.vin === item.vin);
                                    if (ex) { Object.assign(ex, item); updatedTrucks++; }
                                    else { item._idx = trucks.length ? Math.max(...trucks.map(t => t._idx)) + 1 : 0; if (!item.documents) item.documents = []; if (!item.issues) item.issues = []; trucks.push(item); addedTrucks++; }
                                } else {
                                    const ex = drivers.find(d => d.id === item.id || d.name === item.name);
                                    if (ex) { Object.assign(ex, item); updatedDrivers++; }
                                    else { item._idx = drivers.length ? Math.max(...drivers.map(d => d._idx)) + 1 : 0; if (!item.violations) item.violations = []; drivers.push(item); addedDrivers++; }
                                }
                            });
                        }
                        saveAll();
                        resultEl.innerHTML = `<div style="background:rgba(34,201,122,0.1);border:1px solid rgba(34,201,122,0.25);border-radius:8px;padding:12px;font-size:12px;color:var(--green)">
                            ✅ <strong>File processed successfully</strong><br>
                            Drivers: +${addedDrivers} added, ${updatedDrivers} updated<br>
                            Trucks: +${addedTrucks} added, ${updatedTrucks} updated
                        </div>`;
                        updateSidebarBadges();
                        showToast('File applied — data updated');
                    } catch (err) {
                        resultEl.innerHTML = `<div style="background:rgba(240,76,90,0.1);border:1px solid rgba(240,76,90,0.25);border-radius:8px;padding:12px;font-size:12px;color:var(--red)">❌ Failed to parse file: ${err.message}</div>`;
                    }
                    e.target.value = '';
                };
                reader.readAsText(file);
            }

            function csvToRows(csvText) {
                const rows = [];
                let row = [];
                let cell = '';
                let inQuotes = false;
                for (let i = 0; i < csvText.length; i++) {
                    const ch = csvText[i];
                    const next = csvText[i + 1];
                    if (ch === '"') {
                        if (inQuotes && next === '"') {
                            cell += '"';
                            i++;
                        } else {
                            inQuotes = !inQuotes;
                        }
                    } else if (ch === ',' && !inQuotes) {
                        row.push(cell);
                        cell = '';
                    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
                        if (ch === '\r' && next === '\n') i++;
                        row.push(cell);
                        if (row.some(v => (v || '').trim() !== '')) rows.push(row);
                        row = [];
                        cell = '';
                    } else {
                        cell += ch;
                    }
                }
                if (cell.length || row.length) {
                    row.push(cell);
                    if (row.some(v => (v || '').trim() !== '')) rows.push(row);
                }
                return rows;
            }

            function normalizeImportKey(key) {
                return String(key || '').trim().toLowerCase().replace(/\s+/g, '_');
            }

            function parseStructuredImport(text, fileName) {
                const lowerName = (fileName || '').toLowerCase();
                if (lowerName.endsWith('.json')) {
                    const parsed = JSON.parse(text);
                    // If the imported JSON is an object with 'drivers' or 'trucks' keys, flatten it
                    if (!Array.isArray(parsed) && typeof parsed === 'object') {
                        const items = [];
                        if (Array.isArray(parsed.drivers)) items.push(...parsed.drivers.map(d => ({ __type: 'driver', ...d })));
                        if (Array.isArray(parsed.trucks)) items.push(...parsed.trucks.map(t => ({ __type: 'truck', ...t })));
                        if (items.length) return items;
                        // Also support arrays inside 'rows' / 'data' keys (old behaviour)
                        if (Array.isArray(parsed.rows)) return parsed.rows;
                        if (Array.isArray(parsed.data)) return parsed.data;
                        throw new Error('No valid data found. Expected "drivers", "trucks", "rows" or "data" array.');
                    }
                    // If it's a plain array, return it directly
                    if (Array.isArray(parsed)) return parsed;
                    throw new Error('JSON must be an array or contain "drivers"/"trucks"/"rows"/"data" array');
                }
                const rows = csvToRows(text);
                if (!rows.length) return [];
                const headers = rows[0].map(h => normalizeImportKey(h));
                return rows.slice(1).map(r => {
                    const obj = {};
                    headers.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
                    return obj;
                });
            }

            function validateImportHeaders(type, rows) {
                const keys = new Set(Object.keys(rows[0] || {}).map(normalizeImportKey));
                if (type === 'drivers') return keys.has('driver_id') ? [] : ['driver_id'];
                if (type === 'violations') {
                    const miss = [];
                    // Accept driver identifiers: driver_id, plate_number, plate, driver_name, name, or driver_id_or_plate
                    const hasDriverId = keys.has('driver_id');
                    const hasPlate = keys.has('plate_number') || keys.has('plate');
                    const hasName = keys.has('driver_name') || keys.has('name');
                    const hasAnyDriver = hasDriverId || hasPlate || hasName;
                    
                    if (!hasAnyDriver) miss.push('driver_id (or plate_number or driver_name)');
                    if (!keys.has('violation_date')) miss.push('violation_date');
                    if (!keys.has('violation_type')) miss.push('violation_type');
                    return miss;
                }
                if (type === 'trucks') {
                    const miss = [];
                    if (!keys.has('truck_plate')) miss.push('truck_plate');
                    if (!keys.has('document_type')) miss.push('document_type');
                    if (!keys.has('expiry_date')) miss.push('expiry_date');
                    return miss;
                }
                if (type === 'loss') {
                    const miss = [];
                    const hasDriverId = keys.has('driver_id');
                    const hasPlate = keys.has('plate_number') || keys.has('plate');
                    const hasName = keys.has('driver_name') || keys.has('name');
                    const hasAnyDriver = hasDriverId || hasPlate || hasName;
                    
                    if (!hasAnyDriver) miss.push('driver_id (or plate_number or driver_name)');
                    if (!keys.has('loss_date')) miss.push('loss_date');
                    if (!keys.has('loss_type')) miss.push('loss_type');
                    if (!keys.has('loss_amount')) miss.push('loss_amount');
                    return miss;
                }
                return ['type'];
            }

            function ensureDriverCollections(driver) {
                if (!Array.isArray(driver.violations)) driver.violations = [];
                if (!Array.isArray(driver.tripsList)) driver.tripsList = [];
                if (!Array.isArray(driver.warningsList)) driver.warningsList = [];
                if (!Array.isArray(driver.suspensionsList)) driver.suspensionsList = [];
                if (!Array.isArray(driver.accidentsList)) driver.accidentsList = [];
                if (!Array.isArray(driver.lossesList)) driver.lossesList = [];
                if (!Array.isArray(driver.trainings)) driver.trainings = [];
                if (!Array.isArray(driver.files)) driver.files = [];
                if (!driver.custom || typeof driver.custom !== 'object') driver.custom = {};
            }

            function ensureTruckCollections(truck) {
                if (!Array.isArray(truck.documents)) truck.documents = [];
                if (!Array.isArray(truck.issues)) truck.issues = [];
                if (!Array.isArray(truck.files)) truck.files = [];
                if (!truck.custom || typeof truck.custom !== 'object') truck.custom = {};
            }

            function ensureTrailerCollections(trailer) {
                if (!Array.isArray(trailer.documents)) trailer.documents = [];
                if (!Array.isArray(trailer.issues)) trailer.issues = [];
                if (!Array.isArray(trailer.files)) trailer.files = [];
                if (!trailer.custom || typeof trailer.custom !== 'object') trailer.custom = {};
            }

            function createFileId() {
                return 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            }

            function sanitizeFileName(name) {
                return String(name || '')
                    .trim()
                    .replace(/\s+/g, '_')
                    .replace(/[^A-Za-z0-9._-]/g, '')
                    .replace(/_+/g, '_') || 'attachment';
            }

            function normalizePlate(value) {
                return String(value || '')
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '');
            }

            function dataUrlToBase64(dataUrl) {
                if (!dataUrl) return '';
                if (typeof dataUrl === 'object' && dataUrl.data) dataUrl = dataUrl.data;
                if (dataUrl === '__local__') return '';
                return dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
            }

            function readFileAsDataUrl(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = ev => resolve(ev.target.result);
                    reader.onerror = () => reject(new Error('Unable to read file'));
                    reader.readAsDataURL(file);
                });
            }

            function resolveDriveUrl(value) {
                if (!value || typeof value !== 'string') return '';
                if (value.startsWith('http://') || value.startsWith('https://')) return value;
                if (value.startsWith('data:')) return '';
                return '';
            }

            function extractDriveFileId(value) {
                const url = resolveDriveUrl(value) || (typeof value === 'string' ? value : '');
                if (!url) return '';
                const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
                return match ? match[1] : '';
            }

            function getDriveThumbnailUrl(storedUrl, size) {
                if (typeof storedUrl === 'string' && storedUrl.startsWith('data:')) return storedUrl;
                const id = extractDriveFileId(storedUrl);
                if (id) return `https://drive.google.com/thumbnail?id=${id}&sz=${size || 'w400'}`;
                return resolveDriveUrl(storedUrl) || storedUrl || '';
            }

            function getDrivePreviewUrl(storedUrl) {
                const id = extractDriveFileId(storedUrl);
                if (id) return `https://drive.google.com/file/d/${id}/preview`;
                return resolveDriveUrl(storedUrl) || storedUrl || '';
            }

            function getDriveEmbedUrl(storedUrl) {
                return getDriveThumbnailUrl(storedUrl, 'w400');
            }

            function getHscPdfUrl(item) {
                if (!item) return '';
                const pdfVal = item.pdfUrl || item.pdfStorageUrl || '';
                if (typeof pdfVal === 'string' && pdfVal.startsWith('data:')) return pdfVal;
                const driveUrl = resolveDriveUrl(pdfVal);
                if (driveUrl) return driveUrl;
                if (typeof item.pdfFileData === 'string' && item.pdfFileData.startsWith('data:')) return item.pdfFileData;
                return '';
            }

            async function uploadToGoogleDrive({ base64, fileName, mimeType, folder }) {
                const endpoint = window.GOOGLE_APPS_SCRIPT_UPLOAD_URL;
                if (!endpoint || endpoint.includes('YOUR_SCRIPT_ID')) {
                    throw new Error('Google Apps Script upload URL is not configured.');
                }
                if (!base64) throw new Error('File payload is empty.');

                // Google Apps Script deployed web apps redirect via 302 before serving
                // the response. fetch with mode:'cors' cannot follow these redirects and
                // throws a CORS error. Using redirect:'follow' allows the chain to complete.
                const response = await fetch(endpoint, {
                    method: 'POST',
                    mode: 'cors',
                    redirect: 'follow',
                    headers: { 'Content-Type': 'text/plain' },
                    body: JSON.stringify({
                        base64,
                        fileName: fileName || 'upload.bin',
                        mimeType: mimeType || 'application/octet-stream',
                        folder: folder || 'fleetguard'
                    })
                });

                if (!response.ok) {
                    throw new Error(`Upload failed — server returned ${response.status}. Please check your internet connection and try again.`);
                }

                let result;
                try {
                    result = await response.json();
                } catch (parseErr) {
                    throw new Error('Upload server returned an invalid response. Please try again.');
                }

                if (Array.isArray(result)) {
                    result = result[0] || {};
                }

                if (result && result.success === false) {
                    throw new Error(result.error || 'Upload failed.');
                }

                if (!result || !result.url) {
                    throw new Error(result?.error || 'Upload did not return a Google Drive URL. Please try again.');
                }
                return { url: result.url, id: result.id || null };
            }

            function deleteAttachmentFromStorage(_file) {
                return Promise.resolve();
            }

            function formatDate(value) {
                return new Date(value || Date.now()).toISOString().slice(0, 10);
            }

            function isImageFile(file) {
                if (file.type && file.type.startsWith('image/')) return true;
                return /\.(jpe?g|png|gif|webp|bmp|svg|heic|heif|tiff?|avif|jfif|raw|cr2|nef|orf|sr2|ico)$/i.test(file.name || '');
            }

            function isPdfFile(file) {
                if (file.type === 'application/pdf') return true;
                return /\.pdf$/i.test(file.name || '');
            }

            function isVideoFile(file) {
                if (file.type && file.type.startsWith('video/')) return true;
                return /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name || '');
            }

            function isSupportedAttachmentFile(file) {
                return isImageFile(file) || isPdfFile(file) || isVideoFile(file);
            }

            function getAttachmentMimeType(fileRecord) {
                if (fileRecord.mimeType) return fileRecord.mimeType;
                const data = fileRecord.data || fileRecord.storageUrl || '';
                if (data.startsWith('data:application/pdf')) return 'application/pdf';
                if (data.startsWith('data:image/png')) return 'image/png';
                if (data.startsWith('data:video/')) return data.slice(5).split(';')[0];
                return 'image/jpeg';
            }

            function getFileTypeLabel(fileRecord) {
                const mime = getAttachmentMimeType(fileRecord);
                if (mime === 'application/pdf') return 'PDF';
                if (mime === 'image/png') return 'PNG';
                if (mime.startsWith('video/')) return 'Video';
                return 'Image';
            }

            function getAttachmentThumbnailHtml(fileRecord) {
                const mime = getAttachmentMimeType(fileRecord);
                const data = fileRecord.data || fileRecord.storageUrl || '';
                if (mime === 'application/pdf') {
                    return `<div style="width:60px;height:42px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,80,80,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg width="22" height="28" viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="20" height="26" rx="3" fill="#ff4444" fill-opacity="0.18" stroke="#ff4444" stroke-width="1.5"/><path d="M5 8h8M5 12h10M5 16h7" stroke="#ff6666" stroke-width="1.4" stroke-linecap="round"/><text x="11" y="24" font-size="6" fill="#ff6666" text-anchor="middle" font-family="sans-serif" font-weight="bold">PDF</text></svg>
                    </div>`;
                }
                if (mime.startsWith('video/')) {
                    return `<div style="width:60px;height:42px;border-radius:10px;border:1px solid rgba(255,255,255,0.1);background:rgba(98,132,255,0.16);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="4" fill="#4f7cff" fill-opacity="0.18" stroke="#6d99ff" stroke-width="1.4"/><path d="M10 9l5 3-5 3V9Z" fill="#7da4ff"/></svg>
                    </div>`;
                }
                const thumbSrc = data.startsWith('data:') ? data : getDriveThumbnailUrl(data, 'w200');
                return `<img src="${thumbSrc}" loading="lazy" style="width:60px;height:42px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.08);flex-shrink:0;">`;
            }

            function readFileAsDataUrl(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = ev => resolve(ev.target.result);
                    reader.onerror = () => reject(new Error('Unable to read file'));
                    reader.readAsDataURL(file);
                });
            }

            function getVideoDurationSeconds(file) {
                return new Promise((resolve, reject) => {
                    if (!file) return reject(new Error('No video file provided'));
                    const url = URL.createObjectURL(file);
                    const video = document.createElement('video');
                    video.preload = 'metadata';
                    video.onloadedmetadata = () => {
                        const duration = Number.isFinite(video.duration) ? video.duration : 0;
                        URL.revokeObjectURL(url);
                        if (duration > 0) resolve(duration);
                        else reject(new Error('Unable to read video duration'));
                    };
                    video.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error('Unable to read video duration'));
                    };
                    video.src = url;
                });
            }

            async function validateAttachmentFile(file, entityType) {
                if (!file) return { ok: false, error: 'No file selected.' };
                const MAX_SIZE = 100 * 1024 * 1024;
                if (file.size > MAX_SIZE) {
                    return { ok: false, error: `"${file.name}" exceeds the 100MB file size limit.` };
                }
                
                if (entityType !== 'driver' && isVideoFile(file)) {
                    return { ok: false, error: `Video attachments are only supported for drivers.` };
                }
                if (isVideoFile(file)) {
                    try {
                        const duration = await getVideoDurationSeconds(file);
                        if (duration > 60) {
                            return { ok: false, error: `"${file.name}" exceeds the 60 second video limit.` };
                        }
                    } catch (err) {
                        // Ignore error if video duration cannot be determined, allowing the upload.
                        console.warn('Could not determine video duration:', err);
                    }
                } else if (!isSupportedAttachmentFile(file)) {
                    return { ok: false, error: `"${file.name}" is not a supported file type. Please upload an image, PDF, or supported video.` };
                }
                
                return { ok: true };
            }

            function compressImageFile(file) {
                return new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = ev => {
                        const img = new Image();
                        img.onload = () => {
                            try {
                                const maxDim = 1200;
                                let width = img.naturalWidth || 800;
                                let height = img.naturalHeight || 600;
                                if (width > maxDim || height > maxDim) {
                                    if (width > height) {
                                        height = Math.round(height * (maxDim / width));
                                        width = maxDim;
                                    } else {
                                        width = Math.round(width * (maxDim / height));
                                        height = maxDim;
                                    }
                                }
                                const canvas = document.createElement('canvas');
                                canvas.width = width;
                                canvas.height = height;
                                const ctx = canvas.getContext('2d');
                                ctx.drawImage(img, 0, 0, width, height);
                                let quality = 0.92;
                                let dataUrl = canvas.toDataURL('image/jpeg', quality);
                                const targetBytes = 400 * 1024;
                                while (dataUrl.length > targetBytes * 1.37 && quality > 0.55) {
                                    quality -= 0.08;
                                    dataUrl = canvas.toDataURL('image/jpeg', quality);
                                }
                                resolve(dataUrl);
                            } catch (_) {
                                resolve(ev.target.result);
                            }
                        };
                        img.onerror = () => resolve(ev.target.result);
                        img.src = ev.target.result;
                    };
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(file);
                });
            }

            function handleDriverFileUpload(idx, files) {
                addEntityFiles('driver', idx, files);
            }

            function handleTruckFileUpload(idx, files) {
                addEntityFiles('truck', idx, files);
            }

            function handleTrailerFileUpload(idx, files) {
                addEntityFiles('trailer', idx, files);
            }

            function addEntityFiles(entityType, idx, files) {
                const target = entityType === 'driver'
                    ? drivers.find(x => String(x._idx) === String(idx))
                    : entityType === 'trailer'
                        ? trailers.find(x => String(x._idx) === String(idx))
                        : trucks.find(x => String(x._idx) === String(idx));
                if (!target || !files || !files.length) return;

                (async () => {
                    const pending = [];
                    for (const file of Array.from(files)) {
                        const validation = await validateAttachmentFile(file, entityType);
                        if (!validation.ok) {
                            showToast(validation.error);
                            continue;
                        }
                        const displayName = prompt(`Enter display name for "${file.name}"`, file.name || '');
                        if (displayName === null) continue;
                        const name = displayName.trim() || file.name || `Attachment ${formatDate()}`;
                        pending.push({
                            file,
                            name,
                            mimeType: file.type || (isPdfFile(file) ? 'application/pdf' : isVideoFile(file) ? 'video/mp4' : 'image/jpeg'),
                            fileId: createFileId()
                        });
                    }

                    const inputId = entityType === 'driver'
                        ? `driverAttachmentInput_${idx}`
                        : entityType === 'trailer'
                            ? `trailerAttachInput_${idx}`
                            : `truckAttachmentInput_${idx}`;
                    const inputEl = document.getElementById(inputId);
                    if (inputEl) inputEl.value = '';

                    if (!pending.length) return;

                    _uploadModalTarget = { entityType, idx };
                    showUploadLoading(`Uploading ${pending.length} file${pending.length === 1 ? '' : 's'} to Google Drive…`);
                    reopenEntityModal(entityType, idx);

                    try {
                        const tasks = pending.map(async ({ file, name, mimeType, fileId }) => {
                            const dataUrl = isImageFile(file)
                                ? await compressImageFile(file)
                                : await readFileAsDataUrl(file);

                            if (!dataUrl) {
                                return { error: `Failed to read file "${file.name}".`, id: fileId };
                            }

                            const extMatch = (file.name || '').match(/\.([a-zA-Z0-9]+)$/);
                            let ext = extMatch ? extMatch[1].toLowerCase() : '';
                            if (!ext || !/^(jpg|jpeg|png|gif|webp|pdf|mp4|mov|webm|m4v)$/i.test(ext)) {
                                ext = isPdfFile(file) ? 'pdf' : isVideoFile(file) ? 'mp4' : 'jpg';
                            }
                            const safeFileName = `${sanitizeFileName(name) || fileId}.${ext}`;
                            const folder = `fleetguard/attachments/${entityType}/${idx}`;

                            const record = {
                                id: fileId,
                                name,
                                mimeType,
                                uploadedAt: formatDate(),
                                data: dataUrl,
                                driveId: undefined,
                                uploadedToDrive: false
                            };

                            try {
                                const result = await uploadToGoogleDrive({
                                    base64: dataUrlToBase64(dataUrl),
                                    fileName: safeFileName,
                                    mimeType,
                                    folder
                                });
                                record.data = result.url;
                                record.driveId = result.id || extractDriveFileId(result.url) || undefined;
                                record.uploadedToDrive = true;
                            } catch (err) {
                                record.uploadError = err.message || 'Google Drive upload failed';
                            }

                            return record;
                        });

                        const results = await Promise.allSettled(tasks);
                        const fulfilled = results
                            .filter(r => r.status === 'fulfilled' && r.value)
                            .map(r => r.value);
                        const rejected = results
                            .filter(r => r.status === 'rejected')
                            .map(r => r.reason?.message || 'Could not process file');
                        const validationSkipped = Array.from(files).length - pending.length;

                        const savedFiles = fulfilled.filter(file => !file.error);
                        const driveSuccess = savedFiles.filter(file => file.uploadedToDrive);
                        const uploadFailed = savedFiles.filter(file => file.uploadError || !file.uploadedToDrive);

                        if (savedFiles.length) {
                            target.files = target.files || [];
                            target.files.push(...savedFiles);
                            if (entityType === 'driver') ensureDriverCollections(target);
                            else if (entityType === 'trailer') ensureTrailerCollections(target);
                            else ensureTruckCollections(target);
                            saveAll();
                        }

                        const parts = [];
                        if (driveSuccess.length) {
                            parts.push(`✅ ${driveSuccess.length} file${driveSuccess.length === 1 ? '' : 's'} uploaded successfully`);
                        }
                        if (uploadFailed.length) {
                            parts.push(`⚠️ ${uploadFailed.length} file${uploadFailed.length === 1 ? '' : 's'} stored locally; upload pending`);
                        }
                        if (validationSkipped) {
                            parts.push(`⏭ ${validationSkipped} file${validationSkipped === 1 ? '' : 's'} skipped`);
                        }
                        if (rejected.length) {
                            parts.push(`❌ ${rejected.length} file${rejected.length === 1 ? '' : 's'} failed`);
                        }

                        if (parts.length) showToast(parts.join(' · '));

                    } catch (err) {
                        showToast('❌ Upload error: ' + (err.message || 'An unexpected error occurred. Please try again.'));
                    } finally {
                        hideUploadLoading();
                        _uploadModalTarget = null;
                        reopenEntityModal(entityType, idx);
                    }
                })();
            }

            function deleteAttachment(entityType, idx, fileId) {
                const target = entityType === 'driver' 
                    ? drivers.find(x => String(x._idx) === String(idx)) 
                    : entityType === 'trailer'
                        ? trailers.find(x => String(x._idx) === String(idx))
                        : trucks.find(x => String(x._idx) === String(idx));
                if (!target || !Array.isArray(target.files)) return;
                const removed = target.files.find(f => f.id === fileId);
                target.files = target.files.filter(f => f.id !== fileId);
                if (removed) deleteAttachmentFromStorage(removed);
                saveAll();
                if (entityType === 'driver') App.openDriverModal(idx);
                else if (entityType === 'trailer') App.openTrailerModal(idx);
                else App.openTruckModal(idx);
                showToast('Attachment deleted');
            }

            function renameAttachment(entityType, idx, fileId) {
                const target = entityType === 'driver' 
                    ? drivers.find(x => String(x._idx) === String(idx)) 
                    : entityType === 'trailer'
                        ? trailers.find(x => String(x._idx) === String(idx))
                        : trucks.find(x => String(x._idx) === String(idx));
                if (!target || !Array.isArray(target.files)) return;
                const file = target.files.find(f => f.id === fileId);
                if (!file) return;
                const newName = prompt('Enter new attachment name', file.name || '');
                if (newName === null) return;
                file.name = newName.trim() || file.name;
                saveAll();
                if (entityType === 'driver') App.openDriverModal(idx);
                else if (entityType === 'trailer') App.openTrailerModal(idx);
                else App.openTruckModal(idx);
                showToast('Attachment renamed');
            }

            function previewAttachment(entityType, idx, fileId) {
                const target = entityType === 'driver' 
                    ? drivers.find(x => String(x._idx) === String(idx)) 
                    : entityType === 'trailer'
                        ? trailers.find(x => String(x._idx) === String(idx))
                        : trucks.find(x => String(x._idx) === String(idx));
                const file = target?.files?.find(f => f.id === fileId);
                if (!file) return;

                const shareUrl = resolveDriveUrl(file.data || file.storageUrl || '') || file.data || '';
                const driveId = file.driveId || extractDriveFileId(shareUrl);
                const mimeType = getAttachmentMimeType(file);
                const isPdf = mimeType === 'application/pdf';
                const isVideo = mimeType.startsWith('video/');
                let previewContent = '';

                // Build download button HTML (works for both Drive and local data URLs)
                const downloadBtnHtml = `<button class="btn btn-primary btn-sm" onclick="App.downloadAttachment('${entityType}', ${idx}, '${fileId}')">&#8595; Download</button>`;

                if (driveId) {
                    previewContent = `
                <iframe src="https://drive.google.com/file/d/${driveId}/preview" title="${xmlEscape(String(file.name || 'Attachment'))}" style="width:100%;height:70vh;border:none;border-radius:16px;background:#111"></iframe>
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <a class="btn btn-ghost btn-sm" href="https://drive.google.com/file/d/${driveId}/view" target="_blank" rel="noopener">&#128065; Open in Drive</a>
                        <a class="btn btn-primary btn-sm" href="https://drive.google.com/uc?export=download&id=${driveId}" target="_blank" rel="noopener">&#8595; Download</a>
                    </div>
                    <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                </div>`;
                } else if (typeof shareUrl === 'string' && shareUrl.startsWith('data:')) {
                    if (isPdf) {
                        previewContent = `
                <iframe src="${shareUrl}" title="${xmlEscape(String(file.name || 'PDF'))}" style="width:100%;height:70vh;border:none;border-radius:16px;background:#fff"></iframe>
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
                    ${downloadBtnHtml}
                    <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                </div>`;
                    } else if (isVideo) {
                        previewContent = `
                <video controls playsinline style="width:100%;max-height:70vh;border-radius:16px;background:#000">
                    <source src="${shareUrl}" type="${mimeType}">
                </video>
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
                    ${downloadBtnHtml}
                    <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                </div>`;
                    } else {
                        previewContent = `
                <img src="${shareUrl}" alt="${xmlEscape(String(file.name || 'Attachment'))}" style="width:100%;max-height:70vh;object-fit:contain;border-radius:16px;border:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
                    ${downloadBtnHtml}
                    <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                </div>`;
                    }
                } else {
                    previewContent = `
                <p style="color:var(--text3);font-size:13px">Preview unavailable for this attachment.</p>
                ${shareUrl ? `<a class="btn btn-ghost btn-sm" href="${shareUrl}" target="_blank" rel="noopener">Open link</a>` : ''}
                <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
                    ${downloadBtnHtml}
                    <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
                </div>`;
                }

                openModal(`
            <div class="modal-header"><div><div class="modal-name">${xmlEscape(String(file.name))}</div><div class="modal-sub">${getFileTypeLabel(file)} &bull; Uploaded: ${file.uploadedAt}</div></div><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body" style="display:flex;flex-direction:column;gap:14px">
                ${previewContent}
            </div>`);
            }

            function downloadAttachment(entityType, idx, fileId) {
                const target = entityType === 'driver'
                    ? drivers.find(x => String(x._idx) === String(idx))
                    : entityType === 'trailer'
                        ? trailers.find(x => String(x._idx) === String(idx))
                        : trucks.find(x => String(x._idx) === String(idx));
                const file = target?.files?.find(f => f.id === fileId);
                if (!file) return;

                const shareUrl = resolveDriveUrl(file.data || file.storageUrl || '') || file.data || '';
                const driveId = file.driveId || extractDriveFileId(shareUrl);
                const mimeType = getAttachmentMimeType(file);
                const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : mimeType === 'video/mp4' ? 'mp4' : mimeType === 'video/quicktime' ? 'mov' : mimeType === 'video/webm' ? 'webm' : mimeType.startsWith('video/') ? 'mp4' : 'jpg';
                const safeName = (file.name || 'attachment').replace(/[^\w\s.-]/g, '_').trim() || 'attachment';
                const fileName = safeName.includes('.') ? safeName : `${safeName}.${ext}`;

                if (driveId) {
                    // For Google Drive files, open download URL in new tab
                    const a = document.createElement('a');
                    a.href = `https://drive.google.com/uc?export=download&id=${driveId}`;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    a.click();
                } else if (typeof shareUrl === 'string' && shareUrl.startsWith('data:')) {
                    // For locally stored data URLs, trigger a download
                    const a = document.createElement('a');
                    a.href = shareUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else if (shareUrl) {
                    window.open(shareUrl, '_blank', 'noopener');
                } else {
                    showToast('No file data available to download.');
                }
            }

            function toNumberOrValue(value) {
                if (value === '' || value === null || value === undefined) return value;
                const n = Number(value);
                return Number.isNaN(n) ? value : n;
            }

            function nextDriverIdx() {
                return drivers.length ? Math.max(...drivers.map(d => Number(d._idx) || 0)) + 1 : 0;
            }

            function setImportResult(html) {
                const resultEl = document.getElementById('importUpdatesResult');
                if (resultEl) resultEl.innerHTML = html;
            }

            function getActivePage() {
                const active = document.querySelector('.page.active');
                return active ? active.id.replace('page-', '') : 'dashboard';
            }

            function refreshAllViews() {
                showPage(getActivePage());
            }

            function refreshFromFirebase(data) {
                // Update global state from Firebase data with validation
                if (!data) return;
                // Guard against the race where the live listener fires before loadAll() completes
                // on a fresh device (empty localStorage + in-flight .once('value') fetch).
                if (!dataReady) return;
                
                // Update global variables (handle empty lists correctly)
                drivers = Array.isArray(data.drivers) ? data.drivers : [];
                trucks = Array.isArray(data.trucks) ? data.trucks : [];
                trailers = Array.isArray(data.trailers) ? data.trailers : [];
                orders = Array.isArray(data.orders) ? data.orders : [];
                jobCards = Array.isArray(data.jobCards) ? data.jobCards : [];
                if (data.settings) settings = data.settings;

                // ── Recycling Bin live sync ──────────────────────────────
                // Merge incoming recycleBin from Firebase so any item deleted
                // by another user instantly appears (or disappears) on this device.
                if (Array.isArray(data.recycleBin)) {
                    recycleBin = data.recycleBin;
                    localStorage.setItem('fg3_recyclebin', JSON.stringify(recycleBin));
                }

                hydrateAttachments(drivers, 'fg3_drivers');
                hydrateAttachments(trucks, 'fg3_trucks');
                hydrateAttachments(trailers, 'fg3_trailers');

                // Sync HSC data from Firebase
                if (Array.isArray(data.hscPolicies)) {
                    hscPolicies = data.hscPolicies;
                    localStorage.setItem('fg3_hscpolicies', JSON.stringify(hscPolicies));
                }
                if (Array.isArray(data.hscMeetings)) {
                    hscMeetings = data.hscMeetings;
                    localStorage.setItem('fg3_hscmeetings', JSON.stringify(hscMeetings));
                }
                
                // Initialize default fields on the newly fetched data
                _afterLoad();
                
                // Cache updated data locally
                localStorage.setItem('fg3_drivers', JSON.stringify(drivers));
                localStorage.setItem('fg3_trucks', JSON.stringify(trucks));
                localStorage.setItem('fg3_trailers', JSON.stringify(trailers));
                localStorage.setItem('fg3_settings', JSON.stringify(settings));
                localStorage.setItem('fg3_orders', JSON.stringify(orders));
                localStorage.setItem('fg3_jobcards', JSON.stringify(jobCards));
                
                // Only refresh if no modal is currently open
                const modalOpen = document.getElementById('modalOverlay') &&
                                  document.getElementById('modalOverlay').classList.contains('open');
                if (_uploadModalTarget) {
                    reopenEntityModal(_uploadModalTarget.entityType, _uploadModalTarget.idx);
                } else if (!modalOpen) {
                    refreshAllViews();
                    // If recyclebin page is active, also re-render it so remote deletions
                    // and restorations appear instantly without a manual page refresh.
                    if (getActivePage() === 'recyclebin') {
                        renderRecycleBin();
                    }
                }
            }

            function openImportUpdatesModal() {
                openModal(`
            <div class="modal-header"><h3>Import Updates</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                <div style="display:flex;flex-direction:column;gap:10px">
                    <label>Data Type</label>
                    <select id="importUpdatesType">
                        <option value="drivers">Drivers</option>
                        <option value="violations">Violations</option>
                        <option value="trucks">Trucks</option>
                        <option value="loss">Loss Data</option>
                    </select>
                    <label>File (CSV or JSON)</label>
                    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                        <label for="importUpdatesFile" class="btn btn-ghost btn-sm" style="cursor:pointer;">⬆ Upload File</label>
                        <input type="file" id="importUpdatesFile" accept=".csv,.json" style="display:none">
                        <a href="#" onclick="App.downloadImportTemplate();return false;" style="font-size:12px;color:var(--blue);text-decoration:none">Download Template</a>
                    </div>
                    <div id="importUpdatesFileName" style="font-size:12px;color:var(--text3)">No file chosen</div>
                    <div id="importUpdatesResult" style="font-size:12px;color:var(--text3)"></div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.processImportUpdates()">Import</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Close</button>
            </div>`);
                const input = document.getElementById('importUpdatesFile');
                if (input) {
                    input.addEventListener('change', e => {
                        const file = e.target.files && e.target.files[0];
                        const nameEl = document.getElementById('importUpdatesFileName');
                        if (nameEl) nameEl.textContent = file ? file.name : 'No file chosen';
                    });
                }
            }

            function openBulkAttachmentImportModal() {
                openModal(`
            <div class="modal-header"><h3>Import Attachments</h3><div class="modal-close" onclick="App.closeModal()">✕</div></div>
            <div class="modal-body">
                <div style="display:flex;flex-direction:column;gap:14px">
                    <label>Destination</label>
                    <select id="bulkAttachmentTargetDestination">
                        <option value="truck">Trucks Subpage</option>
                        <option value="trailer">Trailers Subpage</option>
                    </select>
                    <label>Document Category</label>
                    <select id="bulkAttachmentDocCategory">
                        <option>Insurance</option>
                        <option>COMESA</option>
                        <option>Calibration</option>
                        <option>Yellow Card</option>
                        <option>Inspection</option>
                        <option>Other</option>
                    </select>
                    <label>Files</label>
                    <div id="bulkAttachmentDropzone" class="bulk-import-dropzone"
                        onclick="document.getElementById('bulkAttachmentInput').click()"
                        ondragover="event.preventDefault();this.classList.add('dragging')"
                        ondragleave="event.preventDefault();this.classList.remove('dragging')"
                        ondrop="event.preventDefault();this.classList.remove('dragging');App.handleBulkAttachmentImportFiles(event.dataTransfer.files)">
                        <div style="font-size:13px;line-height:1.4;color:var(--text2)">Drag PDF or image files here, or click to browse.<br><small>Multiple uploads supported.</small></div>
                    </div>
                    <input type="file" id="bulkAttachmentInput" accept=".pdf,image/*" multiple style="display:none" onchange="App.handleBulkAttachmentImportFiles(this.files)">
                    <div id="bulkAttachmentSelectedFiles" style="font-size:12px;color:var(--text3)">No files selected</div>
                    <div id="bulkAttachmentProgress" style="font-size:13px;color:var(--text);min-height:22px"></div>
                    <div id="bulkAttachmentSummary" style="font-size:12px;color:var(--text3);white-space:pre-wrap;min-height:68px"></div>
                </div>
            </div>
            <div class="modal-actions">
                <button class="btn btn-primary btn-sm" onclick="App.processBulkAttachmentImport()">Upload & Process</button>
                <button class="btn btn-ghost btn-sm" onclick="App.closeModal()">Cancel</button>
            </div>`);
            }

            function handleBulkAttachmentImportFiles(fileList) {
                const files = fileList ? Array.from(fileList) : [];
                const selectedEl = document.getElementById('bulkAttachmentSelectedFiles');
                const summaryEl = document.getElementById('bulkAttachmentSummary');
                if (!files.length) {
                    if (selectedEl) selectedEl.textContent = 'No files selected';
                    if (summaryEl) summaryEl.textContent = '';
                    return;
                }
                bulkAttachmentImportState = bulkAttachmentImportState || {};
                bulkAttachmentImportState.files = files;
                if (selectedEl) {
                    selectedEl.textContent = `${files.length} file${files.length === 1 ? '' : 's'} selected: ${files.map(f => f.name).join(', ')}`;
                }
                if (summaryEl) summaryEl.textContent = '';
            }

            async function processBulkAttachmentImport() {
                const destination = document.getElementById('bulkAttachmentTargetDestination')?.value || 'truck';
                const category = document.getElementById('bulkAttachmentDocCategory')?.value || 'Insurance';
                const files = (bulkAttachmentImportState && Array.isArray(bulkAttachmentImportState.files)) ? bulkAttachmentImportState.files : [];
                const progressEl = document.getElementById('bulkAttachmentProgress');
                const summaryEl = document.getElementById('bulkAttachmentSummary');
                if (!files.length) {
                    if (summaryEl) summaryEl.textContent = 'Please select one or more PDF/image files first.';
                    return;
                }
                const entities = destination === 'trailer' ? trailers : trucks;
                const plateField = destination === 'trailer' ? 'id' : 'plate';
                const plateMap = (entities || []).map(item => ({
                    item,
                    normalized: normalizePlate(item[plateField])
                })).filter(x => x.normalized);
                const summary = {
                    processed: 0,
                    matched: 0,
                    unmatched: [],
                    errors: []
                };

                if (progressEl) progressEl.textContent = `Processing 0 of ${files.length} files...`;
                if (summaryEl) summaryEl.textContent = '';

                const updatedEntities = new Set();

                for (let index = 0; index < files.length; index += 1) {
                    const file = files[index];
                    const position = index + 1;
                    if (progressEl) progressEl.textContent = `Processing ${position} of ${files.length}: ${file.name}`;

                    const normalizedFileName = normalizePlate(file.name);
                    let match = null;
                    if (normalizedFileName) {
                        const matches = plateMap.filter(p => normalizedFileName.includes(p.normalized));
                        if (matches.length === 1) {
                            match = matches[0].item;
                        } else if (matches.length > 1) {
                            match = matches.reduce((best, current) => current.normalized.length > best.normalized.length ? current : best, matches[0]).item;
                        } else {
                            const direct = plateMap.find(p => p.normalized === normalizedFileName);
                            if (direct) match = direct.item;
                        }
                    }

                    if (!match) {
                        summary.unmatched.push(file.name);
                        continue;
                    }

                    const supported = isPdfFile(file) || isImageFile(file);
                    if (!supported) {
                        summary.errors.push(`Unsupported file type: ${file.name}`);
                        continue;
                    }

                    const dataUrl = isImageFile(file)
                        ? await compressImageFile(file)
                        : await readFileAsDataUrl(file);
                    if (!dataUrl) {
                        summary.errors.push(`Unable to read file: ${file.name}`);
                        continue;
                    }

                    const extMatch = (file.name || '').match(/\.([a-zA-Z0-9]+)$/);
                    let ext = extMatch ? extMatch[1].toLowerCase() : '';
                    if (!ext || !/^(jpg|jpeg|png|gif|webp|pdf)$/i.test(ext)) {
                        ext = isPdfFile(file) ? 'pdf' : 'jpg';
                    }
                    const fileId = createFileId();
                    const safeFileName = `${sanitizeFileName(file.name) || fileId}.${ext}`;
                    const folder = `fleetguard/attachments/${destination}/${match._idx}`;
                    const displayPlate = normalizePlate(match[plateField]) || String(match[plateField] || '').toUpperCase();
                    const record = {
                        id: fileId,
                        name: `${displayPlate} ${category}`,
                        mimeType: file.type || (isPdfFile(file) ? 'application/pdf' : 'image/jpeg'),
                        uploadedAt: formatDate(),
                        data: dataUrl,
                        driveId: undefined,
                        uploadedToDrive: false,
                        category
                    };

                    try {
                        const result = await uploadToGoogleDrive({
                            base64: dataUrlToBase64(dataUrl),
                            fileName: safeFileName,
                            mimeType: record.mimeType,
                            folder
                        });
                        record.data = result.url;
                        record.driveId = result.id || extractDriveFileId(result.url) || undefined;
                        record.uploadedToDrive = true;
                    } catch (err) {
                            record.uploadError = err && err.message ? err.message : String(err) || 'Google Drive upload failed';
                            console.error('Bulk attachment upload failed for', file.name, err);
                            try { summary.errors.push(`Upload error for ${file.name}: ${record.uploadError}`); } catch (_) { /* ignore */ }
                    }

                    match.files = Array.isArray(match.files) ? match.files.filter(f => f.category !== category) : [];
                    match.files.push(record);
                    updatedEntities.add(match);
                    summary.matched += 1;
                    summary.processed += 1;
                }

                if (updatedEntities.size > 0) {
                    saveAll();
                    // Refresh UI so updated attachments appear immediately
                    try {
                        refreshAllViews();
                    } catch (e) { /* ignore */ }
                    try {
                        if (destination === 'truck') renderTruckCards();
                        else renderTrailerCards();
                    } catch (e) { /* ignore */ }
                }

                // Clear selection state and file input so UI reflects processed files
                bulkAttachmentImportState = null;
                const inputEl = document.getElementById('bulkAttachmentInput');
                if (inputEl && inputEl.value) inputEl.value = '';
                const selectedElAfter = document.getElementById('bulkAttachmentSelectedFiles');
                if (selectedElAfter) selectedElAfter.textContent = 'No files selected';

                if (progressEl) progressEl.textContent = `Completed ${files.length} files.`;
                let summaryText = `Total files: ${files.length}\nMatched and updated: ${summary.matched}`;
                if (summary.unmatched.length) {
                    summaryText += `\nUnmatched files:\n- ${summary.unmatched.join('\n- ')}`;
                }
                if (summary.errors.length) {
                    summaryText += `\nErrors:\n- ${summary.errors.join('\n- ')}`;
                }
                if (summaryEl) summaryEl.textContent = summaryText;
                showToast(`Import finished: ${summary.matched}/${files.length} attachments updated.`);
            }

            function downloadImportTemplate() {
                const type = document.getElementById('importUpdatesType')?.value || 'drivers';
                let csv = '';
                if (type === 'drivers') {
                    csv = 'driver_id,name,status,phone_number,license_expiry,blood_group,trips,warnings,suspensions,accidents,loss,license,passport,passport_expiry,license_plate,hire_date,health_status\nRAD003W,Jean Hategeka,Online,+250700000000,2026-12-31,A+,120,1,0,0,0,DL1001,PP1001,2027-12-31,RAD003W,2024-04-10,Fit\n';
                } else if (type === 'violations') {
                    csv = 'driver_id,violation_date,violation_time,violation_type,severity,description\nRAD003W,2026-05-01,08:23,Speeding,high,Exceeded limit on highway\nHASSAN MUSEMINALI,2026-05-02,14:15,Rash Driving,high,Aggressive lane changes\n\nAlternatively, use plate_number or driver_name:\nplate_number,violation_date,violation_time,violation_type,severity,description\nRAD003W,2026-05-03,10:30,Dangerous Driving,high,Improper overtaking\nRAD005W,2026-05-04,15:45,Overloading,medium,Exceeded weight limit\n\ndriver_name,violation_date,violation_type,severity,description\nJEAN HATEGEKA,2026-05-05,Speeding,high,Speed exceeded limit';
                } else if (type === 'loss') {
                    csv = 'driver_id,loss_date,loss_type,loss_amount,description\nRAD003W,2026-05-15,Cargo Damage,500.00,Damaged cargo during transit\nHASSAN MUSEMINALI,2026-05-10,Fuel Loss,150.00,Fuel spillage incident\n';
                } else {
                    csv = 'truck_plate,document_type,expiry_date\nRAC 123 A,Insurance,2027-02-15\n';
                }
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `fleetguard-${type}-template.csv`;
                a.click();
            }

            function processImportUpdates() {
                const type = document.getElementById('importUpdatesType')?.value;
                const file = document.getElementById('importUpdatesFile')?.files?.[0];
                if (!type) { setImportResult('<span style="color:var(--red)">Select an import type.</span>'); return; }
                if (!file) { setImportResult('<span style="color:var(--red)">Choose a file first.</span>'); return; }
                const reader = new FileReader();
                reader.onload = ev => {
                    const summary = { updated: 0, created: 0, added: 0, ignored: 0, errors: [] };
                    try {
                        const parsedRows = parseStructuredImport(String(ev.target.result || ''), file.name);
                        if (!parsedRows.length) { setImportResult('<span style="color:var(--amber)">No rows found in file.</span>'); return; }
                        const rows = parsedRows.map(r => {
                            const normalized = {};
                            Object.keys(r || {}).forEach(k => normalized[normalizeImportKey(k)] = r[k]);
                            return normalized;
                        });
                        const missing = validateImportHeaders(type, rows);
                        if (missing.length) { setImportResult(`<span style="color:var(--red)">Missing required header(s): ${missing.join(', ')}</span>`); return; }

                        if (type === 'drivers') {
                            rows.forEach((row, i) => {
                                try {
                                    const driverId = String(row.driver_id || '').trim();
                                    if (!driverId) throw new Error('driver_id is required');
                                    let driver = drivers.find(d => String(d.license_plate || '').trim() === driverId || String(d.id || '').trim() === driverId || String(d.name || '').trim().toLowerCase() === driverId.toLowerCase());
                                    if (!driver) {
                                        driver = {
                                            _idx: nextDriverIdx(), id: driverId, name: row.name || `Driver ${driverId}`,
                                            status: settings.driverStatuses[0]?.name || 'Online',
                                            license: '', licenseExpiry: '', passport: '', passportExpiry: '',
                                            phone: '', license_plate: '', hire_date: '', bloodGroup: '', healthStatus: '',
                                            trips: 0, violations: [], tripsList: [], warningsList: [], suspensionsList: [],
                                            accidentsList: [], lossesList: [], custom: {}
                                        };
                                        drivers.push(driver);
                                        summary.created++;
                                    }
                                    ensureDriverCollections(driver);
                                    const map = {
                                        name: 'name', status: 'status', license_expiry: 'licenseExpiry', blood_group: 'bloodGroup',
                                        phone_number: 'phone', phone: 'phone',
                                        trips: 'trips', warnings: 'warnings', suspensions: 'suspensions', accidents: 'accidents',
                                        loss: 'loss', license: 'license', passport: 'passport', passport_expiry: 'passportExpiry',
                                        license_plate: 'license_plate', hire_date: 'hire_date', health_status: 'healthStatus'
                                    };
                                    let changed = false;
                                    Object.entries(map).forEach(([src, dst]) => {
                                        if (Object.prototype.hasOwnProperty.call(row, src) && row[src] !== '') {
                                            driver[dst] = ['trips', 'warnings', 'suspensions', 'accidents', 'loss'].includes(dst) ? toNumberOrValue(row[src]) : row[src];
                                            changed = true;
                                        }
                                    });
                                    if (changed) summary.updated++;
                                } catch (err) {
                                    const msg = `Row ${i + 2}: ${err.message}`;
                                    summary.errors.push(msg);
                                    console.error(msg, row);
                                }
                            });
                        } else if (type === 'violations') {
                            rows.forEach((row, i) => {
                                try {
                                    // Support multiple ways to identify driver: driver_id, plate_number, or driver_name
                                    let driverId = String(row.driver_id || '').trim();
                                    const plateNumber = String(row.plate_number || '').trim();
                                    const driverName = String(row.driver_name || '').trim();
                                    
                                    // If no driver_id, try to use plate_number or driver_name
                                    if (!driverId && plateNumber) driverId = plateNumber;
                                    if (!driverId && driverName) driverId = driverName;
                                    
                                    if (!driverId) throw new Error('driver_id, plate_number or driver_name is required');
                                    
                                    const violationDate = String(row.violation_date || '').trim();
                                    const violationTime = String(row.violation_time || row.time || '').trim();
                                    const violationType = String(row.violation_type || '').trim();
                                    if (!violationDate || !violationType) throw new Error('violation_date and violation_type are required');
                                    
                                    // Enhanced driver matching: check license_plate, id, and name with flexible matching
                                    const driverIdLower = driverId.toLowerCase().trim();
                                    let driver = drivers.find(d => {
                                        const plateLower = String(d.license_plate || '').toLowerCase().trim();
                                        const idLower = String(d.id || '').toLowerCase().trim();
                                        const nameLower = String(d.name || '').toLowerCase().trim();
                                        return plateLower === driverIdLower || idLower === driverIdLower || nameLower === driverIdLower;
                                    });
                                    
                                    // If exact match not found, try partial name match (in case CSV has shortened or partial names)
                                    if (!driver && driverName) {
                                        driver = drivers.find(d => {
                                            const nameLower = String(d.name || '').toLowerCase().trim();
                                            return nameLower.includes(driverIdLower) || driverIdLower.includes(nameLower);
                                        });
                                    }
                                    
                                    if (!driver) throw new Error(`Driver not found (${driverId})`);
                                    ensureDriverCollections(driver);
                                    const defaultSeverity = (settings.violationTypes.find(v => (v.name || '').toLowerCase() === violationType.toLowerCase()) || {}).severity || 'medium';
                                    const requestedSeverity = String(row.severity || defaultSeverity).toLowerCase();
                                    const requestedDescription = String(row.description || '').trim();
                                    const exists = driver.violations.some(v =>
                                        String(v.date || '').trim() === violationDate &&
                                        String(v.type || '').trim().toLowerCase() === violationType.toLowerCase() &&
                                        String(v.time || '').trim() === violationTime &&
                                        String(v.severity || '').trim().toLowerCase() === requestedSeverity &&
                                        String(v.description || '').trim() === requestedDescription
                                    );
                                    if (exists) { summary.ignored++; return; }
                                    driver.violations.push({
                                        type: violationType,
                                        date: violationDate,
                                        time: violationTime,
                                        severity: requestedSeverity,
                                        description: requestedDescription
                                    });
                                    summary.added++;
                                } catch (err) {
                                    const msg = `Row ${i + 2}: ${err.message}`;
                                    summary.errors.push(msg);
                                    console.error(msg, row);
                                }
                            });
                        } else if (type === 'trucks') {
                            rows.forEach((row, i) => {
                                try {
                                    const plate = String(row.truck_plate || '').trim();
                                    const docType = String(row.document_type || '').trim();
                                    const expiry = String(row.expiry_date || '').trim();
                                    if (!plate || !docType || !expiry) throw new Error('truck_plate, document_type and expiry_date are required');
                                    const truck = trucks.find(t => String(t.plate || '').trim().toLowerCase() === plate.toLowerCase());
                                    if (!truck) throw new Error(`Truck not found (${plate})`);
                                    if (!Array.isArray(truck.documents)) truck.documents = [];
                                    const doc = truck.documents.find(d => String(d.type || '').trim().toLowerCase() === docType.toLowerCase());
                                    if (doc) { doc.expiryDate = expiry; summary.updated++; }
                                    else { truck.documents.push({ type: docType, expiryDate: expiry }); summary.created++; }
                                } catch (err) {
                                    const msg = `Row ${i + 2}: ${err.message}`;
                                    summary.errors.push(msg);
                                    console.error(msg, row);
                                }
                            });
                        } else if (type === 'loss') {
                            rows.forEach((row, i) => {
                                try {
                                    // Support multiple ways to identify driver: driver_id, plate_number, or driver_name
                                    let driverId = String(row.driver_id || '').trim();
                                    const plateNumber = String(row.plate_number || row.plate || '').trim();
                                    const driverName = String(row.driver_name || row.name || '').trim();
                                    
                                    // If no driver_id, try to use plate_number or driver_name
                                    if (!driverId && plateNumber) driverId = plateNumber;
                                    if (!driverId && driverName) driverId = driverName;
                                    
                                    if (!driverId) throw new Error('driver_id, plate_number or driver_name is required');
                                    
                                    const lossDate = String(row.loss_date || '').trim();
                                    const lossType = String(row.loss_type || '').trim();
                                    const lossAmount = row.loss_amount ? parseFloat(row.loss_amount) : null;
                                    if (!lossDate || !lossType || lossAmount === null) throw new Error('loss_date, loss_type and loss_amount are required');
                                    
                                    // Enhanced driver matching: check license_plate, id, and name with flexible matching
                                    const driverIdLower = driverId.toLowerCase().trim();
                                    let driver = drivers.find(d => {
                                        const plateLower = String(d.license_plate || '').toLowerCase().trim();
                                        const idLower = String(d.id || '').toLowerCase().trim();
                                        const nameLower = String(d.name || '').toLowerCase().trim();
                                        return plateLower === driverIdLower || idLower === driverIdLower || nameLower === driverIdLower;
                                    });
                                    
                                    // If exact match not found, try partial name match
                                    if (!driver && driverName) {
                                        driver = drivers.find(d => {
                                            const nameLower = String(d.name || '').toLowerCase().trim();
                                            return nameLower.includes(driverIdLower) || driverIdLower.includes(nameLower);
                                        });
                                    }
                                    
                                    if (!driver) throw new Error(`Driver not found (${driverId})`);
                                    ensureDriverCollections(driver);
                                    const lossDescription = String(row.description || '').trim();
                                    driver.lossesList.push({
                                        date: lossDate,
                                        type: lossType,
                                        amount: lossAmount,
                                        description: lossDescription
                                    });
                                    summary.added++;
                                } catch (err) {
                                    const msg = `Row ${i + 2}: ${err.message}`;
                                    summary.errors.push(msg);
                                    console.error(msg, row);
                                }
                            });
                        }

                        saveAll();
                        refreshAllViews();
                        const summaryLine = type === 'violations' || type === 'loss'
                            ? `${summary.added} ${type === 'loss' ? 'loss records' : 'violations'} added, ${summary.ignored} ignored, ${summary.errors.length} errors`
                            : `${summary.updated} updated, ${summary.created} created, ${summary.errors.length} errors`;
                        setImportResult(`<div style="color:var(--green)">${summaryLine}</div>${summary.errors.length ? `<div style="margin-top:8px;color:var(--amber);max-height:120px;overflow:auto">${summary.errors.map(e => `<div>${e}</div>`).join('')}</div>` : ''}`);
                        showToast('Import updates completed');
                    } catch (err) {
                        setImportResult(`<span style="color:var(--red)">Import failed: ${err.message}</span>`);
                    }
                };
                reader.readAsText(file);
            }

            function xmlEscape(text) {
                return String(text ?? '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
            }

            function getTruckByPlate(plate) {
                const normalized = String(plate || '').trim().toUpperCase();
                if (!normalized) return null;
                return trucks.find(t => String(t.plate || '').trim().toUpperCase() === normalized) || null;
            }

            function getTrailerForPlate(plate) {
                const truck = getTruckByPlate(plate);
                if (truck?.trailer) return truck.trailer;
                const normalized = String(plate || '').trim().toUpperCase();
                if (!normalized) return '';
                const driver = drivers.find(d =>
                    String(d.license_plate || '').trim().toUpperCase() === normalized ||
                    String(d.id || '').trim().toUpperCase() === normalized
                );
                return (driver?.custom || {}).Trailer || '';
            }

            function formatTruckLabel(truck) {
                if (!truck) return '';
                return `${xmlEscape(truck.plate || '')}${truck.trailer ? ' / ' + xmlEscape(truck.trailer) : ''}`;
            }

            function formatTruckLabelFromPlate(plate) {
                const truck = getTruckByPlate(plate);
                if (truck) return formatTruckLabel(truck);
                const trailer = getTrailerForPlate(plate);
                const p = xmlEscape(plate || '');
                return trailer ? `${p} / ${xmlEscape(trailer)}` : p;
            }

            function formatDriverVehicleLabel(driver) {
                if (!driver || !driver.license_plate) return '';
                return formatTruckLabelFromPlate(driver.license_plate);
            }

            function formatTruckPickerLabel(truck) {
                if (!truck) return '';
                const base = formatTruckLabel(truck);
                return truck.model ? `${base} · ${xmlEscape(truck.model)}` : base;
            }

            function asSheetValue(value) {
                if (value === null || value === undefined) return '';
                if (typeof value === 'object') return JSON.stringify(value);
                return String(value);
            }

            function flattenObjectRows(obj, prefix = '', rows = []) {
                if (obj === null || obj === undefined) {
                    rows.push([prefix || 'value', '']);
                    return rows;
                }
                if (Array.isArray(obj)) {
                    obj.forEach((item, idx) => flattenObjectRows(item, `${prefix}[${idx}]`, rows));
                    if (obj.length === 0) rows.push([prefix || 'value', '[]']);
                    return rows;
                }
                if (typeof obj === 'object') {
                    Object.keys(obj).forEach(key => {
                        const next = prefix ? `${prefix}.${key}` : key;
                        flattenObjectRows(obj[key], next, rows);
                    });
                    return rows;
                }
                rows.push([prefix || 'value', String(obj)]);
                return rows;
            }

            function sheetXml(name, rows) {
                const safeName = xmlEscape(String(name || 'Sheet').slice(0, 31));
                const rowXml = rows.map(cols =>
                    `<Row>${cols.map(v => `<Cell><Data ss:Type="String">${xmlEscape(asSheetValue(v))}</Data></Cell>`).join('')}</Row>`
                ).join('');
                return `<Worksheet ss:Name="${safeName}"><Table>${rowXml}</Table></Worksheet>`;
            }

            function downloadExcelFile(fileName, sheets) {
                const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
${sheets.map(s => sheetXml(s.name, s.rows)).join('')}
</Workbook>`;
                const blob = new Blob([workbook], { type: 'application/vnd.ms-excel' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                a.click();
            }

            function exportDriverData(idx) {
                const d = drivers.find(x => x._idx === idx);
                if (!d) { showToast('Driver not found'); return; }
                const safeId = String(d.id || 'unknown').replace(/[^\w-]+/g, '_');
                const rows = [['Field', 'Value'], ...flattenObjectRows(d)];
                downloadExcelFile(`driver_${safeId}.xls`, [{ name: `Driver ${safeId}`, rows }]);
                showToast('Driver export ready');
            }

            function exportTruckData(idx) {
                const t = trucks.find(x => x._idx === idx);
                if (!t) { showToast('Truck not found'); return; }
                const safePlate = String(t.plate || 'unknown').replace(/[^\w-]+/g, '_');
                const rows = [['Field', 'Value'], ...flattenObjectRows(t)];
                downloadExcelFile(`truck_${safePlate}.xls`, [{ name: `Truck ${safePlate}`, rows }]);
                showToast('Truck export ready');
            }

            function exportAllData() {
                const data = { drivers, trucks, trailers, settings, exported: new Date().toISOString() };
                const driverRows = [['driver_id', 'name', 'status', 'phone', 'license_plate', 'violations_count', 'trips', 'warnings', 'suspensions', 'accidents', 'loss']];
                drivers.forEach(d => {
                    driverRows.push([
                        d.license_plate || '', d.name || '', d.status || '', d.phone || '', d.license_plate || '',
                        (d.violations || []).length,
                        d.trips ?? '',
                        d.warnings ?? '',
                        d.suspensions ?? '',
                        d.accidents ?? '',
                        d.loss ?? ''
                    ]);
                });
                const truckRows = [['plate', 'model', 'vin', 'documents', 'issues_count']];
                trucks.forEach(t => {
                    truckRows.push([t.plate || '', t.model || '', t.vin || '', JSON.stringify(t.documents || []), (t.issues || []).length]);
                });
                const trailerRows = [['id', 'brand', 'year', 'logBook', 'status', 'documents', 'issues_count']];
                trailers.forEach(t => {
                    trailerRows.push([t.id || '', t.brand || '', t.year || '', t.logBook || '', t.status || 'Active', JSON.stringify(t.documents || []), (t.issues || []).length]);
                });
                const settingsRows = [['key', 'value'], ...flattenObjectRows(settings)];
                const metaRows = [['key', 'value'], ['exported', data.exported], ['drivers_count', drivers.length], ['trucks_count', trucks.length], ['trailers_count', trailers.length]];
                downloadExcelFile(`fleetguard-export-${new Date().toISOString().slice(0, 10)}.xls`, [
                    { name: 'Meta', rows: metaRows },
                    { name: 'Drivers', rows: driverRows },
                    { name: 'Trucks', rows: truckRows },
                    { name: 'Trailers', rows: trailerRows },
                    { name: 'Settings', rows: settingsRows }
                ]);
                showToast('Export complete');
            }
            function importAllData(e) {
                const file = e.target.files[0];
                if (!file) return;
                const statusEl = document.getElementById('settingsFileStatus');
                const resultEl = document.getElementById('settingsFileResult');
                if (statusEl) statusEl.textContent = file.name;
                const reader = new FileReader();
                reader.onload = ev => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        let driversUpdated = 0, driversCreated = 0;
                        let trucksUpdated = 0, trucksCreated = 0;
                        let violationsAdded = 0;

                        // ══ Merge Trucks ══
                        if (data.trucks && Array.isArray(data.trucks)) {
                            data.trucks.forEach(importedTruck => {
                                const existingTruck = trucks.find(t => t.plate === importedTruck.plate);
                                if (existingTruck) {
                                    // Update model and vin if provided
                                    if (importedTruck.model && importedTruck.model.trim()) {
                                        existingTruck.model = importedTruck.model;
                                    }
                                    if (importedTruck.vin && importedTruck.vin.trim()) {
                                        existingTruck.vin = importedTruck.vin;
                                    }
                                    // Merge documents
                                    if (importedTruck.documents && Array.isArray(importedTruck.documents)) {
                                        importedTruck.documents.forEach(importedDoc => {
                                            const existingDoc = existingTruck.documents.find(d => d.type === importedDoc.type);
                                            if (existingDoc) {
                                                // Update expiry date
                                                existingDoc.expiryDate = importedDoc.expiryDate;
                                            } else {
                                                // Add new document
                                                existingTruck.documents.push(importedDoc);
                                            }
                                        });
                                    }
                                    trucksUpdated++;
                                } else {
                                    // New truck
                                    const newTruck = {
                                        _idx: trucks.length ? Math.max(...trucks.map(t => t._idx)) + 1 : 0,
                                        ...importedTruck,
                                        documents: importedTruck.documents || [],
                                        issues: importedTruck.issues || []
                                    };
                                    trucks.push(newTruck);
                                    trucksCreated++;
                                }
                            });
                        }

                        // ══ Merge Drivers ══
                        if (data.drivers && Array.isArray(data.drivers)) {
                            data.drivers.forEach(importedDriver => {
                                const importedId = String(importedDriver.id || '').trim();
                                const importedPlate = String(importedDriver.license_plate || '').trim();
                                const existingDriver = drivers.find(d =>
                                    String(d.id || '').trim() === importedId ||
                                    String(d.license_plate || '').trim() === importedId ||
                                    (importedPlate && String(d.license_plate || '').trim() === importedPlate)
                                );
                                if (existingDriver) {
                                    // Update top-level fields if provided (non-empty)
                                    const fieldsToUpdate = [
                                        'name', 'status', 'license', 'licenseExpiry', 'passport', 
                                        'passportExpiry', 'license_plate', 'hire_date', 'bloodGroup', 
                                        'healthStatus', 'trips', 'warnings', 'suspensions', 'accidents', 'loss', 'phone'
                                    ];
                                    fieldsToUpdate.forEach(field => {
                                        if (importedDriver[field] !== undefined && importedDriver[field] !== '') {
                                            existingDriver[field] = importedDriver[field];
                                        }
                                    });

                                    // Merge violations array
                                    if (importedDriver.violations && Array.isArray(importedDriver.violations)) {
                                        if (!Array.isArray(existingDriver.violations)) existingDriver.violations = [];
                                        importedDriver.violations.forEach(importedViolation => {
                                            const exists = existingDriver.violations.some(v =>
                                                String(v.date || '').trim() === String(importedViolation.date || '').trim() &&
                                                String(v.type || '').trim() === String(importedViolation.type || '').trim() &&
                                                String(v.time || '').trim() === String(importedViolation.time || '').trim() &&
                                                String(v.severity || '').trim() === String(importedViolation.severity || '').trim() &&
                                                String(v.description || '').trim() === String(importedViolation.description || '').trim()
                                            );
                                            if (!exists) {
                                                existingDriver.violations.push(importedViolation);
                                                violationsAdded++;
                                            }
                                        });
                                    }

                                    // Merge custom fields
                                    if (importedDriver.custom && typeof importedDriver.custom === 'object') {
                                        if (!existingDriver.custom) existingDriver.custom = {};
                                        Object.assign(existingDriver.custom, importedDriver.custom);
                                    }

                                    driversUpdated++;
                                } else {
                                    // New driver
                                    const newDriver = {
                                        _idx: drivers.length ? Math.max(...drivers.map(d => d._idx)) + 1 : 0,
                                        ...importedDriver,
                                        violations: importedDriver.violations || [],
                                        tripsList: importedDriver.tripsList || [],
                                        warningsList: importedDriver.warningsList || [],
                                        suspensionsList: importedDriver.suspensionsList || [],
                                        accidentsList: importedDriver.accidentsList || [],
                                        lossesList: importedDriver.lossesList || [],
                                        custom: importedDriver.custom || {}
                                    };
                                    drivers.push(newDriver);
                                    driversCreated++;
                                    violationsAdded += (newDriver.violations || []).length;
                                }
                            });
                        }

                        // ══ Merge Violations (if separate array) ══
                        if (data.violations && Array.isArray(data.violations)) {
                            data.violations.forEach(importedViolation => {
                                if (!importedViolation.driver_id) return; // Skip if no driver_id
                                const driver = drivers.find(d => String(d.license_plate || '').trim() === String(importedViolation.driver_id || '').trim() || String(d.id || '').trim() === String(importedViolation.driver_id || '').trim());
                                if (!driver) {
                                    console.warn(`Violation skipped: driver_id ${importedViolation.driver_id} not found`);
                                    return;
                                }
                                const exists = driver.violations.some(v => 
                                    String(v.date || '').trim() === String(importedViolation.date || '').trim() &&
                                    String(v.type || '').trim() === String(importedViolation.type || '').trim() &&
                                    String(v.severity || '').trim() === String(importedViolation.severity || '').trim() &&
                                    String(v.description || '').trim() === String(importedViolation.description || '').trim()
                                );
                                if (!exists) {
                                    driver.violations.push(importedViolation);
                                    violationsAdded++;
                                }
                            });
                        }

                        // ══ Merge Orders ══
                        let ordersUpdated = 0, ordersCreated = 0;
                        if (data.orders && Array.isArray(data.orders)) {
                            data.orders.forEach(importedOrder => {
                                const existingOrder = orders.find(o => o._idx === importedOrder._idx || (o.name === importedOrder.name && o.client === importedOrder.client));
                                if (existingOrder) {
                                    existingOrder.name = importedOrder.name || existingOrder.name;
                                    existingOrder.client = importedOrder.client || existingOrder.client;
                                    existingOrder.truckPlate = importedOrder.truckPlate !== undefined ? importedOrder.truckPlate : existingOrder.truckPlate;
                                    existingOrder.priority = importedOrder.priority || existingOrder.priority || 'Medium';
                                    existingOrder.status = importedOrder.status || existingOrder.status;
                                    existingOrder.date = importedOrder.date || existingOrder.date;
                                    ordersUpdated++;
                                } else {
                                    const newOrder = {
                                        _idx: orders.length ? Math.max(...orders.map(o => o._idx)) + 1 : 0,
                                        name: importedOrder.name,
                                        client: importedOrder.client,
                                        truckPlate: importedOrder.truckPlate || '',
                                        priority: importedOrder.priority || 'Medium',
                                        status: importedOrder.status || 'Pending',
                                        date: importedOrder.date || new Date().toISOString().slice(0, 10)
                                    };
                                    orders.push(newOrder);
                                    ordersCreated++;
                                }
                            });
                        }

                        // Save and refresh
                        saveAll();
                        showPage('dashboard');
                        
                        // Show summary toast
                        const summary = `${driversUpdated} drivers updated, ${driversCreated} created | ${trucksUpdated} trucks updated, ${trucksCreated} created | ${ordersCreated + ordersUpdated} orders processed | ${violationsAdded} violations added`;
                        if (resultEl) resultEl.innerHTML = `<div style="color:var(--green);font-size:12px">✓ Import completed. ${summary}</div>`;
                        showToast('Merged: ' + summary);
                    } catch (err) {
                        if (resultEl) resultEl.innerHTML = `<div style="color:var(--red);font-size:12px">Import failed: ${err.message}</div>`;
                        showToast('Import failed: ' + err.message);
                    }
                    e.target.value = '';
                };
                reader.readAsText(file);
            }
            async function resetAllData() {
                if (!await requireAdminPin('Enter admin PIN to reset all data')) return;
                if (!confirm('⚠ This will delete ALL data. Continue?')) return;
                backupAndDownload('Backup before reset');
                let countdown = 5;
                const interval = setInterval(() => {
                    if (countdown <= 0) {
                        clearInterval(interval);
                        const backupJson = localStorage.getItem('fg3_backup');
                        drivers = [];
                        trucks = [];
                        trailers = [];
                        orders = [];
                        jobCards = [];
                        settings = {
                            theme: 'default',
                            darkMode: true,
                            driverStatuses: [{ name: 'Online', color: '#22c97a' }, { name: 'Offline', color: '#565b6e' }, { name: 'On Trip', color: '#3d7fff' }, { name: 'Idle', color: '#f59e0b' }, { name: 'Suspended', color: '#f04c5a' }],
                            violationTypes: [{ name: 'Speeding', severity: 'high' }, { name: 'Phone use', severity: 'medium' }, { name: 'Hard braking', severity: 'low' }],
                            riskMediumThreshold: 10, riskHighThreshold: 24, riskHighCountThreshold: 2,
                            docTypes: [{ name: 'Insurance', months: 12 }, { name: 'Registration', months: 12 }, { name: 'Inspection', months: 6 }],
                            maintenanceServices: DEFAULT_MAINTENANCE_SERVICES.map(s => ({ ...s })),
                            customFields: [],
                            settingsLocked: false
                        };
                        hscPolicies = [];
                        hscMeetings = [];
                        saveHscPolicies();
                        saveHscMeetings();
                        saveAll();
                        if (backupJson) localStorage.setItem('fg3_backup', backupJson);
                        localStorage.removeItem('fg3_admin_failed_attempts');
                        localStorage.removeItem('fg3_admin_lockout');
                        applyTheme();
                        renderSettings();
                        showPage('dashboard');
                        showToast('All data reset');
                        return;
                    }
                    showToast(`Resetting all data in ${countdown} second(s)...`);
                    countdown -= 1;
                }, 1000);
            }
            const DEMO_DRIVERS = [
                {"id":"RAD003W","name":"HASSAN MUSEMINALI","license_plate":"RAD003W","phone":"+250785197477","custom":{"Passport":"PC728699","Driving License":"4006452762","Trailer":"RL1466"}},
                {"id":"RAD005W","name":"ROGATH ELIAS MWASUPELA","license_plate":"RAD005W","phone":"+250788746481","custom":{"Passport":"LP808034","Driving License":"1198580143917501","Trailer":"RL1262"}},
                {"id":"RAD034J","name":"HABINEZA HUSSEIN","license_plate":"RAD034J","phone":"+250788682245","custom":{"Passport":"LP868074","Driving License":"1197980016119120","Trailer":"RL1460"}},
                {"id":"RAD089K","name":"RADJABU IYARWEMA","license_plate":"RAD089K","phone":"+250788242301","custom":{"Passport":"PC751757","Driving License":"1 198980166639332","Trailer":"RL1461"}},
                {"id":"RAD091K","name":"","license_plate":"RAD091K","phone":"","custom":{"Passport":"","Driving License":"","Trailer":"RL1476"}},
                {"id":"RAD542C","name":"ABUBAKARI HASSANI ABDALLAH","license_plate":"RAD542C","phone":"+250788561236","custom":{"Passport":"AB1282633","Driving License":"4000205559","Trailer":"RL1264"}},
                {"id":"RAD534C","name":"","license_plate":"RAD534C","phone":"","custom":{"Passport":"","Driving License":"","Trailer":""}},
                {"id":"RAD742Q","name":"MKUMBWA JASON EMPRAIM","license_plate":"RAD742Q","phone":"+25079148128","custom":{"Passport":"TAE358034","Driving License":"4000952054","Trailer":"RL1653"}},
                {"id":"RAD743Q","name":"MVUMBA MVUMBA","license_plate":"RAD743Q","phone":"+250798273797","custom":{"Passport":"TAE207343","Driving License":"4006818066","Trailer":"RL1998"}},
                {"id":"RAD907R","name":"DUFITUMUKIZA ABUBAKAR","license_plate":"RAD907R","phone":"+250783296460","custom":{"Passport":"LP758579","Driving License":"1199080107426306","Trailer":"RL1465"}},
                {"id":"RAD998V","name":"MURAMBA JOHN OSCAR","license_plate":"RAD998V","phone":"+250791452742","custom":{"Passport":"AB1490090","Driving License":"4000425363","Trailer":"RL1720"}},
                {"id":"RAF535A","name":"NIZEYIMANA HUSSEN","license_plate":"RAF535A","phone":"+250782556986","custom":{"Passport":"LP843430","Driving License":"1198480165115408","Trailer":"RL3528"}},
                {"id":"RAF540A","name":"KARURU HUSSEIN SAIDI","license_plate":"RAF540A","phone":"+250788649424","custom":{"Passport":"LP788102","Driving License":"4005971598","Trailer":"RL3515"}},
                {"id":"RAF545A","name":"YASINI CYIZA","license_plate":"RAF545A","phone":"+250789596009","custom":{"Passport":"LP828988","Driving License":"1199380108496221","Trailer":"RL3524"}},
                {"id":"RAF548A","name":"IDDY MASHAKA IDDY","license_plate":"RAF548A","phone":"+255789819156","custom":{"Passport":"AB1206759","Driving License":"4000265757","Trailer":"RL3523"}},
                {"id":"RAF552A","name":"UWISHEMA JEAN FELIX","license_plate":"RAF552A","phone":"+250784924816","custom":{"Passport":"LP655916","Driving License":"4004107562","Trailer":"RL3530"}},
                {"id":"RAF554A","name":"GAKWISI ANNASY","license_plate":"RAF554A","phone":"+250788221181","custom":{"Passport":"LP874172","Driving License":"1198780155476220","Trailer":"RL3529"}},
                {"id":"RAF565A","name":"BRYAN NIYIZUKURI","license_plate":"RAF565A","phone":"+250788257619","custom":{"Passport":"LP653149","Driving License":"AA00093459KN","Trailer":"RL3518"}},
                {"id":"RAF419U","name":"CLEMENT UWAMAHORO","license_plate":"RAF419U","phone":"+255765337006","custom":{"Passport":"TAE224110","Driving License":"4001119700","Trailer":"RL1722"}},
                {"id":"RAF420U","name":"ISSA MUGENZI","license_plate":"RAF420U","phone":"+250788357893","custom":{"Passport":"LP814285","Driving License":"1199380006925340","Trailer":"RL1719"}},
                {"id":"RAD002W","name":"MBARUSHIMANA ARAFAT IBRAHIM","license_plate":"RAD002W","phone":"+250791244049","custom":{"Passport":"LP570623","Driving License":"4005136194","Trailer":"RL1998"}},
                {"id":"RAF546A","name":"ISMAEL UWIRAGIYE","license_plate":"RAF546A","phone":"+250788870413","custom":{"Passport":"LP636004","Driving License":"119928015186653 7","Trailer":"RL3532"}},
                {"id":"RAF549A","name":"SAIDI BIZIMANA","license_plate":"RAF549A","phone":"+25084694319","custom":{"Passport":"LP801304","Driving License":"C2464965","Trailer":"RL3514"}},
                {"id":"RAF551A","name":"NSHIMIYIMANA EMMANUEL","license_plate":"RAF551A","phone":"+250788838490","custom":{"Passport":"LP666097","Driving License":"119948008632020 7","Trailer":"RL3527"}},
                {"id":"RAF556A","name":"","license_plate":"RAF556A","phone":"","custom":{"Passport":"","Driving License":"","Trailer":"RL3525"}},
                {"id":"RAF557A","name":"BIKORIMANA Jean Baptiste","license_plate":"RAF557A","phone":"+25089006769","custom":{"Passport":"LP768727","Driving License":"4006923421","Trailer":"RL3519"}},
                {"id":"RAF558A","name":"CLAUDE KWIRINGIRA","license_plate":"RAF558A","phone":"+255629181114","custom":{"Passport":"TAE804031","Driving License":"4006300591","Trailer":"RL3526"}},
                {"id":"RAF559A","name":"MIKIDADI ATHUMANI","license_plate":"RAF559A","phone":"+255755664404","custom":{"Passport":"TAE634868","Driving License":"4000155257","Trailer":"RL1296"}},
                {"id":"RAF560A","name":"SHABANI PIMA SEIF","license_plate":"RAF560A","phone":"+250786024877","custom":{"Passport":"TAE364564","Driving License":"4000018279","Trailer":"RL3521"}},
                {"id":"RAF561A","name":"Ismael NDAYISHIMIYIE","license_plate":"RAF561A","phone":"+250788353743","custom":{"Passport":"LP583644","Driving License":"119918014274222 4","Trailer":"RL3531"}},
                {"id":"RAF562A","name":"JOHN LUCAS KOMBA","license_plate":"RAF562A","phone":"+255712114747","custom":{"Passport":"TAE690924","Driving License":"4000146273","Trailer":"RL1718"}},
                {"id":"RAF563A","name":"ISSA SALIM RAMADHAN","license_plate":"RAF563A","phone":"+255715272981","custom":{"Passport":"AB1596771","Driving License":"4000409546","Trailer":"RL3533"}},
                {"id":"RAF564A","name":"ATHUMAN HEMEDY STENGWA","license_plate":"RAF564A","phone":"+255715897282","custom":{"Passport":"TAE691508","Driving License":"4005761812","Trailer":"RL3522"}},
                {"id":"RAF586Z","name":"MOHAMED AMINI MKADIMBA","license_plate":"RAF586Z","phone":"+255788883232","custom":{"Passport":"AB1242656","Driving License":"4001335540","Trailer":"RL3517"}},
                {"id":"RAF589Z","name":"BAAJUN AHMED BAAJUN","license_plate":"RAF589Z","phone":"+250781659451","custom":{"Passport":"TAE342063","Driving License":"4000387932","Trailer":"RL1721"}},
                {"id":"RAH668W","name":"FRANK EPHRAIM MKUMBWA","license_plate":"RAH668W","phone":"+250788483171","custom":{"Passport":"TAE339314","Driving License":"4000261547","Trailer":"RL6716"}},
                {"id":"RAH691W","name":"BERTINE MUTUMWINKA","license_plate":"RAH691W","phone":"+250788510716","custom":{"Passport":"LP688888","Driving License":"4007115747","Trailer":"RL1463"}},
                {"id":"RAH692W","name":"MSAFIRI DAVID MWISSA","license_plate":"RAH692W","phone":"+255769510510","custom":{"Passport":"TAE679584","Driving License":"4000034722","Trailer":"RL6715"}},
                {"id":"RAH693W","name":"NIZIGIYIMANA NESTOR","license_plate":"RAH693W","phone":"+250784609370","custom":{"Passport":"P00044587","Driving License":"PNC0002113","Trailer":"RL1265"}},
                {"id":"RAH694W","name":"JABIR ABDULKARIM SHEIKH","license_plate":"RAH694W","phone":"+250788469624","custom":{"Passport":"AB1192411","Driving License":"4000236324","Trailer":"RL6712"}},
                {"id":"RAH695W","name":"HARERIMANA ABOU","license_plate":"RAH695W","phone":"+250791207302","custom":{"Passport":"OP0364101","Driving License":"PNC0090812","Trailer":"RL6713"}},
                {"id":"RAH696W","name":"ABDALLAH OMARI NG'WANT'EMBO","license_plate":"RAH696W","phone":"+255783994473","custom":{"Passport":"TAE410932","Driving License":"4000204217","Trailer":"RL1652"}},
                {"id":"RAH697W","name":"HARERIMANA OMAR","license_plate":"RAH697W","phone":"+250788485208","custom":{"Passport":"PC768758","Driving License":"1199480144613317","Trailer":"RL3525"}},
                {"id":"RAH698W","name":"NIZEYIMANA ABDUL KARIM","license_plate":"RAH698W","phone":"+255742035273","custom":{"Passport":"LP646778","Driving License":"1 197980112300307","Trailer":"RL3520"}},
                {"id":"RAH699W","name":"EMMANUEL FOCUS MAENJA","license_plate":"RAH699W","phone":"+250786047097","custom":{"Passport":"TAE188715","Driving License":"4001759385","Trailer":"RL7611"}},
                {"id":"RAH823A","name":"NDAHIMANA GASPARD POYO","license_plate":"RAH823A","phone":"+250788254810","custom":{"Passport":"LP783756","Driving License":"4006483236","Trailer":"RL6714"}},
                {"id":"RAH824A","name":"HUSSEIN BAGABO","license_plate":"RAH824A","phone":"+250789919626","custom":{"Passport":"LP736231","Driving License":"PNC0548914","Trailer":"RL1340"}},
                {"id":"RAH825A","name":"NSENGIMANA CONSTANTE PEDRO","license_plate":"RAH825A","phone":"+250788686609","custom":{"Passport":"LP591009","Driving License":"4006960185","Trailer":"RL1263"}},
                {"id":"RAH827A","name":"HEMED ATHUMAN STENGWA","license_plate":"RAH827A","phone":"+255715897282","custom":{"Passport":"AB1265134","Driving License":"4000170898","Trailer":"RL1997"}},
                {"id":"RAH828A","name":"NDIZIHIWE YVES LAMBERT","license_plate":"RAH828A","phone":"+250782750338","custom":{"Passport":"LP712104","Driving License":"4006206909","Trailer":"RL1341"}},
                {"id":"RAH829A","name":"NSHIMYUMUREMYI KAZOYO GASPAR","license_plate":"RAH829A","phone":"+250781643962","custom":{"Passport":"LP697553","Driving License":"4003643471","Trailer":"RL1467"}},
                {"id":"RAH830A","name":"NTWARI MASUDI","license_plate":"RAH830A","phone":"+250783247786","custom":{"Passport":"LP646450","Driving License":"4005036007","Trailer":"RL1462"}},
                {"id":"RAH831A","name":"SHIZZO AIME RUTERANYAGABO","license_plate":"RAH831A","phone":"+250788775406","custom":{"Passport":"LP532556","Driving License":"4003862420","Trailer":"RL1459"}},
                {"id":"RAH832A","name":"IYAMUREMYE JANVIER","license_plate":"RAH832A","phone":"+250783532323","custom":{"Passport":"LP725235","Driving License":"4005269065","Trailer":"RL1477"}},
                {"id":"RAH833A","name":"SWAIBU BAKARY MUSSA","license_plate":"RAH833A","phone":"+250787848160","custom":{"Passport":"AB1242716","Driving License":"4000239565","Trailer":"RL1339"}},
                {"id":"RAD920W","name":"NTUYEMUKAGA IDDI ELLY","license_plate":"RAD920W","phone":"+250788316627","custom":{"Passport":"LP806666","Driving License":"1198580204561330","Trailer":"RL7606"}},
                {"id":"RAD797E","name":"GASANA ALLY","license_plate":"RAD797E","phone":"+250788407428","custom":{"Passport":"LP788638","Driving License":"4004246376","Trailer":"RL7609"}},
                {"id":"RAD059R","name":"ANDREA KALST TESHA","license_plate":"RAD059R","phone":"+255754484844","custom":{"Passport":"TAE531077","Driving License":"4000354173","Trailer":"RL7608"}},
                {"id":"RAD921W","name":"MOHAMED ABUU AMAN","license_plate":"RAD921W","phone":"+250788541317","custom":{"Passport":"TAE298734","Driving License":"4000028702","Trailer":"RL7605"}},
                {"id":"RAD801E","name":"USABUWERA DAMIEN","license_plate":"RAD801E","phone":"+250788482002","custom":{"Passport":"PC728183","Driving License":"1197280091936312","Trailer":"RL7607"}},
                {"id":"RAJ959B","name":"MWINYIHIJA SWALEH KISILA","license_plate":"RAJ959B","phone":"+255715897282","custom":{"Passport":"TAE691508","Driving License":"4005761812","Trailer":"RL7883"}},
                {"id":"RAJ965B","name":"NDAYISABA JEAN DAMASCENE","license_plate":"RAJ965B","phone":"+250788241472","custom":{"Passport":"PC728560","Driving License":"1 1983 8 0060325321","Trailer":"RL7884"}},
                {"id":"RAJ969B","name":"HABIMANA ABDOULKARIM","license_plate":"RAJ969B","phone":"+250788843221","custom":{"Passport":"PC746591","Driving License":"4001658596","Trailer":"RL7879"}},
                {"id":"RAJ966B","name":"SHAFI","license_plate":"RAJ966B","phone":"+250788598071","custom":{"Passport":"LP786708","Driving License":"1198380150084440","Trailer":"RL7878"}},
                {"id":"RAJ968B","name":"WILLY JUVENS NDASHIMYE","license_plate":"RAJ968B","phone":"+250788374992","custom":{"Passport":"LP655916","Driving License":"1198980009491136","Trailer":"RL7874"}},
                {"id":"RAJ967B","name":"NIYITANGA ABDOUL KARIM","license_plate":"RAJ967B","phone":"+250787618167","custom":{"Passport":"LP697900","Driving License":"4007711722","Trailer":"RL7876"}},
                {"id":"RAJ962B","name":"SAIDI SEGISEKURE MUSSA","license_plate":"RAJ962B","phone":"+250788711748","custom":{"Passport":"LP726247","Driving License":"4004270321","Trailer":"RL7882"}},
                {"id":"RAJ964B","name":"MSIGITY ALLY","license_plate":"RAJ964B","phone":"+250788234335","custom":{"Passport":"PC716822","Driving License":"1199980018943242","Trailer":"RL7885"}},
                {"id":"RAJ961B","name":"MWASIBILA DEUS CHARLES","license_plate":"RAJ961B","phone":"+255769391713","custom":{"Passport":"AB1243252","Driving License":"4000059563","Trailer":"RL7877"}},
                {"id":"RAJ963B","name":"PETER NSHIMIYIMANA","license_plate":"RAJ963B","phone":"+250788748321","custom":{"Passport":"PC709245","Driving License":"4005508886","Trailer":"RL7875"}},
                {"id":"RAJ845E","name":"ERIC NGABONZIZA","license_plate":"RAJ845E","phone":"+250795775225","custom":{"Passport":"LP838957","Driving License":"1 1993 8 00564002 22","Trailer":"RL8064"}},
                {"id":"RAJ844E","name":"JACKSON HABIMANA","license_plate":"RAJ844E","phone":"+250788664455","custom":{"Passport":"LP898725","Driving License":"1 1983 8 0017760 5 40","Trailer":"RL8065"}},
                {"id":"RAJ982E","name":"ADNAN DUSHIMIMANA","license_plate":"RAJ982E","phone":"+250787551129","custom":{"Passport":"LP711166","Driving License":"1 1994 80081356 4 31","Trailer":"RL8066"}},
                {"id":"RAJ843E","name":"KHALIFA RUDAHUSHA","license_plate":"RAJ843E","phone":"+250783350924","custom":{"Passport":"LP803482","Driving License":"1 1984 8 01436884 14","Trailer":"RL8067"}},
                {"id":"RAJ981E","name":"PAUL THOMAS","license_plate":"RAJ981E","phone":"+250786279089","custom":{"Passport":"LP740575","Driving License":"1 1992 8 0210658 3 09","Trailer":"RL8068"}},
                {"id":"RAJ848E","name":"Joseph SIBOMANA","license_plate":"RAJ848E","phone":"+250788355368","custom":{"Passport":"LP810220","Driving License":"1 1980 8 0021928 3 10","Trailer":"RL8093"}},
                {"id":"RAJ850E","name":"SHEMA HUGUES","license_plate":"RAJ850E","phone":"+250785781850","custom":{"Passport":"LP707987","Driving License":"4006765809","Trailer":"RL8070"}},
                {"id":"RAJ847E","name":"ISLAM MUHAMMAD FARID","license_plate":"RAJ847E","phone":"+255769431043","custom":{"Passport":"TAE588290","Driving License":"4000258386","Trailer":"RL8091"}},
                {"id":"RAJ849E","name":"BILARY NURDIN JUMANNE","license_plate":"RAJ849E","phone":"+255756333302","custom":{"Passport":"TAE692242","Driving License":"4000371335","Trailer":"RL8092"}},
                {"id":"RAJ846E","name":"MAGOLI HAMAD Enzlon","license_plate":"RAJ846E","phone":"+255754302314","custom":{"Passport":"TAE747721","Driving License":"4000101678","Trailer":"RL8069"}}
            ];
            const DEMO_TRUCKS = [
                {"plate":"RAD003W","model":"","vin":"","trailer":"RL1466","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD005W","model":"","vin":"","trailer":"RL1262","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD034J","model":"","vin":"","trailer":"RL1460","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD089K","model":"","vin":"","trailer":"RL1461","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD091K","model":"","vin":"","trailer":"RL1476","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD542C","model":"","vin":"","trailer":"RL1264","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD534C","model":"","vin":"","trailer":"","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD742Q","model":"","vin":"","trailer":"RL1653","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD743Q","model":"","vin":"","trailer":"RL1998","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD907R","model":"","vin":"","trailer":"RL1465","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD998V","model":"","vin":"","trailer":"RL1720","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF535A","model":"","vin":"","trailer":"RL3528","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF540A","model":"","vin":"","trailer":"RL3515","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF545A","model":"","vin":"","trailer":"RL3524","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF548A","model":"","vin":"","trailer":"RL3523","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF552A","model":"","vin":"","trailer":"RL3530","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF554A","model":"","vin":"","trailer":"RL3529","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF565A","model":"","vin":"","trailer":"RL3518","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF419U","model":"","vin":"","trailer":"RL1722","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF420U","model":"","vin":"","trailer":"RL1719","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD002W","model":"","vin":"","trailer":"RL1998","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF546A","model":"","vin":"","trailer":"RL3532","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF549A","model":"","vin":"","trailer":"RL3514","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF551A","model":"","vin":"","trailer":"RL3527","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF556A","model":"","vin":"","trailer":"RL3525","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF557A","model":"","vin":"","trailer":"RL3519","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF558A","model":"","vin":"","trailer":"RL3526","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF559A","model":"","vin":"","trailer":"RL1296","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF560A","model":"","vin":"","trailer":"RL3521","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF561A","model":"","vin":"","trailer":"RL3531","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF562A","model":"","vin":"","trailer":"RL1718","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF563A","model":"","vin":"","trailer":"RL3533","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF564A","model":"","vin":"","trailer":"RL3522","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF586Z","model":"","vin":"","trailer":"RL3517","documents":[],"issues":[],"custom":{}},
                {"plate":"RAF589Z","model":"","vin":"","trailer":"RL1721","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH668W","model":"","vin":"","trailer":"RL6716","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH691W","model":"","vin":"","trailer":"RL1463","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH692W","model":"","vin":"","trailer":"RL6715","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH693W","model":"","vin":"","trailer":"RL1265","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH694W","model":"","vin":"","trailer":"RL6712","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH695W","model":"","vin":"","trailer":"RL6713","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH696W","model":"","vin":"","trailer":"RL1652","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH697W","model":"","vin":"","trailer":"RL3525","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH698W","model":"","vin":"","trailer":"RL3520","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH699W","model":"","vin":"","trailer":"RL7611","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH823A","model":"","vin":"","trailer":"RL6714","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH824A","model":"","vin":"","trailer":"RL1340","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH825A","model":"","vin":"","trailer":"RL1263","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH827A","model":"","vin":"","trailer":"RL1997","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH828A","model":"","vin":"","trailer":"RL1341","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH829A","model":"","vin":"","trailer":"RL1467","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH830A","model":"","vin":"","trailer":"RL1462","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH831A","model":"","vin":"","trailer":"RL1459","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH832A","model":"","vin":"","trailer":"RL1477","documents":[],"issues":[],"custom":{}},
                {"plate":"RAH833A","model":"","vin":"","trailer":"RL1339","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD920W","model":"","vin":"","trailer":"RL7606","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD797E","model":"","vin":"","trailer":"RL7609","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD059R","model":"","vin":"","trailer":"RL7608","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD921W","model":"","vin":"","trailer":"RL7605","documents":[],"issues":[],"custom":{}},
                {"plate":"RAD801E","model":"","vin":"","trailer":"RL7607","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ959B","model":"","vin":"","trailer":"RL7883","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ965B","model":"","vin":"","trailer":"RL7884","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ969B","model":"","vin":"","trailer":"RL7879","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ966B","model":"","vin":"","trailer":"RL7878","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ968B","model":"","vin":"","trailer":"RL7874","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ967B","model":"","vin":"","trailer":"RL7876","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ962B","model":"","vin":"","trailer":"RL7882","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ964B","model":"","vin":"","trailer":"RL7885","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ961B","model":"","vin":"","trailer":"RL7877","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ963B","model":"","vin":"","trailer":"RL7875","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ845E","model":"","vin":"","trailer":"RL8064","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ844E","model":"","vin":"","trailer":"RL8065","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ982E","model":"","vin":"","trailer":"RL8066","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ843E","model":"","vin":"","trailer":"RL8067","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ981E","model":"","vin":"","trailer":"RL8068","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ848E","model":"","vin":"","trailer":"RL8093","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ850E","model":"","vin":"","trailer":"RL8070","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ847E","model":"","vin":"","trailer":"RL8091","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ849E","model":"","vin":"","trailer":"RL8092","documents":[],"issues":[],"custom":{}},
                {"plate":"RAJ846E","model":"","vin":"","trailer":"RL8069","documents":[],"issues":[],"custom":{} }
            ];

            async function loadDemoData() {
                if (drivers.length || trucks.length) {
                    if (!await requireAdminPin('Enter admin PIN to load demo data and backup current data')) return;
                    backupAndDownload('Backup before loading demo data');
                }
                drivers = DEMO_DRIVERS.map((d, i) => ({
                    _idx: i,
                    id: d.id || `DRV-${100 + i}`,
                    name: d.name || '',
                    status: settings.driverStatuses[i % settings.driverStatuses.length]?.name || 'Online',
                    license: d.custom?.['Driving License'] || '',
                    licenseExpiry: '',
                    passport: d.custom?.Passport || '',
                    passportExpiry: '',
                    phone: d.phone || '',
                    license_plate: d.license_plate || '',
                    hire_date: '',
                    bloodGroup: '',
                    healthStatus: '',
                    trips: 0,
                    tripsList: [],
                    violations: [],
                    warningsList: [],
                    suspensionsList: [],
                    accidentsList: [],
                    lossesList: [],
                    custom: d.custom || {}
                }));
                trucks = DEMO_TRUCKS.map((t, i) => {
                    let initialStatus = 'Active';
                    if (t.plate === 'RAD003W') initialStatus = 'On Trip';
                    return {
                        _idx: i,
                        plate: t.plate || `TRK-${i}`,
                        brand: t.brand || 'Volvo',
                        chassisNo: t.chassisNo || `CH-${t.plate || i}`,
                        year: t.year || 2020,
                        logBook: t.logBook || `LB-${t.plate || i}`,
                        trailer: t.trailer || '',
                        documents: Array.isArray(t.documents) ? t.documents : [],
                        issues: Array.isArray(t.issues) ? t.issues : [],
                        custom: t.custom || {},
                        status: initialStatus
                    };
                });
                orders = [
                    { _idx: 0, orderId: "ORD-1001", name: "Structural Steel Girders", client: "Acme Infrastructure", truckPlate: "RAD003W", status: "In Transit", date: "2026-05-26", priority: "High", assignedTrucks: [{ plate: "RAD001A", status: "allocated", active: false, switchedTo: "RAD003W" }, { plate: "RAD003W", status: "Transit", active: true }] },
                    { _idx: 1, orderId: "ORD-1002", name: "Electronic Core Assemblies", client: "Zenith Tech Component", truckPlate: "RAD005W", status: "Pending", date: "2026-05-27", priority: "Medium", assignedTrucks: [{ plate: "RAD005W", status: "allocated", active: true }] },
                    { _idx: 2, orderId: "ORD-1003", name: "Bio-Fuel Feedstock Batch", client: "EcoEnergy Group Ltd", truckPlate: "RAD034J", status: "At Garage", date: "2026-05-25", priority: "Low", assignedTrucks: [{ plate: "RAD034J", status: "Offloaded", active: true }] }
                ];
                hscPolicies = [
                    {
                        title: 'Speed Limit & Speeding Policy',
                        description: 'All fleet vehicles are speed-governed to 80 km/h. Drivers must adhere strictly to speed limits and adjust speed based on weather and road conditions.',
                        category: 'Safety',
                        severity: 'high',
                        effectiveDate: '2026-01-01',
                        icon: '🏎',
                        committed: true,
                        rank: 1,
                        violationMeasure: 'First violation: Written warning and speed coaching. Second violation: 3-day suspension. Third violation: Immediate contract termination.'
                    },
                    {
                        title: 'Seatbelt Compliance Policy',
                        description: 'Seatbelts must be worn by the driver and all passengers at all times when the vehicle is in motion. No exceptions.',
                        category: 'Safety',
                        severity: 'high',
                        effectiveDate: '2026-01-01',
                        icon: '🛡',
                        committed: true,
                        rank: 2,
                        violationMeasure: 'First offense results in a final written warning and a mandatory safety briefing. Second offense will lead to a 5-day contract suspension.'
                    },
                    {
                        title: 'Rest & Fatigue Management',
                        description: 'Drivers must take a 30-minute rest break after every 4 hours of continuous driving. Maximum driving hours per day is capped at 9 hours.',
                        category: 'Health',
                        severity: 'medium',
                        effectiveDate: '2026-02-15',
                        icon: '😴',
                        committed: false,
                        rank: 3,
                        violationMeasure: 'Disciplinary meeting with safety officer. Continued violation leads to route reassignment and deduction of safety/performance bonuses.'
                    },
                    {
                        title: 'Drug & Alcohol Zero-Tolerance',
                        description: 'The company maintains a zero-tolerance policy for drug and alcohol use. Random testing is conducted at checkpoints.',
                        category: 'Compliance',
                        severity: 'high',
                        effectiveDate: '2026-01-01',
                        icon: '🚫',
                        committed: true,
                        rank: 4,
                        violationMeasure: 'Immediate suspension, pending full investigation. Positive test results in immediate contract termination and reporting to transport authorities.'
                    }
                ];
                
                hscMeetings = [
                    {
                        title: 'Quarterly Fleet Safety Review',
                        date: '2026-05-15',
                        membersPresent: 'Marcus Vance (HSE Chair), Sarah Jenkins (Operations Manager), David Kigo (Driver Rep)',
                        summary: 'Review of recent speed violations trends and effectiveness of speed governors. Discussed updates to Rest and Fatigue policies ahead of the summer season. Approved new zero-tolerance drug check guidelines.',
                        pdfFileName: 'fleet_safety_review_q1.pdf',
                        pdfFileData: DEFAULT_PDF_DATA
                    },
                    {
                        title: 'Emergency Response Protocol Update',
                        date: '2026-04-10',
                        membersPresent: 'Marcus Vance (HSE Chair), Clara Oswald (Logistics Coordinator)',
                        summary: 'Alignment on emergency contacts and protocols for remote transit incidents. Updated truck first-aid kit checklists and designated safety wardens at major loading hubs.',
                        pdfFileName: 'emergency_protocols_v2.pdf',
                        pdfFileData: DEFAULT_PDF_DATA
                    }
                ];
                
                saveHscPolicies();
                saveHscMeetings();
                saveAll();
                renderSettings();
                showPage('dashboard');
                showToast('Demo data loaded');
            }

            // ──── Report Logo & Multi-Driver Selection ────
            let reportLogo = null;

            async function handleReportLogoUpload(files) {
                if (!files || !files.length) return;
                const file = files[0];
                if (!isImageFile(file)) {
                    showToast('Please upload an image file');
                    return;
                }
                try {
                    const dataUrl = await compressImageFile(file);
                    let uploadedUrl = null;
                    try {
                        const result = await uploadToGoogleDrive({
                            base64: dataUrlToBase64(dataUrl),
                            fileName: file.name || 'report-logo.jpg',
                            mimeType: file.type || 'image/jpeg',
                            folder: 'fleetguard/reports/logos'
                        });
                        uploadedUrl = result.url;
                        showToast('Logo uploaded to Google Drive');
                    } catch (_) {
                        uploadedUrl = dataUrl;
                        showToast('Logo attached locally');
                    }
                    reportLogo = uploadedUrl;
                    const statusEl = document.getElementById('rptLogoStatus');
                    const clearBtn = document.getElementById('rptLogoClearBtn');
                    if (statusEl) statusEl.textContent = file.name + ' ✓';
                    if (clearBtn) clearBtn.style.display = '';
                } catch (err) {
                    showToast('Logo processing failed: ' + err.message);
                }
            }

            function clearReportLogo() {
                reportLogo = null;
                const statusEl = document.getElementById('rptLogoStatus');
                const clearBtn = document.getElementById('rptLogoClearBtn');
                if (statusEl) statusEl.textContent = 'No logo selected';
                if (clearBtn) clearBtn.style.display = 'none';
                showToast('Logo cleared');
            }

            let selectedReportDrivers = new Set();
            let selectedReportTrucks = new Set();

            function filterDriverList() {
                const searchText = (document.getElementById('rptDriverSearch')?.value || '').toLowerCase();
                const listContainer = document.getElementById('rptDriversList');
                if (!listContainer) return;
                
                const filtered = drivers.filter(d => 
                    (d.name || '').toLowerCase().includes(searchText) ||
                    (d.id || '').toLowerCase().includes(searchText) ||
                    (d.license_plate || '').toLowerCase().includes(searchText) ||
                    (getTrailerForPlate(d.license_plate || d.id) || '').toLowerCase().includes(searchText)
                );
                
                listContainer.innerHTML = filtered.map((d, i) => {
                    const val = String(d._idx !== undefined ? d._idx : i);
                    const isChecked = selectedReportDrivers.has(val);
                    return `
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;font-size:11px;border-radius:4px;background:var(--bg3);border:1px solid var(--border);transition:all 0.2s;">
                        <input type="checkbox" class="rptDriverCheckbox" value="${val}" ${isChecked ? 'checked' : ''} onchange="App.onDriverCheckChange(this)" style="cursor:pointer;width:16px;height:16px;flex-shrink:0">
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis">
                            <strong>${xmlEscape(d.name || 'Unknown')}</strong>
                            <br>
                            <span style="font-size:9px;color:var(--text3)">${xmlEscape(formatDriverVehicleLabel(d) || 'N/A')}</span>
                        </span>
                    </label>`;
                }).join('');

                updateDriverSelectionCount();
            }

            function onDriverCheckChange(cb) {
                if (!cb) return;
                const val = String(cb.value);
                if (cb.checked) {
                    selectedReportDrivers.add(val);
                } else {
                    selectedReportDrivers.delete(val);
                }
                updateDriverSelectionCount();
            }

            function toggleAllDrivers(checked) {
                if (checked) {
                    drivers.forEach((d, i) => selectedReportDrivers.add(String(d._idx !== undefined ? d._idx : i)));
                } else {
                    selectedReportDrivers.clear();
                }
                filterDriverList();
            }

            function updateDriverSelectionCount() {
                const selectAllCheckbox = document.getElementById('rptDriverSelectAll');
                const checkedCount = selectedReportDrivers.size;
                const countEl = document.getElementById('rptDriversSelectedCount');
                
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = checkedCount === drivers.length && drivers.length > 0;
                }
                
                if (countEl) {
                    if (checkedCount === 0) {
                        countEl.textContent = `All ${drivers.length} drivers included (default)`;
                    } else if (checkedCount === drivers.length) {
                        countEl.textContent = `All ${drivers.length} drivers selected`;
                    } else {
                        countEl.textContent = `${checkedCount} of ${drivers.length} drivers selected`;
                    }
                }
            }

            function filterTruckList() {
                const searchText = (document.getElementById('rptTruckSearch')?.value || '').toLowerCase();
                const listContainer = document.getElementById('rptTrucksList');
                if (!listContainer) return;
                
                const filtered = trucks.filter(t => 
                    (t.plate || '').toLowerCase().includes(searchText) ||
                    (t.model || '').toLowerCase().includes(searchText) ||
                    (t.trailer || '').toLowerCase().includes(searchText)
                );
                
                listContainer.innerHTML = filtered.map((t, i) => {
                    const val = String(t._idx !== undefined ? t._idx : i);
                    const isChecked = selectedReportTrucks.has(val);
                    return `
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:8px;font-size:11px;border-radius:4px;background:var(--bg3);border:1px solid var(--border);transition:all 0.2s;">
                        <input type="checkbox" class="rptTruckCheckbox" value="${val}" ${isChecked ? 'checked' : ''} onchange="App.onTruckCheckChange(this)" style="cursor:pointer;width:16px;height:16px;flex-shrink:0">
                        <span style="flex:1;overflow:hidden;text-overflow:ellipsis">
                            <strong>${xmlEscape(formatTruckLabel(t) || 'Unknown')}</strong>
                            <br>
                            <span style="font-size:9px;color:var(--text3)">${xmlEscape(t.model || 'No model')}</span>
                        </span>
                    </label>`;
                }).join('');

                updateTruckSelectionCount();
            }

            function onTruckCheckChange(cb) {
                if (!cb) return;
                const val = String(cb.value);
                if (cb.checked) {
                    selectedReportTrucks.add(val);
                } else {
                    selectedReportTrucks.delete(val);
                }
                updateTruckSelectionCount();
            }

            function toggleAllTrucks(checked) {
                if (checked) {
                    trucks.forEach((t, i) => selectedReportTrucks.add(String(t._idx !== undefined ? t._idx : i)));
                } else {
                    selectedReportTrucks.clear();
                }
                filterTruckList();
            }

            function updateTruckSelectionCount() {
                const selectAllCheckbox = document.getElementById('rptTruckSelectAll');
                const checkedCount = selectedReportTrucks.size;
                const countEl = document.getElementById('rptTrucksSelectedCount');
                
                if (selectAllCheckbox) {
                    selectAllCheckbox.checked = checkedCount === trucks.length && trucks.length > 0;
                }
                
                if (countEl) {
                    if (checkedCount === 0) {
                        countEl.textContent = `All ${trucks.length} trucks included (default)`;
                    } else if (checkedCount === trucks.length) {
                        countEl.textContent = `All ${trucks.length} trucks selected`;
                    } else {
                        countEl.textContent = `${checkedCount} of ${trucks.length} trucks selected`;
                    }
                }
            }

            function renderReports() {
                selectedReportDrivers.clear();
                selectedReportTrucks.clear();
                filterDriverList();
                filterTruckList();
                
                const today = new Date().toISOString().slice(0,10);
                const yearAgo = new Date(Date.now() - 365*24*60*60*1000).toISOString().slice(0,10);
                const fromEl = document.getElementById('rptDateFrom');
                const toEl   = document.getElementById('rptDateTo');
                const fromTimeEl = document.getElementById('rptTimeFrom');
                const toTimeEl   = document.getElementById('rptTimeTo');
                if (fromEl && !fromEl.value) fromEl.value = yearAgo;
                if (toEl   && !toEl.value)   toEl.value   = today;
                if (fromTimeEl && !fromTimeEl.value) fromTimeEl.value = '00:00';
                if (toTimeEl && !toTimeEl.value)     toTimeEl.value = '23:59';
                populateJcReportServiceFilter();

                // Always restore the currently active category tab & its panel on every render
                // (prevents blank / wrong panel after a browser refresh or Firebase live push).
                const activeCatTab = document.querySelector('#page-reports .rpt-tabs .rpt-tab[data-cat].active');
                const catToShow = activeCatTab ? activeCatTab.dataset.cat : 'driver';
                switchReportCategory(catToShow);
            }

            function switchReportCategory(cat) {
                // Scope to reports page tabs only — prevents collision with recyclebin filter tabs
                // which share the .rpt-tab class.
                document.querySelectorAll('#page-reports .rpt-tabs .rpt-tab[data-cat]').forEach(t => t.classList.remove('active'));
                const tab = document.querySelector(`#page-reports .rpt-tabs .rpt-tab[data-cat="${cat}"]`);
                if (tab) tab.classList.add('active');

                document.querySelectorAll('.rpt-category-panel').forEach(p => p.style.display = 'none');
                const panel = document.getElementById('rptPanel-' + cat);
                if (panel) panel.style.display = '';

                const dSubj = document.getElementById('rptDriverSubject');
                const tSubj = document.getElementById('rptTruckSubject');
                const jSubj = document.getElementById('rptJobCardSubject');
                if (dSubj) dSubj.style.display = cat === 'driver' ? '' : 'none';
                if (tSubj) tSubj.style.display = (cat === 'truck' || cat === 'jobcard') ? '' : 'none';
                if (jSubj) jSubj.style.display = cat === 'jobcard' ? '' : 'none';
                const prev = document.getElementById('rptPreview');
                if (prev) prev.style.display = 'none';

                if (cat === 'driver') {
                    App.updateDriverSelectionCount();
                } else if (cat === 'truck' || cat === 'jobcard') {
                    App.updateTruckSelectionCount();
                }
                if (cat === 'jobcard') populateJcReportServiceFilter();
            }

            function toggleReportCard(card, _id, evt) {
                if (!card) return;
                const cb = card.querySelector('.rpt-check');
                if (!cb) return;
                
                const e = evt || (typeof window !== 'undefined' ? window.event : null);
                const isInput = e && e.target && (e.target === cb || (e.target.tagName && e.target.tagName.toUpperCase() === 'INPUT'));
                
                if (!isInput) {
                    cb.checked = !cb.checked;
                }
                card.classList.toggle('selected', !!cb.checked);
            }

            function onReportCheckChange(cb) {
                if (!cb) return;
                const card = cb.closest('.rpt-card');
                if (card) card.classList.toggle('selected', !!cb.checked);
            }

            function toggleAllReports(cat, checked) {
                document.querySelectorAll(`#rptPanel-${cat} .rpt-check`).forEach(cb => {
                    cb.checked = checked;
                    const card = cb.closest('.rpt-card');
                    if (card) card.classList.toggle('selected', checked);
                });
            }

            function quickReport(type) {
                const today = new Date().toISOString().slice(0,10);
                const yearAgo = new Date(Date.now()-365*24*60*60*1000).toISOString().slice(0,10);
                document.getElementById('rptDateFrom').value = yearAgo;
                document.getElementById('rptDateTo').value   = today;
                document.getElementById('rptTimeFrom').value = '00:00';
                document.getElementById('rptTimeTo').value   = '23:59';
                if (type === 'driver-compliance') {
                    switchReportCategory('driver');
                    setTimeout(() => {
                        toggleAllReports('driver', false);
                        document.getElementById('rptDriverSelect').value = 'all';
                        ['profile','documents','risk'].forEach(v => {
                            const cb = document.querySelector(`#rptPanel-driver .rpt-check[value="${v}"]`);
                            if (cb) { cb.checked = true; cb.closest('.rpt-card').classList.add('selected'); }
                        });
                        generateReport();
                    }, 50);
                } else if (type === 'high-risk') {
                    switchReportCategory('fleet');
                    setTimeout(() => {
                        toggleAllReports('fleet', false);
                        const cb = document.querySelector('#rptPanel-fleet .rpt-check[value="fleet-highrisk"]');
                        if (cb) { cb.checked = true; cb.closest('.rpt-card').classList.add('selected'); }
                        generateReport();
                    }, 50);
                } else if (type === 'expired-docs') {
                    switchReportCategory('fleet');
                    setTimeout(() => {
                        toggleAllReports('fleet', false);
                        const cb = document.querySelector('#rptPanel-fleet .rpt-check[value="fleet-expired"]');
                        if (cb) { cb.checked = true; cb.closest('.rpt-card').classList.add('selected'); }
                        generateReport();
                    }, 50);
                } else if (type === 'fleet-full') {
                    switchReportCategory('fleet');
                    setTimeout(() => { toggleAllReports('fleet', true); generateReport(); }, 50);
                } else if (type === 'truck-health') {
                    switchReportCategory('truck');
                    setTimeout(() => {
                        toggleAllReports('truck', false);
                        ['truck-health','truck-documents','truck-maintenance'].forEach(v => {
                            const cb = document.querySelector(`#rptPanel-truck .rpt-check[value="${v}"]`);
                            if (cb) { cb.checked = true; cb.closest('.rpt-card').classList.add('selected'); }
                        });
                        // Select all trucks for truck-health report
                        const truckSelectAll = document.getElementById('rptTruckSelectAll');
                        if (truckSelectAll) truckSelectAll.checked = true;
                        App.updateTruckSelectionCount();
                        generateReport();
                    }, 50);
                } else if (type === 'jc-high-expense') {
                    switchReportCategory('jobcard');
                    setTimeout(() => {
                        setReportPeriodPreset('month');
                        toggleAllReports('jobcard', false);
                        const cb = document.querySelector('#rptPanel-jobcard .rpt-check[value="jobcard-high-expense"]');
                        if (cb) { cb.checked = true; cb.closest('.rpt-card').classList.add('selected'); }
                        const truckSelectAll = document.getElementById('rptTruckSelectAll');
                        if (truckSelectAll) truckSelectAll.checked = true;
                        document.querySelectorAll('.rptTruckCheckbox').forEach(c => { c.checked = true; });
                        updateTruckSelectionCount();
                        generateReport();
                    }, 50);
                } else if (type === 'jc-upcoming') {
                    switchReportCategory('jobcard');
                    setTimeout(() => {
                        setReportPeriodPreset('30d');
                        toggleAllReports('jobcard', false);
                        const cb = document.querySelector('#rptPanel-jobcard .rpt-check[value="jobcard-recent-upcoming"]');
                        if (cb) { cb.checked = true; cb.closest('.rpt-card').classList.add('selected'); }
                        const truckSelectAll = document.getElementById('rptTruckSelectAll');
                        if (truckSelectAll) truckSelectAll.checked = true;
                        document.querySelectorAll('.rptTruckCheckbox').forEach(c => { c.checked = true; });
                        updateTruckSelectionCount();
                        generateReport();
                    }, 50);
                }
            }

            function setReportPeriodPreset(preset) {
                const fromEl = document.getElementById('rptDateFrom');
                const toEl = document.getElementById('rptDateTo');
                const now = new Date();
                const today = now.toISOString().slice(0, 10);
                let from = today;
                if (preset === 'week') {
                    const w = new Date(now);
                    w.setDate(w.getDate() - 7);
                    from = w.toISOString().slice(0, 10);
                } else if (preset === 'month') {
                    from = today.slice(0, 8) + '01';
                } else if (preset === '30d') {
                    const d = new Date(now);
                    d.setDate(d.getDate() - 30);
                    from = d.toISOString().slice(0, 10);
                } else if (preset === 'year') {
                    from = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
                }
                if (fromEl) fromEl.value = from;
                if (toEl) toEl.value = today;
            }

            function populateJcReportServiceFilter() {
                const sel = document.getElementById('rptJcServiceFilter');
                if (!sel) return;
                const cur = sel.value;
                const names = getServiceCatalog().map(s => s.name).filter(Boolean);
                const fromJc = new Set();
                jobCards.forEach(jc => getJcCompletedServices(jc).forEach(s => fromJc.add(s.name)));
                const all = [...new Set([...names, ...fromJc])].sort((a, b) => a.localeCompare(b));
                sel.innerHTML = '<option value="">All services</option>' + all.map(n => `<option value="${xmlEscape(n)}">${xmlEscape(n)}</option>`).join('');
                if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
            }

            function getSelectedReportDrivers() {
                const selectAllCheckbox = document.getElementById('rptDriverSelectAll');
                if (selectAllCheckbox && selectAllCheckbox.checked) return drivers.slice();
                if (selectedReportDrivers.size > 0) {
                    return drivers.filter((d, i) => selectedReportDrivers.has(String(d._idx !== undefined ? d._idx : i)));
                }
                return drivers.slice();
            }

            function getSelectedReportTrucks() {
                const selectAllCheckbox = document.getElementById('rptTruckSelectAll');
                if (selectAllCheckbox && selectAllCheckbox.checked) return trucks.slice();
                if (selectedReportTrucks.size > 0) {
                    return trucks.filter((t, i) => selectedReportTrucks.has(String(t._idx !== undefined ? t._idx : i)));
                }
                return trucks.slice();
            }

            function isRepairLikeService(name) {
                const n = (name || '').toLowerCase();
                return /repair|fix|replac|brake|engine|transmission|clutch|radiator|suspension|gearbox|overhaul|welding|bodywork|accident|damage|injector|turbo|axle|differential|starter|alternator|tyre|tire/.test(n);
            }

            function getJcCompletedServices(jc) {
                return (jc.mechanicLines || []).filter(m => m.done).map(m => {
                    const dl = (jc.driverLines || []).find(d => d.lineId === m.driverLineId);
                    const name = dl?.name || m.name || 'Service';
                    return {
                        name,
                        cost: m.actualCost || 0,
                        partsCost: m.partsCost || 0,
                        labourCost: m.labourCost || 0,
                        date: (m.completedAt || jcApprovalTimestamp(jc)).slice(0, 10),
                        unplanned: !!m.unplanned,
                        mechanic: m.mechanic || '',
                        jobCardId: jc.id,
                        plate: jc.plate || ''
                    };
                });
            }

            function getTruckMonthlyRepayment(trk) {
                if (!trk?.custom || typeof trk.custom !== 'object') return 0;
                for (const k of Object.keys(trk.custom)) {
                    const lk = k.toLowerCase();
                    if (/repay|loan|installment|finance|lease|monthly/.test(lk)) {
                        const v = parseFloat(String(trk.custom[k]).replace(/[^\d.]/g, ''));
                        if (!isNaN(v) && v > 0) return v;
                    }
                }
                return 0;
            }

            function getReportJobCards(dateFrom, dateTo, plateFilter) {
                let list = jobCards.filter(jc => isSupervisorApproved(jc) || jc.status === 'Released');
                list = _filterJobCardsByDate(list, dateFrom, dateTo);
                if (plateFilter && plateFilter.length) {
                    const set = new Set(plateFilter.map(p => (p || '').trim().toUpperCase()));
                    list = list.filter(jc => set.has((jc.plate || '').trim().toUpperCase()));
                }
                return list;
            }

            function aggregateTruckSpend(plate, filteredJcs) {
                let repairCost = 0;
                let routineCost = 0;
                let jobCardCount = 0;
                const jcs = filteredJcs.filter(jc => jc.plate === plate);
                jcs.forEach(jc => {
                    jobCardCount++;
                    getJcCompletedServices(jc).forEach(s => {
                        if (s.unplanned || isRepairLikeService(s.name)) repairCost += s.cost;
                        else routineCost += s.cost;
                    });
                });
                const trk = trucks.find(t => t.plate === plate);
                const repayment = trk ? getTruckMonthlyRepayment(trk) : 0;
                return {
                    repairCost,
                    routineCost,
                    total: repairCost + routineCost,
                    jobCardCount,
                    repayment,
                    combined: repairCost + routineCost + repayment
                };
            }

            function getPredictedServicesForTruck(plate) {
                return getServiceCatalog().map(svc => {
                    const alert = getServiceIntervalAlert(plate, svc.name);
                    return {
                        service: svc.name,
                        level: alert.level,
                        nextDue: alert.nextDue,
                        lastDate: alert.last?.date || null,
                        text: alert.text
                    };
                }).sort((a, b) => {
                    const order = { over: 0, warn: 1, ok: 2 };
                    return (order[a.level] ?? 3) - (order[b.level] ?? 3);
                });
            }

            function getTruckRecentMaintenance(plate, dateFrom, dateTo, limit) {
                const entries = [];
                const trk = trucks.find(t => t.plate === plate);
                (trk?.maintenanceLog || []).forEach(e => {
                    const d = (e.date || '').slice(0, 10);
                    if (dateFrom && d && d < dateFrom) return;
                    if (dateTo && d && d > dateTo) return;
                    entries.push({ ...e, source: 'log' });
                });
                jobCards.filter(jc => jc.plate === plate && (isSupervisorApproved(jc) || jc.status === 'Released'))
                    .forEach(jc => {
                        getJcCompletedServices(jc).forEach(s => {
                            const d = s.date.slice(0, 10);
                            if (dateFrom && d < dateFrom) return;
                            if (dateTo && d > dateTo) return;
                            entries.push({
                                date: d,
                                service: s.name,
                                jobCardId: jc.id,
                                cost: s.cost,
                                mechanic: s.mechanic,
                                source: 'jobcard'
                            });
                        });
                    });
                entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
                const seen = new Set();
                const deduped = [];
                entries.forEach(e => {
                    const key = `${e.date}|${e.service}|${e.jobCardId || ''}`;
                    if (seen.has(key)) return;
                    seen.add(key);
                    deduped.push(e);
                });
                return deduped.slice(0, limit || 12);
            }

            function rptLevelChip(level) {
                const cls = level === 'over' ? 'rpt-chip-critical' : level === 'warn' ? 'rpt-chip-warning' : 'rpt-chip-good';
                const label = level === 'over' ? 'OVERDUE' : level === 'warn' ? 'DUE SOON' : 'OK';
                return `<span class="rpt-chip ${cls}">${label}</span>`;
            }

            function generateReport() {
                // Scope the tab lookup to the reports category tabs only (not recyclebin filter tabs)
                // to avoid false matches on shared .rpt-tab class after a fresh browser refresh.
                const activeTab = document.querySelector('#page-reports .rpt-tabs .rpt-tab[data-cat].active');
                // Fallback: find whichever category tab has an active class, or force 'driver' as default
                const cat = (activeTab && activeTab.dataset.cat) || 
                            (() => {
                                const firstActive = document.querySelector('#page-reports .rpt-tabs .rpt-tab[data-cat]');
                                if (firstActive) {
                                    firstActive.classList.add('active');
                                    switchReportCategory(firstActive.dataset.cat);
                                    return firstActive.dataset.cat;
                                }
                                return 'driver';
                            })();
                let selectedTypes = [...document.querySelectorAll(`#rptPanel-${cat} .rpt-check:checked`)].map(cb => cb.value);
                
                // If no report types are checked, auto-select all types in this panel silently
                // (never block the user with a toast — they already see the category)
                if (!selectedTypes.length) {
                    toggleAllReports(cat, true);
                    selectedTypes = [...document.querySelectorAll(`#rptPanel-${cat} .rpt-check:checked`)].map(cb => cb.value);
                }
                
                // If still empty (panel has no cards — should not happen), show friendly message
                if (!selectedTypes.length) { showToast('No report types found in this category'); return; }
                const dateFrom = document.getElementById('rptDateFrom')?.value || '';
                const timeFrom = document.getElementById('rptTimeFrom')?.value || '00:00';
                const dateTo   = document.getElementById('rptDateTo')?.value || '';
                const timeTo   = document.getElementById('rptTimeTo')?.value || '23:59';
                const genDate  = new Date().toLocaleString();
                const periodDisplay = dateFrom && dateTo ? `${dateFrom} ${timeFrom} → ${dateTo} ${timeTo}` : 'All Time';
                let contentHtml = '';
                if (cat === 'driver') {
                    const td = getSelectedReportDrivers();
                    if (!td.length) {
                        showToast('Please select at least one driver');
                        return;
                    }
                    contentHtml = buildDriverReportHtml(td, selectedTypes, dateFrom, dateTo);
                } else if (cat === 'truck') {
                    const tt = getSelectedReportTrucks();
                    if (!tt.length) {
                        showToast('Please select at least one truck');
                        return;
                    }
                    contentHtml = buildTruckReportHtml(tt, selectedTypes, dateFrom, dateTo);
                } else if (cat === 'fleet') {
                    contentHtml = buildFleetReportHtml(selectedTypes, dateFrom, dateTo);
                } else if (cat === 'jobcard') {
                    const selectedTrucks = getSelectedReportTrucks();
                    if (!selectedTrucks.length) {
                        showToast('Please select at least one truck');
                        return;
                    }
                    contentHtml = buildJobCardReportHtml(selectedTypes, dateFrom, dateTo, selectedTrucks);
                }
                const preview = document.getElementById('rptPreview');
                preview.innerHTML = `
                    <div class="rpt-preview-header">
                        <div>
                            <div style="font-family:var(--font-display);font-size:16px;font-weight:700;color:var(--text)">📄 Report Preview</div>
                            <div style="font-size:11px;color:var(--text3);margin-top:2px">Generated: ${genDate}${dateFrom && dateTo ? ' · Period: ' + periodDisplay : ''}</div>
                        </div>
                        <div style="display:flex;gap:8px">
                            <button class="btn btn-primary btn-sm" onclick="App.printReport()">🖨 Print / PDF</button>
                            <button class="btn btn-primary btn-sm" onclick="App.downloadReport()">📥 Download PDF</button>
                            <button class="btn btn-ghost btn-sm" onclick="document.getElementById('rptPreview').style.display='none'">✕ Close</button>
                        </div>
                    </div>
                    <div id="rptPrintArea" class="rpt-print-area">${contentHtml}</div>
                `;
                preview.style.display = '';
                setTimeout(() => preview.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                showToast('Report generated ✓');
            }

            function downloadReport() {
                const area = document.getElementById('rptPrintArea');
                if (!area) return;
                
                // Load html2pdf library if not already loaded
                if (!window.html2pdf) {
                    showToast('Loading PDF library...');
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    script.onload = () => executePdfDownload(area);
                    document.head.appendChild(script);
                } else {
                    executePdfDownload(area);
                }
            }

            function executePdfDownload(area) {
                const logoHtml = reportLogo ? `<div style="text-align:center;margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #d32f2f;border-top:4px solid #d32f2f;height:90px;display:flex;align-items:center;justify-content:center"><img src="${getDriveEmbedUrl(reportLogo)}" style="max-height:75px;max-width:320px;object-fit:contain"></div>` : '';
                const htmlContent = `
                    <div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#111;padding:0;margin:0">
                        ${logoHtml}
                        <h1 style="font-size:18px;border-bottom:2px solid #3d7fff;padding-bottom:6px;margin:0 0 14px 0;color:#1a1e28">3 RAG company LTD — Fleet Report</h1>
                        ${area.innerHTML}
                        <div style="margin-top:24px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#888;text-align:center">Generated on ${new Date().toLocaleString()} — Confidential</div>
                    </div>
                `;
                
                const options = {
                    margin: [6, 8, 8, 8],
                    filename: `RAG-Fleet-Report-${new Date().toISOString().slice(0,10)}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false },
                    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                };
                
                html2pdf().set(options).from(htmlContent).save();
                showToast('PDF downloaded ✓');
            }

            function printReport() {
                const area = document.getElementById('rptPrintArea');
                if (!area) return;
                const w = window.open('', '_blank');
                const logoHtml = reportLogo ? `<div style="text-align:center;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #d32f2f;border-top:6px solid #d32f2f;height:120px;display:flex;align-items:center;justify-content:center"><img src="${getDriveEmbedUrl(reportLogo)}" style="max-height:100px;max-width:350px;object-fit:contain"></div>` : '';
                w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fleet Report — 3 RAG company LTD</title>
                <style>
                    body{font-family:'Segoe UI',sans-serif;color:#111;background:#fff;padding:24px;font-size:13px;margin:0}
                    h1{font-size:20px;border-bottom:2px solid #3d7fff;padding-bottom:8px;margin:20px 0;color:#1a1e28}
                    .rpt-section{border:1px solid #ddd;border-radius:8px;margin-bottom:18px;overflow:hidden;page-break-inside:avoid}
                    .rpt-section-title{font-size:15px;font-weight:700;padding:12px 16px;background:#f0f4ff;border-bottom:1px solid #ddd;color:#1a1e28}
                    .rpt-id{font-size:11px;color:#888;font-weight:400;margin-left:8px}
                    .rpt-block{padding:12px 16px;border-bottom:1px solid #eee}
                    .rpt-block:last-child{border-bottom:none}
                    .rpt-block-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#3d7fff;margin-bottom:8px}
                    .rpt-info-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}
                    .rpt-info-cell{background:#f9f9f9;border-radius:6px;padding:7px 10px}
                    .rpt-il{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:1px}
                    .rpt-iv{font-size:13px;font-weight:500;color:#111}
                    .rpt-table{width:100%;border-collapse:collapse;margin-top:4px;font-size:12px}
                    .rpt-table th{background:#3d7fff;color:#fff;padding:6px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase}
                    .rpt-table td{padding:6px 10px;border-bottom:1px solid #eee}
                    .rpt-table tr:nth-child(even) td{background:#f9f9f9}
                    .rpt-chip{display:inline-block;padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700}
                    .rpt-chip-high,.rpt-chip-expired{background:#fee;color:#c00}
                    .rpt-chip-medium,.rpt-chip-expiring,.rpt-chip-warning{background:#fff3cd;color:#856404}
                    .rpt-chip-low,.rpt-chip-valid,.rpt-chip-good{background:#efe;color:#060}
                    .rpt-chip-critical{background:#fee;color:#c00}
                    .rpt-empty{text-align:center;padding:16px;color:#888;font-size:12px}
                    @media print{body{padding:16px;margin:0}}
                </style></head><body>
                ${logoHtml}
                <h1>3 RAG company LTD — Fleet Report</h1>
                ${area.innerHTML}
                </body></html>`);
                w.document.close();
                setTimeout(() => w.print(), 400);
            }

            function _filterByDate(items, dateFrom, dateTo) {
                if (!dateFrom && !dateTo) return items;
                return items.filter(item => {
                    const d = item.date || item.expiryDate || '';
                    if (!d) return true;
                    if (dateFrom && d < dateFrom) return false;
                    if (dateTo   && d > dateTo)   return false;
                    return true;
                });
            }

            function buildDriverReportHtml(targetDrivers, types, dateFrom, dateTo) {
                if (!targetDrivers.length) return '<div class="rpt-empty">No drivers found.</div>';
                let html = '';
                targetDrivers.forEach(drv => {
                    html += `<div class="rpt-section"><div class="rpt-section-title">👤 ${drv.name} <span class="rpt-id">#${drv.id}</span></div>`;

                    if (types.includes('profile')) {
                        html += `<div class="rpt-block"><div class="rpt-block-title">Full Profile</div>
                        <div class="rpt-info-grid">
                            <div class="rpt-info-cell"><div class="rpt-il">ID</div><div class="rpt-iv">${drv.id||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Status</div><div class="rpt-iv">${drv.status||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Phone</div><div class="rpt-iv">${drv.phone||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">License No.</div><div class="rpt-iv">${drv.license||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">License Expiry</div><div class="rpt-iv">${drv.licenseExpiry||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Passport No.</div><div class="rpt-iv">${drv.passport||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Passport Expiry</div><div class="rpt-iv">${drv.passportExpiry||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Hire Date</div><div class="rpt-iv">${drv.hire_date||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Blood Group</div><div class="rpt-iv">${drv.bloodGroup||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">License Plate</div><div class="rpt-iv">${drv.license_plate||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Health Status</div><div class="rpt-iv">${drv.healthStatus||'—'}</div></div>
                        </div></div>`;
                    }

                    if (types.includes('violations')) {
                        const vlist = _filterByDate(drv.violations||[], dateFrom, dateTo);
                        const rl = riskLevel(drv.violations||[]);
                        const rlColor = rl==='high'?'var(--red)':rl==='medium'?'var(--amber)':'var(--green)';
                        html += `<div class="rpt-block"><div class="rpt-block-title">Violations Summary <span style="color:${rlColor};margin-left:6px">Risk: ${rl.toUpperCase()}</span></div>
                        ${vlist.length ? `<table class="rpt-table"><thead><tr><th>Date</th><th>Type</th><th>Severity</th><th>Description &amp; Action</th></tr></thead><tbody>
                        ${vlist.map(v=>`<tr><td>${v.date||'-'}</td><td>${v.type||'-'}</td><td><span class="rpt-chip rpt-chip-${v.severity||'low'}">${(v.severity||'').toUpperCase()}</span></td><td>${v.description||'-'}${v.actionTaken ? `<br><small style="color:var(--text3)"><b>Action:</b> ${v.actionTaken}</small>` : ''}</td></tr>`).join('')}
                        </tbody></table>` : '<div class="rpt-empty">No violations in selected period</div>'}</div>`;
                    }

                    if (types.includes('documents')) {
                        html += `<div class="rpt-block"><div class="rpt-block-title">Document Status</div>
                        <table class="rpt-table"><thead><tr><th>Document</th><th>Number</th><th>Expiry Date</th><th>Status</th></tr></thead><tbody>
                        <tr><td>Driving License</td><td>${drv.license||'-'}</td><td>${drv.licenseExpiry||'-'}</td><td>${drv.licenseExpiry?`<span class="rpt-chip rpt-chip-${docStatus({expiryDate:drv.licenseExpiry})}">${docStatus({expiryDate:drv.licenseExpiry}).toUpperCase()}</span>`:'-'}</td></tr>
                        <tr><td>Passport</td><td>${drv.passport||'-'}</td><td>${drv.passportExpiry||'-'}</td><td>${drv.passportExpiry?`<span class="rpt-chip rpt-chip-${docStatus({expiryDate:drv.passportExpiry})}">${docStatus({expiryDate:drv.passportExpiry}).toUpperCase()}</span>`:'-'}</td></tr>
                        </tbody></table></div>`;
                    }

                    if (types.includes('risk')) {
                        const sc = riskScore(drv.violations); const rl = riskLevel(drv.violations); const pct = riskPct(drv.violations);
                        const hi = (drv.violations||[]).filter(v=>v.severity==='high').length;
                        const md = (drv.violations||[]).filter(v=>v.severity==='medium').length;
                        const lo = (drv.violations||[]).filter(v=>v.severity==='low').length;
                        const rlc = rl==='high'?'var(--red)':rl==='medium'?'var(--amber)':'var(--green)';
                        html += `<div class="rpt-block"><div class="rpt-block-title">Risk Assessment</div>
                        <div class="rpt-info-grid">
                            <div class="rpt-info-cell"><div class="rpt-il">Risk Level</div><div class="rpt-iv" style="color:${rlc}">${rl.toUpperCase()}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Risk Score</div><div class="rpt-iv">${sc}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Risk %</div><div class="rpt-iv">${pct}%</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Total Violations</div><div class="rpt-iv">${(drv.violations||[]).length}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">High Severity</div><div class="rpt-iv" style="color:var(--red)">${hi}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Medium Severity</div><div class="rpt-iv" style="color:var(--amber)">${md}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Low Severity</div><div class="rpt-iv" style="color:var(--green)">${lo}</div></div>
                        </div></div>`;
                    }

                    if (types.includes('trips')) {
                        const tl = _filterByDate(drv.tripsList||[], dateFrom, dateTo);
                        html += `<div class="rpt-block"><div class="rpt-block-title">Trip History</div>
                        ${tl.length ? `<table class="rpt-table"><thead><tr><th>Trip Date</th><th>Completed Date</th></tr></thead><tbody>
                        ${tl.map(t=>`<tr><td>${t.date||'—'}</td><td>${t.completed||'—'}</td></tr>`).join('')}
                        </tbody></table>` : '<div class="rpt-empty">No trips in selected period</div>'}</div>`;
                    }

                    if (types.includes('warnings')) {
                        const wl = _filterByDate(drv.warningsList||[], dateFrom, dateTo);
                        html += `<div class="rpt-block"><div class="rpt-block-title">Warnings Issued</div>
                        ${wl.length ? `<table class="rpt-table"><thead><tr><th>Date</th><th>Reason</th></tr></thead><tbody>
                        ${wl.map(w=>`<tr><td>${w.date||'—'}</td><td>${w.reason||'—'}</td></tr>`).join('')}
                        </tbody></table>` : '<div class="rpt-empty">No warnings in selected period</div>'}</div>`;
                    }

                    if (types.includes('suspensions')) {
                        const sl = _filterByDate(drv.suspensionsList||[], dateFrom, dateTo);
                        html += `<div class="rpt-block"><div class="rpt-block-title">Suspension History</div>
                        ${sl.length ? `<table class="rpt-table"><thead><tr><th>Date</th><th>Reason</th></tr></thead><tbody>
                        ${sl.map(s=>`<tr><td>${s.date||'—'}</td><td>${s.reason||'—'}</td></tr>`).join('')}
                        </tbody></table>` : '<div class="rpt-empty">No suspensions in selected period</div>'}</div>`;
                    }

                    if (types.includes('accidents')) {
                        const al = _filterByDate(drv.accidentsList||[], dateFrom, dateTo);
                        const ll = _filterByDate(drv.lossesList||[], dateFrom, dateTo);
                        html += `<div class="rpt-block"><div class="rpt-block-title">Accidents &amp; Losses</div>
                        ${al.length ? `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;font-weight:600">ACCIDENTS</div>
                        <table class="rpt-table"><thead><tr><th>Date</th><th>Accident Description</th></tr></thead><tbody>
                        ${al.map(a=>`<tr><td>${a.date||'—'}</td><td>${a.description||'—'}</td></tr>`).join('')}
                        </tbody></table>` : '<div class="rpt-empty">No accidents in selected period</div>'}
                        ${ll.length ? `<div style="font-size:11px;color:var(--text3);margin:10px 0 6px;font-weight:600">LOSSES</div>
                        <table class="rpt-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Description</th></tr></thead><tbody>
                        ${ll.map(l=>`<tr><td>${l.date||'—'}</td><td>${l.type||'—'}</td><td>${l.amount||0} L</td><td>${l.description||'—'}</td></tr>`).join('')}
                        </tbody></table>` : ''}</div>`;
                    }

                    if (types.includes('training')) {
                        const trs = _filterByDate(drv.trainingsList||drv.trainings||[], dateFrom, dateTo);
                        html += `<div class="rpt-block"><div class="rpt-block-title">Training &amp; Certifications</div>
                        ${trs.length ? `<table class="rpt-table"><thead><tr><th>Date</th><th>Course</th><th>Validity (mo)</th><th>Next Due</th><th>Status</th></tr></thead><tbody>
                        ${trs.map(tr=>{ const ts=trainingStatus(tr); return `<tr><td>${tr.date||'—'}</td><td>${tr.course||tr.name||'—'}</td><td>${tr.validityMonths||'—'}</td><td>${ts.nextDue||'—'}</td><td><span class="rpt-chip rpt-chip-${ts.valid?'valid':'expired'}">${ts.valid?'VALID':'EXPIRED'}</span></td></tr>`; }).join('')}
                        </tbody></table>` : '<div class="rpt-empty">No training records found</div>'}</div>`;
                    }

                    html += '</div>';
                });
                return html;
            }

            function buildTruckReportHtml(targetTrucks, types, dateFrom, dateTo) {
                if (!targetTrucks.length) return '<div class="rpt-empty">No trucks found.</div>';
                let html = '';
                targetTrucks.forEach(trk => {
                    const hs = healthScore(trk); const hl = healthLabel(hs);
                    const hlColor = hl==='good'?'var(--green)':hl==='warning'?'var(--amber)':'var(--red)';
                    html += `<div class="rpt-section"><div class="rpt-section-title">🚛 ${formatTruckLabel(trk)}</div>`;

                    if (types.includes('truck-profile')) {
                        html += `<div class="rpt-block"><div class="rpt-block-title">Truck Profile</div>
                        <div class="rpt-info-grid">
                            <div class="rpt-info-cell"><div class="rpt-il">Plate</div><div class="rpt-iv">${trk.plate||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Model</div><div class="rpt-iv">${trk.model||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">VIN</div><div class="rpt-iv">${trk.vin||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Trailer</div><div class="rpt-iv">${trk.trailer||'—'}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Health Score</div><div class="rpt-iv">${hs}%</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Health Status</div><div class="rpt-iv" style="color:${hlColor}">${hl.toUpperCase()}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Documents</div><div class="rpt-iv">${(trk.documents||[]).length}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Open Issues</div><div class="rpt-iv">${(trk.issues||[]).length}</div></div>
                        </div></div>`;
                    }

                    if (types.includes('truck-documents')) {
                        const docs = trk.documents||[];
                        html += `<div class="rpt-block"><div class="rpt-block-title">Document Status</div>
                        ${docs.length ? `<table class="rpt-table"><thead><tr><th>Document Type</th><th>Issued Date</th><th>Expiry Date</th><th>Status</th></tr></thead><tbody>
                        ${docs.map(d=>{ const st=docStatus(d); return `<tr><td>${d.type||'—'}</td><td>${d.issuedDate||'—'}</td><td>${d.expiryDate||'—'}</td><td><span class="rpt-chip rpt-chip-${st}">${st.toUpperCase()}</span></td></tr>`; }).join('')}
                        </tbody></table>` : '<div class="rpt-empty">No documents on file for this truck</div>'}</div>`;
                    }

                    if (types.includes('truck-health')) {
                        const issues = trk.issues||[];
                        html += `<div class="rpt-block"><div class="rpt-block-title">Health &amp; Issues</div>
                        <div class="rpt-info-grid" style="margin-bottom:12px">
                            <div class="rpt-info-cell"><div class="rpt-il">Health Score</div><div class="rpt-iv">${hs}%</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Status</div><div class="rpt-iv" style="color:${hlColor}">${hl.toUpperCase()}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Open Issues</div><div class="rpt-iv">${issues.length}</div></div>
                        </div>
                        ${issues.length ? `<table class="rpt-table"><thead><tr><th>Issue Description</th><th>Severity</th><th>Notes</th></tr></thead><tbody>
                        ${issues.map(i=>`<tr><td>${i.description||i.issue||'—'}</td><td><span class="rpt-chip rpt-chip-${i.severity||'low'}">${(i.severity||'').toUpperCase()}</span></td><td>${i.notes||'—'}</td></tr>`).join('')}
                        </tbody></table>` : '<div class="rpt-empty">✅ No open issues — truck in good health</div>'}</div>`;
                    }

                    if (types.includes('truck-maintenance')) {
                        const expDocs = (trk.documents||[]).filter(d=>docStatus(d)==='expired').length;
                        const expgDocs = (trk.documents||[]).filter(d=>docStatus(d)==='expiring').length;
                        const valDocs  = (trk.documents||[]).filter(d=>docStatus(d)==='valid').length;
                        html += `<div class="rpt-block"><div class="rpt-block-title">Maintenance Overview</div>
                        <div class="rpt-info-grid">
                            <div class="rpt-info-cell"><div class="rpt-il">Total Docs</div><div class="rpt-iv">${(trk.documents||[]).length}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Expired</div><div class="rpt-iv" style="color:var(--red)">${expDocs}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Expiring Soon</div><div class="rpt-iv" style="color:var(--amber)">${expgDocs}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Valid</div><div class="rpt-iv" style="color:var(--green)">${valDocs}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Open Issues</div><div class="rpt-iv">${(trk.issues||[]).length}</div></div>
                            <div class="rpt-info-cell"><div class="rpt-il">Health Score</div><div class="rpt-iv">${hs}%</div></div>
                        </div></div>`;
                    }

                    html += '</div>';
                });
                return html;
            }

            function buildFleetReportHtml(types, dateFrom, dateTo) {
                let html = '';

                if (types.includes('fleet-summary')) {
                    const tv = drivers.reduce((s,d)=>s+d.violations.length,0);
                    const hR = drivers.filter(d=>riskLevel(d.violations)==='high').length;
                    const mR = drivers.filter(d=>riskLevel(d.violations)==='medium').length;
                    const lR = drivers.filter(d=>riskLevel(d.violations)==='low').length;
                    const xD = trucks.reduce((s,t)=>s+t.documents.filter(d=>docStatus(d)==='expired').length,0);
                    const nD = trucks.reduce((s,t)=>s+t.documents.filter(d=>docStatus(d)==='expiring').length,0);
                    const cT = trucks.filter(t=>healthLabel(healthScore(t))==='critical').length;
                    const wT = trucks.filter(t=>healthLabel(healthScore(t))==='warning').length;
                    const gT = trucks.filter(t=>healthLabel(healthScore(t))==='good').length;
                    html += `<div class="rpt-section"><div class="rpt-section-title">📊 Fleet Summary Report</div>
                    <div class="rpt-block"><div class="rpt-block-title">Fleet Overview</div>
                    <div class="rpt-info-grid">
                        <div class="rpt-info-cell"><div class="rpt-il">Total Drivers</div><div class="rpt-iv">${drivers.length}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Total Trucks</div><div class="rpt-iv">${trucks.length}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Total Violations</div><div class="rpt-iv">${tv}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">High Risk Drivers</div><div class="rpt-iv" style="color:var(--red)">${hR}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Medium Risk</div><div class="rpt-iv" style="color:var(--amber)">${mR}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Low Risk</div><div class="rpt-iv" style="color:var(--green)">${lR}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Expired Docs</div><div class="rpt-iv" style="color:var(--red)">${xD}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Expiring Soon</div><div class="rpt-iv" style="color:var(--amber)">${nD}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Critical Trucks</div><div class="rpt-iv" style="color:var(--red)">${cT}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Warning Trucks</div><div class="rpt-iv" style="color:var(--amber)">${wT}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Good Trucks</div><div class="rpt-iv" style="color:var(--green)">${gT}</div></div>
                    </div></div></div>`;
                }

                if (types.includes('fleet-expired')) {
                    let rows = '';
                    trucks.forEach(t=>{ t.documents.filter(d=>['expired','expiring'].includes(docStatus(d))).forEach(d=>{ const st=docStatus(d); rows+=`<tr><td>Truck</td><td>${formatTruckLabel(t)}</td><td>${d.type}</td><td>${d.expiryDate}</td><td><span class="rpt-chip rpt-chip-${st}">${st.toUpperCase()}</span></td></tr>`; }); });
                    drivers.forEach(drv=>{ [{type:'Driving License',expiry:drv.licenseExpiry},{type:'Passport',expiry:drv.passportExpiry}].forEach(doc=>{ if(!doc.expiry)return; const st=docStatus({expiryDate:doc.expiry}); if(['expired','expiring'].includes(st)) rows+=`<tr><td>Driver</td><td>${drv.name}</td><td>${doc.type}</td><td>${doc.expiry}</td><td><span class="rpt-chip rpt-chip-${st}">${st.toUpperCase()}</span></td></tr>`; }); });
                    html += `<div class="rpt-section"><div class="rpt-section-title">🔴 Expired / Expiring Documents</div>
                    <div class="rpt-block">${rows ? `<table class="rpt-table"><thead><tr><th>Category</th><th>Subject</th><th>Document</th><th>Expiry</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="rpt-empty">✅ All documents are valid — nothing expired or expiring</div>'}</div></div>`;
                }

                if (types.includes('fleet-highrisk')) {
                    const hr = drivers.filter(d=>riskLevel(d.violations)==='high');
                    html += `<div class="rpt-section"><div class="rpt-section-title">🚨 High Risk Drivers</div>
                    <div class="rpt-block">${hr.length ? `<table class="rpt-table"><thead><tr><th>Driver</th><th>ID</th><th>Status</th><th>Violations</th><th>Risk Score</th><th>High Severity</th></tr></thead><tbody>
                    ${hr.map(d=>`<tr><td>${d.name}</td><td>${d.id}</td><td>${d.status||'—'}</td><td>${d.violations.length}</td><td>${riskScore(d.violations)}</td><td>${d.violations.filter(v=>v.severity==='high').length}</td></tr>`).join('')}
                    </tbody></table>` : '<div class="rpt-empty">✅ No high-risk drivers at this time</div>'}</div></div>`;
                }

                if (types.includes('fleet-compliance')) {
                    const tdD = drivers.reduce((s,d)=>s+(d.licenseExpiry?1:0)+(d.passportExpiry?1:0),0);
                    const xdD = drivers.reduce((s,d)=>s+(d.licenseExpiry&&docStatus({expiryDate:d.licenseExpiry})==='expired'?1:0)+(d.passportExpiry&&docStatus({expiryDate:d.passportExpiry})==='expired'?1:0),0);
                    const tdT = trucks.reduce((s,t)=>s+t.documents.length,0);
                    const xdT = trucks.reduce((s,t)=>s+t.documents.filter(d=>docStatus(d)==='expired').length,0);
                    const total = tdD+tdT; const expired = xdD+xdT;
                    const rate = total>0 ? Math.round(((total-expired)/total)*100) : 100;
                    const rateColor = rate>=80?'var(--green)':rate>=60?'var(--amber)':'var(--red)';
                    html += `<div class="rpt-section"><div class="rpt-section-title">✅ Compliance Overview</div>
                    <div class="rpt-block"><div class="rpt-block-title">Overall Compliance Rate: <span style="color:${rateColor};font-size:18px">${rate}%</span></div>
                    <div class="rpt-info-grid">
                        <div class="rpt-info-cell"><div class="rpt-il">Driver Docs Total</div><div class="rpt-iv">${tdD}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Driver Docs Expired</div><div class="rpt-iv" style="color:var(--red)">${xdD}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Truck Docs Total</div><div class="rpt-iv">${tdT}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Truck Docs Expired</div><div class="rpt-iv" style="color:var(--red)">${xdT}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">High Risk Drivers</div><div class="rpt-iv" style="color:var(--red)">${drivers.filter(d=>riskLevel(d.violations)==='high').length}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Critical Trucks</div><div class="rpt-iv" style="color:var(--red)">${trucks.filter(t=>healthLabel(healthScore(t))==='critical').length}</div></div>
                    </div></div></div>`;
                }

                if (types.includes('fleet-violations')) {
                    let allV = [];
                    drivers.forEach(d=>{ (d.violations||[]).forEach(v=>{ const vd=v.date||''; if(dateFrom&&vd&&vd<dateFrom)return; if(dateTo&&vd&&vd>dateTo)return; allV.push({driver:d.name,id:d.id,...v}); }); });
                    allV.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
                    html += `<div class="rpt-section"><div class="rpt-section-title">📈 Fleet Violation Report</div>
                    <div class="rpt-block">${allV.length ? `<table class="rpt-table"><thead><tr><th>Date</th><th>Driver</th><th>ID</th><th>Type</th><th>Severity</th><th>Notes</th></tr></thead><tbody>
                    ${allV.map(v=>`<tr><td>${v.date||'—'}</td><td>${v.driver}</td><td>${v.id}</td><td>${v.type||'—'}</td><td><span class="rpt-chip rpt-chip-${v.severity||'low'}">${(v.severity||'').toUpperCase()}</span></td><td>${v.notes||'—'}</td></tr>`).join('')}
                    </tbody></table>` : '<div class="rpt-empty">No violations in selected period</div>'}</div></div>`;
                }

                return html || '<div class="rpt-empty" style="padding:40px;text-align:center;font-size:14px">Select report types above and click Generate</div>';
            }

            function _filterJobCardsByDate(items, dateFrom, dateTo) {
                if (!dateFrom && !dateTo) return items;
                return items.filter(item => {
                    const d = (item.approvedAt || item.releasedAt || item.date || '').slice(0, 10);
                    if (!d) return false;
                    if (dateFrom && d < dateFrom) return false;
                    if (dateTo && d > dateTo) return false;
                    return true;
                });
            }

            function buildJobCardReportHtml(types, dateFrom, dateTo, selectedTrucks) {
                const plates = selectedTrucks.map(t => t.plate).filter(Boolean);
                const filtered = getReportJobCards(dateFrom, dateTo, plates);
                const expenseMin = parseInt(document.getElementById('rptJcMinExpense')?.value || '500000', 10) || 0;
                const multiMinCost = parseInt(document.getElementById('rptJcMinJobCost')?.value || '300000', 10) || 0;
                const serviceFilter = document.getElementById('rptJcServiceFilter')?.value || '';
                const periodLabel = dateFrom && dateTo ? `${dateFrom} → ${dateTo}` : 'All time';
                const needsJcData = types.some(t => ['jobcard-summary', 'jobcard-request-final', 'jobcard-cost-breakdown', 'jobcard-high-expense', 'jobcard-multi-service', 'jobcard-service-by-period', 'jobcard-next-scheduled'].includes(t));
                if (needsJcData && !filtered.length && !types.includes('jobcard-recent-upcoming')) {
                    return '<div class="rpt-empty">No approved/released job cards in the selected period for the chosen trucks. Try widening the date range or selecting more trucks.</div>';
                }
                let html = `<div class="rpt-block" style="background:rgba(61,127,255,0.06);border-bottom:1px solid var(--border)"><div class="rpt-info-grid"><div class="rpt-info-cell"><div class="rpt-il">Period</div><div class="rpt-iv">${periodLabel}</div></div><div class="rpt-info-cell"><div class="rpt-il">Trucks</div><div class="rpt-iv">${plates.length}</div></div><div class="rpt-info-cell"><div class="rpt-il">Job Cards</div><div class="rpt-iv">${filtered.length}</div></div></div></div>`;

                if (types.includes('jobcard-summary')) {
                    const rows = filtered.map(jc => {
                        const t = jcTotals(jc);
                        const svcCount = getJcCompletedServices(jc).length;
                        const svcList = getJcCompletedServices(jc).map(s => xmlEscape(s.name)).join(', ') || '—';
                        return `<tr><td>${jc.id}</td><td>${formatTruckLabelFromPlate(jc.plate || '')}</td><td>${xmlEscape(jc.driver || '')}</td><td>${jcApprovalTimestamp(jc).slice(0, 10)}</td><td>${svcCount}</td><td style="max-width:200px;font-size:11px">${svcList}</td><td>${formatRwf(t.actC)}</td><td>${jc.status || '—'}</td></tr>`;
                    }).join('');
                    const totalCost = filtered.reduce((s, jc) => s + jcTotals(jc).actC, 0);
                    html += `<div class="rpt-section"><div class="rpt-section-title">🧾 Job Card Summary</div><div class="rpt-block">
                    <div class="rpt-info-grid" style="margin-bottom:12px"><div class="rpt-info-cell"><div class="rpt-il">Cards</div><div class="rpt-iv">${filtered.length}</div></div><div class="rpt-info-cell"><div class="rpt-il">Fleet spend</div><div class="rpt-iv">${formatRwf(totalCost)}</div></div></div>
                    ${rows ? `<table class="rpt-table"><thead><tr><th>ID</th><th>Truck</th><th>Driver</th><th>Date</th><th># Svc</th><th>Services</th><th>Cost</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="rpt-empty">No job cards in period</div>'}
                    </div></div>`;
                }

                if (types.includes('jobcard-request-final')) {
                    html += `<div class="rpt-section"><div class="rpt-section-title">🔁 Requested vs Final Work</div>`;
                    if (!filtered.length) {
                        html += '<div class="rpt-block"><div class="rpt-empty">No job cards in period</div></div>';
                    } else {
                        filtered.forEach(jc => {
                            const requested = (jc.driverLines || []).map(dl => `<li>${xmlEscape(dl.name)}</li>`).join('') || '<li>None</li>';
                            const finalWork = (jc.mechanicLines || []).filter(m => m.done).map(m => {
                                const dl = (jc.driverLines || []).find(d => d.lineId === m.driverLineId);
                                const name = xmlEscape(m.name || dl?.name || 'Extra work');
                                return `<li>${name} — ${formatRwf(m.actualCost || 0)}</li>`;
                            }).join('') || '<li>No completed work</li>';
                            html += `<div class="rpt-block"><div style="font-weight:700;margin-bottom:8px">${jc.id} · ${formatTruckLabelFromPlate(jc.plate || '')} · ${jcApprovalTimestamp(jc).slice(0, 10)}</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><div class="rpt-block-title" style="margin-bottom:6px">Requested Services</div><ul style="margin:0;padding-left:18px">${requested}</ul></div><div><div class="rpt-block-title" style="margin-bottom:6px">Final Completed Work</div><ul style="margin:0;padding-left:18px">${finalWork}</ul></div></div></div>`;
                        });
                    }
                    html += `</div>`;
                }

                if (types.includes('jobcard-cost-breakdown')) {
                    const byTruck = {};
                    plates.forEach(p => { byTruck[p] = { repair: 0, routine: 0, cards: 0 }; });
                    filtered.forEach(jc => {
                        const plate = jc.plate || 'Unknown';
                        if (!byTruck[plate]) byTruck[plate] = { repair: 0, routine: 0, cards: 0 };
                        byTruck[plate].cards++;
                        getJcCompletedServices(jc).forEach(s => {
                            if (s.unplanned || isRepairLikeService(s.name)) byTruck[plate].repair += s.cost;
                            else byTruck[plate].routine += s.cost;
                        });
                    });
                    const rows = Object.entries(byTruck)
                        .filter(([, v]) => v.repair + v.routine > 0 || v.cards > 0)
                        .sort((a, b) => (b[1].repair + b[1].routine) - (a[1].repair + a[1].routine))
                        .map(([plate, v]) => `<tr><td>${formatTruckLabelFromPlate(plate)}</td><td>${v.cards}</td><td>${formatRwf(v.repair)}</td><td>${formatRwf(v.routine)}</td><td><strong>${formatRwf(v.repair + v.routine)}</strong></td></tr>`).join('');
                    const totals = filtered.reduce((sum, jc) => sum + jcTotals(jc).actC, 0);
                    html += `<div class="rpt-section"><div class="rpt-section-title">💰 Cost Breakdown by Truck</div><div class="rpt-block">
                    <div class="rpt-info-grid" style="margin-bottom:12px"><div class="rpt-info-cell"><div class="rpt-il">Total spend</div><div class="rpt-iv">${formatRwf(totals)}</div></div></div>
                    <p class="rpt-jc-hint" style="margin-bottom:10px">Repair = unplanned work or repair-type services. Routine = scheduled maintenance from the service catalog.</p>
                    ${rows ? `<table class="rpt-table"><thead><tr><th>Truck</th><th>Job cards</th><th>Repair cost</th><th>Routine cost</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="rpt-empty">No costs recorded in period</div>'}
                    </div></div>`;
                }

                if (types.includes('jobcard-high-expense')) {
                    const ranked = plates.map(plate => ({ plate, ...aggregateTruckSpend(plate, filtered) }))
                        .filter(r => r.combined >= expenseMin || r.repairCost >= expenseMin * 0.5)
                        .sort((a, b) => b.combined - a.combined);
                    const rows = ranked.map(r => `<tr>
                        <td><strong>${formatTruckLabelFromPlate(r.plate)}</strong></td>
                        <td>${r.jobCardCount}</td>
                        <td style="color:var(--red)">${formatRwf(r.repairCost)}</td>
                        <td>${formatRwf(r.routineCost)}</td>
                        <td>${r.repayment > 0 ? formatRwf(r.repayment) : '—'}</td>
                        <td><strong>${formatRwf(r.combined)}</strong></td>
                    </tr>`).join('');
                    html += `<div class="rpt-section"><div class="rpt-section-title">📉 High-Expense Trucks</div><div class="rpt-block">
                    <p class="rpt-jc-hint" style="margin-bottom:10px">Trucks at or above ${formatRwf(expenseMin)} combined (repair + routine job card spend + monthly repayment from truck custom fields). Sorted highest first.</p>
                    ${rows ? `<table class="rpt-table"><thead><tr><th>Truck</th><th>Job cards</th><th>Repair spend</th><th>Routine spend</th><th>Monthly repayment</th><th>Combined</th></tr></thead><tbody>${rows}</tbody></table>` : `<div class="rpt-empty">No trucks exceeded ${formatRwf(expenseMin)} in this period. Lower the threshold in Report Options or widen the date range.</div>`}
                    </div></div>`;
                }

                if (types.includes('jobcard-multi-service')) {
                    const flagged = filtered.map(jc => {
                        const services = getJcCompletedServices(jc);
                        const cost = jcTotals(jc).actC;
                        return { jc, services, cost, multi: services.length >= 2, expensive: cost >= multiMinCost };
                    }).filter(x => x.multi || x.expensive);
                    const byPlate = {};
                    flagged.forEach(({ jc, services, cost }) => {
                        const plate = jc.plate || 'Unknown';
                        if (!byPlate[plate]) byPlate[plate] = [];
                        byPlate[plate].push({ jc, services, cost });
                    });
                    html += `<div class="rpt-section"><div class="rpt-section-title">🔧 Multi-Service &amp; High-Cost Job Cards</div>`;
                    const plateKeys = Object.keys(byPlate).sort();
                    if (!plateKeys.length) {
                        html += `<div class="rpt-block"><div class="rpt-empty">No job cards with 2+ services or cost ≥ ${formatRwf(multiMinCost)} in this period.</div></div>`;
                    } else {
                        plateKeys.forEach(plate => {
                            html += `<div class="rpt-block"><div class="rpt-block-title">🚛 ${formatTruckLabelFromPlate(plate)}</div>`;
                            byPlate[plate].forEach(({ jc, services, cost }) => {
                                const svcRows = services.map(s =>
                                    `<tr><td>${xmlEscape(s.name)}</td><td>${s.date}</td><td>${formatRwf(s.cost)}</td><td>${s.unplanned ? 'Unplanned' : 'Planned'}</td></tr>`
                                ).join('');
                                html += `<div style="margin-bottom:14px;padding:10px;background:var(--bg4);border-radius:8px">
                                    <div style="font-weight:600;margin-bottom:6px">${jc.id} · ${jcApprovalTimestamp(jc).slice(0, 10)} · ${formatRwf(cost)} · ${services.length} service(s)</div>
                                    <table class="rpt-table"><thead><tr><th>Service</th><th>Date</th><th>Cost</th><th>Type</th></tr></thead><tbody>${svcRows}</tbody></table>
                                </div>`;
                            });
                            html += `</div>`;
                        });
                    }
                    html += `</div>`;
                }

                if (types.includes('jobcard-recent-upcoming')) {
                    html += `<div class="rpt-section"><div class="rpt-section-title">📅 Recent &amp; Upcoming Services</div>`;
                    plates.forEach(plate => {
                        const recent = getTruckRecentMaintenance(plate, dateFrom, dateTo, 8);
                        const upcoming = getPredictedServicesForTruck(plate).filter(p => p.level === 'over' || p.level === 'warn').slice(0, 6);
                        const recentRows = recent.length ? recent.map(e =>
                            `<tr><td>${e.date || '—'}</td><td>${xmlEscape(e.service || '—')}</td><td>${e.jobCardId || '—'}</td><td>${e.cost != null ? formatRwf(e.cost) : '—'}</td></tr>`
                        ).join('') : '<tr><td colspan="4" class="rpt-empty">No recent services in period</td></tr>';
                        const upRows = upcoming.length ? upcoming.map(p =>
                            `<tr><td>${xmlEscape(p.service)}</td><td>${p.lastDate || '—'}</td><td>${p.nextDue || '—'}</td><td>${rptLevelChip(p.level)}</td></tr>`
                        ).join('') : '<tr><td colspan="4" class="rpt-empty">No services due soon (all intervals OK)</td></tr>';
                        html += `<div class="rpt-block"><div class="rpt-block-title">🚛 ${formatTruckLabelFromPlate(plate)}</div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                            <div><div style="font-size:10px;font-weight:600;color:var(--accent2);margin-bottom:6px">RECENT (period)</div>
                            <table class="rpt-table"><thead><tr><th>Date</th><th>Service</th><th>Job card</th><th>Cost</th></tr></thead><tbody>${recentRows}</tbody></table></div>
                            <div><div style="font-size:10px;font-weight:600;color:var(--amber);margin-bottom:6px">LIKELY NEEDED SOON</div>
                            <table class="rpt-table"><thead><tr><th>Service</th><th>Last done</th><th>Next due</th><th>Status</th></tr></thead><tbody>${upRows}</tbody></table></div>
                        </div></div>`;
                    });
                    html += `</div>`;
                }

                if (types.includes('jobcard-service-by-period')) {
                    const serviceTrucks = {};
                    const countService = (name, plate) => {
                        const key = name || 'Unknown';
                        if (!serviceTrucks[key]) serviceTrucks[key] = new Set();
                        serviceTrucks[key].add(plate);
                    };
                    filtered.forEach(jc => {
                        getJcCompletedServices(jc).forEach(s => {
                            if (serviceFilter && normalizeServiceKey(s.name) !== normalizeServiceKey(serviceFilter) && s.name !== serviceFilter) return;
                            countService(s.name, jc.plate);
                        });
                    });
                    const entries = Object.entries(serviceTrucks).sort((a, b) => b[1].size - a[1].size);
                    const filterNote = serviceFilter ? `Filtered to: <strong>${xmlEscape(serviceFilter)}</strong>` : 'All services performed in period';
                    const summaryRows = entries.map(([name, set]) =>
                        `<tr><td>${xmlEscape(name)}</td><td><strong>${set.size}</strong></td><td style="font-size:11px">${[...set].map(p => xmlEscape(p)).join(', ')}</td></tr>`
                    ).join('');
                    const totalTrucks = new Set();
                    entries.forEach(([, set]) => set.forEach(p => totalTrucks.add(p)));
                    html += `<div class="rpt-section"><div class="rpt-section-title">📊 Service Frequency — ${periodLabel}</div><div class="rpt-block">
                    <p class="rpt-jc-hint" style="margin-bottom:10px">${filterNote}. Unique trucks that received each service.</p>
                    <div class="rpt-info-grid" style="margin-bottom:12px">
                        <div class="rpt-info-cell"><div class="rpt-il">Service types</div><div class="rpt-iv">${entries.length}</div></div>
                        <div class="rpt-info-cell"><div class="rpt-il">Trucks with any listed service</div><div class="rpt-iv">${totalTrucks.size}</div></div>
                    </div>
                    ${summaryRows ? `<table class="rpt-table"><thead><tr><th>Service</th><th>Truck count</th><th>Trucks</th></tr></thead><tbody>${summaryRows}</tbody></table>` : '<div class="rpt-empty">No matching services in period</div>'}
                    </div></div>`;
                }

                if (types.includes('jobcard-next-scheduled')) {
                    const rows = [];
                    filtered.forEach(jc => {
                        getJcCompletedServices(jc).forEach(s => {
                            const alert = getServiceIntervalAlert(jc.plate, s.name);
                            const cat = getCatalogEntry(s.name);
                            const interval = getServiceDisplayInterval(cat) || (cat?.intervalDays ? `${cat.intervalDays}d` : '—');
                            rows.push({
                                plate: jc.plate,
                                jobCardId: jc.id,
                                service: s.name,
                                completed: s.date,
                                nextDue: alert.nextDue || '—',
                                level: alert.level,
                                interval
                            });
                        });
                    });
                    rows.sort((a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999'));
                    const tableRows = rows.map(r => `<tr>
                        <td>${xmlEscape(r.plate)}</td><td>${r.jobCardId}</td><td>${xmlEscape(r.service)}</td>
                        <td>${r.completed}</td><td>${r.interval}</td><td><strong>${r.nextDue}</strong></td><td>${rptLevelChip(r.level)}</td>
                    </tr>`).join('');
                    html += `<div class="rpt-section"><div class="rpt-section-title">⏭ Next Scheduled Service (after completion)</div><div class="rpt-block">
                    <p class="rpt-jc-hint" style="margin-bottom:10px">Based on maintenance catalog intervals and last service date on each truck.</p>
                    ${tableRows ? `<table class="rpt-table"><thead><tr><th>Truck</th><th>Job card</th><th>Service completed</th><th>Completed on</th><th>Interval</th><th>Next due</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table>` : '<div class="rpt-empty">No completed services in period to schedule forward</div>'}
                    </div></div>`;
                }

                return html || '<div class="rpt-empty">Select a job card report type and click Generate</div>';
            }
            // ═════════════════════════════════════════════

            function init() {
                ensureSettingsDefaults();
                loadAll(function() {
                    // NEW: Attach the live listener safely AFTER data is loaded and auth is verified
                    if (typeof database !== 'undefined') {
                        database.ref('fleetguard').on('value', snapshot => {
                            if (!dataReady) return; // Prevent race conditions during initial load
                            const data = snapshot.val();
                            if (data) {
                                try {
                                    if (typeof App !== 'undefined' && typeof App.refreshFromFirebase === 'function') {
                                        App.refreshFromFirebase(data);
                                    } else {
                                        refreshFromFirebase(data);
                                    }
                                } catch(e) { console.warn('Sync error:', e); }
                            }
                        });
                    }

                    // This callback runs AFTER data is loaded (from Firebase or localStorage)
                    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
                        item.addEventListener('click', e => {
                            e.preventDefault();
                            showPage(item.dataset.page);
                        });
                    });
                    const pageSettings = document.getElementById('page-settings');
                    if (pageSettings) {
                        pageSettings.addEventListener('click', e => {
                            if (!settings.settingsLocked) return;
                        });
                    }

                    document.addEventListener('click', e => {
                        if (!e.target.closest('.modal-dropdown')) {
                            closeDropdownMenus();
                        }
                        if (settings.settingsLocked) {
                            if (e.target.closest('#adminPinButton, #restoreBackupButton, #settingsLockButton')) return;
                            const pageSettings = document.getElementById('page-settings');
                            if (pageSettings && pageSettings.contains(e.target)) {
                                e.preventDefault();
                                e.stopPropagation();
                            }
                        }
                    });
                    showPage('dashboard');
                });
            }

            function scrollToViolationCard(typeName) {
                const cardId = 'vdc-card-' + typeName.replace(/[^a-zA-Z0-9]/g, '_');
                const card = document.getElementById(cardId);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.style.transition = 'box-shadow 0.3s, border-color 0.3s';
                    card.style.boxShadow = '0 0 0 2px var(--accent), 0 4px 20px rgba(61,127,255,0.3)';
                    card.style.borderColor = 'var(--accent)';
                    setTimeout(() => {
                        card.style.boxShadow = '';
                        card.style.borderColor = '';
                    }, 1500);
                }
            }

                        // ═══════════ JOB CARD SYSTEM ═══════════
            function getFgRole() {
                return cachedFgRole || localStorage.getItem('fg_role') || 'Driver';
            }
            function setFgRole(role) {
                cachedFgRole = role;
                localStorage.setItem('fg_role', role);
                const uid = window.auth?.currentUser?.uid;
                if (uid && typeof database !== 'undefined') {
                    database.ref('users/' + uid + '/role').set(role).catch(err => {
                        console.warn('Role sync failed:', err);
                    });
                }
                document.querySelectorAll('.jc-role-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.dataset.role === role);
                });
                const newBtn = document.getElementById('jcBtnNew');
                if (newBtn) newBtn.style.display = role === 'Driver' ? '' : 'none';
                jcStatusFilter = role === 'Driver' ? 'Draft' : 'In-Progress';
                renderJcKanban();
            }
            function loadUserRoleFromFirebase(uid) {
                if (!uid || typeof database === 'undefined') return Promise.resolve(null);
                return database.ref('users/' + uid + '/role').once('value').then(snap => {
                    const role = snap.val();
                    if (role) {
                        cachedFgRole = role;
                        localStorage.setItem('fg_role', role);
                    }
                    return role;
                }).catch(() => null);
            }
            function setJcStatusFilter(status) {
                jcStatusFilter = status;
                renderJcKanban();
            }
            function formatRwf(amount) {
                const n = Number(amount) || 0;
                return 'RWF ' + n.toLocaleString('en-US', { maximumFractionDigits: 0, minimumFractionDigits: 0 });
            }
            function isSupervisorApproved(jc) {
                return jc.status === 'Approved' || (jc.status === 'Released' && !!jc.approvedAt);
            }
            function jcApprovalTimestamp(jc) {
                return jc.approvedAt || jc.releasedAt || jc.date || '';
            }
            function matchesJcSearch(jc, search, truckFilter) {
                const ms = !search || jc.id.toLowerCase().includes(search) || (jc.plate || '').toLowerCase().includes(search) || (getTrailerForPlate(jc.plate) || '').toLowerCase().includes(search) || (jc.driver || '').toLowerCase().includes(search);
                const mt = !truckFilter || jc.plate === truckFilter;
                return ms && mt;
            }
            function getFilteredPipelineCards() {
                const search = (document.getElementById('jobcardSearch')?.value || '').toLowerCase();
                const truckFilter = document.getElementById('jobcardTruckFilter')?.value || '';
                const role = getFgRole();
                if (jcStatusFilter === 'Approved') {
                    return jobCards.filter(jc => isSupervisorApproved(jc) && matchesJcSearch(jc, search, truckFilter))
                        .sort((a, b) => jcApprovalTimestamp(b).localeCompare(jcApprovalTimestamp(a)));
                }
                let list = jobCards.filter(jc => jc.status !== 'Released' && !isSupervisorApproved(jc));
                if (role === 'Mechanic') list = list.filter(j => j.status === 'In-Progress' || j.status === 'Pending-Approval');
                return list.filter(jc => {
                    const mf = jc.status === jcStatusFilter;
                    return matchesJcSearch(jc, search, truckFilter) && mf;
                });
            }
            function updateJcStatCounts() {
                const search = (document.getElementById('jobcardSearch')?.value || '').toLowerCase();
                const truckFilter = document.getElementById('jobcardTruckFilter')?.value || '';
                const pipelineBase = jobCards.filter(jc => jc.status !== 'Released' && !isSupervisorApproved(jc));
                const counts = { Draft: 0, 'In-Progress': 0, 'Pending-Approval': 0, Approved: 0 };
                pipelineBase.forEach(jc => {
                    if (matchesJcSearch(jc, search, truckFilter) && counts[jc.status] !== undefined) counts[jc.status]++;
                });
                counts.Approved = jobCards.filter(jc => isSupervisorApproved(jc) && matchesJcSearch(jc, search, truckFilter)).length;
                ['Draft', 'In-Progress', 'Pending-Approval', 'Approved'].forEach(st => {
                    const el = document.getElementById('jcCount-' + st);
                    if (el) el.textContent = counts[st] || 0;
                });
                document.querySelectorAll('.jc-stat-box[data-status]').forEach(box => {
                    box.classList.toggle('active', box.dataset.status === jcStatusFilter);
                });
            }
            function normalizeServiceKey(name) {
                return (name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom';
            }
            function normalizeService(s) {
                if (!s) return s;
                if (s.intervalDays && !s.intervalUnit) {
                    return { ...s, intervalValue: s.intervalDays, intervalUnit: 'days' };
                }
                return s;
            }
            function getServiceCatalog() {
                const cat = settings.maintenanceServices && settings.maintenanceServices.length
                    ? settings.maintenanceServices
                    : DEFAULT_MAINTENANCE_SERVICES;
                return cat.map(normalizeService);
            }
            function getCatalogEntry(serviceName) {
                const key = normalizeServiceKey(serviceName);
                return getServiceCatalog().find(s => s.key === key || normalizeServiceKey(s.name) === key)
                    || getServiceCatalog().find(s => (s.name || '').toLowerCase() === (serviceName || '').toLowerCase());
            }
            function getServiceDisplayInterval(s) {
                if (!s) return '';
                const norm = normalizeService(s);
                if (norm.intervalValue && norm.intervalUnit) {
                    const unit = norm.intervalUnit === 'months' ? 'mo' : norm.intervalUnit === 'days' ? 'd' : 'km';
                    return `${norm.intervalValue}${unit}`;
                }
                return '';
            }
            function getNextJobCardSeq() {
                let max = 0;
                jobCards.forEach(jc => {
                    const m = String(jc.id || '').match(/^JC-(\d+)$/i);
                    if (m) max = Math.max(max, parseInt(m[1], 10));
                });
                return max + 1;
            }
            function newJobCardId() {
                const seq = getNextJobCardSeq();
                return 'JC-' + String(seq).padStart(4, '0');
            }
            function newLineId() { return 'LN-' + Math.random().toString(36).slice(2, 9); }
            function addAuditLog(jc, role, action, detail) {
                if (!jc.auditLog) jc.auditLog = [];
                jc.auditLog.push({ at: new Date().toISOString(), role, action, detail: detail || '' });
            }
            function migrateJobCard(jc) {
                if (jc.driverLines && Array.isArray(jc.driverLines)) {
                    if (!jc.mechanicLines) jc.mechanicLines = [];
                    if (!jc.auditLog) jc.auditLog = [];
                    return jc;
                }
                const driverLines = (jc.driverServices || []).map(s => ({
                    lineId: newLineId(),
                    serviceKey: normalizeServiceKey(s.name),
                    name: s.name,
                    notes: s.notes || ''
                }));
                const mechanicLines = (jc.mechanicServices || []).map((m, i) => ({
                    driverLineId: driverLines[i]?.lineId || newLineId(),
                    done: true,
                    actualHours: m.actualHours || 0,
                    partsCost: m.partsCost || 0,
                    labourCost: m.labourCost || (m.actualCost || 0),
                    actualCost: m.actualCost || 0,
                    mechanic: m.mechanic || '',
                    completedAt: jc.completedAt || jc.date || null,
                    notDoneReason: '',
                    unplanned: !driverLines[i]
                }));
                jc.driverLines = driverLines;
                jc.mechanicLines = mechanicLines;
                delete jc.driverServices;
                delete jc.mechanicServices;
                if (!jc.auditLog) jc.auditLog = [];
                return jc;
            }
            function migrateAllJobCards() {
                jobCards = jobCards.map(migrateJobCard);
            }
            function getActiveJobCardForTruck(plate) {
                const p = (plate || '').trim().toUpperCase();
                return jobCards.find(j => (j.plate || '').trim().toUpperCase() === p && j.status !== 'Released');
            }
            function findLastServiceFromHistory(plate, serviceName) {
                const key = normalizeServiceKey(serviceName);
                const released = jobCards.filter(j => j.plate === plate && j.status === 'Released')
                    .sort((a, b) => (b.releasedAt || b.date || '').localeCompare(a.releasedAt || a.date || ''));
                for (const jc of released) {
                    const line = (jc.mechanicLines || []).find(m => {
                        if (!m.done) return false;
                        const dl = (jc.driverLines || []).find(d => d.lineId === m.driverLineId);
                        const n = dl?.name || '';
                        return normalizeServiceKey(n) === key || n.toLowerCase() === (serviceName || '').toLowerCase();
                    });
                    if (line) {
                        const dl = (jc.driverLines || []).find(d => d.lineId === line.driverLineId);
                        return {
                            jobCardId: jc.id,
                            date: line.completedAt || jc.releasedAt || jc.date,
                            cost: line.actualCost || 0,
                            serviceName: dl?.name || serviceName
                        };
                    }
                }
                const trk = trucks.find(t => t.plate === plate);
                if (trk?.lastServices?.[serviceName]) {
                    return { jobCardId: null, date: trk.lastServices[serviceName], cost: null, serviceName };
                }
                return null;
            }
            function getServiceIntervalAlert(plate, serviceName) {
                const cat = getCatalogEntry(serviceName);
                const last = findLastServiceFromHistory(plate, serviceName);
                // if no last date, check truck lastServices
                if (!last || !last.date) {
                    return { level: 'warn', text: 'No prior record for this service on this truck.', last: null, daysSince: null, nextDue: null };
                }
                const trk = trucks.find(t => t.plate === plate);
                const meta = trk?.lastServicesMeta?.[serviceName];
                const today = new Date();
                const lastD = new Date(last.date);
                const daysSince = Math.floor((today - lastD) / 86400000);
                // prefer meta dueType if provided
                if (meta && meta.dueType && meta.dueType !== 'date') {
                    if (meta.dueType === 'days') {
                        const nextDue = new Date(lastD.getTime() + (parseInt(meta.dueValue || 0, 10) || 0) * 86400000);
                        const daysUntil = Math.floor((nextDue - today) / 86400000);
                        let level = 'ok';
                        let text = `Last done ${last.date}${last.jobCardId ? ' (' + last.jobCardId + ')' : ''} — ${daysSince} days ago. Next due ~${nextDue.toLocaleDateString()}.`;
                        if (daysUntil < 0) { level = 'over'; text = `OVERDUE by ${Math.abs(daysUntil)} days. Last: ${last.date} (${daysSince} days ago).`; }
                        else if (daysUntil <= 14) { level = 'warn'; text = `Due in ${daysUntil} days. Last: ${last.date} (${daysSince} days ago).`; }
                        return { level, text, last, daysSince, nextDue: nextDue.toISOString().split('T')[0], intervalDays: meta.dueValue };
                    }
                    if (meta.dueType === 'months') {
                        const months = parseInt(meta.dueValue || 0, 10) || 0;
                        const nextDue = new Date(lastD.getFullYear(), lastD.getMonth() + months, lastD.getDate());
                        const daysUntil = Math.floor((nextDue - today) / 86400000);
                        let level = 'ok';
                        let text = `Last done ${last.date} — Next due ~${nextDue.toLocaleDateString()}.`;
                        if (daysUntil < 0) { level = 'over'; text = `OVERDUE. Last: ${last.date}.`; }
                        else if (daysUntil <= 14) { level = 'warn'; text = `Due in ${daysUntil} days. Last: ${last.date}.`; }
                        return { level, text, last, daysSince, nextDue: nextDue.toISOString().split('T')[0], intervalDays: months * 30 };
                    }
                    if (meta.dueType === 'km') {
                        // KM-based due cannot produce a date without vehicle odometer; show KM info
                        return { level: 'ok', text: `Last done ${last.date}. Next due after ${meta.dueValue || 'N/A'} km.`, last, daysSince, nextDue: null };
                    }
                }
                const intervalDays = cat?.intervalDays || 90;
                const nextDue = new Date(lastD.getTime() + intervalDays * 86400000);
                const daysUntil = Math.floor((nextDue - today) / 86400000);
                let level = 'ok';
                let text = `Last done ${last.date}${last.jobCardId ? ' (' + last.jobCardId + ')' : ''} — ${daysSince} days ago. Next due ~${nextDue.toLocaleDateString()}.`;
                if (daysUntil < 0) { level = 'over'; text = `OVERDUE by ${Math.abs(daysUntil)} days. Last: ${last.date} (${daysSince} days ago).`; }
                else if (daysUntil <= 14) { level = 'warn'; text = `Due in ${daysUntil} days. Last: ${last.date} (${daysSince} days ago).`; }
                return { level, text, last, daysSince, nextDue: nextDue.toISOString().split('T')[0], intervalDays };
            }
            function intervalAlertHtml(plate, serviceName) {
                const a = getServiceIntervalAlert(plate, serviceName);
                if (!serviceName) return '';
                const cls = a.level === 'over' ? 'jc-interval-over' : a.level === 'warn' ? 'jc-interval-warn' : 'jc-interval-ok';
                return `<div class="jc-interval-alert ${cls}">${xmlEscape(a.text)}</div>`;
            }
            function setTruckGarageStatus(plate, inGarage) {
                const trk = trucks.find(t => t.plate === plate);
                if (!trk) return;
                if (inGarage) {
                    trk._prevStatus = trk.status || 'Active';
                    trk.status = 'In Maintenance';
                } else {
                    trk.status = trk._prevStatus || 'Active';
                    delete trk._prevStatus;
                }
                saveAll();
                if (document.getElementById('page-trucks')?.classList.contains('active')) {
                    renderTruckCards();
                    renderTruckMetrics();
                }
            }
            function jcTotals(jc) {
                const actH = (jc.mechanicLines || []).filter(m => m.done).reduce((s, m) => s + (m.actualHours || 0), 0);
                const actP = (jc.mechanicLines || []).filter(m => m.done).reduce((s, m) => s + (m.partsCost || 0), 0);
                const actL = (jc.mechanicLines || []).filter(m => m.done).reduce((s, m) => s + (m.labourCost || 0), 0);
                const actC = (jc.mechanicLines || []).filter(m => m.done).reduce((s, m) => s + (m.actualCost || 0), 0);
                return { actH, actP, actL, actC };
            }
            function setJcPageTab(tab) {
                jcPageTab = tab;
                document.getElementById('jcTab-pipeline')?.classList.toggle('active', tab === 'pipeline');
                document.getElementById('jcTab-history')?.classList.toggle('active', tab === 'history');
                document.getElementById('jc-pipeline-panel').style.display = tab === 'pipeline' ? 'block' : 'none';
                document.getElementById('jc-history-panel').style.display = tab === 'history' ? 'block' : 'none';
                if (tab === 'pipeline') renderJcKanban();
                else renderJcHistory();
            }
            function populateJcTruckFilters() {
                const opts = trucks.map(t => `<option value="${xmlEscape(t.plate)}">${formatTruckLabel(t)}</option>`).join('');
                ['jobcardTruckFilter', 'historyTruckFilter'].forEach(id => {
                    const el = document.getElementById(id);
                    if (!el) return;
                    const cur = el.value;
                    el.innerHTML = `<option value="">All Trucks</option>${opts}`;
                    if (cur) el.value = cur;
                });
            }
            function renderJobCardsPage() {
                const role = getFgRole();
                setFgRole(role);
                populateJcTruckFilters();
                renderJcMetrics();
                if (jcPageTab === 'history') renderJcHistory();
                else renderJcKanban();
            }
            function isDateInMetricsPeriod(dateValue, period) {
                if (!dateValue) return false;
                const date = new Date(dateValue);
                if (Number.isNaN(date.getTime())) return false;
                const now = new Date();
                const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                if (period === 'today') {
                    return date.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
                }
                if (period === 'week') {
                    const weekStart = new Date(today);
                    weekStart.setDate(weekStart.getDate() - 6);
                    return date >= weekStart && date <= new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
                }
                if (period === 'month') {
                    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
                }
                if (period === 'year') {
                    return date.getFullYear() === now.getFullYear();
                }
                return false;
            }
            function getJcMetricTimestamp(jc) {
                if (jc.status === 'Released') return jc.releasedAt || jc.approvedAt || jc.date;
                return jc.date || jc.submittedAt || '';
            }
            function setJcMetricsPeriod(period) {
                jcMetricsPeriod = period || 'today';
                const sel = document.getElementById('jcMetricsPeriodFilter');
                if (sel) sel.value = jcMetricsPeriod;
                renderJcMetrics();
            }
            function renderJcMetrics() {
                const el = document.getElementById('jcMetrics');
                if (!el) return;
                const draft = jobCards.filter(j => j.status === 'Draft' && isDateInMetricsPeriod(getJcMetricTimestamp(j), jcMetricsPeriod)).length;
                const prog = jobCards.filter(j => j.status === 'In-Progress' && isDateInMetricsPeriod(getJcMetricTimestamp(j), jcMetricsPeriod)).length;
                const pend = jobCards.filter(j => j.status === 'Pending-Approval' && isDateInMetricsPeriod(getJcMetricTimestamp(j), jcMetricsPeriod)).length;
                const released = jobCards.filter(j => j.status === 'Released' && isDateInMetricsPeriod(getJcMetricTimestamp(j), jcMetricsPeriod)).length;
                const inGarage = Array.from(new Set(jobCards.filter(j => (j.status === 'In-Progress' || j.status === 'Pending-Approval') && isDateInMetricsPeriod(getJcMetricTimestamp(j), jcMetricsPeriod)).map(j => j.plate || ''))).length;
                const cost = jobCards.filter(j => j.status === 'Released' && isDateInMetricsPeriod(getJcMetricTimestamp(j), jcMetricsPeriod)).reduce((s, j) => s + jcTotals(j).actC, 0);
                el.innerHTML = `
                    <div class="metric-card c-blue"><div class="metric-label">Draft</div><div class="metric-value">${draft}</div></div>
                    <div class="metric-card c-amber"><div class="metric-label">In Progress</div><div class="metric-value">${prog}</div></div>
                    <div class="metric-card c-purple"><div class="metric-label">Pending Approval</div><div class="metric-value">${pend}</div></div>
                    <div class="metric-card c-teal"><div class="metric-label">Released (all)</div><div class="metric-value">${released}</div></div>
                    <div class="metric-card c-red"><div class="metric-label">Trucks in Garage</div><div class="metric-value">${inGarage}</div></div>
                    <div class="metric-card c-green"><div class="metric-label">${jcMetricsPeriod === 'today' ? 'Cost Today' : jcMetricsPeriod === 'week' ? 'Cost This Week' : jcMetricsPeriod === 'month' ? 'Cost This Month' : 'Cost This Year'}</div><div class="metric-value">${formatRwf(cost).replace('RWF ', '')}</div><div class="metric-sub">RWF</div></div>`;
            }
            function renderJcApprovedList(cards) {
                if (!cards.length) {
                    return `<div class="jc-status-section"><p style="padding:20px;font-size:13px;color:var(--text3);text-align:center">No supervisor-approved job cards yet.</p></div>`;
                }
                return `<div class="jc-status-section">
                    <div class="jc-approved-list">${cards.map(jc => {
                        const t = jcTotals(jc);
                        const approvedOn = jcApprovalTimestamp(jc).slice(0, 10);
                        return `<div class="jc-approved-row">
                            <div class="jc-approved-main">
                                <div><strong>${jc.id}</strong> · ${formatTruckLabelFromPlate(jc.plate || '')} · ${xmlEscape(jc.driver || '')}</div>
                                <div class="jc-approved-meta">Approved ${approvedOn || '—'} by ${xmlEscape(jc.approvedBy || 'Supervisor')}${jc.status === 'Released' ? ' · Released' : ''}</div>
                            </div>
                            <div class="jc-approved-cost">${formatRwf(t.actC)}</div>
                            <div style="display:flex;gap:6px">
                                <button class="btn btn-sm btn-ghost" onclick="App.openJobCardPreview('${jc.id}')">View</button>
                                <button class="btn btn-sm btn-ghost" onclick="App.generateJobCardReportById('${jc.id}')">Print</button>
                            </div>
                        </div>`;
                    }).join('')}</div>
                </div>`;
            }
            function jcStatusClass(st) {
                return st === 'Draft' ? 'jobcard-status-draft' : st === 'In-Progress' ? 'jobcard-status-progress'
                    : st === 'Pending-Approval' ? 'jobcard-status-pending' : st === 'Released' ? 'jobcard-status-released' : 'jobcard-status-approved';
            }
            function renderJcKanbanCard(jc) {
                const role = getFgRole();
                const serviceCount = (jc.driverLines || []).length + (jc.mechanicLines || []).filter(m => m.unplanned).length;
                let actions = '';
                if (role === 'Driver' && jc.status === 'Draft') {
                    actions = `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();App.openEditJobCardModal('${jc.id}')">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();App.deleteJobCard('${jc.id}')">Delete</button>`;
                } else if (role === 'Mechanic' && jc.status === 'In-Progress') {
                    actions = `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();App.openJobCardModal('${jc.id}')">Log Work</button>`;
                } else if (role === 'Supervisor' && jc.status === 'Pending-Approval') {
                    actions = `<button class="btn btn-sm btn-primary" onclick="event.stopPropagation();App.openJobCardPreview('${jc.id}')">Review</button>`;
                } else if (jc.status === 'Released') {
                    actions = `<button class="btn btn-sm btn-ghost" onclick="event.stopPropagation();App.generateJobCardReportById('${jc.id}')">Print</button>`;
                }
                const extraLines = (jc.mechanicLines || []).filter(m => m.unplanned && m.name);
                const serviceList = [
                    ...(jc.driverLines || []).slice(0, 3).map(l => `<div class="jobcard-service-item">• ${xmlEscape(l.name)}</div>`),
                    ...extraLines.slice(0, 2).map(m => `<div class="jobcard-service-item" style="color:var(--teal)">+ ${xmlEscape(m.name)}</div>`)
                ].join('');
                return `<div class="jobcard-card" onclick="App.openJobCardModal('${jc.id}')">
                    <div class="jobcard-header">
                        <div class="jobcard-id">${jc.id}</div>
                        <span class="jobcard-status-badge ${jcStatusClass(jc.status)}">${jc.status}</span>
                    </div>
                    <div class="jobcard-info">
                        <div>🚛 <strong>${formatTruckLabelFromPlate(jc.plate || '')}</strong></div>
                        <div>👤 ${xmlEscape(jc.driver || '')}</div>
                        <div>📅 ${jc.date || ''} · ${serviceCount} service${serviceCount !== 1 ? 's' : ''}</div>
                    </div>
                    <div class="jobcard-services">${serviceList || '<div class="jobcard-service-item" style="color:var(--text3)">No services listed</div>'}</div>
                    <div class="jobcard-actions">${actions}</div>
                </div>`;
            }
            function renderJcCarouselBlock(cards, sectionId) {
                if (!cards.length) {
                    return `<div class="jc-status-section"><p style="padding:20px;font-size:13px;color:var(--text3);text-align:center">No job cards in this category</p></div>`;
                }
                return `<div class="jc-status-section" data-section="${sectionId}">
                    <div class="jc-carousel-wrap">
                        <button type="button" class="jc-carousel-btn jc-carousel-prev" data-section="${sectionId}" onclick="App.scrollJcCarousel('${sectionId}', -1)" disabled aria-label="Scroll left">‹</button>
                        <div class="jc-carousel-track" id="jc-track-${sectionId}" data-section="${sectionId}">${cards.map(renderJcKanbanCard).join('')}</div>
                        <button type="button" class="jc-carousel-btn jc-carousel-next" data-section="${sectionId}" onclick="App.scrollJcCarousel('${sectionId}', 1)" aria-label="Scroll right">›</button>
                    </div>
                    <div class="jc-carousel-meta" id="jc-meta-${sectionId}">
                        <span class="jc-meta-range">Showing 1–${Math.min(cards.length, 1)} of ${cards.length}</span>
                        <span class="jc-meta-remaining">${cards.length > 1 ? `<strong>${cards.length - 1}</strong> more →` : ''}</span>
                    </div>
                </div>`;
            }
            function updateJcCarouselMeta(sectionKey) {
                const track = document.getElementById('jc-track-' + sectionKey);
                const meta = document.getElementById('jc-meta-' + sectionKey);
                const prev = document.querySelector(`.jc-carousel-prev[data-section="${sectionKey}"]`);
                const next = document.querySelector(`.jc-carousel-next[data-section="${sectionKey}"]`);
                if (!track || !meta) return;
                const cards = track.querySelectorAll('.jobcard-card');
                const total = cards.length;
                const rangeEl = meta.querySelector('.jc-meta-range');
                const remEl = meta.querySelector('.jc-meta-remaining');
                if (!total) {
                    if (rangeEl) rangeEl.textContent = 'No cards';
                    if (remEl) remEl.innerHTML = '';
                    if (prev) prev.disabled = true;
                    if (next) next.disabled = true;
                    return;
                }
                const gap = 14;
                const cardW = (cards[0]?.offsetWidth || track.clientWidth) + gap;
                const scrollLeft = track.scrollLeft;
                const viewW = track.clientWidth;
                const firstIdx = Math.max(0, Math.floor((scrollLeft + gap * 0.5) / cardW));
                const visibleCount = Math.max(1, Math.ceil((viewW + gap) / cardW));
                const lastIdx = Math.min(total - 1, firstIdx + visibleCount - 1);
                const remainingRight = Math.max(0, total - 1 - lastIdx);
                const remainingLeft = firstIdx;
                if (rangeEl) rangeEl.textContent = `Showing ${firstIdx + 1}–${lastIdx + 1} of ${total}`;
                if (remEl) {
                    if (remainingRight > 0) remEl.innerHTML = `<strong>${remainingRight}</strong> more →`;
                    else if (remainingLeft > 0) remEl.innerHTML = `← <strong>${remainingLeft}</strong> earlier`;
                    else remEl.innerHTML = '<span style="color:var(--green)">All visible</span>';
                }
                if (prev) prev.disabled = scrollLeft <= 2;
                if (next) next.disabled = scrollLeft + viewW >= track.scrollWidth - 2;
            }
            function bindJcCarousels() {
                document.querySelectorAll('.jc-carousel-track').forEach(track => {
                    const key = track.dataset.section;
                    if (track._jcScrollBound) return;
                    track._jcScrollBound = true;
                    track.addEventListener('scroll', () => updateJcCarouselMeta(key), { passive: true });
                    track.addEventListener('wheel', e => {
                        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                            e.preventDefault();
                            track.scrollBy({ left: e.deltaY, behavior: 'smooth' });
                        }
                    }, { passive: false });
                    window.addEventListener('resize', () => updateJcCarouselMeta(key));
                    requestAnimationFrame(() => updateJcCarouselMeta(key));
                });
            }
            function scrollJcCarousel(sectionKey, direction) {
                const track = document.getElementById('jc-track-' + sectionKey);
                if (!track) return;
                const card = track.querySelector('.jobcard-card');
                const step = card ? card.offsetWidth + 14 : 320;
                track.scrollBy({ left: direction * step, behavior: 'smooth' });
                requestAnimationFrame(() => updateJcCarouselMeta(sectionKey));
                setTimeout(() => updateJcCarouselMeta(sectionKey), 260);
            }
            function renderJcKanban() {
                const role = getFgRole();
                if (role !== 'Driver' && jcStatusFilter === 'Draft') jcStatusFilter = 'In-Progress';
                updateJcStatCounts();
                const cards = getFilteredPipelineCards();
                const statusLabels = {
                    Draft: 'Draft job cards',
                    'In-Progress': 'In progress',
                    'Pending-Approval': 'Pending approval',
                    Approved: 'Supervisor approved'
                };
                const labelEl = document.getElementById('jcPipelineLabel');
                if (labelEl) {
                    labelEl.innerHTML = `${statusLabels[jcStatusFilter] || jcStatusFilter} <span>· ${cards.length} card${cards.length !== 1 ? 's' : ''}</span>`;
                }
                const board = document.getElementById('jcKanban');
                if (!board) return;
                if (jcStatusFilter === 'Approved') {
                    board.innerHTML = renderJcApprovedList(cards);
                } else {
                    const sectionId = jcStatusFilter.replace(/[^a-zA-Z0-9]/g, '_');
                    board.innerHTML = renderJcCarouselBlock(cards, sectionId);
                    bindJcCarousels();
                }
                renderJcMetrics();
                updateSidebarBadges();
            }
            function startJobCardForTruck(plate) {
                if (getActiveJobCardForTruck(plate)) {
                    showToast('This truck already has an open job card');
                    showPage('jobcards');
                    const active = getActiveJobCardForTruck(plate);
                    if (active) openJobCardModal(active.id);
                    return;
                }
                showPage('jobcards');
                setTimeout(() => openCreateJobCardModal(plate), 80);
            }
            function openCreateJobCardModal(prefillPlate) {
                if (getFgRole() !== 'Driver') {
                    showToast('Switch role to Driver to create a job card');
                    return;
                }
                if (prefillPlate && getActiveJobCardForTruck(prefillPlate)) {
                    showToast('Truck already has an open job card');
                    openJobCardModal(getActiveJobCardForTruck(prefillPlate).id);
                    return;
                }
                const plateList = trucks.map(t => `<option value="${xmlEscape(t.plate)}">${formatTruckLabel(t)}</option>`).join('');
                const driverList = drivers.map(d => `<option value="${xmlEscape(d.name)}">${xmlEscape(d.name)} · ${formatDriverVehicleLabel(d)}</option>`).join('');
                const prefillVal = prefillPlate ? xmlEscape(prefillPlate) : '';
                const serviceOptions = getServiceCatalog().map(s => `<option value="${xmlEscape(s.name)}">${xmlEscape(s.name)} (${s.intervalDays}d)</option>`).join('');
                openModal(`
                    <div class="modal-header">
                        <div><div class="modal-name">📋 Create Job Card</div><div class="modal-sub">Driver — request maintenance for garage</div></div>
                        <div class="modal-close" onclick="App.closeModal()">✕</div>
                    </div>
                    <div class="modal-body">
                        <div class="section">
                            <div class="info-grid">
                                <div class="info-cell">
                                    <div class="il">Truck / trailer</div>
                                    <input type="text" id="jcTruckPlate" list="jcTruckPlateList" value="${prefillVal}" placeholder="Type or select plate number" autocomplete="off"
                                        style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                    <datalist id="jcTruckPlateList">${plateList}</datalist>
                                    <div class="jc-combo-hint">Shows truck plate with assigned trailer from fleet</div>
                                </div>
                                <div class="info-cell">
                                    <div class="il">Driver name</div>
                                    <input type="text" id="jcDriver" list="jcDriverList" placeholder="Type or select driver name" autocomplete="off"
                                        style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                    <datalist id="jcDriverList">${driverList}</datalist>
                                    <div class="jc-combo-hint">Pick from roster or type any driver name</div>
                                </div>
                            </div>
                            <div style="margin-top:12px"><div class="il">Priority</div>
                                <div style="display:flex;gap:12px;margin-top:8px;font-size:13px">
                                    <label><input type="radio" name="jcPriority" value="Low" checked> Low</label>
                                    <label><input type="radio" name="jcPriority" value="Medium"> Medium</label>
                                    <label><input type="radio" name="jcPriority" value="High"> High</label>
                                </div>
                            </div>
                        </div>
                        <div class="section">
                            <div class="section-title">Services required</div>
                            <div id="jcServicesContainer"></div>
                            <button class="btn btn-ghost btn-sm" onclick="App.addJobCardLineRow()" style="margin-top:8px">+ Add line</button>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="App.saveJobCard()">Save draft</button>
                    </div>`);
                addJobCardLineRow(serviceOptions);
            }
            function openEditJobCardModal(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc || jc.status !== 'Draft') return;
                if (getFgRole() !== 'Driver') {
                    showToast('Switch to Driver role to edit drafts');
                    return;
                }
                migrateJobCard(jc);
                const plateList = trucks.map(t => `<option value="${xmlEscape(t.plate)}">${formatTruckLabel(t)}</option>`).join('');
                const driverList = drivers.map(d => `<option value="${xmlEscape(d.name)}">${xmlEscape(d.name)} · ${formatDriverVehicleLabel(d)}</option>`).join('');
                const serviceOptions = getServiceCatalog().map(s => `<option value="${xmlEscape(s.name)}">${xmlEscape(s.name)} (${s.intervalDays}d)</option>`).join('');
                const pri = jc.priority || 'Medium';
                openModal(`
                    <div class="modal-header">
                        <div><div class="modal-name">✎ Edit ${jc.id}</div><div class="modal-sub">Update draft before submitting to garage</div></div>
                        <div class="modal-close" onclick="App.closeModal()">✕</div>
                    </div>
                    <div class="modal-body">
                        <div class="section">
                            <div class="info-grid">
                                <div class="info-cell">
                                    <div class="il">Truck / trailer</div>
                                    <input type="text" id="jcTruckPlate" list="jcTruckPlateList" value="${xmlEscape(jc.plate || '')}" placeholder="Type or select plate number" autocomplete="off"
                                        style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                    <datalist id="jcTruckPlateList">${plateList}</datalist>
                                </div>
                                <div class="info-cell">
                                    <div class="il">Driver name</div>
                                    <input type="text" id="jcDriver" list="jcDriverList" value="${xmlEscape(jc.driver || '')}" placeholder="Type or select driver name" autocomplete="off"
                                        style="width:100%;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                    <datalist id="jcDriverList">${driverList}</datalist>
                                </div>
                            </div>
                            <div style="margin-top:12px"><div class="il">Priority</div>
                                <div style="display:flex;gap:12px;margin-top:8px;font-size:13px">
                                    <label><input type="radio" name="jcPriority" value="Low" ${pri === 'Low' ? 'checked' : ''}> Low</label>
                                    <label><input type="radio" name="jcPriority" value="Medium" ${pri === 'Medium' ? 'checked' : ''}> Medium</label>
                                    <label><input type="radio" name="jcPriority" value="High" ${pri === 'High' ? 'checked' : ''}> High</label>
                                </div>
                            </div>
                        </div>
                        <div class="section">
                            <div class="section-title">Services required</div>
                            <div id="jcServicesContainer"></div>
                            <button class="btn btn-ghost btn-sm" onclick="App.addJobCardLineRow()" style="margin-top:8px">+ Add line</button>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" onclick="App.closeModal()">Cancel</button>
                        <button class="btn btn-primary" onclick="App.updateJobCard('${jc.id}')">Save changes</button>
                        <button class="btn btn-primary" onclick="App.updateJobCardAndSubmit('${jc.id}')">Save &amp; submit</button>
                    </div>`);
                const container = document.getElementById('jcServicesContainer');
                (jc.driverLines || []).forEach(dl => {
                    addJobCardLineRow(serviceOptions);
                    const row = container.lastElementChild;
                    const sel = row.querySelector('.jc-line-service');
                    const catalog = getServiceCatalog();
                    const inCatalog = catalog.some(s => s.name === dl.name);
                    if (inCatalog) {
                        sel.value = dl.name;
                    } else {
                        sel.value = '__custom__';
                        const custom = row.querySelector('.jc-line-custom');
                        custom.style.display = 'block';
                        custom.value = dl.name;
                    }
                });
                if (!(jc.driverLines || []).length) addJobCardLineRow(serviceOptions);
            }
            function updateJobCard(jobCardId, andSubmit) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc || jc.status !== 'Draft') return false;
                const plate = (document.getElementById('jcTruckPlate')?.value || '').trim().toUpperCase();
                const driver = (document.getElementById('jcDriver')?.value || '').trim();
                const priority = document.querySelector('input[name="jcPriority"]:checked')?.value || 'Medium';
                const driverLines = collectDriverLinesFromForm();
                if (!plate || !driver || !driverLines.length) {
                    showToast('Fill truck plate, driver name, and at least one service');
                    return false;
                }
                const other = getActiveJobCardForTruck(plate);
                if (other && other.id !== jc.id) {
                    showToast('Another open job card exists for this plate');
                    return false;
                }
                jc.plate = plate;
                jc.driver = driver;
                jc.priority = priority;
                jc.driverLines = driverLines;
                jc.mechanicLines = driverLines.map(dl => ({
                    driverLineId: dl.lineId,
                    done: false,
                    actualHours: 0,
                    partsCost: 0,
                    labourCost: 0,
                    actualCost: 0,
                    mechanic: '',
                    completedAt: null,
                    notDoneReason: '',
                    unplanned: false
                }));
                addAuditLog(jc, 'Driver', 'updated draft');
                saveAll();
                if (andSubmit) {
                    submitJobCardToMechanic(jobCardId);
                    return true;
                }
                closeModal();
                renderJobCardsPage();
                showToast(`${jc.id} updated`);
                return true;
            }
            function updateJobCardAndSubmit(jobCardId) {
                updateJobCard(jobCardId, true);
            }
            function addJobCardLineRow(serviceOptionsHtml) {
                const container = document.getElementById('jcServicesContainer');
                if (!container) return;
                const idx = container.children.length;
                const catalog = getServiceCatalog();
                const opts = serviceOptionsHtml || catalog.map(s => `<option value="${xmlEscape(s.name)}">${xmlEscape(s.name)}</option>`).join('');
                container.insertAdjacentHTML('beforeend', `
                    <div class="jc-line-row" data-idx="${idx}">
                        <select class="jc-line-service" onchange="App.onJcLineServiceChange(this)" style="width:100%;padding:8px;margin-bottom:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                            <option value="">— Custom / pick service —</option>${opts}
                            <option value="__custom__">Custom service…</option>
                        </select>
                        <input type="text" class="jc-line-custom" placeholder="Custom service name" style="display:none;width:100%;padding:8px;margin-bottom:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                        <div id="jc-line-alert-${idx}"></div>
                        <button class="btn btn-danger btn-xs" style="margin-top:8px" onclick="this.closest('.jc-line-row').remove()">Remove</button>
                    </div>`);
            }
            function onJcLineServiceChange(sel) {
                const row = sel.closest('.jc-line-row');
                const custom = row.querySelector('.jc-line-custom');
                const alertEl = row.querySelector('[id^="jc-line-alert"]');
                if (sel.value === '__custom__') {
                    custom.style.display = 'block';
                    custom.value = '';
                    if (alertEl) alertEl.innerHTML = '';
                    return;
                }
                custom.style.display = 'none';
                const plate = document.getElementById('jcTruckPlate')?.value;
                if (alertEl && plate && sel.value) alertEl.innerHTML = intervalAlertHtml(plate, sel.value);
            }
            function collectDriverLinesFromForm() {
                const lines = [];
                document.querySelectorAll('#jcServicesContainer .jc-line-row').forEach(row => {
                    const sel = row.querySelector('.jc-line-service');
                    let name = sel?.value === '__custom__' ? row.querySelector('.jc-line-custom')?.value?.trim() : sel?.value;
                    if (!name || name === '__custom__') return;
                    lines.push({
                        lineId: newLineId(),
                        serviceKey: normalizeServiceKey(name),
                        name,
                        notes: ''
                    });
                });
                return lines;
            }
            function saveJobCard() {
                const plate = (document.getElementById('jcTruckPlate')?.value || '').trim().toUpperCase();
                const driver = (document.getElementById('jcDriver')?.value || '').trim();
                const priority = document.querySelector('input[name="jcPriority"]:checked')?.value || 'Medium';
                const driverLines = collectDriverLinesFromForm();
                if (!plate || !driver || !driverLines.length) {
                    showToast('Fill truck plate, driver name, and at least one service');
                    return;
                }
                if (getActiveJobCardForTruck(plate)) {
                    showToast('Truck already has an open job card');
                    return;
                }
                const jc = {
                    id: newJobCardId(),
                    date: new Date().toISOString().split('T')[0],
                    plate, driver, priority,
                    status: 'Draft',
                    driverLines,
                    mechanicLines: driverLines.map(dl => ({
                        driverLineId: dl.lineId,
                        done: false,
                        actualHours: 0,
                        partsCost: 0,
                        labourCost: 0,
                        actualCost: 0,
                        mechanic: '',
                        completedAt: null,
                        notDoneReason: '',
                        unplanned: false
                    })),
                    auditLog: [],
                    createdAt: new Date().toISOString()
                };
                addAuditLog(jc, 'Driver', 'created');
                jobCards.push(jc);
                saveAll();
                closeModal();
                renderJobCardsPage();
                showToast(`Job card ${jc.id} created`);
            }
            function ensureMechanicLines(jc) {
                (jc.driverLines || []).forEach(dl => {
                    if (!(jc.mechanicLines || []).some(m => m.driverLineId === dl.lineId)) {
                        jc.mechanicLines.push({
                            driverLineId: dl.lineId, done: false, actualHours: 0, partsCost: 0, labourCost: 0,
                            actualCost: 0, mechanic: '', completedAt: null, notDoneReason: '', unplanned: false
                        });
                    }
                });
            }
            // ═══════════ Handwritten Proof Helpers ═══════════
            /**
             * Compress an image file using the Canvas API.
             * Targets ≤300 KB. Returns a {data, size, type} object.
             */
            function compressImageFile(file) {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const TARGET_BYTES = 300 * 1024; // 300 KB
                            const canvas = document.createElement('canvas');
                            let W = img.naturalWidth;
                            let H = img.naturalHeight;
                            // Scale down if very large, keeping aspect ratio
                            const MAX_DIM = 2400;
                            if (W > MAX_DIM || H > MAX_DIM) {
                                const ratio = Math.min(MAX_DIM / W, MAX_DIM / H);
                                W = Math.round(W * ratio);
                                H = Math.round(H * ratio);
                            }
                            canvas.width = W;
                            canvas.height = H;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, W, H);
                            // Binary-search the quality value to hit our target
                            let lo = 0.1, hi = 0.97, bestData = null;
                            for (let iter = 0; iter < 8; iter++) {
                                const mid = (lo + hi) / 2;
                                const data = canvas.toDataURL('image/jpeg', mid);
                                const bytes = Math.round((data.length - 22) * 3 / 4);
                                if (bytes <= TARGET_BYTES) {
                                    bestData = data;
                                    lo = mid;
                                } else {
                                    hi = mid;
                                }
                            }
                            // If even at q=0.1 it is still too large (rare), just use q=0.1 result
                            if (!bestData) bestData = canvas.toDataURL('image/jpeg', 0.1);
                            resolve(bestData);
                        };
                        img.onerror = reject;
                        img.src = e.target.result;
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }

            /**
             * Read a PDF file as base64 data URL.
             * Warns if >2 MB but still allows it.
             */
            function readPdfFile(file) {
                return new Promise((resolve, reject) => {
                    const MAX_PDF = 2 * 1024 * 1024; // 2 MB
                    if (file.size > MAX_PDF) {
                        showToast('⚠️ PDF is large (' + (file.size / 1024 / 1024).toFixed(1) + ' MB). Consider compressing it for better performance.');
                    }
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ data: e.target.result, size: file.size, type: 'application/pdf' });
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            }

            /** Format bytes into a human-readable string */
            function fmtBytes(bytes) {
                if (bytes < 1024) return bytes + ' B';
                if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
                return (bytes / 1024 / 1024).toFixed(2) + ' MB';
            }

            /**
             * Validate, compress (if image), and read the file.
             * Returns a proof object: { name, type, data, size, uploadedAt }
             */
            async function validateAndReadProof(file, customName) {
                const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
                if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|png|jpg|jpeg)$/i)) {
                    showToast('Please upload a PDF, PNG, or JPG file');
                    return null;
                }
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                const ext = isPdf ? '.pdf' : (file.type === 'image/png' ? '.png' : '.jpg');
                const finalName = (customName && customName.trim()) ? customName.trim() + ext : file.name;
                try {
                    let fileData, fileSize, fileType;
                    if (isPdf) {
                        const pdfRes = await readPdfFile(file);
                        fileData = pdfRes.data;
                        fileSize = pdfRes.size;
                        fileType = 'application/pdf';
                    } else {
                        const dataUrl = await compressImageFile(file);
                        fileData = dataUrl;
                        fileSize = Math.round(dataUrl.length * 0.75);
                        fileType = file.type || 'image/jpeg';
                    }
                    return {
                        name: finalName,
                        type: fileType,
                        data: fileData,
                        size: fileSize,
                        uploadedAt: new Date().toISOString().split('T')[0]
                    };
                } catch (err) {
                    console.error('Proof read error:', err);
                    showToast('Failed to read file. Please try again.');
                    return null;
                }
            }

            /** Handle actual file upload after rename confirmation */
            async function uploadHandwrittenProof(jobCardId, input, customName) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                const file = input.files && input.files[0];
                if (!file) return;
                showToast('Processing file…');
                const proof = await validateAndReadProof(file, customName);
                if (!proof) return;
                jc.handwrittenProof = proof;
                addAuditLog(jc, 'Mechanic', 'uploaded handwritten proof: ' + proof.name);
                saveAll();
                showToast('✅ Proof uploaded — ' + proof.name + ' (' + fmtBytes(proof.size) + ')');
                openJobCardModal(jobCardId);
            }

            /**
             * Show inline rename UI inside the modal before actual upload.
             * Triggered when the mechanic selects a file.
             */
            function showProofRenameUi(jobCardId, inputEl) {
                const file = inputEl.files && inputEl.files[0];
                if (!file) return;
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                const ext = isPdf ? '.pdf' : (file.type === 'image/png' ? '.png' : '.jpg');
                // Derive a sensible default name from the job card id
                const jc = jobCards.find(j => j.id === jobCardId);
                const defaultName = jc ? (jc.id + '-handwritten') : file.name.replace(/\.[^.]+$/, '');
                // Inject rename row below the upload zone in the modal
                const existingRow = document.getElementById('proofRenameRow_' + jobCardId);
                if (existingRow) existingRow.remove();
                const zone = document.getElementById('proofUploadZone_' + jobCardId);
                if (!zone) return;
                const row = document.createElement('div');
                row.id = 'proofRenameRow_' + jobCardId;
                row.className = 'jc-rename-row';
                row.innerHTML = `
                    <input type="text" id="proofNameInput_${jobCardId}" value="${xmlEscape(defaultName)}" placeholder="File name (without extension)" maxlength="80">
                    <span class="ext-badge">${xmlEscape(ext)}</span>
                    <button class="btn btn-primary btn-sm" onclick="App.confirmProofUpload('${jobCardId}')">✅ Upload</button>
                    <button class="btn btn-ghost btn-sm" onclick="App.cancelProofRename('${jobCardId}')">Cancel</button>`;
                zone.insertAdjacentElement('afterend', row);
                // Focus and select the name input
                const nameInput = row.querySelector('input');
                if (nameInput) { nameInput.focus(); nameInput.select(); }
            }

            function confirmProofUpload(jobCardId) {
                const nameInput = document.getElementById('proofNameInput_' + jobCardId);
                const customName = nameInput ? nameInput.value.trim() : '';
                const fileInput = document.getElementById('proofFileInput_' + jobCardId);
                if (!fileInput) return;
                uploadHandwrittenProof(jobCardId, fileInput, customName);
            }

            function cancelProofRename(jobCardId) {
                const row = document.getElementById('proofRenameRow_' + jobCardId);
                if (row) row.remove();
                // Clear the file input so the change event fires again next time
                const fi = document.getElementById('proofFileInput_' + jobCardId);
                if (fi) fi.value = '';
            }

            /** Download the stored handwritten proof file */
            function downloadHandwrittenJobCard(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc || !jc.handwrittenProof) {
                    showToast('No handwritten proof attached to this job card');
                    return;
                }
                const p = jc.handwrittenProof;
                const a = document.createElement('a');
                a.href = p.data;
                a.download = p.name || ('handwritten-' + jobCardId + '.pdf');
                a.click();
                showToast('Downloading handwritten proof…');
            }

            /** Download both digital PDF and handwritten proof */
            function downloadBothJobCardFiles(jobCardId) {
                downloadJobCardReportById(jobCardId);
                setTimeout(() => downloadHandwrittenJobCard(jobCardId), 600);
            }

            function viewHandwrittenProof(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc || !jc.handwrittenProof) {
                    showToast('No handwritten proof attached to this job card');
                    return;
                }
                const p = jc.handwrittenProof;
                const isPdf = p.type === 'application/pdf';

                if (isPdf) {
                    // Open the raw base64 data URL directly — the browser's native
                    // PDF viewer handles everything (print, zoom, download) with correct dimensions.
                    const win = window.open(p.data, '_blank');
                    if (!win) { showToast('Pop-up blocked — please allow pop-ups for this site'); }
                    return;
                }

                // Image proof — full document view (no print button to prevent wrong dimensions)
                const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Handwritten Proof — ${xmlEscape(jc.id)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { height: 100%; font-family: Inter, Arial, sans-serif; background: #f1f5f9; color: #1e293b; }
  .doc-toolbar {
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; gap: 14px;
    padding: 12px 24px; background: #1e293b;
    border-bottom: 2px solid #334155;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
  }
  .doc-title { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .doc-title h1 { font-size: 15px; font-weight: 700; color: #f1f5f9; letter-spacing: 0.01em; }
  .doc-title p  { font-size: 12px; color: #94a3b8; font-family: monospace; }
  .badge {
    display: inline-flex; align-items: center; padding: 4px 12px;
    border-radius: 999px; background: rgba(220,38,38,0.15);
    border: 1px solid rgba(220,38,38,0.35); color: #fca5a5;
    font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; white-space: nowrap;
  }
  .doc-body { padding: 32px 24px; max-width: 1100px; margin: 0 auto; }
  .doc-card { background: #fff; border-radius: 14px; box-shadow: 0 8px 32px rgba(15,23,42,0.10); overflow: hidden; }
  .doc-card-header {
    padding: 20px 28px 18px; background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap;
  }
  .doc-card-header h2 { font-size: 18px; font-weight: 700; color: #dc2626; margin-bottom: 4px; }
  .doc-card-header p  { font-size: 12px; color: #64748b; line-height: 1.5; }
  .doc-card-meta { text-align: right; font-size: 12px; color: #64748b; line-height: 1.7; }
  .hw-proof-img { display: block; width: 100%; height: auto; padding: 24px; object-fit: contain; }
</style>
</head>
<body>
  <div class="doc-toolbar">
    <div class="doc-title">
      <h1>Handwritten Job Card Proof</h1>
      <p>${xmlEscape(jc.id)} &nbsp;·&nbsp; ${formatTruckLabelFromPlate(jc.plate)} &nbsp;·&nbsp; ${xmlEscape(jc.driver)}</p>
    </div>
    <span class="badge">Handwritten Proof</span>
  </div>
  <div class="doc-body">
    <div class="doc-card">
      <div class="doc-card-header">
        <div>
          <h2>Handwritten Job Card Proof</h2>
          <p>${xmlEscape(p.name)}&nbsp;·&nbsp;${fmtBytes(p.size)}<br>Uploaded: ${xmlEscape(p.uploadedAt || 'N/A')}</p>
        </div>
        <div class="doc-card-meta">${xmlEscape(jc.id)}<br>${formatTruckLabelFromPlate(jc.plate)}<br>${xmlEscape(jc.driver)}</div>
      </div>
      <img src="${p.data}" alt="Handwritten job card proof" class="hw-proof-img">
    </div>
  </div>
</body>
</html>`;

                const win = window.open('', '_blank');
                if (!win) { showToast('Pop-up blocked — please allow pop-ups for this site'); return; }
                win.document.write(fullHtml);
                win.document.close();
            }

            function openJobCardModal(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                if (getFgRole() === 'Driver' && jc.status === 'Draft') {
                    openEditJobCardModal(jobCardId);
                    return;
                }
                migrateJobCard(jc);
                ensureMechanicLines(jc);
                const role = getFgRole();
                const canMechanic = role === 'Mechanic' && jc.status === 'In-Progress';

                let driverHtml = (jc.driverLines || []).map(dl => `
                    <div style="padding:12px;background:var(--bg4);border-radius:var(--radius);margin-bottom:10px">
                        <strong>${xmlEscape(dl.name)}</strong>
                        ${dl.notes ? `<div style="font-size:11px;color:var(--text3);margin-top:4px">${xmlEscape(dl.notes)}</div>` : ''}
                    </div>`).join('');

                let mechanicHtml = '';
                if (jc.status !== 'Draft') {
                    const mechRow = (m, label, lineId, isExtra) => {
                        const hist = !isExtra ? findLastServiceFromHistory(jc.plate, label) : null;
                        const histNote = hist ? `<div style="font-size:10px;color:var(--text3);margin-top:4px">Prior: ${hist.date}${hist.jobCardId ? ' · ' + hist.jobCardId : ''}</div>` : '';
                        if (canMechanic) {
                            const rowCls = isExtra ? 'jc-extra-row' : 'jc-line-row';
                            const dataAttr = isExtra ? `data-extra-id="${lineId}"` : `data-line="${lineId}"`;
                            const nameField = isExtra ? `<input type="text" class="jc-extra-name" value="${xmlEscape(m.name || '')}" placeholder="Describe extra work" style="width:100%;padding:8px;margin-bottom:8px;background:var(--bg3);border:1px solid var(--teal);border-radius:var(--radius);color:var(--text)">` : `<div style="font-weight:600;margin-bottom:8px">${xmlEscape(label)}</div>`;
                            return `<div class="${rowCls}" ${dataAttr}>
                                ${isExtra ? '<div style="font-size:10px;color:var(--teal);margin-bottom:4px">Extra work (not on job card)</div>' : ''}
                                ${nameField}${histNote}
                                <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px">
                                    <input type="checkbox" class="jc-m-done" ${m.done ? 'checked' : ''}> Completed
                                </label>
                                <div class="info-grid">
                                    <input type="number" class="jc-m-hours" value="${m.actualHours || ''}" placeholder="Actual hours" step="0.5" style="padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                    <input type="number" class="jc-m-parts" value="${m.partsCost || ''}" placeholder="Parts (RWF)" step="1" min="0" style="padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                    <input type="number" class="jc-m-labour" value="${m.labourCost || ''}" placeholder="Labour (RWF)" step="1" min="0" style="padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                    <input type="text" class="jc-m-mech" value="${xmlEscape(m.mechanic || '')}" placeholder="Mechanic name" style="padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text)">
                                </div>
                                ${isExtra ? `<button class="btn btn-danger btn-xs" style="margin-top:8px" onclick="App.removeMechanicExtraLine('${jc.id}','${lineId}')">Remove extra</button>` : `<input type="text" class="jc-m-reason" value="${xmlEscape(m.notDoneReason || '')}" placeholder="If not done, reason" style="width:100%;margin-top:8px;padding:8px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font-size:12px">`}
                            </div>`;
                        }
                        return `<div style="padding:10px;background:var(--bg3);border-radius:var(--radius);margin-bottom:8px;border:1px solid ${isExtra ? 'var(--teal)' : 'var(--border)'}">
                            <strong>${xmlEscape(label)}</strong>${isExtra ? ' <span style="color:var(--teal);font-size:10px">(extra)</span>' : ''} — ${m.done ? '✅' : '⏳'}
                            ${m.done ? `<div style="font-size:11px;margin-top:4px">${formatRwf(m.actualCost)} · ${m.actualHours || 0}h · ${xmlEscape(m.mechanic || '')}</div>` : (m.notDoneReason ? `<div style="font-size:11px;color:var(--amber)">${xmlEscape(m.notDoneReason)}</div>` : '')}
                            ${histNote}
                        </div>`;
                    };
                    mechanicHtml = (jc.driverLines || []).map(dl => {
                        const m = (jc.mechanicLines || []).find(x => x.driverLineId === dl.lineId && !x.unplanned) || {};
                        return mechRow(m, dl.name, dl.lineId, false);
                    }).join('');
                    mechanicHtml += (jc.mechanicLines || []).filter(m => m.unplanned).map(m =>
                        mechRow(m, m.name || 'Extra work', m.driverLineId, true)
                    ).join('');
                    if (canMechanic) {
                        mechanicHtml += `<button class="btn btn-ghost btn-sm" style="margin-top:12px" onclick="App.addMechanicExtraLine('${jc.id}')">+ Add work not on job card</button>`;
                    }
                }

                // Build the handwritten proof upload/status section (mechanic only, In-Progress)
                let proofSectionHtml = '';
                if (canMechanic) {
                    const proof = jc.handwrittenProof;
                    const proofIcon = proof ? (proof.type === 'application/pdf' ? '📄' : '🖼️') : '📋';
                    const proofContent = proof
                        ? `<div class="jc-proof-uploaded">
                               <span class="proof-icon">${proofIcon}</span>
                               <div class="proof-info">
                                   <div class="proof-name">✅ ${xmlEscape(proof.name)}</div>
                                   <div class="proof-meta">${fmtBytes(proof.size)} · Uploaded ${xmlEscape(proof.uploadedAt || '')}</div>
                               </div>
                               <div class="proof-actions">
                                   <button class="btn btn-ghost btn-xs" onclick="App.viewHandwrittenProof('${jc.id}')">👁 View</button>
                                   <button class="btn btn-ghost btn-xs" style="color:var(--amber)" onclick="document.getElementById('proofFileInput_${jc.id}').click()">↺ Replace</button>
                               </div>
                           </div>`
                        : `<div class="jc-proof-upload-zone" id="proofUploadZone_${jc.id}" onclick="document.getElementById('proofFileInput_${jc.id}').click()">
                               <span class="upload-icon">📋</span>
                               <div class="upload-label">Upload Handwritten Job Card</div>
                               <div class="upload-hint">PDF, PNG, or JPG · Images auto-compressed to ≤300 KB</div>
                           </div>`;
                    proofSectionHtml = `
                        <div class="jc-proof-section">
                            <div class="jc-proof-section-title">
                                📋 Handwritten Proof
                                <span class="proof-badge">REQUIRED BEFORE SUBMIT</span>
                            </div>
                            ${proofContent}
                            <input type="file" id="proofFileInput_${jc.id}" accept=".pdf,.png,.jpg,.jpeg" style="display:none"
                                   onchange="App.showProofRenameUi('${jc.id}', this)">
                        </div>`;
                }

                let actions = `<button class="btn btn-ghost" onclick="App.closeModal()">Close</button>`;
                if (canMechanic) actions += `<button class="btn btn-primary" onclick="App.saveMechanicWork('${jc.id}')">Save work</button>
                    <button class="btn btn-primary" onclick="App.submitJobCardForApproval('${jc.id}')">Submit for approval</button>`;
                if (role === 'Supervisor' && jc.status === 'Pending-Approval') {
                    actions += `<button class="btn btn-primary" onclick="App.openJobCardPreview('${jc.id}')">Open review</button>`;
                }
                if (jc.status === 'Released') {
                    actions += `<button class="btn btn-ghost" onclick="App.generateJobCardReportById('${jc.id}')">Print report</button>`;
                    if (jc.handwrittenProof) {
                        actions += `<button class="btn btn-handwritten btn-sm" onclick="App.viewHandwrittenProof('${jc.id}')">📋 View Handwritten</button>`;
                    }
                }

                openModal(`
                    <div class="modal-header">
                        <div><div class="modal-name">${jc.id}</div><div class="modal-sub">${formatTruckLabelFromPlate(jc.plate)} · ${xmlEscape(jc.driver)} · ${jc.status}</div></div>
                        <div class="modal-close" onclick="App.closeModal()">✕</div>
                    </div>
                    <div class="modal-body">
                        <div class="section"><div class="section-title">Driver request (initial)</div>${driverHtml || '<p style="color:var(--text3)">No lines</p>'}</div>
                        ${jc.status !== 'Draft' ? `<div class="section"><div class="section-title">Mechanic completion (final)</div><div id="jcMechForm">${mechanicHtml}</div></div>` : ''}
                        ${proofSectionHtml}
                    </div>
                    <div class="modal-actions">${actions}</div>`);
            }
            function syncMechCost(checkbox) {
                const row = checkbox.closest('.jc-line-row');
                const parts = parseFloat(row.querySelector('.jc-m-parts')?.value) || 0;
                const labour = parseFloat(row.querySelector('.jc-m-labour')?.value) || 0;
                /* total shown on save */
            }
            function applyMechRowFromDom(row, m) {
                m.done = row.querySelector('.jc-m-done')?.checked || false;
                m.actualHours = parseFloat(row.querySelector('.jc-m-hours')?.value) || 0;
                m.partsCost = parseFloat(row.querySelector('.jc-m-parts')?.value) || 0;
                m.labourCost = parseFloat(row.querySelector('.jc-m-labour')?.value) || 0;
                m.actualCost = m.partsCost + m.labourCost;
                m.mechanic = row.querySelector('.jc-m-mech')?.value?.trim() || '';
                m.notDoneReason = row.querySelector('.jc-m-reason')?.value?.trim() || '';
                if (m.unplanned) m.name = row.querySelector('.jc-extra-name')?.value?.trim() || m.name || '';
                if (m.done) m.completedAt = new Date().toISOString().split('T')[0];
            }
            function saveMechanicWorkFromDom(jc) {
                document.querySelectorAll('#jcMechForm .jc-line-row').forEach(row => {
                    const lineId = row.dataset.line;
                    const m = jc.mechanicLines.find(x => x.driverLineId === lineId && !x.unplanned);
                    if (!m) return;
                    applyMechRowFromDom(row, m);
                });
                document.querySelectorAll('#jcMechForm .jc-extra-row').forEach(row => {
                    const lineId = row.dataset.extraId;
                    const m = jc.mechanicLines.find(x => x.driverLineId === lineId && x.unplanned);
                    if (!m) return;
                    applyMechRowFromDom(row, m);
                });
            }
            function addMechanicExtraLine(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc || jc.status !== 'In-Progress') return;
                jc.mechanicLines.push({
                    driverLineId: newLineId(),
                    unplanned: true,
                    name: '',
                    done: false,
                    actualHours: 0,
                    partsCost: 0,
                    labourCost: 0,
                    actualCost: 0,
                    mechanic: '',
                    completedAt: null,
                    notDoneReason: ''
                });
                saveAll();
                openJobCardModal(jobCardId);
            }
            function removeMechanicExtraLine(jobCardId, lineId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                jc.mechanicLines = jc.mechanicLines.filter(m => !(m.unplanned && m.driverLineId === lineId));
                saveAll();
                openJobCardModal(jobCardId);
            }
            function saveMechanicWork(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                if (getFgRole() !== 'Mechanic') {
                    showToast('Only mechanics can enter prices and values');
                    return;
                }
                saveMechanicWorkFromDom(jc);
                addAuditLog(jc, 'Mechanic', 'saved work');
                saveAll();
                showToast('Work saved');
            }
            function mechanicLinesComplete(jc) {
                const driverOk = (jc.driverLines || []).every(dl => {
                    const m = (jc.mechanicLines || []).find(x => x.driverLineId === dl.lineId && !x.unplanned);
                    if (!m) return false;
                    return m.done || (m.notDoneReason && m.notDoneReason.trim());
                });
                const extrasOk = (jc.mechanicLines || []).filter(m => m.unplanned).every(m => {
                    if (!m.done) return true;
                    return !!(m.name && m.name.trim());
                });
                return driverOk && extrasOk;
            }
            function submitJobCardToMechanic(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                jc.status = 'In-Progress';
                jc.submittedAt = new Date().toISOString();
                addAuditLog(jc, 'Driver', 'submitted to garage');
                setTruckGarageStatus(jc.plate, true);
                saveAll();
                closeModal();
                renderJobCardsPage();
                showToast('Submitted to mechanics — truck in garage');
            }
            function submitJobCardForApproval(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                if (getFgRole() !== 'Mechanic') {
                    showToast('Only mechanics can submit work for approval');
                    return;
                }
                saveMechanicWorkFromDom(jc);
                if (!mechanicLinesComplete(jc)) {
                    showToast('Complete or explain every service line');
                    return;
                }
                const doneCount = jc.mechanicLines.filter(m => m.done).length;
                if (!doneCount) {
                    showToast('Mark at least one service as completed');
                    return;
                }
                // Gate: handwritten proof is required before submission
                if (!jc.handwrittenProof) {
                    showToast('📋 Please upload the handwritten job card proof before submitting');
                    // Scroll the proof section into view if possible
                    const zone = document.getElementById('proofUploadZone_' + jobCardId);
                    if (zone) zone.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return;
                }
                jc.status = 'Pending-Approval';
                jc.completedAt = new Date().toISOString();
                addAuditLog(jc, 'Mechanic', 'submitted for approval');
                saveAll();
                closeModal();
                renderJobCardsPage();
                showToast('Sent to supervisor for approval');
            }
            function generateJobCardReportById(id) {
                const jc = jobCards.find(j => j.id === id);
                if (jc) generateJobCardReport(jc);
            }
            function downloadJobCardReportById(id) {
                const jc = jobCards.find(j => j.id === id);
                if (!jc) return;
                const html = generateJobCardReportHtml(jc);
                downloadHtmlAsPdf(html, `jobcard-${jc.id}.pdf`);
            }
            function downloadHtmlAsPdf(html, filename) {
                if (!window.html2pdf) {
                    showToast('Loading PDF library...');
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                    script.onload = () => executePdfDownloadHtml(html, filename);
                    document.head.appendChild(script);
                } else {
                    executePdfDownloadHtml(html, filename);
                }
            }
            function downloadHtmlAsPdfBlob(html) {
                return new Promise((resolve, reject) => {
                    const output = () => {
                        try {
                            const options = {
                                margin: [6, 8, 8, 8],
                                image: { type: 'jpeg', quality: 0.98 },
                                html2canvas: { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false },
                                jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
                                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                            };
                            const worker = html2pdf().set(options).from(html);
                            if (worker.outputPdf) {
                                worker.outputPdf('blob').then(resolve).catch(reject);
                            } else if (worker.toPdf) {
                                const pdf = worker.toPdf();
                                if (pdf && pdf.output) {
                                    const blob = pdf.output('blob');
                                    resolve(blob);
                                } else {
                                    reject(new Error('Unable to generate PDF blob'));
                                }
                            } else {
                                reject(new Error('html2pdf blob output not supported'));
                            }
                        } catch (err) {
                            reject(err);
                        }
                    };
                    if (!window.html2pdf) {
                        const script = document.createElement('script');
                        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                        script.onload = output;
                        script.onerror = () => reject(new Error('Unable to load html2pdf'));
                        document.head.appendChild(script);
                    } else {
                        output();
                    }
                });
            }
            function loadPdfLib() {
                if (window.PDFLib) return Promise.resolve(window.PDFLib);
                return new Promise((resolve, reject) => {
                    const script = document.createElement('script');
                    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
                    script.onload = () => resolve(window.PDFLib);
                    script.onerror = () => reject(new Error('Unable to load PDFLib'));
                    document.head.appendChild(script);
                });
            }
            function dataUrlToBlob(dataUrl) {
                const parts = dataUrl.split(',');
                const mimeMatch = parts[0].match(/:(.*?);/);
                const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                const byteString = atob(parts[1]);
                const array = new Uint8Array(byteString.length);
                for (let i = 0; i < byteString.length; i++) array[i] = byteString.charCodeAt(i);
                return new Blob([array], { type: mime });
            }
            async function mergePdfBlobs(blobA, blobB) {
                await loadPdfLib();
                const arrA = await blobA.arrayBuffer();
                const arrB = await blobB.arrayBuffer();
                const mergedPdf = await PDFLib.PDFDocument.create();
                const pdfA = await PDFLib.PDFDocument.load(arrA);
                const pdfB = await PDFLib.PDFDocument.load(arrB);
                const pagesA = await mergedPdf.copyPages(pdfA, pdfA.getPageIndices());
                pagesA.forEach(page => mergedPdf.addPage(page));
                const pagesB = await mergedPdf.copyPages(pdfB, pdfB.getPageIndices());
                pagesB.forEach(page => mergedPdf.addPage(page));
                const mergedBytes = await mergedPdf.save();
                return new Blob([mergedBytes], { type: 'application/pdf' });
            }
            function executePdfDownloadHtml(html, filename) {
                const options = {
                    margin: [6, 8, 8, 8],
                    filename,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2.5, backgroundColor: '#ffffff', useCORS: true, logging: false },
                    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' },
                    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
                };
                html2pdf().set(options).from(html).save();
                showToast('PDF downloaded ✓');
            }
            function openJobCardPreview(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                const isReleased = jc.status === 'Released';
                if (!isReleased && getFgRole() !== 'Supervisor') {
                    showToast('Supervisor role required');
                    return;
                }
                migrateJobCard(jc);
                const t = jcTotals(jc);

                const driverCol = (jc.driverLines || []).map(dl => `
                    <div class="preview-item">
                        <div class="preview-item-name">${xmlEscape(dl.name)}</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:4px">Requested by driver — no pricing</div>
                        ${intervalAlertHtml(jc.plate, dl.name)}
                    </div>`).join('');

                const mechCol = (jc.driverLines || []).map(dl => {
                    const m = (jc.mechanicLines || []).find(x => x.driverLineId === dl.lineId && !x.unplanned) || {};
                    return `<div class="preview-item">
                        <div class="preview-item-name">${xmlEscape(dl.name)} ${m.done ? '✅' : '—'}</div>
                        <div class="preview-item-details">
                            <div class="preview-detail"><div class="preview-detail-label">Hours</div><div class="preview-detail-value">${m.actualHours || 0}</div></div>
                            <div class="preview-detail"><div class="preview-detail-label">Parts</div><div class="preview-detail-value">${formatRwf(m.partsCost || 0)}</div></div>
                            <div class="preview-detail"><div class="preview-detail-label">Labour</div><div class="preview-detail-value">${formatRwf(m.labourCost || 0)}</div></div>
                            <div class="preview-detail"><div class="preview-detail-label">Total</div><div class="preview-detail-value">${formatRwf(m.actualCost || 0)}</div></div>
                        </div>
                        <div style="font-size:10px;color:var(--text3)">${xmlEscape(m.mechanic || '')}</div>
                    </div>`;
                }).join('') + (jc.mechanicLines || []).filter(m => m.unplanned).map(m => `
                    <div class="preview-item" style="border-left:2px solid var(--teal)">
                        <div class="preview-item-name">${xmlEscape(m.name || 'Extra work')} ${m.done ? '✅' : '—'} <span style="color:var(--teal);font-size:9px">EXTRA</span></div>
                        <div class="preview-item-details">
                            <div class="preview-detail"><div class="preview-detail-label">Hours</div><div class="preview-detail-value">${m.actualHours || 0}</div></div>
                            <div class="preview-detail"><div class="preview-detail-label">Parts</div><div class="preview-detail-value">${formatRwf(m.partsCost || 0)}</div></div>
                            <div class="preview-detail"><div class="preview-detail-label">Labour</div><div class="preview-detail-value">${formatRwf(m.labourCost || 0)}</div></div>
                            <div class="preview-detail"><div class="preview-detail-label">Total</div><div class="preview-detail-value">${formatRwf(m.actualCost || 0)}</div></div>
                        </div>
                    </div>`).join('');

                // Compact proof badge (no embedded preview — that lives in the combined preview window)
                const proof = jc.handwrittenProof;
                let proofBadgeHtml = '';
                if (proof) {
                    const isPdf = proof.type === 'application/pdf';
                    const proofIcon = isPdf ? '📄' : '🖼️';
                    proofBadgeHtml = `
                        <div class="jc-proof-compact">
                            <span class="jc-proof-compact-icon">${proofIcon}</span>
                            <div class="jc-proof-compact-info">
                                <div class="jc-proof-compact-name">${xmlEscape(proof.name)}</div>
                                <div class="jc-proof-compact-meta">${isPdf ? 'PDF' : 'Image'} &nbsp;·&nbsp; ${fmtBytes(proof.size)} &nbsp;·&nbsp; Uploaded ${xmlEscape(proof.uploadedAt || '')}</div>
                            </div>
                            <button class="btn btn-ghost btn-xs" onclick="App.viewHandwrittenProof('${jc.id}')">👁 Full View</button>
                        </div>`;
                } else {
                    proofBadgeHtml = `<div class="jc-proof-missing" style="margin-top:16px">⚠️ No handwritten proof was uploaded with this job card.</div>`;
                }

                openModal(`
                    <div class="modal-header">
                        <div><div class="modal-name">Review ${jc.id}</div><div class="modal-sub">${formatTruckLabelFromPlate(jc.plate || '')} · ${xmlEscape(jc.driver || '')}</div></div>
                        <div class="modal-close" onclick="App.closeModal()">✕</div>
                    </div>
                    <div class="modal-body">
                        <div class="preview-grid">
                            <div class="preview-column">
                                <div class="preview-column-title">Initial (Driver)</div>
                                ${driverCol}
                                <div class="preview-summary">
                                    <div class="preview-summary-row"><span class="preview-summary-label">Services</span><span class="preview-summary-value">${(jc.driverLines || []).length}</span></div>
                                </div>
                            </div>
                            <div class="preview-column">
                                <div class="preview-column-title">Final (Mechanic)</div>
                                ${mechCol}
                                <div class="preview-summary">
                                    <div class="preview-summary-row"><span class="preview-summary-label">Total hours</span><span class="preview-summary-value">${t.actH.toFixed(1)}</span></div>
                                    <div class="preview-summary-row"><span class="preview-summary-label">Total parts</span><span class="preview-summary-value">${formatRwf(t.actP)}</span></div>
                                    <div class="preview-summary-row"><span class="preview-summary-label">Total labour</span><span class="preview-summary-value">${formatRwf(t.actL)}</span></div>
                                    <div class="preview-summary-row"><span class="preview-summary-label">Total cost</span><span class="preview-summary-value">${formatRwf(t.actC)}</span></div>
                                </div>
                            </div>
                        </div>
                        ${proofBadgeHtml}
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-ghost" onclick="App.closeModal()">Close</button>
                        <div class="modal-dropdown">
                            <button class="btn btn-ghost btn-sm modal-dropdown-toggle" type="button" onclick="App.togglePreviewDropdown(this)">👁 Preview ▾</button>
                            <div class="modal-dropdown-menu">
                                <button type="button" class="dropdown-item" onclick="App.openPreviewChoice('${jc.id}','digital')">Digital job card</button>
                                <button type="button" class="dropdown-item ${proof ? '' : 'disabled'}" onclick="App.openPreviewChoice('${jc.id}','handwritten')">Uploaded proof</button>
                                <button type="button" class="dropdown-item" onclick="App.openPreviewChoice('${jc.id}','combined')">Both combined</button>
                            </div>
                        </div>
                        <div class="modal-dropdown">
                            <button class="btn btn-ghost btn-sm modal-dropdown-toggle" type="button" onclick="App.togglePreviewDropdown(this)">⬇ Download ▾</button>
                            <div class="modal-dropdown-menu">
                                <button type="button" class="dropdown-item" onclick="App.openDownloadChoice('${jc.id}','digital')">Digital job card</button>
                                <button type="button" class="dropdown-item ${proof ? '' : 'disabled'}" onclick="App.openDownloadChoice('${jc.id}','handwritten')">Handwritten proof</button>
                                <button type="button" class="dropdown-item" onclick="App.openDownloadChoice('${jc.id}','combined')">Combined PDF</button>
                            </div>
                        </div>
                        ${isReleased ? '' : `<button class="btn btn-danger" onclick="App.rejectJobCard('${jc.id}')">Reject</button>
                        <button class="btn btn-primary" onclick="App.approveJobCard('${jc.id}')">Approve &amp; release truck</button>`}
                    </div>`);
            }

            /**
             * Opens a new browser tab showing the full digital job card report
             * followed by the full handwritten proof — both fully readable.
             * The supervisor can print (Ctrl+P) this combined view to get a paper copy.
             */
            function openPreviewChoice(jobCardId, type) {
                if (type === 'digital') {
                    App.openDigitalJobCardPreview(jobCardId);
                } else if (type === 'handwritten') {
                    App.viewHandwrittenProof(jobCardId);
                } else if (type === 'combined') {
                    App.openCombinedPreview(jobCardId);
                }
                App.closeDropdownMenus();
            }

            function openDownloadChoice(jobCardId, type) {
                if (type === 'digital') {
                    App.downloadJobCardReportById(jobCardId);
                } else if (type === 'handwritten') {
                    App.downloadHandwrittenJobCard(jobCardId);
                } else if (type === 'combined') {
                    App.downloadCombinedJobCard(jobCardId);
                }
                App.closeDropdownMenus();
            }

            function togglePreviewDropdown(button) {
                const menu = button.nextElementSibling;
                if (!menu) return;
                const shown = menu.style.display === 'flex';
                App.closeDropdownMenus();
                if (shown) return; // was open, now closed — done

                // Measure available space above and below the button
                const rect = button.getBoundingClientRect();
                const spaceBelow = window.innerHeight - rect.bottom;
                const spaceAbove = rect.top;
                const menuHeight = 160; // approx menu height (3 items × ~52px)

                // Choose direction: prefer upward (cleaner for bottom action bars),
                // but fall back to downward if there isn't enough room above
                const goUp = spaceAbove >= menuHeight || spaceAbove >= spaceBelow;
                menu.classList.remove('open-upward', 'open-downward');
                menu.classList.add(goUp ? 'open-upward' : 'open-downward');
                menu.style.display = 'flex';

                // Scroll the button into view so the dropdown is fully visible,
                // but only if the menu would otherwise be clipped
                if (goUp && spaceAbove < menuHeight + 16) {
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else if (!goUp && spaceBelow < menuHeight + 16) {
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }

            function closeDropdownMenus() {
                document.querySelectorAll('.modal-dropdown-menu').forEach(menu => {
                    menu.style.display = 'none';
                    menu.classList.remove('open-upward', 'open-downward');
                });
            }

            function openDigitalJobCardPreview(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job Card — ${jc.id}</title>
<style>
  body { margin: 0; background: #e2e8f0; font-family: 'Segoe UI', Arial, sans-serif; color: #111; padding: 30px 0; }
  .sheet { max-width: 800px; margin: 0 auto; background: #fff; box-shadow: 0 4px 16px rgba(0,0,0,0.12); position: relative; overflow: hidden; min-height: 1123px; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 10px; max-width: 800px; margin: 0 auto 16px auto; }
  .toolbar button { border: none; background: #c0141c; color: #fff; border-radius: 8px; padding: 10px 20px; font-size: 13px; font-weight: 700; cursor: pointer; letter-spacing: 0.03em; }
  .toolbar button:hover { background: #9b0f15; }
  @media print {
    body { background: #fff !important; padding: 0 !important; }
    .toolbar { display: none !important; }
    .sheet { box-shadow: none !important; max-width: 100% !important; min-height: auto !important; }
  }
</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">🖨 Print</button></div>
<div class="sheet">
  ${generateJobCardReportHtml(jc)}
</div>
</body>
</html>`;
                const win = window.open('', '_blank');
                if (!win) { showToast('Pop-up blocked — please allow pop-ups for this site'); return; }
                win.document.write(html);
                win.document.close();
                try {
                    const printBtn = win.document.querySelector('.toolbar button');
                    if (printBtn) printBtn.onclick = () => win.print();
                } catch (e) { /* cross-origin guard */ }
            }

            function openCombinedPreview(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                const digitalHtml = generateJobCardReportHtml(jc);
                const proof = jc.handwrittenProof;

                let proofSection = '';
                if (proof) {
                    const isPdf = proof.type === 'application/pdf';
                    const proofContent = isPdf
                        ? `<iframe src="${proof.data}" title="Handwritten proof" class="proof-frame"></iframe>`
                        : `<img src="${proof.data}" alt="Handwritten job card" class="proof-image">`;
                    proofSection = `
                        <section style="padding:32px 24px;background:#fff;max-width:1100px;margin:24px auto;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,0.08)">
                            <header style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:24px">
                                <div>
                                    <h2 style="margin:0 0 8px;font-size:22px;color:#c62828">Handwritten Job Card Proof</h2>
                                    <p style="margin:0;color:#555;font-size:14px">${xmlEscape(proof.name)} · ${fmtBytes(proof.size)} · Uploaded ${xmlEscape(proof.uploadedAt || '')}</p>
                                </div>
                                <div style="text-align:right;color:#666;font-size:13px">${xmlEscape(jc.id)}<br>${formatTruckLabelFromPlate(jc.plate)}</div>
                            </header>
                            <div>${proofContent}</div>
                        </section>`;
                } else {
                    proofSection = `
                        <section style="padding:32px 24px;background:#fff;max-width:1100px;margin:24px auto;border-radius:14px;box-shadow:0 16px 40px rgba(0,0,0,0.08);text-align:center;color:#666">
                            <h2 style="margin:0 0 16px;font-size:20px">No handwritten proof attached</h2>
                            <p style="margin:0;font-size:14px">This job card does not include an uploaded handwritten proof file.</p>
                        </section>`;
                }

                const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Combined Preview — ${xmlEscape(jc.id)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html { min-height: 100%; }
  body { margin: 0; min-height: 100vh; background: #f1f5f9; color: #111; font-family: Inter, Arial, sans-serif; }
  a { color: #1a73e8; }
  a:hover { text-decoration: underline; }
  .page-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #1e293b;
    border-bottom: 2px solid #334155;
    box-shadow: 0 2px 12px rgba(0,0,0,0.25);
    padding: 14px 28px;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
  }
  .page-header-text { flex: 1; }
  .page-title { margin: 0 0 2px; font-size: 16px; color: #f1f5f9; font-weight: 700; }
  .page-subtitle { margin: 0; color: #94a3b8; font-size: 12px; }
  .section-label { display: inline-flex; align-items: center; gap: 10px; padding: 7px 14px; border-radius: 999px; background: #1a237e; color: #fff; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 14px; }
  .content-wrap { max-width: 1100px; margin: 0 auto; padding: 28px 24px; }
  .full-section { background:#fff; padding: 32px; border-radius: 14px; box-shadow: 0 8px 32px rgba(15,23,42,0.08); margin-bottom: 28px; }
  .proof-frame { width: 100%; min-height: 80vh; border: none; border-radius: 10px; display: block; background: #fff; }
  .proof-image { width: 100%; max-width: 100%; display: block; margin: 0 auto; border-radius: 10px; object-fit: contain; }
</style>
</head>
<body>
<div class="page-header">
  <div class="page-header-text">
    <h1 class="page-title">Combined Job Card — ${xmlEscape(jc.id)}</h1>
    <p class="page-subtitle">${formatTruckLabelFromPlate(jc.plate)} &nbsp;·&nbsp; ${xmlEscape(jc.driver)}</p>
  </div>
</div>
<div class="content-wrap">
  <section class="full-section">
    <div class="section-label">Digital Job Card</div>
    ${digitalHtml}
  </section>
  <section class="full-section">
    <div class="section-label">Handwritten Proof</div>
    ${proofSection}
  </section>
</div>
</body>
</html>`;

                const win = window.open('', '_blank');
                if (!win) { showToast('Pop-up blocked — please allow pop-ups for this site'); return; }
                win.document.write(fullHtml);
                win.document.close();
            }

            /**
             * Downloads both documents as a single combined PDF.
             * - Image proofs: merged inline into one html2pdf render (single file).
             * - PDF proofs:   generates digital PDF then downloads the proof PDF separately,
             *                 and opens the combined preview so the user can print-to-PDF.
             */
            async function downloadCombinedJobCard(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) {
                    showToast('Job card not found');
                    return;
                }
                const proof = jc.handwrittenProof;

                if (!proof) {
                    // No proof — just download the digital card
                    downloadJobCardReportById(jobCardId);
                    return;
                }

                const isPdf = proof.type === 'application/pdf';

                if (!isPdf) {
                    const digitalHtml = generateJobCardReportHtml(jc);
                    const combinedHtml = `
                        ${digitalHtml}
                        <div style="padding:32px 24px;font-family:Arial,sans-serif;color:#111;background:#fff;">
                            <div style="border-bottom:3px solid #c62828;padding-bottom:12px;margin-bottom:24px">
                                <h2 style="margin:0;color:#c62828;font-size:18px">HANDWRITTEN JOB CARD PROOF</h2>
                                <p style="margin:6px 0 0;color:#555;font-size:11px">${xmlEscape(proof.name)} · ${fmtBytes(proof.size)} · Uploaded ${xmlEscape(proof.uploadedAt || '')}</p>
                            </div>
                            <img src="${proof.data}" alt="Handwritten proof"
                                 style="width:100%;max-width:1000px;display:block;margin:0 auto;object-fit:contain;border:1px solid #ddd;border-radius:8px">
                        </div>`;
                    showToast('Generating combined PDF…');
                    downloadHtmlAsPdf(combinedHtml, `jobcard-${jc.id}-combined.pdf`);
                    return;
                }

                showToast('Generating combined PDF...');
                try {
                    const digitalHtml = generateJobCardReportHtml(jc);
                    const digitalBlob = await downloadHtmlAsPdfBlob(digitalHtml);
                    const proofBlob = dataUrlToBlob(proof.data);
                    const mergedBlob = await mergePdfBlobs(digitalBlob, proofBlob);
                    const fileName = `jobcard-${jc.id}-combined.pdf`;
                    const url = URL.createObjectURL(mergedBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = fileName;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 15000);
                    showToast('Combined PDF downloaded ✓');
                } catch (err) {
                    console.error('Combined PDF generation failed:', err);
                    showToast('Failed to create combined PDF. Downloading digital job card instead.');
                    downloadJobCardReportById(jobCardId);
                }
            }

            async function approveJobCard(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc || getFgRole() !== 'Supervisor') return;
                if (!await requireAdminPin('Enter admin PIN to approve and release this job card')) return;
                jc.status = 'Released';
                jc.approvedAt = new Date().toISOString();
                jc.releasedAt = jc.approvedAt;
                jc.approvedBy = 'Supervisor';
                addAuditLog(jc, 'Supervisor', 'approved and released');
                const trk = trucks.find(t => t.plate === jc.plate);
                if (trk) {
                    if (!trk.lastServices) trk.lastServices = {};
                    if (!trk.maintenanceLog) trk.maintenanceLog = [];
                    (jc.mechanicLines || []).filter(m => m.done).forEach(m => {
                        const dl = (jc.driverLines || []).find(d => d.lineId === m.driverLineId);
                        const name = dl?.name || 'Service';
                        const d = m.completedAt || jc.releasedAt.split('T')[0];
                        trk.lastServices[name] = d;
                        trk.maintenanceLog.push({
                            date: d, service: name, jobCardId: jc.id,
                            cost: m.actualCost, mechanic: m.mechanic
                        });
                    });
                }
                setTruckGarageStatus(jc.plate, false);
                saveAll();
                closeModal();
                renderJobCardsPage();
                showToast(`Truck ${jc.plate} released from garage`);
            }
            function rejectJobCard(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                jc.status = 'In-Progress';
                addAuditLog(jc, 'Supervisor', 'rejected — returned to mechanic');
                saveAll();
                closeModal();
                renderJobCardsPage();
                showToast('Returned to mechanic');
            }
            function deleteJobCard(jobCardId) {
                const jc = jobCards.find(j => j.id === jobCardId);
                if (!jc) return;
                if (!confirm(`Move job card "${jc.id}" to Recycling Bin?`)) return;
                sendToRecycleBin('jobcard', `Job Card ${jc.id} (${jc.plate || 'Vehicle'})`, jc);
                jobCards = jobCards.filter(j => j.id !== jobCardId);
                saveAll();
                renderJobCardsPage();
                showToast('Job card moved to Recycling Bin');
            }
            function passesHistoryPeriod(jc, period) {
                const d = jcApprovalTimestamp(jc).slice(0, 10);
                if (!d) return period === 'recent';
                const now = new Date();
                const dt = new Date(d + 'T12:00:00');
                if (period === 'recent') return true;
                if (period === 'date') return d === now.toISOString().slice(0, 10);
                if (period === 'week') {
                    const weekAgo = new Date(now);
                    weekAgo.setDate(weekAgo.getDate() - 7);
                    return dt >= weekAgo;
                }
                if (period === 'month') return d.slice(0, 7) === now.toISOString().slice(0, 7);
                return true;
            }
            function renderJcHistory() {
                const search = (document.getElementById('historySearch')?.value || '').toLowerCase();
                const truckFilter = document.getElementById('historyTruckFilter')?.value || '';
                const period = document.getElementById('historyPeriodFilter')?.value || 'recent';
                let filtered = jobCards.filter(jc => isSupervisorApproved(jc));
                filtered = filtered.filter(jc => {
                    const ms = !search || jc.id.toLowerCase().includes(search) || (jc.plate || '').toLowerCase().includes(search) || (getTrailerForPlate(jc.plate) || '').toLowerCase().includes(search) || (jc.driver || '').toLowerCase().includes(search);
                    const mt = !truckFilter || jc.plate === truckFilter;
                    return ms && mt && passesHistoryPeriod(jc, period);
                });
                filtered.sort((a, b) => jcApprovalTimestamp(b).localeCompare(jcApprovalTimestamp(a)));
                const container = document.getElementById('jobCardHistoryList');
                if (!container) return;
                if (!filtered.length) {
                    container.innerHTML = '<div class="empty-state"><div class="e-icon">📑</div><p>No approved job cards in this period.</p></div>';
                    return;
                }
                container.innerHTML = filtered.map(jc => {
                    const t = jcTotals(jc);
                    const approvedOn = jcApprovalTimestamp(jc).slice(0, 10);
                    const hasProof = !!jc.handwrittenProof;
                    return `<div class="rpt-panel-box" style="margin-bottom:14px">
                        <div class="rpt-panel-header"><span>${jc.id} · ${formatTruckLabelFromPlate(jc.plate || '')} · Approved ${approvedOn}</span>
                            <span style="color:var(--green)">${formatRwf(t.actC)}</span></div>
                        <div style="padding:14px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">
                            <button class="btn btn-sm btn-ghost" onclick="App.openJobCardPreview('${jc.id}')">View</button>
                            <button class="btn btn-sm btn-ghost" onclick="App.generateJobCardReportById('${jc.id}')">Print</button>
                            <button class="btn btn-sm btn-ghost" onclick="App.exportJobCardCsv('${jc.id}')">CSV</button>
                            ${hasProof ? `<button class="btn btn-sm btn-handwritten" onclick="App.viewHandwrittenProof('${jc.id}')">📋 View Handwritten Job Card</button>` : '<span style="font-size:11px;color:var(--text3);padding:4px 0">No handwritten proof</span>'}
                        </div>
                    </div>`;
                }).join('');
            }
            function generateJobCardReportHtml(jc) {
                migrateJobCard(jc);
                const t = jcTotals(jc);
                const trk = trucks.find(x => x.plate === jc.plate);
                const driverRows = (jc.driverLines || []).map(dl => {
                    const hist = findLastServiceFromHistory(jc.plate, dl.name);
                    return `<tr>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;font-size:12px">${xmlEscape(dl.name)}</td>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;font-size:11px;color:#475569">${hist ? hist.date + (hist.jobCardId ? ' (' + hist.jobCardId + ')' : '') : 'Never'}</td>
                    </tr>`;
                }).join('');
                const mechRows = (jc.mechanicLines || []).filter(m => m.done).map(m => {
                    const dl = (jc.driverLines || []).find(d => d.lineId === m.driverLineId);
                    const label = m.unplanned ? (m.name || 'Extra work') : (dl?.name || 'Service');
                    return `<tr>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;font-size:12px">${xmlEscape(label)}${m.unplanned ? ' <span style="color:#0d9488">(extra)</span>' : ''}</td>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:center;font-size:12px">${m.actualHours || '—'}</td>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:right;font-size:12px">${formatRwf(m.partsCost || 0)}</td>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:right;font-size:12px">${formatRwf(m.labourCost || 0)}</td>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:right;font-size:12px;font-weight:600">${formatRwf(m.actualCost || 0)}</td>
                        <td style="border:1px solid #cbd5e1;padding:7px 10px;font-size:12px">${xmlEscape(m.mechanic || '')}</td>
                    </tr>`;
                }).join('');
                const _jcLogoUri = 'images/3 rag.jpeg';
                const _wmUri = 'images/3 rag.jpeg';
                const approvalDate = jc.approvedAt ? jc.approvedAt.split('T')[0] : (jc.createdAt ? jc.createdAt.split('T')[0] : '');
                return `<div style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;width:100%;max-width:800px;margin:0 auto;padding:0;background:#fff;color:#0f172a;box-sizing:border-box;position:relative;overflow:hidden;">

                    <!-- ===== LETTERHEAD ===== -->
                    <div style="position:relative;">
                        <!-- Red top bar -->
                        <div style="height:16px;background:#ec0000;width:100%;"></div>
                        <!-- Black wave -->
                        <svg style="display:block;width:100%;height:34px;" viewBox="0 0 1000 40" preserveAspectRatio="none">
                            <path d="M0,0 L1000,0 L1000,14 C820,38 680,6 520,20 C360,34 200,4 0,18 Z" fill="#000000"></path>
                        </svg>
                        <!-- Logo + Company + Contact -->
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:6px 24px 14px 24px;">
                            <img src="${_jcLogoUri}" alt="3RAG Logo" style="height:90px;width:auto;flex-shrink:0;">
                            <div style="flex:1;text-align:center;">
                                <div style="margin:0 0 4px 0;font-size:24px;font-weight:800;color:#ec0000;letter-spacing:0.01em;">3 RAG company LTD</div>
                                <div style="margin:0;font-size:11px;font-weight:700;color:#000000;letter-spacing:0.06em;text-transform:uppercase;">Maintenance &nbsp;-&nbsp; Job Card</div>
                            </div>
                            <div style="text-align:right;font-size:11px;font-weight:700;color:#000000;line-height:1.5;flex-shrink:0;white-space:nowrap;">
                                POBOX : 6578 KIGALI-RWANDA<br>
                                Tel: 0784 037 906, 0788 528 795<br>
                                Email: 3rag@robert.com<br>
                                Web: www.3rag.com
                            </div>
                        </div>
                        <!-- Black divider -->
                        <div style="height:5px;background:#000000;width:100%;"></div>
                    </div>

                    <!-- ===== WATERMARK ===== -->
                    <img src="${_wmUri}" alt="" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;opacity:0.10;z-index:0;pointer-events:none;">

                    <!-- ===== BODY ===== -->
                    <div style="position:relative;z-index:1;padding:16px 20px;">

                        <!-- Summary row -->
                        <div style="padding-bottom:10px;margin-bottom:14px;text-align:center;">
                            <p style="margin:0;font-size:13px;color:#334155;font-weight:600;">${xmlEscape(jc.id)}&nbsp;&middot;&nbsp;${formatTruckLabelFromPlate(jc.plate)}${trk?.model ? ' &middot; ' + xmlEscape(trk.model) : ''}${approvalDate ? '&nbsp;&middot;&nbsp;Date: ' + approvalDate : ''}</p>
                        </div>

                        <!-- Info block -->
                        <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;background:#f8fafc;padding:10px 14px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:14px;font-size:12px;">
                            <div><strong>Truck:</strong> ${formatTruckLabelFromPlate(jc.plate)}${trk?.model ? ' &middot; ' + xmlEscape(trk.model) : ''} &nbsp;&middot;&nbsp; <strong>Health:</strong> ${trk ? healthScore(trk) + '%' : 'N/A'}</div>
                            <div><strong>Driver:</strong> ${xmlEscape(jc.driver)} &nbsp;&middot;&nbsp; <strong>Approved By:</strong> ${xmlEscape(jc.approvedBy || 'Supervisor')}</div>
                        </div>

                        <!-- Section 1 -->
                        <h3 style="margin:12px 0 6px 0;font-size:13px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.03em;">1. Driver Service Requests</h3>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
                            <thead>
                                <tr style="background:#f1f5f9;font-size:11px;text-transform:uppercase;color:#334155;">
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">Service Requested</th>
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">Prior Service Record</th>
                                </tr>
                            </thead>
                            <tbody>${driverRows || '<tr><td colspan="2" style="padding:8px;text-align:center;color:#94a3b8;">&mdash; No driver lines &mdash;</td></tr>'}</tbody>
                        </table>

                        <!-- Section 2 -->
                        <h3 style="margin:14px 0 6px 0;font-size:13px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:0.03em;">2. Mechanic Completion &amp; Expenses (RWF)</h3>
                        <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                            <thead>
                                <tr style="background:#f1f5f9;font-size:11px;text-transform:uppercase;color:#334155;">
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">Service</th>
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:center;">Hours</th>
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">Parts (RWF)</th>
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">Labour (RWF)</th>
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:right;">Total (RWF)</th>
                                    <th style="border:1px solid #cbd5e1;padding:6px 10px;text-align:left;">Mechanic</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${mechRows || '<tr><td colspan="6" style="padding:8px;text-align:center;color:#94a3b8;">&mdash; No completed lines &mdash;</td></tr>'}
                                <tr style="font-weight:700;background:#f8fafc;">
                                    <td style="border:1px solid #cbd5e1;padding:7px 10px;font-size:12px;">TOTAL</td>
                                    <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:center;font-size:12px;">${t.actH.toFixed(1)}</td>
                                    <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:right;font-size:12px;">${formatRwf(t.actP)}</td>
                                    <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:right;font-size:12px;">${formatRwf(t.actL)}</td>
                                    <td style="border:1px solid #cbd5e1;padding:7px 10px;text-align:right;font-size:12px;color:#0f172a;">${formatRwf(t.actC)}</td>
                                    <td style="border:1px solid #cbd5e1;padding:7px 10px;"></td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- Signatures -->
                        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-top:28px;text-align:center;font-size:11px;color:#475569;">
                            <div>____________________<br><strong style="color:#0f172a;">Driver Signature</strong></div>
                            <div>____________________<br><strong style="color:#0f172a;">Mechanic Signature</strong></div>
                            <div>____________________<br><strong style="color:#0f172a;">Supervisor Signature</strong></div>
                        </div>

                    </div>
                </div>`;
            }
            function generateJobCardReport(jc) {
                if (!jc) return;
                const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${jc.id}</title><style>body{margin:0;padding:0;background:#fff;font-family:'Segoe UI',Arial,sans-serif;}@media print{body{margin:0;padding:0;}}</style></head><body>${generateJobCardReportHtml(jc)}</body></html>`;
                const win = window.open('', '_blank');
                if (!win) { showToast('Pop-up blocked — allow pop-ups to print'); return; }
                win.document.write(html);
                win.document.close();
                win.print();
            }
            function downloadJobCardReport() {
                const search = (document.getElementById('historySearch')?.value || '').toLowerCase();
                const truckFilter = document.getElementById('historyTruckFilter')?.value || '';
                let filtered = jobCards.filter(jc => isSupervisorApproved(jc));
                filtered = filtered.filter(jc => {
                    const ms = !search || jc.id.toLowerCase().includes(search) || (jc.plate || '').toLowerCase().includes(search) || (getTrailerForPlate(jc.plate) || '').toLowerCase().includes(search);
                    return ms && (!truckFilter || jc.plate === truckFilter);
                });
                filtered.sort((a, b) => jcApprovalTimestamp(b).localeCompare(jcApprovalTimestamp(a)));
                if (!filtered.length) { showToast('No released job cards to print'); return; }
                const body = filtered.map(jc => generateJobCardReportHtml(jc)).join('<div style="page-break-after:always"></div>');
                const win = window.open('', '_blank');
                if (!win) { showToast('Pop-up blocked — allow pop-ups to print'); return; }
                win.document.write('<!DOCTYPE html><html><body>' + body + '</body></html>');
                win.document.close();
                win.print();
            }
            function exportJobCardCsv(singleId) {
                let list = jobCards.filter(jc => isSupervisorApproved(jc));
                if (singleId) list = list.filter(j => j.id === singleId);
                list.sort((a, b) => jcApprovalTimestamp(b).localeCompare(jcApprovalTimestamp(a)));
                if (!list.length) { showToast('No data'); return; }
                const rows = [['JobCardID', 'ApprovedDate', 'Plate', 'Driver', 'Service', 'PartsCostRWF', 'LabourCostRWF', 'TotalCostRWF', 'Hours', 'Mechanic', 'Extra', 'PriorServiceDate', 'PriorJobCard']];
                list.forEach(jc => {
                    migrateJobCard(jc);
                    (jc.mechanicLines || []).filter(m => m.done).forEach(m => {
                        const dl = (jc.driverLines || []).find(d => d.lineId === m.driverLineId);
                        const name = m.unplanned ? (m.name || 'Extra work') : (dl?.name || 'Service');
                        const hist = findLastServiceFromHistory(jc.plate, name);
                        rows.push([
                            jc.id, jcApprovalTimestamp(jc).slice(0, 10), jc.plate, jc.driver, name,
                            m.partsCost || 0, m.labourCost || 0, m.actualCost || 0, m.actualHours || 0, m.mechanic || '',
                            m.unplanned ? 'Yes' : 'No',
                            hist?.date || '', hist?.jobCardId || ''
                        ]);
                    });
                });
                const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = singleId ? `jobcard-${singleId}.csv` : `jobcards-finance-${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                showToast('CSV downloaded');
            }

            return {
                showPage, openModal, closeModal, closeModalClick,
                renderDriverCards, openDriverModal, changeDriverPage, changeDriverStatus,
                showDriverEditPen, openDriverEditForm, saveDriverEditForm,
                openViolationDetailModal, openTripsDetailModal, openWarningsDetailModal,
                openSuspensionsDetailModal, openAccidentsDetailModal, openLossesDetailModal,
                removeFromList, addTripItem, addWarningItem, addSuspensionItem, addAccidentItem, addLossItem, editLossItem,
                showAddViolationForm, autoSetSeverity, addViolationFromForm, removeViolation,
                showEditViolationForm, saveEditedViolation, applyCustomDateFilter,
                updateDriverField,
                openDriverAddForm, createDriverFromForm, deleteDriver, editDriverCustom, editDriverCustomField,
                openTrainingDetailModal, addTrainingItem, removeTrainingItem,
                renderTruckCards, openTruckModal, addTruckForm, createTruckFromForm, deleteTruck,
                addDocToTruck, updateDocExpiry, removeDocFromTruck, addIssue, removeIssue, editTruckCustom,
                updateTruckStatus, updateTruckTrailer,
                handleTrailerSelectChange, saveTrailerAssignment, deleteTrailerFromFleet, unassignTrailer,
                editTruckEssentialDetails, saveTruckEssentialDetails, cancelEditTruckEssentialDetails,
                renderViolationList, openAddViolationModal, selectAddViolationDriver, changeViolationPage,
                renameAccidentFileAt,
                handleAccidentPeriodFilter, handleAccidentDateFilter,
                renderSettings, saveSettings, updateTheme, applyTheme, addDriverStatus, removeDriverStatus,
                addViolationType, removeViolationType, addDocType, removeDocType,
                addCustomField, removeCustomField, renderMaintenanceServices, addMaintenanceService, removeMaintenanceService, applySelectedServicesToTruck,
                switchViolationSubpage, renderViolationSubpage, renderAccidentsSubpage, openAddAccidentModal, syncAccidentDriverSelection, handleAccidentFileSelection, handleAccidentVideoSelection, updateAccidentFilesDisplay, removeAccidentFileAt, saveAccidentFromForm, previewAccidentAttachment, downloadAccidentAttachment, deleteAccidentEntry,
                openEditAccidentModal, syncEditAccidentDriverSelection, renderEditAccidentExistingFiles, removeEditAccidentExistingFileAt, updateEditAccidentFilesDisplay, removeEditAccidentFileAt, handleEditAccidentFileSelection, handleEditAccidentVideoSelection, saveEditAccidentForm,
                renderHscPolicies, openAddHscPolicy, saveHscPolicyFromForm, handlePolicyPdfSelect, viewPolicyPdf, downloadPolicyPdf, commitHscPolicy, deleteHscPolicy,
                switchHscSubpage, setHscMeetingsFilter, openAddHscMeeting, handleMeetingPdfSelect, handleMeetingFileSelect, updateMeetingFilesDisplay, renameMeetingFileAt, removeMeetingFileAt, saveHscMeetingFromForm, viewMeetingPdf, downloadMeetingPdf, deleteHscMeeting, openHscMeetingDetailModal, previewMeetingAttachment, downloadMeetingAttachment,
                populateOrderClientFilter, renderOrders, openAddOrderModal, createOrderFromForm,
                updateOrderStatus, deleteOrder, setOrderStatusFilter, handleOrderDateFilter,
                openOrderDetailsModal, updateOrderTruckStatus, switchOrderTruckForm, confirmSwitchTruck,
                addTruckToOrderForm, confirmAddTruck,
                syncPickerFromInput, syncPickerFromCheckbox, updatePickerCount, getPickerPlates, buildTruckPickerHtml, toggleTruckPickerRow,
                handleSettingsFileUpload,
                openImportUpdatesModal, downloadImportTemplate, processImportUpdates,
                openBulkAttachmentImportModal, handleBulkAttachmentImportFiles, processBulkAttachmentImport,
                exportDriverData, exportTruckData,
                exportAllData, importAllData, resetAllData, loadDemoData,
                handleAdminPin, toggleSettingsLock, restoreFromBackup,
                handleDriverFileUpload, handleTruckFileUpload, deleteAttachment, previewAttachment, downloadAttachment,
                renderReports, switchReportCategory, toggleReportCard, onReportCheckChange, toggleAllReports, generateReport, printReport, downloadReport, quickReport,
                setReportPeriodPreset, populateJcReportServiceFilter,
                handleReportLogoUpload, clearReportLogo, filterDriverList, toggleAllDrivers, updateDriverSelectionCount, onDriverCheckChange,
                filterTruckList, toggleAllTrucks, updateTruckSelectionCount, onTruckCheckChange,
                renameAttachment,
                scrollToViolationCard,
                refreshAllViews, refreshFromFirebase, isDataReady: () => dataReady,
                setFgRole, loadUserRoleFromFirebase, setJcStatusFilter, setJcPageTab, setJcMetricsPeriod, renderJobCardsPage, startJobCardForTruck,
                openCreateJobCardModal, openEditJobCardModal, updateJobCard, updateJobCardAndSubmit,
                addJobCardLineRow, onJcLineServiceChange, saveJobCard,
                openJobCardModal, saveMechanicWork, addMechanicExtraLine, removeMechanicExtraLine, syncMechCost,
                submitJobCardToMechanic, submitJobCardForApproval, openJobCardPreview, approveJobCard, rejectJobCard, deleteJobCard,
                renderJcKanban, scrollJcCarousel, renderJcHistory, downloadJobCardReport, generateJobCardReport, generateJobCardReportById, downloadJobCardReportById, exportJobCardCsv,
                uploadHandwrittenProof, showProofRenameUi, confirmProofUpload, cancelProofRename,
                viewHandwrittenProof, downloadHandwrittenJobCard, downloadBothJobCardFiles,
                openDigitalJobCardPreview, openPreviewChoice, openDownloadChoice, togglePreviewDropdown, closeDropdownMenus,
                openCombinedPreview, downloadCombinedJobCard,
                init, showToast,
                openTruckAssignmentDrawer, closeTruckAssignmentDrawer, closeDrawerClick,
                handleDrawerDriverChange, handleDrawerTruckChange, handleDrawerTruckSearch, handleDrawerSwapChange,
                renderTruckAssignmentDrawer, confirmTruckAssignment, deleteReassignmentLog,
                openDriverModalFromAnyPage,
                pushModal,
                setTruckSubTab,
                renderTrailerMetrics, renderTrailerCards, openTrailerModal,
                addTrailerForm, createTrailerFromForm, deleteTrailer, updateTrailerStatus,
                addDocToTrailer, updateTrailerDocExpiry, removeDocFromTrailer,
                addTrailerIssue, removeTrailerIssue,
                handleTrailerFileUpload, renameTrailerAttachment, deleteTrailerAttachment, previewTrailerAttachment,
                editTrailerCustom, exportTrailerData,
                editTrailerEssentialDetails, saveTrailerEssentialDetails, cancelEditTrailerEssentialDetails,
                renderRecycleBin, setRecycleFilter, setRecycleSort, toggleRecycleSelectAll, toggleRecycleItemSelect, restoreSelectedFromBin, permanentDeleteSelectedFromBin, previewRecycleItem, restoreFromRecycleBin, permanentDeleteFromBin, emptyRecycleBin
            };
        })();

        // expose App to window so inline handlers (onclick="App...") work
        try { window.App = App; } catch (e) { /* ignore */ }