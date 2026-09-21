
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('ERROR: ADMIN_USERNAME and ADMIN_PASSWORD must be configured.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(LEADS_FILE)) {
  fs.writeFileSync(LEADS_FILE, '[]');
}

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Never expose private files or the leads database publicly.
app.use((req, res, next) => {
  const blockedPaths = [
    '/data',
    '/server.js',
    '/package.json',
    '/package-lock.json'
  ];

  if (blockedPaths.some((item) =>
    req.path === item || req.path.startsWith(item + '/')
  )) {
    return res.status(404).send('Not found');
  }

  next();
});

// Serve frontend files from the root directory.
app.use(express.static(__dirname));

// --------------------
// Authentication helpers
// --------------------

const COOKIE_NAME = 'dp_admin_session';
const SESSION_DURATION = 8 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  if (first.length !== second.length) {
    return false;
  }

  return crypto.timingSafeEqual(first, second);
}

function createSession(username) {
  const expires = Date.now() + SESSION_DURATION;
  const payload = `${username}|${expires}`;

  const signature = crypto
    .createHmac('sha256', ADMIN_PASSWORD)
    .update(payload)
    .digest('hex');

  return Buffer
    .from(`${payload}|${signature}`)
    .toString('base64url');
}

function verifySession(token) {
  try {
    if (!token) return false;

    const decoded = Buffer
      .from(token, 'base64url')
      .toString('utf8');

    const parts = decoded.split('|');

    if (parts.length !== 3) return false;

    const [username, expiresText, signature] = parts;
    const expires = Number(expiresText);

    if (!username || !Number.isFinite(expires)) {
      return false;
    }

    if (Date.now() > expires) {
      return false;
    }

    if (!safeEqual(username, ADMIN_USERNAME)) {
      return false;
    }

    const payload = `${username}|${expires}`;

    const expectedSignature = crypto
      .createHmac('sha256', ADMIN_PASSWORD)
      .update(payload)
      .digest('hex');

    return safeEqual(signature, expectedSignature);
  } catch (error) {
    return false;
  }
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';

  const item = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  return item ? decodeURIComponent(item.slice(name.length + 1)) : null;
}

function isAuthenticated(req) {
  return verifySession(getCookie(req, COOKIE_NAME));
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({
      ok: false,
      message: 'Admin authentication required.'
    });
  }

  next();
}

// --------------------
// Public API
// --------------------

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'Digital Point Insurance API'
  });
});

app.post('/api/inquiries', (req, res) => {
  const { name, phone, vehicleType, service, message } = req.body || {};

  if (!name || !phone || !vehicleType || !service) {
    return res.status(400).json({
      ok: false,
      message: 'Name, phone, vehicle type and service are required.'
    });
  }

  const cleanPhone = String(phone).trim();

  if (!/^[0-9+()\-\s]{8,20}$/.test(cleanPhone)) {
    return res.status(400).json({
      ok: false,
      message: 'Please enter a valid phone number.'
    });
  }

  let leads;

  try {
    leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));

    if (!Array.isArray(leads)) {
      leads = [];
    }
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Unable to read inquiry data.'
    });
  }

  const lead = {
    id: `DP-${Date.now()}`,
    name: String(name).trim().slice(0, 100),
    phone: cleanPhone.slice(0, 30),
    vehicleType: String(vehicleType).trim().slice(0, 60),
    service: String(service).trim().slice(0, 100),
    message: String(message || '').trim().slice(0, 1000),
    createdAt: new Date().toISOString()
  };

  leads.push(lead);

  try {
    fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: 'Unable to save inquiry.'
    });
  }

  res.status(201).json({
    ok: true,
    message: 'Your inquiry was submitted successfully.',
    inquiryId: lead.id
  });
});

// --------------------
// Admin login
// --------------------

app.get('/admin', (req, res) => {
  if (isAuthenticated(req)) {
    return res.send(adminDashboardHtml());
  }

  res.send(adminLoginHtml());
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    !safeEqual(username, ADMIN_USERNAME) ||
    !safeEqual(password, ADMIN_PASSWORD)
  ) {
    return res.status(401).json({
      ok: false,
      message: 'Invalid username or password.'
    });
  }

  const token = createSession(ADMIN_USERNAME);

  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=28800; SameSite=Strict${IS_PRODUCTION ? '; Secure' : ''}`
  );

  res.json({
    ok: true,
    message: 'Login successful.'
  });
});

app.post('/api/admin/logout', (req, res) => {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${IS_PRODUCTION ? '; Secure' : ''}`
  );

  res.json({
    ok: true,
    message: 'Logged out successfully.'
  });
});

// --------------------
// Protected inquiry API
// --------------------

app.get('/api/admin/inquiries', requireAdmin, (req, res) => {
  try {
    const leads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));

    res.json({
      ok: true,
      inquiries: Array.isArray(leads) ? leads.reverse() : []
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      message: 'Unable to load inquiries.'
    });
  }
});

