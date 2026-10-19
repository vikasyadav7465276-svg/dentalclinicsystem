export function getAdminPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmileCraft Admin Dashboard</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --primary: #A78BFA; --bg: #FFF9F2; --white: #FFFFFF; --text: #292644; --muted: #77758C;
      --success: #22C55E; --error: #EF4444; --warning: #F59E0B;
      --shadow: 8px 8px 16px rgba(0,0,0,0.04), -8px -8px 16px rgba(255,255,255,0.8);
      --radius: 20px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); display: flex; height: 100vh; overflow: hidden; }
    h1, h2, h3 { font-family: 'Poppins', sans-serif; }
    
    /* Login Screen */
    #login-screen { position: fixed; inset: 0; background: var(--bg); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .login-box { background: var(--white); padding: 40px; border-radius: var(--radius); box-shadow: var(--shadow); width: 100%; max-width: 400px; text-align: center; }
    .form-control { width: 100%; padding: 12px; margin: 10px 0 20px; border: none; border-radius: 10px; background: var(--bg); box-shadow: inset 2px 2px 5px rgba(0,0,0,0.05); outline: none; font-family: inherit; }
    .btn { background: var(--primary); color: white; border: none; padding: 12px 20px; width: 100%; border-radius: 10px; cursor: pointer; font-weight: 600; box-shadow: var(--shadow); transition: 0.2s; }
    .btn:hover { filter: brightness(0.95); }
    .btn-sm { padding: 6px 12px; font-size: 13px; width: auto; }
    
    /* Layout */
    .sidebar { width: 250px; background: var(--white); padding: 20px; box-shadow: 2px 0 10px rgba(0,0,0,0.02); display: flex; flex-direction: column; }
    .logo { font-size: 20px; font-weight: bold; color: var(--primary); margin-bottom: 40px; display: flex; align-items: center; gap: 10px; }
    .nav-item { padding: 12px 15px; margin-bottom: 10px; border-radius: 10px; cursor: pointer; color: var(--muted); font-weight: 500; transition: 0.2s; display: flex; align-items: center; gap: 10px; }
    .nav-item:hover, .nav-item.active { background: var(--bg); color: var(--primary); box-shadow: var(--shadow); }
    .main-content { flex: 1; padding: 30px; overflow-y: auto; }
    
    /* Cards & Tables */
    .dashboard-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: var(--white); padding: 20px; border-radius: var(--radius); box-shadow: var(--shadow); text-align: center; }
    .stat-card h3 { font-size: 32px; color: var(--primary); margin: 10px 0; }
    
    .data-card { background: var(--white); padding: 20px; border-radius: var(--radius); box-shadow: var(--shadow); }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; text-align: left; }
    th, td { padding: 12px 15px; border-bottom: 1px solid rgba(0,0,0,0.05); }
    th { color: var(--muted); font-weight: 500; font-size: 14px; }
    .badge { padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .badge.pending { background: #FEF3C7; color: var(--warning); }
    .badge.confirmed { background: #D1FAE5; color: var(--success); }
    .badge.cancelled { background: #FEE2E2; color: var(--error); }
    .badge.completed { background: #E0E7FF; color: var(--primary); }
    
    .view-section { display: none; }
    .view-section.active { display: block; animation: fadeIn 0.3s; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    
    .loader { border: 3px solid var(--bg); border-top: 3px solid var(--primary); border-radius: 50%; width: 24px; height: 24px; animation: spin 1s linear infinite; margin: 20px auto; display: none; }
    @keyframes spin { 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>

  <!-- Login Screen -->
  <div id="login-screen">
    <div class="login-box">
      <h2><i class="fa-solid fa-lock" style="color:var(--primary)"></i> Admin Login</h2>
      <p style="color:var(--muted); font-size:14px; margin-bottom:20px;">Restricted Access</p>
      <input type="text" id="username" class="form-control" placeholder="Username">
      <input type="password" id="password" class="form-control" placeholder="Password">
      <button class="btn" onclick="login()">Sign In</button>
      <p id="login-error" style="color:var(--error); font-size:14px; margin-top:10px; display:none;"></p>
    </div>
  </div>

  <!-- Dashboard Layout -->
  <div class="sidebar" id="sidebar" style="display:none;">
    <div class="logo"><i class="fa-solid fa-tooth"></i> SmileCraft</div>
    <div class="nav-item active" onclick="switchView('overview')"><i class="fa-solid fa-chart-pie"></i> Overview</div>
    <div class="nav-item" onclick="switchView('appointments')"><i class="fa-solid fa-calendar-check"></i> Appointments</div>
    <div style="margin-top:auto">
      <div class="nav-item" onclick="logout()"><i class="fa-solid fa-right-from-bracket"></i> Logout</div>
    </div>
  </div>

  <div class="main-content" id="main-content" style="display:none;">
    <!-- Overview View -->
    <div id="view-overview" class="view-section active">
      <h2>Dashboard Overview</h2>
      <p style="color:var(--muted); margin-bottom:20px;">Real-time clinic statistics</p>
      <div class="dashboard-grid">
        <div class="stat-card">
          <p>Total Bookings</p>
          <h3 id="stat-total">-</h3>
        </div>
        <div class="stat-card">
          <p>Pending</p>
          <h3 id="stat-pending" style="color:var(--warning)">-</h3>
        </div>
        <div class="stat-card">
          <p>Confirmed</p>
          <h3 id="stat-confirmed" style="color:var(--success)">-</h3>
        </div>
      </div>
    </div>

    <!-- Appointments View -->
    <div id="view-appointments" class="view-section">
      <h2>Manage Appointments</h2>
      <div class="data-card" style="margin-top:20px;">
        <div class="loader" id="table-loader"></div>
        <table id="appt-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Patient</th>
              <th>Service</th>
              <th>Date & Time</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="appt-body"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    // App State
    let appointments = [];

    // Auth Initialization
    async function checkAuth() {
      try {
        const res = await fetch('/api/admin/me');
        if (res.ok) {
          showDashboard();
        } else {
          document.getElementById('login-screen').style.display = 'flex';
        }
      } catch (e) {
        document.getElementById('login-screen').style.display = 'flex';
      }
    }

    async function login() {
      const u = document.getElementById('username').value;
      const p = document.getElementById('password').value;
      const errEl = document.getElementById('login-error');
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({username: u, password: p})
        });
        const data = await res.json();
        if (data.success) {
          showDashboard();
        } else {
          errEl.innerText = data.error;
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.innerText = 'Network error';
        errEl.style.display = 'block';
      }
    }

    async function logout() {
      await fetch('/api/admin/logout', {method:'POST'});
      location.reload();
    }

    function showDashboard() {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('sidebar').style.display = 'flex';
      document.getElementById('main-content').style.display = 'block';
      loadDashboardStats();
    }

    // Navigation
    function switchView(view) {
      document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      
      document.getElementById('view-'+view).classList.add('active');
      event.currentTarget.classList.add('active');
      
      if(view === 'overview') loadDashboardStats();
      if(view === 'appointments') loadAppointments();
    }

    // Data Fetching
    async function loadDashboardStats() {
      try {
        const res = await fetch('/api/admin/dashboard');
        const data = await res.json();
        document.getElementById('stat-total').innerText = data.total;
        document.getElementById('stat-pending').innerText = data.pending;
        document.getElementById('stat-confirmed').innerText = data.confirmed;
      } catch (e) { console.error('Error loading stats'); }
    }

    async function loadAppointments() {
      document.getElementById('table-loader').style.display = 'block';
      document.getElementById('appt-body').innerHTML = '';
      try {
        const res = await fetch('/api/admin/appointments');
        appointments = await res.json();
        
        document.getElementById('table-loader').style.display = 'none';
        document.getElementById('appt-body').innerHTML = appointments.map(a => \`
          <tr>
            <td><strong>\${a.bookingReference}</strong></td>
            <td>\${a.patientName}<br><small style="color:var(--muted)">\${a.patientPhone}</small></td>
            <td>\${a.serviceNameSnapshot}</td>
            <td>\${new Date(a.appointmentStart).toLocaleString([], {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'})}</td>
            <td><span class="badge \${a.status.toLowerCase()}">\${a.status}</span></td>
            <td>
              <select class="form-control" style="width:auto; margin:0; padding:6px; font-size:12px;" onchange="updateStatus('\${a._id}', this.value)">
                <option value="" disabled selected>Change...</option>
                <option value="Confirmed">Confirm</option>
                <option value="Completed">Complete</option>
                <option value="Cancelled">Cancel</option>
              </select>
            </td>
          </tr>
        \`).join('');
      } catch (e) { console.error('Error loading appointments'); }
    }

    async function updateStatus(id, newStatus) {
      if(!confirm('Are you sure you want to change the status to ' + newStatus + '?')) return loadAppointments();
      try {
        const res = await fetch('/api/admin/appointments/' + id + '/status', {
          method: 'PATCH', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({status: newStatus})
        });
        if(res.ok) {
          loadAppointments();
        } else {
          alert('Failed to update status');
        }
      } catch(e) { alert('Error updating status'); }
    }

    // Start
    checkAuth();
  </script>
</body>
</html>
  `;
}
