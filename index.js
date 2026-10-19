import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import xss from 'xss';
import dotenv from 'dotenv';
import { getAdminPage } from './admin.js';

dotenv.config();

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(helmet({ contentSecurityPolicy: false })); // Disabled strict CSP to allow embedded CDNs easily

const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// === MongoDB Connection Management ===
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb) return cachedDb;
  if (!process.env.MONGODB_URI) {
    console.error('CRITICAL: MONGODB_URI environment variable is missing.');
    throw new Error('Database configuration missing');
  }
  const client = new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 });
  await client.connect();
  cachedClient = client;
  cachedDb = client.db(process.env.MONGODB_DB_NAME || 'smilecraft');
  await setupDatabase(cachedDb);
  return cachedDb;
}

// === Database Seeding & Setup ===
async function setupDatabase(db) {
  const services = db.collection('services');
  const dentists = db.collection('dentists');
  
  // Indexes for performance
  await db.collection('appointments').createIndex({ dentistId: 1, appointmentStart: 1 });
  await db.collection('appointments').createIndex({ bookingReference: 1 }, { unique: true });

  const serviceCount = await services.countDocuments();
  if (serviceCount === 0) {
    await services.insertMany([
      { name: 'General Dental Checkup', description: 'Comprehensive examination of your oral health.', price: 50, durationMinutes: 30, active: true, onlineBookingEnabled: true, createdAt: new Date() },
      { name: 'Professional Teeth Cleaning', description: 'Thorough cleaning to remove plaque and tartar.', price: 80, durationMinutes: 45, active: true, onlineBookingEnabled: true, createdAt: new Date() },
      { name: 'Teeth Whitening', description: 'Brighten your smile with our professional whitening.', price: 150, durationMinutes: 60, active: true, onlineBookingEnabled: true, createdAt: new Date() },
      { name: 'Dental Fillings', description: 'Restore teeth damaged by decay.', price: 120, durationMinutes: 45, active: true, onlineBookingEnabled: true, createdAt: new Date() },
      { name: 'Root Canal Consultation', description: 'Evaluation for root canal therapy.', price: 90, durationMinutes: 30, active: true, onlineBookingEnabled: true, createdAt: new Date() },
      { name: 'Dental Crowns and Restorations', description: 'Custom crowns to restore tooth shape and size.', price: 250, durationMinutes: 60, active: true, onlineBookingEnabled: true, createdAt: new Date() },
      { name: 'Braces and Orthodontic Consultation', description: 'Discuss options for straightening your teeth.', price: 75, durationMinutes: 30, active: true, onlineBookingEnabled: true, createdAt: new Date() },
      { name: 'Pediatric Dental Consultation', description: 'Gentle care tailored for children.', price: 45, durationMinutes: 30, active: true, onlineBookingEnabled: true, createdAt: new Date() }
    ]);
  }

  const dentistCount = await dentists.countDocuments();
  if (dentistCount === 0) {
    await dentists.insertMany([
      { name: 'Dr. Olivia Bennett', specialty: 'General Dentistry', imageUrl: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=300&q=80', active: true, createdAt: new Date() },
      { name: 'Dr. Ethan Brooks', specialty: 'Cosmetic Dentistry', imageUrl: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=300&q=80', active: true, createdAt: new Date() },
      { name: 'Dr. Sophia Carter', specialty: 'Family and Pediatric Dental Care', imageUrl: 'https://images.unsplash.com/photo-1594824436951-7f12bc41753a?auto=format&fit=crop&w=300&q=80', active: true, createdAt: new Date() }
    ]);
  }
}

// === Security & Middleware ===
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, message: { error: 'Too many requests' } });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts' } });

const authenticateAdmin = (req, res, next) => {
  const token = req.cookies?.admin_session;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.SESSION_SECRET || 'fallback_dev_secret');
    req.admin = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired' });
  }
};

const generateBookingRef = () => 'SC-' + Math.random().toString(36).substring(2, 8).toUpperCase();

// === Helper Functions ===
const clean = (text) => xss(text?.trim() || '');

