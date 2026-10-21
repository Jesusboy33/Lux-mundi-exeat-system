// ==============================================================================
// LUX MUNDI UNIVERSITY - OFFLINE JSON-BASED SERVER
// File: server.js
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
const CRED_FILE = path.join(__dirname, 'credentials.json');

// Load Credentials from external file
function loadCredentials() {
  if (!fs.existsSync(CRED_FILE)) {
    const defaultCreds = {
      users: [
        { id: '1', username: 'LMU/2026/0142', password: 'student123', fullName: 'Emmanuel Nwankwo', role: 'STUDENT', hostelBlock: 'Saint Augustine Hostel', parentPhone: '+2348012345678', isActive: true },
        { id: '2', username: 'porter_augustine', password: 'warden123', fullName: 'Dr. Kalu Okoro (Porter)', role: 'PORTER', hostelBlock: 'Saint Augustine Hostel', isActive: true },
        { id: '3', username: 'security_gate1', password: 'security123', fullName: 'Officer Danjuma (Main Gate)', role: 'SECURITY', isActive: true },
        { id: '4', username: 'admin', password: 'admin123', fullName: 'Mr. Chidiebere Maduka Okoye (ICT Admin)', role: 'SUPER_ADMIN', hostelBlock: '', isActive: true }
      ]
    };
    fs.writeFileSync(CRED_FILE, JSON.stringify(defaultCreds, null, 2));
  }
  return JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
}

function saveCredentials(data) {
  fs.writeFileSync(CRED_FILE, JSON.stringify(data, null, 2));
}

// Load Exeat Database
function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = { exeats: [], notifications: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Static & Views
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Authentication Route
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const creds = loadCredentials();

  const user = creds.users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }
  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account disabled by ICT Admin.' });
  }

  req.session.user = user;
  let redirectTo = '/portal/' + user.role.toLowerCase();
  res.status(200).json({ success: true, role: user.role, redirectTo, user });
});

// Student Apply for Exeat
app.post('/api/student/apply-exeat', (req, res) => {
  const { username, reason, destination, departureDate, returnDate } = req.body;
  const creds = loadCredentials();
  const db = loadDB();

  const student = creds.users.find(u => u.username === username && u.role === 'STUDENT');
  if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

  const newExeat = {
    id: Date.now().toString(),
    matricNumber: student.username,
    studentName: student.fullName,
    hostelBlock: student.hostelBlock || 'Saint Augustine Hostel',
    parentPhone: student.parentPhone,
    reason,
    destination,
    departureDate,
    returnDate,
    parentStatus: 'Pending',
    hostelStatus: 'Pending',
    gateStatus: 'Pending',
    studentArrivalNotified: false,
    hostelArrivalStatus: 'Pending',
    createdAt: new Date().toISOString()
  };

  db.exeats.push(newExeat);
  saveDB(db);

  res.status(201).json({ success: true, message: 'Exeat request submitted!', data: newExeat });
});

// Get Requests
app.get('/api/requests', (req, res) => {
  const db = loadDB();
  res.status(200).json({ success: true, data: db.exeats });
});

// Get Students List (for Porter view)
app.get('/api/hostel/students/:hostelName', (req, res) => {
  const creds = loadCredentials();
  const db = loadDB();
  const hostelName = decodeURIComponent(req.params.hostelName);

  const students = creds.users.filter(u => u.role === 'STUDENT' && u.hostelBlock === hostelName);
  
  // Attach current exeat or absence status
  const studentStatusList = students.map(st => {
    const activeExeat = db.exeats.find(e => e.matricNumber === st.username && e.hostelStatus !== 'Returned to Hostel');
    return {
      ...st,
      status: activeExeat ? (activeExeat.gateStatus === 'Off Campus' ? 'Currently Off-Campus' : 'Exeat Pending/Approved') : 'Available in Hostel'
    };
  });

  res.status(200).json({ success: true, data: studentStatusList });
});

// Porter Manual Parent Approval Override
app.patch('/api/porter/approve-parent/:id', (req, res) => {
  const db = loadDB();
  const exeat = db.exeats.find(e => e.id === req.params.id);
  if (!exeat) return res.status(404).json({ success: false, message: 'Request not found.' });

  exeat.parentStatus = 'Approved';
  saveDB(db);
  res.status(200).json({ success: true, message: 'Parent consent manually approved by porter.', data: exeat });
});

// Porter Sign Out Hostel
app.patch('/api/porter/signout-hostel/:id', (req, res) => {
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

// Student Confirm Arrival
app.patch('/api/student/confirm-arrival/:id', (req, res) => {
  const db = loadDB();
  const exeat = db.exeats.find(e => e.id === req.params.id);
  if (!exeat) return res.status(404).json({ success: false, message: 'Request not found.' });
  if (exeat.gateStatus !== 'Returned') {
    return res.status(400).json({ success: false, message: 'Gate security must log your return first.' });
  }

  exeat.studentArrivalNotified = true;
  exeat.hostelArrivalStatus = 'Awaiting Warden Confirmation';
  saveDB(db);
  res.status(200).json({ success: true, message: 'Arrival notification sent to porter!', data: exeat });
});

// Porter Final Return Confirmation
app.patch('/api/porter/confirm-return/:id', (req, res) => {
  const db = loadDB();
  const exeat = db.exeats.find(e => e.id === req.params.id);
  if (!exeat) return res.status(404).json({ success: false, message: 'Request not found.' });

  exeat.hostelStatus = 'Returned to Hostel';
  exeat.hostelArrivalStatus = 'Confirmed';
  saveDB(db);
  res.status(200).json({ success: true, message: 'Student checked back into hostel!', data: exeat });
});

// ICT: Get All Users
app.get('/api/ict/users', (req, res) => {
  const creds = loadCredentials();
  res.status(200).json({ success: true, data: creds.users });
});

// ICT: Add User (Porter, Gate, or Student)
app.post('/api/ict/add-user', (req, res) => {
  const { username, password, fullName, role, hostelBlock, parentPhone } = req.body;
  const creds = loadCredentials();

  const newUser = {
    id: Date.now().toString(),
    username,
    password,
    fullName,
    role,
    hostelBlock: hostelBlock || 'Saint Augustine Hostel',
    parentPhone: parentPhone || '+2348012345678',
    isActive: true
  };

  creds.users.push(newUser);
  saveCredentials(creds);
  res.status(201).json({ success: true, message: 'User account created successfully!', data: newUser });
});

// ICT: Delete / Revoke User Access
app.delete('/api/ict/user/:id', (req, res) => {
  const creds = loadCredentials();
  creds.users = creds.users.filter(u => u.id !== req.params.id);
  saveCredentials(creds);
  res.status(200).json({ success: true, message: 'User account deleted/revoked.' });
});

// ICT: Send Broadcast Notification
app.post('/api/ict/broadcast', (req, res) => {
  const { message, targetRole } = req.body;
  const db = loadDB();
  db.notifications.push({ id: Date.now().toString(), message, targetRole, date: new Date().toISOString() });
  saveDB(db);
  res.status(201).json({ success: true, message: 'Broadcast notification sent.' });
});

// Get Notifications for User
app.get('/api/notifications/:role', (req, res) => {
  const db = loadDB();
  const role = req.params.role.toUpperCase();
  const notes = db.notifications.filter(n => n.targetRole === 'ALL' || n.targetRole === role);
  res.status(200).json({ success: true, data: notes });
});

app.listen(PORT, () => {
  console.log(` Lux Mundi Server running on http://localhost:${PORT}`);
});