// --------------------
// Admin HTML pages
// --------------------

function adminLoginHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Digital Point Admin Login</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 24px;
    }

    .box {
      max-width: 400px;
      margin: 60px auto;
      background: white;
      padding: 24px;
      border-radius: 14px;
      box-shadow: 0 5px 25px #0001;
    }

    input, button {
      width: 100%;
      box-sizing: border-box;
      padding: 13px;
      margin-top: 10px;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
    }

    button {
      background: #2563eb;
      color: white;
      border: 0;
      cursor: pointer;
    }

    #message {
      margin-top: 14px;
      color: #dc2626;
    }
  </style>
</head>
<body>
  <div class="box">
    <h2>Digital Point Insurance</h2>
    <h3>Admin Login</h3>

    <form id="loginForm">
      <input
        type="text"
        id="username"
        placeholder="Username"
        autocomplete="username"
        required
      >

      <input
        type="password"
        id="password"
        placeholder="Password"
        autocomplete="current-password"
        required
      >

      <button type="submit">Login</button>
    </form>

    <div id="message"></div>
  </div>

  <script>
    document.getElementById('loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();

      const message = document.getElementById('message');
      message.textContent = 'Logging in...';

      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            username: document.getElementById('username').value,
            password: document.getElementById('password').value
          })
        });

        const result = await response.json();

        if (!response.ok) {
          message.textContent = result.message || 'Login failed.';
          return;
        }

        window.location.href = '/admin';
      } catch (error) {
        message.textContent = 'Network error. Please try again.';
      }
    });
  </script>
</body>
</html>
  `;
}

function adminDashboardHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Dashboard</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      background: #f1f5f9;
      margin: 0;
      padding: 18px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    button {
      padding: 10px 14px;
      border: 0;
      border-radius: 8px;
      background: #2563eb;
      color: white;
      cursor: pointer;
    }

    .logout {
      background: #dc2626;
    }

    .card {
      background: white;
      padding: 16px;
      margin-top: 14px;
      border-radius: 12px;
      box-shadow: 0 2px 10px #0001;
      overflow-wrap: anywhere;
    }

    .muted {
      color: #64748b;
    }

    a {
      color: #2563eb;
    }
  </style>
</head>
<body>
  <div class="header">
    <h2>Admin Dashboard</h2>
    <div>
      <button onclick="loadInquiries()">Refresh</button>
      <button class="logout" onclick="logout()">Logout</button>
    </div>
  </div>

  <p id="status" class="muted">Loading inquiries...</p>
  <div id="inquiries"></div>

  <script>
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[character]));
    }

    async function loadInquiries() {
      const status = document.getElementById('status');
      const container = document.getElementById('inquiries');

      status.textContent = 'Loading inquiries...';

      try {
        const response = await fetch('/api/admin/inquiries', {
          credentials: 'same-origin'
        });

        if (response.status === 401) {
          window.location.href = '/admin';
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          status.textContent = result.message || 'Unable to load inquiries.';
          return;
        }

        const inquiries = result.inquiries || [];

        status.textContent = 'Total inquiries: ' + inquiries.length;

        if (inquiries.length === 0) {
          container.innerHTML = '<div class="card">No inquiries yet.</div>';
          return;
        }

        container.innerHTML = inquiries.map((item) => {
          const phone = String(item.phone || '');
          const phoneLink = phone.replace(/[^0-9+]/g, '');

          return '<div class="card">' +
            '<h3>' + escapeHtml(item.name) + '</h3>' +
            '<p><b>Mobile:</b> <a href="tel:' + escapeHtml(phoneLink) + '">' + escapeHtml(phone) + '</a></p>' +
            '<p><b>Vehicle:</b> ' + escapeHtml(item.vehicleType) + '</p>' +
            '<p><b>Service:</b> ' + escapeHtml(item.service) + '</p>' +
            '<p><b>Message:</b> ' + escapeHtml(item.message) + '</p>' +
            '<p class="muted"><b>ID:</b> ' + escapeHtml(item.id) + '</p>' +
            '<p class="muted">' + escapeHtml(item.createdAt) + '</p>' +
            '<a href="https://wa.me/' + escapeHtml(phoneLink.replace(/^\\+/, '')) + '" target="_blank" rel="noopener noreferrer">WhatsApp Customer</a>' +
            '</div>';
        }).join('');
      } catch (error) {
        status.textContent = 'Network error. Please try again.';
      }
    }

    async function logout() {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });

      window.location.href = '/admin';
    }

    loadInquiries();
  </script>
</body>
</html>
  `;
}

// --------------------
// Frontend routes
// --------------------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Express 5-compatible fallback route.
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      ok: false,
      message: 'API route not found'
    });
  }

  if (req.path === '/admin') {
    return res.send(adminLoginHtml());
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Digital Point website running on port ${PORT}`
  );
});