// === Public API Endpoints ===
app.get('/api/health', async (req, res) => {
  try {
    await connectToDatabase();
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

app.get('/api/services', apiLimiter, async (req, res) => {
  try {
    const db = await connectToDatabase();
    const services = await db.collection('services').find({ ).toArray();
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/dentists', apiLimiter, async (req, res) => {
  try {
    const db = await connectToDatabase();
    const dentists = await db.collection('dentists').find({ active: true }).toArray();
    res.json(dentists);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/availability', apiLimiter, async (req, res) => {
  try {
    const { date, serviceId, dentistId } = req.body;
    if (!date || !serviceId) return res.status(400).json({ error: 'Date and service are required' });

    const reqDate = new Date(date);
    const today = new Date();
    today.setHours(0,0,0,0);
    if (reqDate < today) return res.status(400).json({ error: 'Cannot book in the past' });
    if (reqDate.getDay() === 0) return res.status(400).json({ error: 'Clinic closed on Sundays' });

    const db = await connectToDatabase();
    const service = await db.collection('services').findOne({ _id: new ObjectId(serviceId) });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const duration = service.durationMinutes || 30;
    let startHour = 9, endHour = reqDate.getDay() === 6 ? 14 : 18;
    
    let query = {
        appointmentStart: { $gte: new Date(reqDate.setHours(0,0,0)), $lt: new Date(reqDate.setHours(23,59,59)) },
        status: { $in: ['Pending', 'Confirmed'] }
    };
    if (dentistId) query.dentistId = new ObjectId(dentistId);
    const existing = await db.collection('appointments').find(query).toArray();

    let availableSlots = [];
    let currentTime = new Date(reqDate);
    currentTime.setHours(startHour, 0, 0, 0);
    const endTime = new Date(reqDate);
    endTime.setHours(endHour, 0, 0, 0);

    while (currentTime.getTime() + duration * 60000 <= endTime.getTime()) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);
      const isConflict = existing.some(app => {
        const aStart = new Date(app.appointmentStart).getTime();
        const aEnd = new Date(app.appointmentEnd).getTime();
        return (currentTime.getTime() < aEnd && slotEnd.getTime() > aStart);
      });

      if (!isConflict && currentTime > new Date()) {
        availableSlots.push(currentTime.toISOString());
      }
      currentTime = new Date(currentTime.getTime() + 30 * 60000); // 30 min intervals
    }
    res.json({ slots: availableSlots });
  } catch (err) {
    res.status(500).json({ error: 'Error calculating availability' });
  }
});

app.post('/api/appointments', apiLimiter, async (req, res) => {
  try {
    const { serviceId, dentistId, date, time, name, email, phone, note } = req.body;
    if (!serviceId || !time || !name || !email || !phone) return res.status(400).json({ error: 'Missing required fields' });

    const db = await connectToDatabase();
    const service = await db.collection('services').findOne({ _id: new ObjectId(serviceId) });
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const start = new Date(time);
    const end = new Date(start.getTime() + service.durationMinutes * 60000);

    // Concurrency Check
    const conflictQuery = {
      status: { $in: ['Pending', 'Confirmed'] },
      appointmentStart: { $lt: end },
      appointmentEnd: { $gt: start }
    };
    if (dentistId) conflictQuery.dentistId = new ObjectId(dentistId);
    
    const conflict = await db.collection('appointments').findOne(conflictQuery);
    if (conflict) return res.status(409).json({ error: 'Time slot is no longer available. Please choose another.' });

    const ref = generateBookingRef();
    const appointment = {
      bookingReference: ref,
      patientName: clean(name),
      patientEmail: clean(email),
      patientPhone: clean(phone),
      patientNote: clean(note),
      serviceId: new ObjectId(serviceId),
      serviceNameSnapshot: service.name,
      priceSnapshot: service.price,
      durationSnapshot: service.durationMinutes,
      dentistId: dentistId ? new ObjectId(dentistId) : null,
      appointmentStart: start,
      appointmentEnd: end,
      timezone: process.env.CLINIC_TIMEZONE || 'America/Los_Angeles',
      status: 'Pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.collection('appointments').insertOne(appointment);
    res.json({ success: true, bookingReference: ref, appointment });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

app.post('/api/appointments/lookup', apiLimiter, async (req, res) => {
  try {
    const { reference, email } = req.body;
    const db = await connectToDatabase();
    const appt = await db.collection('appointments').findOne({ bookingReference: clean(reference), patientEmail: clean(email) });
    if (!appt) return res.status(404).json({ error: 'Appointment not found or details incorrect' });
    res.json(appt);
  } catch (err) {
    res.status(500).json({ error: 'Lookup failed' });
  }
});

app.post('/api/contact', apiLimiter, async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'All fields required' });
    const db = await connectToDatabase();
    await db.collection('contactMessages').insertOne({
      name: clean(name), email: clean(email), message: clean(message), status: 'Unread', createdAt: new Date()
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// === Admin Auth Endpoints ===
app.post('/api/admin/login', authLimiter, (req, res) => {
  const { username, password } = req.body;
  const envUser = process.env.ADMIN_USERNAME || 'admin';
  const envPassHash = process.env.ADMIN_PASSWORD_HASH;

  if (!envPassHash) return res.status(500).json({ error: 'Server misconfiguration: No admin password hash set.' });

  if (username === envUser && bcrypt.compareSync(password, envPassHash)) {
    const token = jwt.sign({ username, role: 'admin' }, process.env.SESSION_SECRET || 'fallback_dev_secret', { expiresIn: '8h' });
    res.cookie('admin_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 8 * 60 * 60 * 1000 });
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.json({ success: true });
});

app.get('/api/admin/me', authenticateAdmin, (req, res) => { res.json({ user: req.admin.username }); });

// === Protected Admin Endpoints ===
app.get('/api/admin/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const db = await connectToDatabase();
    const [total, pending, confirmed, cancelled] = await Promise.all([
      db.collection('appointments').countDocuments(),
      db.collection('appointments').countDocuments({ status: 'Pending' }),
      db.collection('appointments').countDocuments({ status: 'Confirmed' }),
      db.collection('appointments').countDocuments({ status: 'Cancelled' })
    ]);
    res.json({ total, pending, confirmed, cancelled });
  } catch (err) { res.status(500).json({ error: 'Failed to load stats' }); }
});

app.get('/api/admin/appointments', authenticateAdmin, async (req, res) => {
  try {
    const db = await connectToDatabase();
    const appointments = await db.collection('appointments').find().sort({ appointmentStart: -1 }).limit(100).toArray();
    res.json(appointments);
  } catch (err) { res.status(500).json({ error: 'Failed' }); }
});

app.patch('/api/admin/appointments/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    
    const db = await connectToDatabase();
    await db.collection('appointments').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status, updatedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Failed to update' }); }
});

// === Public View (Generated HTML/CSS/JS) ===
app.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SmileCraft Dental Studio | Gentle Care</title>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Inter:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    :root {
      --primary: #A78BFA; --primary-dark: #6D5AE6; --mint: #A7F3D0; --aqua: #7DD3FC; --pink: #F9A8D4; --peach: #FDBA9B;
      --bg: #FFF9F2; --white: #FFFFFF; --text: #292644; --muted: #77758C; --success: #22C55E; --error: #EF4444;
      --shadow-outer: 8px 8px 16px rgba(0,0,0,0.05), -8px -8px 16px rgba(255,255,255,0.8);
      --shadow-inner: inset 4px 4px 8px rgba(0,0,0,0.05), inset -4px -4px 8px rgba(255,255,255,0.8);
      --radius: 24px; --radius-sm: 14px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', sans-serif; background-color: var(--bg); color: var(--text); overflow-x: hidden; line-height: 1.6; }
    h1, h2, h3, .logo { font-family: 'Poppins', sans-serif; }
    a { text-decoration: none; color: inherit; }
    
    /* Animations */
    @keyframes float { 0% { transform: translateY(0); } 50% { transform: translateY(-10px); } 100% { transform: translateY(0); } }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .fade-in { animation: fadeIn 0.8s ease-out forwards; opacity: 0; }
    
    /* Layout & Clay Components */
    .container { max-width: 1200px; margin: 0 auto; padding: 0 20px; }
    .clay-card { background: var(--white); border-radius: var(--radius); box-shadow: var(--shadow-outer); transition: transform 0.3s ease; padding: 24px; }
    .clay-card:hover { transform: translateY(-5px); }
    .btn { display: inline-block; background: var(--primary); color: var(--white); padding: 12px 28px; border-radius: var(--radius-sm); border: none; font-family: 'Poppins', sans-serif; font-weight: 600; cursor: pointer; box-shadow: 4px 4px 10px rgba(167, 139, 250, 0.4), -4px -4px 10px rgba(255,255,255,0.8); transition: all 0.2s ease; text-align: center; }
    .btn:hover { background: var(--primary-dark); }
    .btn:active { box-shadow: var(--shadow-inner); transform: scale(0.98); }
    .btn-secondary { background: var(--bg); color: var(--primary-dark); box-shadow: var(--shadow-outer); }
    
    /* Announcement & Nav */
    .announcement { background: linear-gradient(90deg, var(--peach), var(--pink), var(--primary)); color: white; text-align: center; padding: 8px; font-size: 14px; font-weight: 500; }
    header { position: sticky; top: 0; z-index: 1000; background: rgba(255, 249, 242, 0.9); backdrop-filter: blur(10px); padding: 15px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
    .nav-container { display: flex; justify-content: space-between; align-items: center; }
    .logo { font-size: 24px; font-weight: 700; color: var(--primary-dark); display: flex; align-items: center; gap: 8px; }
    .nav-links { display: flex; gap: 24px; align-items: center; }
    .nav-links a:hover { color: var(--primary); }
    .hamburger { display: none; font-size: 24px; cursor: pointer; color: var(--primary-dark); }

    /* Hero Section */
    .hero { padding: 80px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 60px; align-items: center; position: relative; }
    .hero::before { content: ''; position: absolute; width: 400px; height: 400px; background: var(--mint); filter: blur(100px); opacity: 0.3; top: -100px; left: -100px; z-index: -1; border-radius: 50%; }
    .hero-badge { background: var(--white); display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 14px; color: var(--primary-dark); box-shadow: var(--shadow-outer); margin-bottom: 20px; font-weight: 600; }
    .hero h1 { font-size: 48px; line-height: 1.2; margin-bottom: 20px; color: var(--text); }
    .hero p { color: var(--muted); font-size: 18px; margin-bottom: 30px; }
    .hero-buttons { display: flex; gap: 16px; margin-bottom: 30px; }
    .hero-benefits { display: flex; flex-wrap: wrap; gap: 12px; }
    .benefit-label { font-size: 13px; background: var(--white); padding: 6px 12px; border-radius: 12px; box-shadow: var(--shadow-outer); display: flex; align-items: center; gap: 6px; }
    .hero-image { position: relative; }
    .hero-image img { width: 100%; border-radius: var(--radius); box-shadow: var(--shadow-outer); object-fit: cover; aspect-ratio: 4/3; }
    .floating-card { position: absolute; background: var(--white); padding: 12px 20px; border-radius: 16px; box-shadow: var(--shadow-outer); font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 10px; animation: float 4s ease-in-out infinite; }
    .fc-1 { top: 20px; left: -30px; animation-delay: 0s; }
    .fc-2 { bottom: 40px; right: -20px; animation-delay: 1s; }

    /* Sections Shared */
    section { padding: 80px 0; }
    .section-header { text-align: center; margin-bottom: 50px; }
    .section-header h2 { font-size: 36px; color: var(--primary-dark); margin-bottom: 12px; }
    .section-header p { color: var(--muted); font-size: 16px; max-width: 600px; margin: 0 auto; }

    /* Services & Cards Grid */
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 30px; }
    .service-card { text-align: center; }
    .service-icon { width: 80px; height: 80px; margin: 0 auto 20px; border-radius: 50%; background: linear-gradient(135deg, var(--white), var(--bg)); box-shadow: var(--shadow-outer); display: flex; align-items: center; justify-content: center; font-size: 32px; color: var(--primary); }
    .service-card h3 { margin-bottom: 10px; }
    .service-card p { color: var(--muted); font-size: 14px; margin-bottom: 20px; }
    .price-tag { font-weight: 700; color: var(--text); margin-bottom: 15px; display: block; }

    /* Booking Section */
    .booking-section { background: linear-gradient(135deg, rgba(167, 139, 250, 0.1), rgba(167, 243, 208, 0.1)); border-radius: 40px; padding: 60px 40px; max-width: 900px; margin: 0 auto; box-shadow: var(--shadow-outer); }
    .booking-steps { display: flex; justify-content: space-between; margin-bottom: 40px; position: relative; }
    .step { flex: 1; text-align: center; font-weight: 600; color: var(--muted); position: relative; z-index: 1; }
    .step.active { color: var(--primary-dark); }
    .step-circle { width: 40px; height: 40px; border-radius: 50%; background: var(--white); box-shadow: var(--shadow-outer); display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; transition: all 0.3s; }
    .step.active .step-circle { background: var(--primary); color: white; box-shadow: var(--shadow-inner); }
    .form-group { margin-bottom: 20px; text-align: left; }
    .form-group label { display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px; }
    .form-control { width: 100%; padding: 14px; border: none; border-radius: var(--radius-sm); background: var(--white); box-shadow: inset 2px 2px 5px rgba(0,0,0,0.03), inset -2px -2px 5px rgba(255,255,255,1); font-family: inherit; font-size: 15px; transition: outline 0.2s; }
    .form-control:focus { outline: 2px solid var(--primary); }
    .slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; margin-top: 15px; }
    .slot-btn { padding: 10px; border: none; border-radius: 10px; background: var(--white); box-shadow: var(--shadow-outer); cursor: pointer; transition: 0.2s; }
    .slot-btn:hover { background: var(--primary); color: white; }
    .slot-btn.selected { background: var(--primary-dark); color: white; box-shadow: var(--shadow-inner); }
    .booking-actions { display: flex; justify-content: space-between; margin-top: 30px; }
    .step-content { display: none; animation: fadeIn 0.4s; }
    .step-content.active { display: block; }
    #booking-success { display: none; text-align: center; }
    .success-icon { font-size: 60px; color: var(--success); margin-bottom: 20px; animation: float 3s infinite; }

    /* Footer & Utils */
    footer { background: var(--white); padding: 40px 0 20px; border-top: 1px solid rgba(0,0,0,0.05); text-align: center; color: var(--muted); font-size: 14px; }
    .disclaimer { font-size: 12px; opacity: 0.7; margin-top: 20px; }
    .loader { border: 4px solid var(--bg); border-top: 4px solid var(--primary); border-radius: 50%; width: 30px; height: 30px; animation: spin 1s linear infinite; margin: 0 auto; display: none; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .hero { grid-template-columns: 1fr; text-align: center; padding: 40px 0; }
      .hero-buttons { justify-content: center; }
      .nav-links { display: none; flex-direction: column; position: absolute; top: 100%; left: 0; width: 100%; background: var(--white); padding: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
      .nav-links.active { display: flex; }
      .hamburger { display: block; }
      .floating-card { display: none; }
      .booking-section { padding: 30px 20px; }
      .step span { display: none; }
    }
  </style>
</head>
<body>

  <div class="announcement">✨ Your smile deserves the best care! Demo Clinic — Replace Information Before Launch</div>
  
  <header>
    <div class="container nav-container">
      <div class="logo"><i class="fa-solid fa-tooth" style="color:var(--primary)"></i> SmileCraft</div>
      <nav class="nav-links" id="navLinks">
        <a href="#home">Home</a>
        <a href="#services">Services</a>
        <a href="#dentists">Our Dentists</a>
        <a href="#faq">FAQ</a>
        <button class="btn" onclick="document.getElementById('booking').scrollIntoView({behavior:'smooth'})">Book Appointment</button>
      </nav>
      <i class="fa-solid fa-bars hamburger" onclick="document.getElementById('navLinks').classList.toggle('active')"></i>
    </div>
  </header>

  <section class="hero container" id="home">
    <div class="fade-in">
      <div class="hero-badge">Gentle Dental Care for Everyone</div>
      <h1>A Brighter Smile Begins With a Little Care.</h1>
      <p>Gentle Care. Beautiful Smiles. Healthier Lives. Experience modern dentistry in a warm, comfortable environment.</p>
      <div class="hero-buttons">
        <button class="btn" onclick="document.getElementById('booking').scrollIntoView({behavior:'smooth'})">Book Your Visit</button>
        <button class="btn btn-secondary" onclick="document.getElementById('services').scrollIntoView({behavior:'smooth'})">Explore Services</button>
      </div>
      <div class="hero-benefits">
        <div class="benefit-label"><i class="fa-solid fa-heart" style="color:var(--pink)"></i> Gentle Team</div>
        <div class="benefit-label"><i class="fa-solid fa-microscope" style="color:var(--aqua)"></i> Modern Tech</div>
        <div class="benefit-label"><i class="fa-solid fa-user-md" style="color:var(--primary)"></i> Personal Care</div>
      </div>
    </div>
    <div class="hero-image fade-in" style="animation-delay: 0.2s">
      <img src="https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&w=800&q=80" alt="Friendly Dentist Consultation">
      <div class="floating-card fc-1"><i class="fa-solid fa-sparkles" style="color:var(--primary)"></i> Your Smile Matters</div>
      <div class="floating-card fc-2"><i class="fa-solid fa-shield-heart" style="color:var(--pink)"></i> Care Made Comfortable</div>
    </div>
  </section>

  <section class="container" id="services">
    <div class="section-header fade-in">
      <h2>Our Dental Services</h2>
      <p>Comprehensive care tailored to your unique smile. (Sample prices and durations)</p>
    </div>
    <div class="grid" id="services-grid">
      <!-- Injected via JS -->
      <div class="loader" style="display:block"></div>
    </div>
  </section>

  <section class="container" id="dentists">
    <div class="section-header fade-in">
      <h2>Meet Our Dentists</h2>
      <p>Fictional sample profiles for demonstration.</p>
    </div>
    <div class="grid" id="dentists-grid">
      <div class="loader" style="display:block"></div>
    </div>
  </section>

  <section class="container" id="booking">
    <div class="section-header fade-in">
      <h2>Book Your Appointment</h2>
      <p>Securely schedule your visit online in just a few clicks.</p>
    </div>
    <div class="booking-section clay-card fade-in">
      <div id="booking-form-container">
        <div class="booking-steps">
          <div class="step active" id="st-1"><div class="step-circle">1</div><span>Service</span></div>
          <div class="step" id="st-2"><div class="step-circle">2</div><span>Details</span></div>
          <div class="step" id="st-3"><div class="step-circle">3</div><span>Time</span></div>
          <div class="step" id="st-4"><div class="step-circle">4</div><span>Confirm</span></div>
        </div>

        <!-- Step 1 -->
        <div class="step-content active" id="step-1">
          <h3>Choose a Service</h3><br>
          <div class="form-group">
            <select class="form-control" id="bk-service"></select>
          </div>
          <div class="booking-actions"><button class="btn" style="margin-left:auto" onclick="nextStep(2)">Next Step <i class="fa-solid fa-arrow-right"></i></button></div>
        </div>

        <!-- Step 2 -->
        <div class="step-content" id="step-2">
          <h3>Patient Information</h3><br>
          <div class="form-group"><label>Full Name</label><input type="text" class="form-control" id="bk-name" placeholder="John Doe"></div>
          <div class="form-group"><label>Email Address</label><input type="email" class="form-control" id="bk-email" placeholder="john@example.com"></div>
          <div class="form-group"><label>Phone Number</label><input type="tel" class="form-control" id="bk-phone" placeholder="+1 555 000 0000"></div>
          <div class="booking-actions">
            <button class="btn btn-secondary" onclick="nextStep(1)">Back</button>
            <button class="btn" onclick="nextStep(3)">Next Step</button>
          </div>
        </div>

        <!-- Step 3 -->
        <div class="step-content" id="step-3">
          <h3>Select Date & Time</h3><br>
          <div class="form-group">
            <label>Preferred Dentist (Optional)</label>
            <select class="form-control" id="bk-dentist"><option value="">Any Available Dentist</option></select>
          </div>
          <div class="form-group">
            <label>Select Date (Mon-Sat)</label>
            <input type="date" class="form-control" id="bk-date" onchange="fetchAvailability()">
          </div>
          <div class="form-group" id="slots-container" style="display:none">
            <label>Available Times</label>
            <div class="loader" id="slot-loader"></div>
            <div class="slot-grid" id="bk-slots"></div>
          </div>
          <div class="booking-actions">
            <button class="btn btn-secondary" onclick="nextStep(2)">Back</button>
            <button class="btn" onclick="nextStep(4)" id="btn-to-4" disabled>Review Booking</button>
          </div>
        </div>

        <!-- Step 4 -->
        <div class="step-content" id="step-4">
          <h3>Review & Confirm</h3><br>
          <div class="clay-card" style="background:var(--bg); margin-bottom:20px;">
            <p><strong>Service:</strong> <span id="rv-service"></span></p>
            <p><strong>Patient:</strong> <span id="rv-name"></span></p>
            <p><strong>Date & Time:</strong> <span id="rv-datetime"></span></p>
          </div>
          <p style="font-size:13px; color:var(--muted); margin-bottom:20px;">By confirming, you agree to our fictional demo privacy notice.</p>
          <div class="loader" id="submit-loader"></div>
          <p id="submit-error" style="color:var(--error); font-weight:500; display:none;"></p>
          <div class="booking-actions" id="submit-actions">
            <button class="btn btn-secondary" onclick="nextStep(3)">Back</button>
            <button class="btn" style="background:var(--success)" onclick="submitBooking()">Confirm Appointment</button>
          </div>
        </div>
      </div>

      <!-- Success Screen -->
      <div id="booking-success">
        <i class="fa-solid fa-circle-check success-icon"></i>
        <h2>Request Received!</h2>
        <p style="margin: 15px 0; color:var(--muted)">Your booking reference is:</p>
        <h3 style="font-size: 28px; color:var(--primary-dark); margin-bottom:20px;" id="success-ref"></h3>
        <button class="btn" onclick="location.reload()">Done</button>
      </div>
    </div>
  </section>

  <footer>
    <div class="container">
      <p>&copy; <script>document.write(new Date().getFullYear())</script> SmileCraft Dental Studio. All rights reserved.</p>
      <p class="disclaimer">DEMONSTRATION ONLY. All data, clinics, dentists, and reviews are fictional. Do not enter real medical info.</p>
      <a href="/admin" style="font-size:12px; margin-top:10px; display:inline-block; text-decoration:underline;">Admin Dashboard Access</a>
    </div>
  </footer>

  <script>
    // State
    let services = [], dentists = [], selectedSlot = null;

    // Initialization
    async function init() {
      try {
        const [srvRes, dentRes] = await Promise.all([fetch('/api/services'), fetch('/api/dentists')]);
        services = await srvRes.json();
        dentists = await dentRes.json();
        
        renderServices();
        renderDentists();
        populateDropdowns();
        
        // Set min date for booking
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('bk-date').setAttribute('min', today);
      } catch (err) { console.error('Error loading data'); }
    }

    function renderServices() {
      const grid = document.getElementById('services-grid');
      grid.innerHTML = services.map(s => \`
        <div class="clay-card service-card">
          <div class="service-icon"><i class="fa-solid fa-tooth"></i></div>
          <h3>\${s.name}</h3>
          <p>\${s.description}</p>
          <span class="price-tag">$\${s.price} • \${s.durationMinutes} mins</span>
          <button class="btn btn-secondary" onclick="selectServiceForBooking('\${s._id}')">Book This Service</button>
        </div>
      \`).join('');
    }

    function renderDentists() {
      const grid = document.getElementById('dentists-grid');
      grid.innerHTML = dentists.map(d => \`
        <div class="clay-card service-card">
          <img src="\${d.imageUrl}" alt="\${d.name}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;margin-bottom:15px;box-shadow:var(--shadow-outer);">
          <h3>\${d.name}</h3>
          <p style="color:var(--primary-dark); font-weight:600; margin-bottom:5px;">\${d.specialty}</p>
          <p>Sample profile.</p>
        </div>
      \`).join('');
    }

    function populateDropdowns() {
      document.getElementById('bk-service').innerHTML = services.map(s => \`<option value="\${s._id}">\${s.name} ($\${s.price})</option>\`).join('');
      document.getElementById('bk-dentist').innerHTML += dentists.map(d => \`<option value="\${d._id}">\${d.name}</option>\`).join('');
    }

    function selectServiceForBooking(id) {
      document.getElementById('bk-service').value = id;
      document.getElementById('booking').scrollIntoView({behavior:'smooth'});
      nextStep(1);
    }

    // Booking Wizard Logic
    function nextStep(step) {
      if(step === 2) {
        if(!document.getElementById('bk-service').value) return alert('Select a service');
      }
      if(step === 3) {
        if(!document.getElementById('bk-name').value || !document.getElementById('bk-email').value || !document.getElementById('bk-phone').value) {
          return alert('Please fill all patient details');
        }
      }
      if(step === 4) {
        if(!selectedSlot) return alert('Please select a time slot');
        // Populate review
        const srvId = document.getElementById('bk-service').value;
        const srvName = services.find(s=>s._id===srvId)?.name;
        document.getElementById('rv-service').innerText = srvName;
        document.getElementById('rv-name').innerText = document.getElementById('bk-name').value;
        document.getElementById('rv-datetime').innerText = new Date(selectedSlot).toLocaleString();
      }

      document.querySelectorAll('.step-content').forEach(el => el.classList.remove('active'));
      document.getElementById('step-'+step).classList.add('active');
      document.querySelectorAll('.step').forEach((el, idx) => {
        el.classList.toggle('active', idx < step);
      });
    }

    async function fetchAvailability() {
      const date = document.getElementById('bk-date').value;
      if(!date) return;
      
      const dObj = new Date(date);
      if(dObj.getDay() === 0) { alert('Clinic is closed on Sundays'); document.getElementById('bk-date').value=''; return; }

      document.getElementById('slots-container').style.display = 'block';
      document.getElementById('slot-loader').style.display = 'block';
      document.getElementById('bk-slots').innerHTML = '';
      selectedSlot = null;
      document.getElementById('btn-to-4').disabled = true;

      try {
        const res = await fetch('/api/availability', {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            date, serviceId: document.getElementById('bk-service').value, dentistId: document.getElementById('bk-dentist').value
          })
        });
        const data = await res.json();
        document.getElementById('slot-loader').style.display = 'none';
        
        if(data.error) throw new Error(data.error);
        if(data.slots.length === 0) {
          document.getElementById('bk-slots').innerHTML = '<p>No slots available on this date.</p>';
          return;
        }

        document.getElementById('bk-slots').innerHTML = data.slots.map(iso => {
          const t = new Date(iso).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
          return \`<button class="slot-btn" onclick="selectSlot('\${iso}', this)">\${t}</button>\`;
        }).join('');

      } catch (err) {
        document.getElementById('slot-loader').style.display = 'none';
        document.getElementById('bk-slots').innerHTML = \`<p style="color:var(--error)">\${err.message}</p>\`;
      }
    }

    function selectSlot(iso, btnEl) {
      selectedSlot = iso;
      document.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
      btnEl.classList.add('selected');
      document.getElementById('btn-to-4').disabled = false;
    }

    async function submitBooking() {
      document.getElementById('submit-actions').style.display = 'none';
      document.getElementById('submit-loader').style.display = 'block';
      document.getElementById('submit-error').style.display = 'none';

      const payload = {
        serviceId: document.getElementById('bk-service').value,
        dentistId: document.getElementById('bk-dentist').value || null,
        date: document.getElementById('bk-date').value,
        time: selectedSlot,
        name: document.getElementById('bk-name').value,
        email: document.getElementById('bk-email').value,
        phone: document.getElementById('bk-phone').value
      };

      try {
        const res = await fetch('/api/appointments', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(data.error) throw new Error(data.error);

        document.getElementById('booking-form-container').style.display = 'none';
        document.getElementById('booking-success').style.display = 'block';
        document.getElementById('success-ref').innerText = data.bookingReference;
      } catch (err) {
        document.getElementById('submit-actions').style.display = 'flex';
        document.getElementById('submit-loader').style.display = 'none';
        document.getElementById('submit-error').innerText = err.message;
        document.getElementById('submit-error').style.display = 'block';
      }
    }

    // Scroll Observer for Fade-ins
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => { if (entry.isIntersecting) entry.target.style.animationPlayState = 'running'; });
    });
    document.querySelectorAll('.fade-in').forEach(el => { el.style.animationPlayState = 'paused'; observer.observe(el); });

    init();
  </script>
</body>
</html>
  `;
  res.send(html);
});

// === Admin Interface Route ===
app.get('/admin', (req, res) => {
  res.send(getAdminPage());
});

// === Vercel Serverless Export ===
export default app;

if (isDev) {
  app.listen(PORT, () => console.log(`Dev server running on http://localhost:${PORT}`));
}
