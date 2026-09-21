
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

if (!fs.existsSync(LEADS_FILE)) {
  fs.writeFileSync(LEADS_FILE, '[]');
}

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Serve frontend files from the root directory
app.use(express.static(__dirname));

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

  if (!/^[0-9+()\-\s]{8,20}$/.test(phone)) {
    return res.status(400).json({
      ok: false,
      message: 'Please enter a valid phone number.'
    });
  }

  const leads = JSON.parse(
    fs.readFileSync(LEADS_FILE, 'utf8')
  );

  const lead = {
    id: `DP-${Date.now()}`,
    name: String(name).trim().slice(0, 100),
    phone: String(phone).trim().slice(0, 30),
    vehicleType: String(vehicleType).trim().slice(0, 60),
    service: String(service).trim().slice(0, 100),
    message: String(message || '').trim().slice(0, 1000),
    createdAt: new Date().toISOString()
  };

  leads.push(lead);

  fs.writeFileSync(
    LEADS_FILE,
    JSON.stringify(leads, null, 2)
  );

  res.status(201).json({
    ok: true,
    message: 'Your inquiry was submitted successfully.',
    inquiryId: lead.id
  });
});

// Serve index.html from the root directory
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fallback for frontend routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      ok: false,
      message: 'API route not found'
    });
  }

  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(
    `Digital Point website running on port ${PORT}`
  );
});
