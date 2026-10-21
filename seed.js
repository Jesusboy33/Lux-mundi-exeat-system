// ==============================================================================
// LUX MUNDI UNIVERSITY - OFFLINE JSON-BASED SERVER
// File: server.js
// Description: Fully functional backend using a local JSON file (Zero MongoDB needed)
// ==============================================================================

const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const session = require('express-session');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

app.use(session({
  secret: 'lux_mundi_secret_2026',
  resave: false,
  saveUninitialized: true
}));

const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'database.json');

// Initialize local database file with 4 default users if it doesn't exist
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [
        { id: '1', username: 'LMU/2026/0142', password: 'student123', fullName: 'Emmanuel Nwankwo', role: 'STUDENT', hostelBlock: 'Saint Augustine Hostel - Room 104', parentPhone: '+2348012345678', isActive: true },
        { id: '2', username: 'warden_augustine', password: 'warden123', fullName: 'Dr. Kalu Okoro (Hall Warden)', role: 'WARDEN', hostelBlock: 'Saint Augustine Hostel', isActive: true },
        { id: '3', username: 'security_gate1', password: 'security123', fullName: 'Officer Danjuma (Main Gate)', role: 'SECURITY', isActive: true },
        { id: '4', username: 'admin', password: 'admin123', fullName: 'Mr. Chidiebere Maduka Okoye (Lux Mundi)', role: 'SUPER_ADMIN', isActive: true }
      ],
      exeats: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ==============================================================================
// API ROUTES
// ==============================================================================

app.get('/', (req, res) => {
  res.send({ message: 'Lux Mundi Offline Exeat API is running successfully!' });
});

// Unified Login Route
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();

  const user = db.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }
  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account disabled by admin.' });
  }

  req.session.user = user;

  let redirectTo = '/login';
  if (user.role === 'STUDENT') redirectTo = '/portal/student';
  else if (user.role === 'WARDEN') redirectTo = '/portal/warden';
  else if (user.role === 'SECURITY') redirectTo = '/portal/gate';
  else if (user.role === 'SUPER_ADMIN') redirectTo = '/portal/admin';

  res.status(200).json({ success: true, role: user.role, redirectTo, user });
});

// Student Apply for Exeat
app.post('/api/student/apply-exeat', (req, res) => {
  const { username, reason, destination, departureDate, returnDate } = req.body;
  const db = loadDB();

  const student = db.users.find(u => u.username === username && u.role === 'STUDENT');
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  const newExeat = {
    id: Date.now().toString(),
    matricNumber: student.username,
    studentName: student.fullName,
    hostelBlock: student.hostelBlock,
    parentPhone: student.parentPhone,
    reason,
    destination,
    departureDate,
    returnDate,
    parentStatus: 'Pending',
    hostelStatus: 'Pending',
    gateStatus: 'Pending',
    createdAt: new Date()
  };

  db.exeats.push(newExeat);
  saveDB(db);

  res.status(201).json({ success: true, message: 'Exeat request submitted!', data: newExeat });
});

// Get all requests (Warden / Admin)
app.get('/api/warden/requests', (req, res) => {
  const db = loadDB();
  res.status(200).json({ success: true, data: db.exeats });
});

// Warden Sign Out Hostel
app.patch('/api/warden/signout-hostel/:id', (req, res) => {
  const db = loadDB();
  const exeat = db.exeats.find(e => e.id === req.params.id);
  if (!exeat) return res.status(404).json({ success: false, message: 'Request not found.' });

  exeat.hostelStatus = 'Signed Out';
  saveDB(db);

  res.status(200).json({ success: true, message: 'Student signed out of hostel!', data: exeat });
});

// Gate Exit
app.patch('/api/gate/campus-exit/:id', (req, res) => {
  const db = loadDB();
  const exeat = db.exeats.find(e => e.id === req.params.id);
  if (!exeat) return res.status(404).json({ success: false, message: 'Request not found.' });

  exeat.gateStatus = 'Off Campus';
  saveDB(db);

  res.status(200).json({ success: true, message: 'Student granted exit at gate!', data: exeat });
});

// Gate Return
app.patch('/api/gate/campus-return/:id', (req, res) => {
  const db = loadDB();
  const exeat = db.exeats.find(e => e.id === req.params.id);
  if (!exeat) return res.status(404).json({ success: false, message: 'Request not found.' });

  exeat.gateStatus = 'Returned';
  saveDB(db);

  res.status(200).json({ success: true, message: 'Student marked returned!', data: exeat });
});

// Admin Add Staff
app.post('/api/admin/add-staff', (req, res) => {
  const { username, password, fullName, role, hostelBlock } = req.body;
  const db = loadDB();

  const newStaff = {
    id: Date.now().toString(),
    username,
    password,
    fullName,
    role,
    hostelBlock: hostelBlock || '',
    isActive: true
  };

  db.users.push(newStaff);
  saveDB(db);

  res.status(201).json({ success: true, message: 'Staff account added successfully!', data: newStaff });
});

// Start Server
app.listen(PORT, () => {
  console.log(` Lux Mundi Offline Server running successfully on http://localhost:${PORT}`);
});