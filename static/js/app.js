// HR RMS Training & Employee Management Frontend Application

const IS_ADMIN = (window.HR_USER_ROLE === 'admin');

document.addEventListener('DOMContentLoaded', () => {
    // 1. Set default current date in date picker input
    setCurrentDateDefault();

    // 2. Load stats & trainings list
    loadDashboardStats();
    loadTrainings();

    // 3. Load Employees for Autocomplete & Departments
    loadEmployeeDatalist();
    loadEmployeeDepartments();

    // 4. AI Assistant input handler
    setupAIAssistant();

    // 5. Apply role restrictions for non-admin users
    applyRoleRestrictions();
});

// Apply role-based UI restrictions
function applyRoleRestrictions() {
    if (IS_ADMIN) return; // Admin sees everything

    // Hide Add Training form panel
    const addPanel = document.getElementById('addTrainingPanel');
    if (addPanel) addPanel.style.display = 'none';

    // Hide "Add Training" / action buttons — handled dynamically in renderTrainingsTable
    // Status toggles hidden dynamically in renderEmployeesTable
}


// Helper: Get & Set Today's ISO Date YYYY-MM-DD
function setCurrentDateDefault() {
    const dateInput = document.getElementById('trainingDate');
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${year}-${month}-${day}`;
    }
}

// Global State Variables & Table Sorters/Paginations
let currentTrainings = [];
let allEmployees = [];
let modalFilteredEmployees = [];
let mainPageEmployees = [];

const tableStates = {
    trainings: { page: 1, pageSize: 10, sortKey: 'date', sortDir: 'desc' },
    employees: { page: 1, pageSize: 10, sortKey: 'full_name', sortDir: 'asc' },
    empModal: { page: 1, pageSize: 10, sortKey: 'full_name', sortDir: 'asc' }
};

// EXCEL EXPORT ENGINE (Native CSV / XLS with BOM)
function exportToExcel(headers, rows, filename) {
    let csvContent = '\uFEFF'; // UTF-8 BOM for Excel
    csvContent += headers.map(h => `"${(h ?? '').toString().replace(/"/g, '""')}"`).join(',') + '\r\n';

    rows.forEach(row => {
        csvContent += row.map(val => `"${(val ?? '').toString().replace(/"/g, '""')}"`).join(',') + '\r\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${filename} successfully!`);
}

function exportTrainingsToExcel() {
    if (!currentTrainings || currentTrainings.length === 0) {
        showToast('No training data available to export', 'warning');
        return;
    }
    const headers = ['Date', 'Topic', 'Faculty', 'Program Duration (Hrs)', 'Hours Completed', 'Attendees', 'Status', 'Notes'];
    const rows = currentTrainings.map(t => [
        t.date, t.topic, t.faculty, t.program_duration, t.hours_completed, t.attendees, t.status, t.notes
    ]);
    exportToExcel(headers, rows, `HR_Trainings_${new Date().toISOString().slice(0,10)}.csv`);
}

function exportEmployeesToExcel() {
    if (!allEmployees || allEmployees.length === 0) {
        showToast('No employee data available to export', 'warning');
        return;
    }
    const headers = ['Emp Code', 'Full Name', 'First Name', 'Last Name', 'Designation', 'Department', 'Gender', 'Status', 'Phone', 'Email', 'Joining Date', 'PAN No', 'PF No', 'UAN', 'ESI No', 'Blood Group'];
    const rows = allEmployees.map(e => [
        e.em_code, e.full_name, e.first_name, e.last_name, e.des_name, e.dep_name, e.em_gender, e.status, e.em_phone, e.em_email, e.em_joining_date, e.em_pan_no, e.em_pf_no, e.em_uan, e.em_esi_no, e.em_blood_group
    ]);
    exportToExcel(headers, rows, `HR_Employee_Directory_${new Date().toISOString().slice(0,10)}.csv`);
}

async function exportEmployeeTrainingsToExcel(emCode) {
    let empTrainings = [];
    try {
        const response = await fetch(`/api/employees/${emCode}/trainings`);
        if (response.ok) empTrainings = await response.json();
    } catch (e) {
        console.error(e);
    }

    if (!empTrainings || empTrainings.length === 0) {
        showToast('No attended trainings found for this employee to export', 'warning');
        return;
    }

    const headers = ['Date', 'Topic', 'Faculty', 'Duration (Hrs)', 'Hours Completed', 'Status', 'Notes'];
    const rows = empTrainings.map(t => [
        t.date, t.topic, t.faculty, t.program_duration, t.hours_completed, t.status, t.notes
    ]);
    exportToExcel(headers, rows, `Employee_${emCode}_Trainings.csv`);
}

async function printEmployeeTrainings(emCode) {
    let emp = allEmployees.find(e => e.em_code === emCode);
    let empTrainings = [];
    try {
        const response = await fetch(`/api/employees/${emCode}/trainings`);
        if (response.ok) empTrainings = await response.json();
    } catch (e) {
        console.error(e);
    }

    if (!empTrainings || empTrainings.length === 0) {
        showToast('No training records found to print', 'warning');
        return;
    }

    const printWin = window.open('', '_blank', 'width=850,height=900');
    if (!printWin) {
        alert('Please allow popups to print summary');
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Employee Training Transcript - ${escapeHtml(emp ? emp.full_name : emCode)}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 40px; line-height: 1.5; }
                .header { border-bottom: 2px solid #00a884; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { color: #0f172a; margin: 0; font-size: 22px; font-weight: 700; }
                .emp-box { background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; }
                table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; font-size: 13px; }
                th { background: #f1f5f9; font-weight: 700; }
                .signature-section { margin-top: 60px; display: flex; justify-content: space-between; text-align: center; font-size: 12px; color: #64748b; }
                .sig-line { border-top: 1px dashed #cbd5e1; width: 200px; padding-top: 6px; margin-top: 40px; }
                @media print { body { margin: 20px; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>RMS - EMPLOYEE TRAINING TRANSCRIPT</h1>
                    <p>Official Record of Attended Learning & Skill Programs</p>
                </div>
            </div>

            <div class="emp-box">
                <strong>Employee Name:</strong> ${escapeHtml(emp ? emp.full_name : emCode)} | 
                <strong>Code:</strong> ${escapeHtml(emCode)} | 
                <strong>Designation:</strong> ${escapeHtml(emp ? emp.des_name : 'N/A')} | 
                <strong>Department:</strong> ${escapeHtml(emp ? emp.dep_name : 'N/A')}
            </div>

            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Training Topic</th>
                        <th>Faculty / Instructor</th>
                        <th>Duration (Hrs)</th>
                        <th>Completed (Hrs)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${empTrainings.map(t => `
                        <tr>
                            <td>${escapeHtml(t.date)}</td>
                            <td><strong>${escapeHtml(t.topic)}</strong></td>
                            <td>${escapeHtml(t.faculty)}</td>
                            <td>${t.program_duration}</td>
                            <td>${t.hours_completed}</td>
                            <td>${escapeHtml(t.status)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="signature-section">
                <div><div class="sig-line">Employee Signature</div></div>
                <div><div class="sig-line">Authorized HR Signature</div></div>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

// SORTING AND PAGINATION CORE ENGINE
function handleTableSort(tableId, sortKey) {
    const state = tableStates[tableId];
    if (!state) return;

    if (state.sortKey === sortKey) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
        state.sortKey = sortKey;
        state.sortDir = 'asc';
    }
    state.page = 1;

    updateSortIcons(tableId);

    if (tableId === 'trainings') renderTable(currentTrainings);
    else if (tableId === 'employees') renderEmployeePageTable(mainPageEmployees);
    else if (tableId === 'empModal') renderEmployeeModalTable(modalFilteredEmployees);
}

function updateSortIcons(tableId) {
    const state = tableStates[tableId];
    document.querySelectorAll(`[id^="sort-${tableId}-"]`).forEach(icon => {
        icon.className = 'fa-solid fa-sort sort-icon';
    });

    const activeIcon = document.getElementById(`sort-${tableId}-${state.sortKey}`);
    if (activeIcon) {
        activeIcon.className = `fa-solid fa-sort-${state.sortDir === 'asc' ? 'up' : 'down'} sort-icon active`;
    }
}

function paginateAndSort(dataArray, tableId) {
    if (!dataArray) return { items: [], total: 0, start: 0, end: 0, totalPages: 0 };
    const state = tableStates[tableId];
    
    const sorted = [...dataArray].sort((a, b) => {
        let valA = a[state.sortKey] ?? '';
        let valB = b[state.sortKey] ?? '';

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return state.sortDir === 'asc' ? -1 : 1;
        if (valA > valB) return state.sortDir === 'asc' ? 1 : -1;
        return 0;
    });

    const total = sorted.length;
    const totalPages = Math.ceil(total / state.pageSize) || 1;
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    const startIndex = (state.page - 1) * state.pageSize;
    const endIndex = Math.min(startIndex + state.pageSize, total);
    const paginatedItems = sorted.slice(startIndex, endIndex);

    return {
        items: paginatedItems,
        total: total,
        start: total > 0 ? startIndex + 1 : 0,
        end: endIndex,
        totalPages: totalPages,
        currentPage: state.page
    };
}

function changePageSize(tableId, size) {
    tableStates[tableId].pageSize = parseInt(size, 10) || 10;
    tableStates[tableId].page = 1;

    if (tableId === 'trainings') renderTable(currentTrainings);
    else if (tableId === 'employees') renderEmployeePageTable(mainPageEmployees);
    else if (tableId === 'empModal') renderEmployeeModalTable(modalFilteredEmployees);
}

function goToPage(tableId, targetPage) {
    tableStates[tableId].page = targetPage;

    if (tableId === 'trainings') renderTable(currentTrainings);
    else if (tableId === 'employees') renderEmployeePageTable(mainPageEmployees);
    else if (tableId === 'empModal') renderEmployeeModalTable(modalFilteredEmployees);
}

function renderPaginationControlsUI(tableId, paginationData, containerId, startId, endId, totalId) {
    const startElem = document.getElementById(startId);
    const endElem = document.getElementById(endId);
    const totalElem = document.getElementById(totalId);
    const container = document.getElementById(containerId);

    if (startElem) startElem.innerText = paginationData.start;
    if (endElem) endElem.innerText = paginationData.end;
    if (totalElem) totalElem.innerText = paginationData.total;

    if (!container) return;

    const { currentPage, totalPages } = paginationData;
    if (totalPages <= 1) {
        container.innerHTML = `
            <button type="button" class="page-btn" disabled><i class="fa-solid fa-chevron-left"></i></button>
            <button type="button" class="page-btn active">1</button>
            <button type="button" class="page-btn" disabled><i class="fa-solid fa-chevron-right"></i></button>
        `;
        return;
    }

    let buttonsHtml = `
        <button type="button" class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="goToPage('${tableId}', ${currentPage - 1})">
            <i class="fa-solid fa-chevron-left"></i>
        </button>
    `;

    for (let p = 1; p <= totalPages; p++) {
        if (p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)) {
            buttonsHtml += `
                <button type="button" class="page-btn ${p === currentPage ? 'active' : ''}" onclick="goToPage('${tableId}', ${p})">
                    ${p}
                </button>
            `;
        } else if (p === currentPage - 2 || p === currentPage + 2) {
            buttonsHtml += `<span style="color: #94a3b8; font-size: 0.8rem;">...</span>`;
        }
    }

    buttonsHtml += `
        <button type="button" class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="goToPage('${tableId}', ${currentPage + 1})">
            <i class="fa-solid fa-chevron-right"></i>
        </button>
    `;

    container.innerHTML = buttonsHtml;
}

// NAVIGATION VIEW SWITCHER
function switchPage(page, event) {
    if (event) event.preventDefault();

    // Hide all page views
    document.querySelectorAll('.page-view').forEach(view => {
        view.classList.add('hidden');
    });

    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        const indicator = nav.querySelector('.active-indicator');
        if (indicator) indicator.remove();
    });

    const pageHeading = document.getElementById('pageHeading');
    
    // Set active nav
    let activeNavId = 'nav' + page.charAt(0).toUpperCase() + page.slice(1);
    if (page === 'profile') activeNavId = 'navEmployees';
    const activeNav = document.getElementById(activeNavId);
    if (activeNav) {
        activeNav.classList.add('active');
        if (!activeNav.querySelector('.active-indicator')) {
            activeNav.insertAdjacentHTML('beforeend', '<span class="active-indicator"></span>');
        }
    }

    let targetView = document.getElementById(page + 'View');
    
    if (page === 'employees') {
        if (pageHeading) pageHeading.innerHTML = `Employee Directory <span class="wave-emoji">👥</span>`;
        loadEmployeePageTable();
    } else if (page === 'profile') {
        targetView = document.getElementById('employeeProfileView');
        if (pageHeading) pageHeading.innerHTML = `Employee Profile Page <span class="wave-emoji">🪪</span>`;
    } else if (page === 'training') {
        if (pageHeading) pageHeading.innerHTML = `HR Training Center <span class="wave-emoji">🎓</span>`;
        loadTrainings();
    } else if (page === 'dashboard') {
        if (pageHeading) pageHeading.innerHTML = `Dashboard Overview <span class="wave-emoji">📊</span>`;
    } else if (page === 'attendance') {
        if (pageHeading) pageHeading.innerHTML = `Attendance & Leave <span class="wave-emoji">📅</span>`;
        loadLeaves();
    } else if (page === 'payroll') {
        if (pageHeading) pageHeading.innerHTML = `Payroll Management <span class="wave-emoji">💰</span>`;
    } else if (page === 'helpdesk') {
        if (pageHeading) pageHeading.innerHTML = `Support Helpdesk <span class="wave-emoji">🎧</span>`;
        loadTickets();
    } else if (page === 'analytics') {
        if (pageHeading) pageHeading.innerHTML = `Analytics & Workforce <span class="wave-emoji">📈</span>`;
    } else if (page === 'settings') {
        if (pageHeading) pageHeading.innerHTML = `System Settings <span class="wave-emoji">⚙️</span>`;
    }
    
    if (targetView) {
        targetView.classList.remove('hidden');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// FETCH & RENDER LEAVES
async function loadLeaves() {
    try {
        const response = await fetch('/api/leaves');
        if (!response.ok) return;
        const leaves = await response.json();
        
        const tbody = document.querySelector('#attendanceView .custom-table tbody');
        if (!tbody) return;
        
        if (leaves.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:20px;">No leave requests found.</td></tr>';
            return;
        }

        tbody.innerHTML = leaves.map(l => {
            const initials = getInitials(l.full_name || 'User');
            let badgeClass = 'badge-upcoming';
            if (l.status === 'Approved') badgeClass = 'badge-completed';
            else if (l.status === 'Pending') badgeClass = 'badge-in-progress';
            
            return `
                <tr>
                    <td><div class="faculty-pill"><div class="faculty-avatar-icon">${initials}</div><strong>${escapeHtml(l.full_name || 'Unknown')}</strong></div></td>
                    <td><span class="attendee-tag">${escapeHtml(l.leave_type)}</span></td>
                    <td>${l.duration} Day(s)</td>
                    <td>${escapeHtml(l.start_date)} to ${escapeHtml(l.end_date)}</td>
                    <td><span class="badge ${badgeClass}">${escapeHtml(l.status)}</span></td>
                    <td style="text-align: right;">
                        <button class="btn-tbl-action" style="color:#16a34a;" onclick="updateLeaveStatus(${l.id}, 'Approved')"><i class="fa-solid fa-check"></i></button> 
                        <button class="btn-tbl-action delete" onclick="updateLeaveStatus(${l.id}, 'Rejected')"><i class="fa-solid fa-xmark"></i></button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) { console.error('Error loading leaves:', e); }
}

async function updateLeaveStatus(id, status) {
    try {
        const res = await fetch(`/api/leaves/${id}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status})
        });
        if(res.ok) { showToast(`Leave ${status}`); loadLeaves(); }
    } catch(e) {}
}

// FETCH & RENDER TICKETS
async function loadTickets() {
    try {
        const response = await fetch('/api/tickets');
        if (!response.ok) return;
        const tickets = await response.json();
        
        // This is a simple implementation rendering them as a list inside the helpdeskView container
        const container = document.querySelector('#helpdeskView .section-card > div:last-child');
        if (!container) return;
        
        container.innerHTML = '<div style="display:flex;flex-direction:column;gap:12px;width:100%;">';
        
        if (tickets.length === 0) {
            container.innerHTML += '<p style="text-align:center;color:#94a3b8;padding:20px;">No support tickets found.</p>';
        } else {
            container.innerHTML += tickets.map(t => {
                const initials = getInitials(t.full_name || 'User');
                let prioColor = t.priority === 'High' ? '#ef4444' : (t.priority === 'Medium' ? '#d97706' : '#0284c7');
                let prioBg = t.priority === 'High' ? '#fee2e2' : (t.priority === 'Medium' ? '#fef3c7' : '#e0f2fe');
                
                return `
                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                                <span class="badge" style="background:${prioBg};color:${prioColor};">${escapeHtml(t.priority)}</span>
                                <span style="font-size:12px; color:#94a3b8;">Status: <strong>${escapeHtml(t.status)}</strong></span>
                            </div>
                            <h5 style="font-size: 15px; margin-bottom: 4px;">${escapeHtml(t.subject)}</h5>
                            <p style="font-size: 13px; color: #64748b; margin-bottom: 8px;">${escapeHtml(t.description)}</p>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <div class="faculty-avatar-icon" style="width:24px;height:24px;font-size:10px;">${initials}</div>
                                <span style="font-size:12px; font-weight:600;">${escapeHtml(t.full_name || 'Unknown')}</span>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;">
                            ${t.status !== 'Resolved' ? `<button class="btn btn-primary" onclick="updateTicketStatus(${t.id}, 'Resolved')"><i class="fa-solid fa-check"></i> Mark Resolved</button>` : `<span style="color:#16a34a;font-weight:600;"><i class="fa-solid fa-check-circle"></i> Resolved</span>`}
                        </div>
                    </div>
                `;
            }).join('');
        }
        container.innerHTML += '</div>';
    } catch (e) { console.error('Error loading tickets:', e); }
}

async function updateTicketStatus(id, status) {
    try {
        const res = await fetch(`/api/tickets/${id}/status`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({status})
        });
        if(res.ok) { showToast(`Ticket marked as ${status}`); loadTickets(); }
    } catch(e) {}
}

// Load Summary Stats
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) return;
        const stats = await response.json();

        document.getElementById('statTotal').innerText = stats.total || 0;
        document.getElementById('statInProgress').innerText = stats.in_progress || 0;
        document.getElementById('statHoursCompleted').innerText = (stats.total_hours_completed || 0).toFixed(1);
        document.getElementById('statTargetHours').innerText = (stats.total_target_hours || 0).toFixed(1);

        const percent = Math.round(stats.completion_rate || 0);
        document.getElementById('ringPercentage').innerText = `${percent}%`;

        const circle = document.getElementById('completionRing');
        if (circle) {
            const maxDash = 188.4;
            const offset = maxDash - (maxDash * percent) / 100;
            circle.style.strokeDashoffset = offset;
        }
    } catch (err) {
        console.error('Error fetching dashboard stats:', err);
    }
}

// Load Employees into Autocomplete Datalists (Attendees & Faculty)
async function loadEmployeeDatalist() {
    try {
        const response = await fetch('/api/employees');
        if (!response.ok) return;
        allEmployees = await response.json();

        const datalistOptions = allEmployees.map(emp => 
            `<option value="${escapeHtml(emp.full_name)}">${escapeHtml(emp.em_code)} - ${escapeHtml(emp.des_name || emp.dep_name || '')}</option>`
        ).join('');

        const attendeeDatalist = document.getElementById('employeeDatalist');
        if (attendeeDatalist) {
            attendeeDatalist.innerHTML = datalistOptions;
        }

        const facultyDatalist = document.getElementById('facultyDatalist');
        if (facultyDatalist) {
            facultyDatalist.innerHTML = datalistOptions;
        }
    } catch (err) {
        console.error('Error loading employee datalist:', err);
    }
}

// Load Employee Departments into Filter Select
async function loadEmployeeDepartments() {
    try {
        const response = await fetch('/api/employees/departments');
        if (!response.ok) return;
        const deps = await response.json();

        const filterSelects = [
            document.getElementById('empDeptFilter'),
            document.getElementById('empPageDeptFilter')
        ];

        filterSelects.forEach(select => {
            if (select) {
                select.innerHTML = '<option value="All">All Departments</option>' +
                    deps.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
            }
        });
    } catch (err) {
        console.error('Error loading employee departments:', err);
    }
}

// Load Trainings from API
async function loadTrainings() {
    try {
        const searchVal = document.getElementById('globalSearch')?.value || '';
        const statusVal = document.getElementById('statusFilter')?.value || 'All';

        const url = `/api/trainings?search=${encodeURIComponent(searchVal)}&status=${encodeURIComponent(statusVal)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch trainings');

        currentTrainings = await response.json();
        renderTable(currentTrainings);
    } catch (err) {
        console.error('Error loading trainings:', err);
        showToast('Error loading training sessions', 'error');
    }
}

// Render Training Table Rows with Sorting & Pagination
function renderTable(trainings) {
    const tbody = document.getElementById('trainingsTbody');
    if (!tbody) return;

    const paginated = paginateAndSort(trainings, 'trainings');
    renderPaginationControlsUI('trainings', paginated, 'trainingsPaginationControls', 'trainingsPageStart', 'trainingsPageEnd', 'trainingsTotalCount');

    if (!paginated.items || paginated.items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 36px; color: #94a3b8;">
                    <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 8px; display: block;"></i>
                    No training records found matching criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = paginated.items.map(item => {
        const duration = parseFloat(item.program_duration) || 0;
        const completed = parseFloat(item.hours_completed) || 0;
        const progressPct = duration > 0 ? Math.min(100, Math.round((completed / duration) * 100)) : 0;

        const attendeeList = item.attendees ? item.attendees.split(',').map(s => s.trim()).filter(Boolean) : [];
        const attendeeTagsHtml = attendeeList.slice(0, 3).map(name => `<span class="attendee-tag">${escapeHtml(name)}</span>`).join('');
        const extraCount = attendeeList.length > 3 ? `<span class="attendee-tag">+${attendeeList.length - 3} more</span>` : '';

        let badgeClass = 'badge-upcoming';
        if (item.status === 'Completed') badgeClass = 'badge-completed';
        else if (item.status === 'In Progress') badgeClass = 'badge-in-progress';

        const facultyInitials = getInitials(item.faculty);

        return `
            <tr id="row-${item.id}">
                <td style="font-weight: 500; color: #475569; white-space: nowrap;">
                    <i class="fa-regular fa-calendar" style="margin-right: 6px; color: #94a3b8;"></i>${escapeHtml(item.date)}
                </td>
                <td>
                    <span class="topic-title">${escapeHtml(item.topic)}</span>
                    ${item.notes ? `<span class="topic-notes">${escapeHtml(item.notes)}</span>` : ''}
                </td>
                <td>
                    <div class="faculty-pill">
                        <div class="faculty-avatar-icon">${facultyInitials}</div>
                        <span>${escapeHtml(item.faculty)}</span>
                    </div>
                </td>
                <td>
                    <div class="progress-text">
                        <span>${completed} / ${duration} hrs</span>
                    </div>
                </td>
                <td>
                    <div class="progress-bar-wrapper">
                        <div class="progress-text">
                            <span>${progressPct}%</span>
                        </div>
                        <div class="progress-track">
                            <div class="progress-fill" style="width: ${progressPct}%;"></div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="attendees-tags">
                        ${attendeeTagsHtml}
                        ${extraCount}
                    </div>
                </td>
                <td>
                    <span class="badge ${badgeClass}">${escapeHtml(item.status)}</span>
                </td>
                <td>
                    <div class="action-btns">
                        <button class="btn-tbl-action print" onclick="printTraining(${item.id})" title="Print Program Report">
                            <i class="fa-solid fa-print"></i>
                        </button>
                        ${IS_ADMIN ? `
                        <button class="btn-tbl-action" onclick="editTraining(${item.id})" title="Edit Training">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-tbl-action delete" onclick="deleteTraining(${item.id})" title="Delete Record">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// PRINT SINGLE TRAINING PROGRAM REPORT FUNCTION
function printTraining(id) {
    const item = currentTrainings.find(t => t.id === id);
    if (!item) {
        showToast('Training session details not found', 'error');
        return;
    }

    const duration = parseFloat(item.program_duration) || 0;
    const completed = parseFloat(item.hours_completed) || 0;
    const progressPct = duration > 0 ? Math.min(100, Math.round((completed / duration) * 100)) : 0;
    const attendees = item.attendees ? item.attendees.split(',').map(s => s.trim()).filter(Boolean) : [];

    const printWin = window.open('', '_blank', 'width=850,height=900');
    if (!printWin) {
        alert('Please allow popups to print program summary');
        return;
    }

    printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Training Program Report - ${escapeHtml(item.topic)}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 40px; line-height: 1.5; }
                .header { border-bottom: 2px solid #00a884; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
                .header h1 { color: #0f172a; margin: 0; font-size: 22px; font-weight: 700; }
                .header p { color: #64748b; margin: 4px 0 0; font-size: 13px; }
                .badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; text-transform: uppercase; background: #e0f2fe; color: #0284c7; }
                .badge.completed { background: #dcfce7; color: #15803d; }
                .badge.in-progress { background: #fef3c7; color: #b45309; }
                .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 24px; }
                .card { background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
                .card-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 6px; font-weight: 700; }
                .card-value { font-size: 16px; font-weight: 600; color: #0f172a; }
                .section { margin-bottom: 24px; }
                .section-title { font-size: 14px; font-weight: 700; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 12px; color: #0f172a; }
                .attendees-list { display: flex; flex-wrap: wrap; gap: 8px; }
                .attendee-pill { background: #ffffff; border: 1px solid #cbd5e1; padding: 6px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; }
                .progress-bar { height: 10px; background: #e2e8f0; border-radius: 5px; overflow: hidden; margin-top: 8px; }
                .progress-fill { height: 100%; background: #00a884; width: ${progressPct}%; }
                .signature-section { margin-top: 60px; display: flex; justify-content: space-between; text-align: center; font-size: 12px; color: #64748b; }
                .sig-line { border-top: 1px dashed #cbd5e1; width: 200px; padding-top: 6px; margin-top: 40px; }
                @media print { body { margin: 20px; } }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <h1>RMS - TRAINING PROGRAM REPORT</h1>
                    <p>Skill Development & Employee Knowledge Verification</p>
                </div>
                <span class="badge ${item.status.toLowerCase().replace(' ', '-')}">${escapeHtml(item.status)}</span>
            </div>

            <div class="grid">
                <div class="card">
                    <div class="card-title">Training Topic</div>
                    <div class="card-value">${escapeHtml(item.topic)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Faculty / Trainer</div>
                    <div class="card-value">${escapeHtml(item.faculty)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Scheduled Date</div>
                    <div class="card-value">${escapeHtml(item.date)}</div>
                </div>
                <div class="card">
                    <div class="card-title">Duration & Progress</div>
                    <div class="card-value">${completed} / ${duration} Hours (${progressPct}%)</div>
                    <div class="progress-bar"><div class="progress-fill"></div></div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">Program Notes / Syllabus</div>
                <p style="font-size: 13px; color: #334155; background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
                    ${item.notes ? escapeHtml(item.notes) : 'Standard training module for skill enhancement and employee development.'}
                </p>
            </div>

            <div class="section">
                <div class="section-title">Registered Employee Attendees (${attendees.length})</div>
                <div class="attendees-list">
                    ${attendees.map((name, i) => `<div class="attendee-pill">${i+1}. ${escapeHtml(name)}</div>`).join('')}
                </div>
            </div>

            <div class="signature-section">
                <div><div class="sig-line">Trainer / Faculty Signature</div></div>
                <div><div class="sig-line">Authorized HR Signature</div></div>
            </div>

            <script>
                window.onload = function() { window.print(); }
            </script>
        </body>
        </html>
    `);
    printWin.document.close();
}

// FULL EMPLOYEES PAGE DIRECTORY TABLE
async function loadEmployeePageTable() {
    const searchVal = document.getElementById('empPageSearch')?.value || '';
    const deptVal = document.getElementById('empPageDeptFilter')?.value || 'All';
    const statusVal = document.getElementById('empPageStatusFilter')?.value || 'All';

    try {
        const url = `/api/employees?search=${encodeURIComponent(searchVal)}&department=${encodeURIComponent(deptVal)}&status=${encodeURIComponent(statusVal)}`;
        const response = await fetch(url);
        if (!response.ok) return;

        mainPageEmployees = await response.json();
        renderEmployeePageTable(mainPageEmployees);
    } catch (err) {
        console.error('Error loading full employees table:', err);
    }
}

function renderEmployeePageTable(employees) {
    const tbody = document.getElementById('empPageTbody');
    const badge = document.getElementById('empPageTotalBadge');
    if (badge) badge.innerText = employees ? employees.length : 0;
    if (!tbody) return;

    const paginated = paginateAndSort(employees, 'employees');
    renderPaginationControlsUI('employees', paginated, 'empPaginationControls', 'empPageStart', 'empPageEnd', 'empTotalCount');

    if (!paginated.items || paginated.items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 36px; color: #94a3b8;">
                    No employees found matching filter criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = paginated.items.map(emp => {
        const initials = getInitials(emp.full_name);
        const isChecked = emp.status === 'ACTIVE';

        return `
            <tr style="cursor: pointer;" onclick="viewEmployeeDetail('${escapeHtml(emp.em_code)}')">
                <td><code style="font-weight: 600; color: #0284c7;">${escapeHtml(emp.em_code)}</code></td>
                <td>
                    <div class="faculty-pill">
                        <div class="faculty-avatar-icon">${initials}</div>
                        <div>
                            <strong>${escapeHtml(emp.full_name)}</strong>
                            <small style="display:block; color:#64748b;">${escapeHtml(emp.em_gender || '')}</small>
                        </div>
                    </div>
                </td>
                <td><strong style="color: #334155;">${escapeHtml(emp.des_name || 'N/A')}</strong></td>
                <td><span class="attendee-tag">${escapeHtml(emp.dep_name || 'General')}</span></td>
                <td style="white-space: nowrap; color: #64748b;">${escapeHtml(emp.em_joining_date || 'N/A')}</td>
                <td>
                    <div style="font-size: 0.8rem;">
                        <div><i class="fa-solid fa-phone" style="font-size: 0.7rem; color: #94a3b8;"></i> ${escapeHtml(emp.em_phone || 'N/A')}</div>
                        <div style="color: #64748b;"><i class="fa-regular fa-envelope" style="font-size: 0.7rem; color: #94a3b8;"></i> ${escapeHtml(emp.em_email || 'N/A')}</div>
                    </div>
                </td>
                <td onclick="event.stopPropagation()">
                    <div class="status-toggle-wrapper">
                        <span class="status-toggle-label" id="tblStatusLabel-${emp.em_code}" style="color: ${isChecked ? '#16a34a' : '#0284c7'};">${escapeHtml(emp.status)}</span>
                        ${IS_ADMIN ? `
                        <label class="toggle-switch">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleEmployeeStatus('${escapeHtml(emp.em_code)}', this.checked)">
                            <span class="slider"></span>
                        </label>` : ''}
                    </div>
                </td>
                <td style="text-align: right;">
                    <button type="button" class="btn-sm-add" onclick="event.stopPropagation(); viewEmployeeDetail('${escapeHtml(emp.em_code)}')">
                        <i class="fa-solid fa-id-card"></i> View Profile Page
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// TOGGLE EMPLOYEE STATUS API HANDLER
async function toggleEmployeeStatus(emCode, isActive) {
    const newStatus = isActive ? 'ACTIVE' : 'INACTIVE';
    try {
        const response = await fetch(`/api/employees/${emCode}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Failed to update status', 'error');
            return;
        }

        showToast(`Employee ${emCode} status updated to ${newStatus}`);

        const label1 = document.getElementById(`tblStatusLabel-${emCode}`);
        if (label1) {
            label1.innerText = newStatus;
            label1.style.color = isActive ? '#16a34a' : '#0284c7';
        }

        const label2 = document.getElementById(`pageStatusLabel-${emCode}`);
        if (label2) {
            label2.innerText = newStatus;
            label2.style.color = isActive ? '#16a34a' : '#0284c7';
        }

        const emp = allEmployees.find(e => e.em_code === emCode);
        if (emp) emp.status = newStatus;

    } catch (err) {
        console.error('Error toggling status:', err);
        showToast('Network error while updating status', 'error');
    }
}

// VIEW DEDICATED EMPLOYEE FULL INFO PROFILE PAGE
async function viewEmployeeDetail(emCode) {
    let emp = allEmployees.find(e => e.em_code === emCode);
    if (!emp) {
        try {
            const response = await fetch(`/api/employees?search=${encodeURIComponent(emCode)}`);
            const data = await response.json();
            if (data && data.length > 0) emp = data[0];
        } catch (e) {
            console.error(e);
        }
    }

    if (!emp) {
        showToast('Employee details not found', 'error');
        return;
    }

    let empTrainings = [];
    try {
        const tResponse = await fetch(`/api/employees/${emCode}/trainings`);
        if (tResponse.ok) {
            empTrainings = await tResponse.json();
        }
    } catch (e) {
        console.error('Error fetching employee training history:', e);
    }

    const container = document.getElementById('empProfilePageContent');
    if (!container) return;

    const initials = getInitials(emp.full_name);
    const isChecked = emp.status === 'ACTIVE';

    let trainingHistoryHtml = '';
    if (empTrainings && empTrainings.length > 0) {
        trainingHistoryHtml = `
            <div class="table-responsive">
                <table class="custom-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Training Topic</th>
                            <th>Faculty / Instructor</th>
                            <th>Completed / Duration</th>
                            <th>Progress</th>
                            <th>Status</th>
                            <th style="text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${empTrainings.map(t => {
                            const duration = parseFloat(t.program_duration) || 0;
                            const completed = parseFloat(t.hours_completed) || 0;
                            const progressPct = duration > 0 ? Math.min(100, Math.round((completed / duration) * 100)) : 0;
                            let badgeClass = t.status === 'Completed' ? 'badge-completed' : (t.status === 'In Progress' ? 'badge-in-progress' : 'badge-upcoming');
                            return `
                                <tr>
                                    <td><i class="fa-regular fa-calendar" style="margin-right:6px; color:#94a3b8;"></i>${escapeHtml(t.date)}</td>
                                    <td><strong style="color:#0f172a;">${escapeHtml(t.topic)}</strong></td>
                                    <td>${escapeHtml(t.faculty)}</td>
                                    <td>${completed} / ${duration} hrs</td>
                                    <td>
                                        <div class="progress-bar-wrapper">
                                            <div class="progress-text"><span>${progressPct}%</span></div>
                                            <div class="progress-track"><div class="progress-fill" style="width: ${progressPct}%;"></div></div>
                                        </div>
                                    </td>
                                    <td><span class="badge ${badgeClass}">${escapeHtml(t.status)}</span></td>
                                    <td style="text-align: right;">
                                        <button type="button" class="btn-tbl-action print" onclick="printTraining(${t.id})" title="Print Program Report">
                                            <i class="fa-solid fa-print"></i>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    } else {
        trainingHistoryHtml = `
            <div style="text-align: center; padding: 28px; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1; color: #64748b;">
                <i class="fa-solid fa-graduation-cap" style="font-size: 2rem; margin-bottom: 8px; color: #94a3b8; display: block;"></i>
                No training sessions assigned yet for this employee.
                <div style="margin-top: 12px;">
                    <button type="button" class="btn btn-teal" onclick="addEmployeeAsAttendee('${escapeHtml(emp.full_name)}')">
                        <i class="fa-solid fa-plus"></i> Assign to Training Session
                    </button>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="profile-header-card" style="margin-bottom: 24px; padding: 24px;">
            <div class="profile-avatar-lg" style="width: 72px; height: 72px; font-size: 1.8rem;">${initials}</div>
            <div class="profile-meta" style="flex: 1;">
                <h2 style="font-size: 1.5rem;">${escapeHtml(emp.full_name)}</h2>
                <div style="font-weight: 600; color: #0284c7; font-size: 1rem;">${escapeHtml(emp.des_name || 'Designation N/A')}</div>
                <div class="profile-submeta">
                    <span class="attendee-tag" style="font-size: 0.82rem; padding: 4px 10px;">${escapeHtml(emp.dep_name || 'Department N/A')}</span>
                    <span style="color: #64748b;">Employee Code: <strong>${escapeHtml(emp.em_code)}</strong></span>
                </div>
            </div>

            <div style="text-align: right;">
                <div style="font-size: 0.76rem; font-weight: 700; color: #64748b; margin-bottom: 6px; text-transform: uppercase;">Employee Status</div>
                <div class="status-toggle-wrapper">
                    <span class="status-toggle-label" id="pageStatusLabel-${emp.em_code}" style="color: ${isChecked ? '#16a34a' : '#0284c7'};">${escapeHtml(emp.status)}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleEmployeeStatus('${escapeHtml(emp.em_code)}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>

        <div class="profile-grid">
            <div class="info-box">
                <h4><i class="fa-solid fa-user"></i> Personal Information</h4>
                <div class="info-item"><span class="info-label">Gender</span><span class="info-val">${escapeHtml(emp.em_gender || 'N/A')}</span></div>
                <div class="info-item"><span class="info-label">Date of Birth</span><span class="info-val">${escapeHtml(emp.em_birthday || 'N/A')}</span></div>
                <div class="info-item"><span class="info-label">Blood Group</span><span class="info-val">${escapeHtml(emp.em_blood_group || 'N/A')}</span></div>
                <div class="info-item"><span class="info-label">Joining Date</span><span class="info-val">${escapeHtml(emp.em_joining_date || 'N/A')}</span></div>
            </div>

            <div class="info-box">
                <h4><i class="fa-solid fa-phone"></i> Contact Details</h4>
                <div class="info-item"><span class="info-label">Phone Number</span><span class="info-val">${escapeHtml(emp.em_phone || 'N/A')}</span></div>
                <div class="info-item"><span class="info-label">Email Address</span><span class="info-val" style="word-break: break-all;">${escapeHtml(emp.em_email || 'N/A')}</span></div>
                <div class="info-item"><span class="info-label">HR System Role</span><span class="info-val">${escapeHtml(emp.em_role || 'EMPLOYEE')}</span></div>
            </div>
        </div>

        <div class="info-box" style="margin-bottom: 24px;">
            <h4><i class="fa-solid fa-shield-halved"></i> Statutory & Government Identifiers</h4>
            <div class="profile-grid" style="margin-bottom: 0;">
                <div>
                    <div class="info-item"><span class="info-label">PAN Number</span><span class="info-val">${escapeHtml(emp.em_pan_no || 'N/A')}</span></div>
                    <div class="info-item"><span class="info-label">PF Number</span><span class="info-val">${escapeHtml(emp.em_pf_no || 'N/A')}</span></div>
                </div>
                <div>
                    <div class="info-item"><span class="info-label">UAN Number</span><span class="info-val">${escapeHtml(emp.em_uan || 'N/A')}</span></div>
                    <div class="info-item"><span class="info-label">ESI Number</span><span class="info-val">${escapeHtml(emp.em_esi_no || 'N/A')}</span></div>
                </div>
            </div>
        </div>

        <div class="section-card">
            <div class="card-header border-bottom">
                <h3 class="card-title"><i class="fa-solid fa-graduation-cap text-teal"></i> Trainings Attended (${empTrainings.length})</h3>
                <div class="header-actions-group">
                    <button type="button" class="btn btn-secondary" onclick="printEmployeeTrainings('${escapeHtml(emp.em_code)}')">
                        <i class="fa-solid fa-print"></i> Print All
                    </button>
                    <button type="button" class="btn btn-secondary" onclick="exportEmployeeTrainingsToExcel('${escapeHtml(emp.em_code)}')">
                        <i class="fa-solid fa-file-excel text-green"></i> Export Excel
                    </button>
                    <button type="button" class="btn btn-teal" onclick="addEmployeeAsAttendee('${escapeHtml(emp.full_name)}')">
                        <i class="fa-solid fa-plus"></i> Add to Training
                    </button>
                </div>
            </div>
            <div style="margin-top: 16px;">
                ${trainingHistoryHtml}
            </div>
        </div>
    `;

    switchPage('profile');
}

// EMPLOYEE SELECTION MODAL FUNCTIONS
function openEmployeeDirectoryModal(event) {
    if (event) event.preventDefault();
    const modal = document.getElementById('empModal');
    if (modal) {
        modal.classList.remove('hidden');
        filterEmployeeModal();
    }
}

function closeEmployeeModal() {
    const modal = document.getElementById('empModal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function filterEmployeeModal() {
    const searchVal = document.getElementById('empSearchInput')?.value || '';
    const deptVal = document.getElementById('empDeptFilter')?.value || 'All';
    const statusVal = document.getElementById('empStatusFilter')?.value || 'All';

    try {
        const url = `/api/employees?search=${encodeURIComponent(searchVal)}&department=${encodeURIComponent(deptVal)}&status=${encodeURIComponent(statusVal)}`;
        const response = await fetch(url);
        if (!response.ok) return;

        modalFilteredEmployees = await response.json();
        renderEmployeeModalTable(modalFilteredEmployees);
    } catch (err) {
        console.error('Error fetching filtered employees:', err);
    }
}

function renderEmployeeModalTable(employees) {
    const tbody = document.getElementById('empTableTbody');
    const badge = document.getElementById('empCountBadge');
    if (badge) badge.innerText = employees ? employees.length : 0;
    if (!tbody) return;

    const paginated = paginateAndSort(employees, 'empModal');
    renderPaginationControlsUI('empModal', paginated, 'empModalPaginationControls', 'empModalPageStart', 'empModalPageEnd', 'empModalTotalCount');

    if (!paginated.items || paginated.items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 28px; color: #94a3b8;">
                    No employees found matching criteria.
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = paginated.items.map(emp => {
        const initials = getInitials(emp.full_name);
        const isChecked = emp.status === 'ACTIVE';

        return `
            <tr>
                <td><code style="font-weight: 600; color: #0284c7;">${escapeHtml(emp.em_code)}</code></td>
                <td>
                    <div class="faculty-pill">
                        <div class="faculty-avatar-icon">${initials}</div>
                        <div>
                            <strong>${escapeHtml(emp.full_name)}</strong>
                            <small style="display:block; color:#64748b;">${escapeHtml(emp.em_gender || '')}</small>
                        </div>
                    </div>
                </td>
                <td>${escapeHtml(emp.des_name || 'N/A')}</td>
                <td><span class="attendee-tag">${escapeHtml(emp.dep_name || 'General')}</span></td>
                <td>
                    <div style="font-size: 0.8rem;">
                        <div><i class="fa-solid fa-phone" style="font-size: 0.7rem; color: #94a3b8;"></i> ${escapeHtml(emp.em_phone || 'N/A')}</div>
                        <div style="color: #64748b;"><i class="fa-regular fa-envelope" style="font-size: 0.7rem; color: #94a3b8;"></i> ${escapeHtml(emp.em_email || 'N/A')}</div>
                    </div>
                </td>
                <td>
                    <div class="status-toggle-wrapper">
                        <span class="status-toggle-label" style="color: ${isChecked ? '#16a34a' : '#0284c7'};">${escapeHtml(emp.status)}</span>
                        <label class="toggle-switch">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleEmployeeStatus('${escapeHtml(emp.em_code)}', this.checked)">
                            <span class="slider"></span>
                        </label>
                    </div>
                </td>
                <td style="text-align: right;">
                    <button type="button" class="btn-sm-add" onclick="addEmployeeAsAttendee('${escapeHtml(emp.full_name)}')">
                        <i class="fa-solid fa-plus"></i> Add Attendee
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function addEmployeeAsAttendee(name) {
    const input = document.getElementById('trainingAttendees');
    if (!input) return;

    let currentVal = input.value.trim();
    if (currentVal) {
        const names = currentVal.split(',').map(s => s.trim());
        if (!names.includes(name)) {
            input.value = currentVal + ', ' + name;
        }
    } else {
        input.value = name;
    }

    showToast(`Added ${name} to Attendees!`);
    closeEmployeeModal();
    if (document.getElementById('trainingView').classList.contains('hidden')) {
        switchPage('training');
    }
    document.getElementById('quickFormCard').scrollIntoView({ behavior: 'smooth' });
}

// Calculate Auto Status based on duration and completed hours
function calculateAutoStatus() {
    const duration = parseFloat(document.getElementById('programDuration').value) || 0;
    const completed = parseFloat(document.getElementById('hoursCompleted').value) || 0;
    
    if (completed > duration && duration > 0) {
        document.getElementById('hoursCompleted').style.borderColor = '#ea580c';
    } else {
        document.getElementById('hoursCompleted').style.borderColor = '';
    }
}

// Handle Form Submit (Add or Update)
async function handleFormSubmit(event) {
    event.preventDefault();

    const id = document.getElementById('trainingId').value;
    const dateVal = document.getElementById('trainingDate').value;
    const topic = document.getElementById('trainingTopic').value.trim();
    const faculty = document.getElementById('trainingFaculty').value.trim();
    const program_duration = parseFloat(document.getElementById('programDuration').value);
    const hours_completed = parseFloat(document.getElementById('hoursCompleted').value);
    const attendees = document.getElementById('trainingAttendees').value.trim();
    const notes = document.getElementById('trainingNotes').value.trim();

    if (!topic || !faculty || isNaN(program_duration) || program_duration <= 0) {
        showToast('Please fill out all required fields correctly', 'warning');
        return;
    }

    const payload = {
        date: dateVal,
        topic: topic,
        faculty: faculty,
        program_duration: program_duration,
        hours_completed: isNaN(hours_completed) ? 0 : hours_completed,
        attendees: attendees,
        notes: notes
    };

    try {
        let response;
        if (id) {
            response = await fetch(`/api/trainings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            response = await fetch('/api/trainings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }

        const data = await response.json();
        if (!response.ok) {
            showToast(data.error || 'Failed to save training', 'error');
            return;
        }

        showToast(id ? 'Training program updated!' : 'New training session added successfully!');
        resetForm();
        loadTrainings();
        loadDashboardStats();

    } catch (err) {
        console.error('Error submitting form:', err);
        showToast('Network error while saving session', 'error');
    }
}

// Edit Training Session
function editTraining(id) {
    const item = currentTrainings.find(t => t.id === id);
    if (!item) return;

    if (document.getElementById('trainingView').classList.contains('hidden')) {
        switchPage('training');
    }

    document.getElementById('trainingId').value = item.id;
    document.getElementById('trainingDate').value = item.date;
    document.getElementById('trainingTopic').value = item.topic;
    document.getElementById('trainingFaculty').value = item.faculty;
    document.getElementById('programDuration').value = item.program_duration;
    document.getElementById('hoursCompleted').value = item.hours_completed;
    document.getElementById('trainingAttendees').value = item.attendees;
    document.getElementById('trainingNotes').value = item.notes || '';

    document.getElementById('formCardTitle').innerHTML = `<i class="fa-solid fa-pen-to-square text-teal"></i> Edit Training #${item.id}`;
    document.getElementById('submitBtn').innerHTML = `<i class="fa-solid fa-check"></i> Update Training`;
    document.getElementById('cancelEditBtn').classList.remove('hidden');

    document.getElementById('quickFormCard').scrollIntoView({ behavior: 'smooth' });
}

// Cancel Edit Mode
function cancelEdit() {
    resetForm();
}

// Reset Form to initial default state
function resetForm() {
    document.getElementById('trainingForm').reset();
    document.getElementById('trainingId').value = '';
    setCurrentDateDefault();

    document.getElementById('formCardTitle').innerHTML = `<i class="fa-solid fa-plus-circle text-teal"></i> Add Training Session`;
    document.getElementById('submitBtn').innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Training Session`;
    document.getElementById('cancelEditBtn').classList.add('hidden');
}

// Delete Training Session
async function deleteTraining(id) {
    if (!confirm('Are you sure you want to delete this training session?')) return;

    try {
        const response = await fetch(`/api/trainings/${id}`, { method: 'DELETE' });
        if (response.ok) {
            showToast('Training session removed.');
            loadTrainings();
            loadDashboardStats();
        } else {
            showToast('Failed to delete training record', 'error');
        }
    } catch (err) {
        console.error('Error deleting training:', err);
        showToast('Error communicating with server', 'error');
    }
}

// Filter Event Handler
function filterTrainings() {
    loadTrainings();
}

// Search Event Handler
let searchDebounceTimer;
function handleSearch(val) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        loadTrainings();
    }, 300);
}

// Scroll to / Open Add Modal
function openAddModal() {
    resetForm();
    if (document.getElementById('trainingView').classList.contains('hidden')) {
        switchPage('training');
    }
    document.getElementById('quickFormCard').scrollIntoView({ behavior: 'smooth' });
    document.getElementById('trainingTopic').focus();
}

// Setup AI Assistant Input
function setupAIAssistant() {
    const input = document.querySelector('.ai-input');
    const sendBtn = document.querySelector('.ai-send-btn');
    
    if (input && sendBtn) {
        const handleSend = () => {
            const query = input.value.trim();
            if (!query) return;

            showToast(`AI Assistant processing: "${query}"`);
            input.value = '';
        };

        sendBtn.addEventListener('click', handleSend);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSend();
        });
    }
}

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHtml(message)}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Utility Helpers
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, match => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[match]));
}

function getInitials(name) {
    if (!name) return 'TR';
    const parts = name.replace(/^(Dr\.|Prof\.|Mr\.|Mrs\.|Ms\.)\s+/i, '').split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}
