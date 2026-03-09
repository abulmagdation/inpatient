// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'AbuAlMajdSuperSecretKey2026';

// ==========================================
// 1. Database Connection
// ==========================================
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://abulmagd:Abulmagd610@cluster0.blq59le.mongodb.net/hospital_ward?appName=Cluster0')
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    seedInitialUser(); // إنشاء مستخدم افتراضي لو الداتا بيز فاضية
  })
  .catch(err => console.error(err));

// ==========================================
// 2. Models
// ==========================================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  theme: { type: String, enum: ['light', 'dark'], default: 'light' }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const bedSchema = new mongoose.Schema({
  bedNumber: String,
  isOccupied: { type: Boolean, default: false },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null }
});

const roomSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true, unique: true },
  floor: { type: String, required: true },
  totalBeds: { type: Number, required: true },
  occupiedBeds: { type: Number, default: 0 },
  beds: [bedSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // تتبع المنشئ
}, { timestamps: true });
const Room = mongoose.model('Room', roomSchema);

const tubeSchema = new mongoose.Schema({
  type: String, location: String, insertionDate: Date, removalDate: Date
});

const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  medicalNumber: { type: String, required: true, unique: true },
  diagnosis: { type: String, required: true },
  doctorName: { type: String, required: true },
  status: { type: String, enum: ['stable', 'fair', 'critical', 'discharged'], default: 'stable' },
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  bedNumber: String,
  admissionDate: { type: Date, required: true },
  dischargeDate: { type: Date }, 
  nutrition: { type: String, default: 'اعتيادي' },
  medicalHistory: [String],
  tubes: [tubeSchema],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // تتبع المنشئ
}, { timestamps: true });
const Patient = mongoose.model('Patient', patientSchema);

const vitalSignsSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  recordedAt: { type: Date, required: true },
  heartRate: { type: Number, required: true }, systolicBP: { type: Number, required: true },
  diastolicBP: { type: Number, required: true }, temperature: { type: Number, required: true },
  oxygenSaturation: { type: Number, required: true }, respiratoryRate: { type: Number, required: true },
  bloodSugar: { type: Number },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } 
});
const VitalSigns = mongoose.model('VitalSigns', vitalSignsSchema);

const medicationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  name: { type: String, required: true }, dose: { type: String, required: true }, route: { type: String, required: true },
  addedAt: { type: Date, required: true }, frequency: { type: Number, required: true }, doseTimes: [{ type: Date, required: true }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const Medication = mongoose.model('Medication', medicationSchema);

const nursingNoteSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  text: { type: String, required: true },
  recordedAt: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const NursingNote = mongoose.model('NursingNote', nursingNoteSchema);

const taskSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  text: { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  targetDate: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});
const Task = mongoose.model('Task', taskSchema);

// ==========================================
// 3. Authentication & Middleware
// ==========================================

const seedInitialUser = async () => {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      const hashedPassword = await bcrypt.hash('123456', 10);
      await new User({ username: 'admin', password: hashedPassword, name: 'عبدالرحمن أبو المجد', theme: 'light' }).save();
      console.log('✅ تم إنشاء مستخدم افتراضي: Username: admin | Password: 123456');
    }
  } catch (e) { console.error('Error seeding user:', e); }
};

// دالة التحقق من التوكن (بوابة الأمان)
const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'عفواً، يجب تسجيل الدخول أولاً' });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(401).json({ error: 'الجلسة انتهت أو غير صالحة، برجاء تسجيل الدخول مجدداً' });
  }
};

// مسار تسجيل الدخول
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: 'بيانات الدخول غير صحيحة' });

    const token = jwt.sign({ id: user._id, name: user.name, theme: user.theme }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, username: user.username, theme: user.theme } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// مسار حفظ وتحديث الثيم في الداتا بيز
app.put('/api/users/theme', auth, async (req, res) => {
  try {
    const { theme } = req.body;
    await User.findByIdAndUpdate(req.user.id, { theme });
    res.json({ success: true, theme });
  } catch (e) { res.status(400).json({ error: e.message }); }
});


// ==========================================
// 4. API Routes (Protected with `auth`)
// ==========================================

app.get('/api/patients', auth, async (req, res) => { 
  res.json(await Patient.find().populate('room').populate('createdBy', 'name').sort('-createdAt')); 
});

app.post('/api/patients', auth, async (req, res) => {
  try {
    const newPatient = new Patient({ ...req.body, createdBy: req.user.id }); // تسجيل مين اللي ضاف
    await newPatient.save();
    
    if (req.body.room && req.body.bedNumber) {
      try {
        await Room.findOneAndUpdate(
          { _id: req.body.room, 'beds.bedNumber': req.body.bedNumber }, 
          { $set: { 'beds.$.isOccupied': true, 'beds.$.patient': newPatient._id }, $inc: { occupiedBeds: 1 } }
        );
      } catch (roomErr) { console.error('خطأ مزامنة', roomErr); }
    }
    res.status(201).json(newPatient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/patients/:id', auth, async (req, res) => { 
  try { 
    const oldPatient = await Patient.findById(req.params.id);
    if (!oldPatient) return res.status(404).json({ error: 'Patient not found' });

    const updatedPatient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true }); 

    const oldRoomId = oldPatient.room ? oldPatient.room.toString() : null;
    const newRoomId = updatedPatient.room ? updatedPatient.room.toString() : null;
    const oldBed = oldPatient.bedNumber;
    const newBed = updatedPatient.bedNumber;

    if (oldRoomId !== newRoomId || oldBed !== newBed) {
      try {
        if (oldRoomId && oldBed) {
          await Room.findOneAndUpdate( { _id: oldRoomId, 'beds.bedNumber': oldBed }, { $set: { 'beds.$.isOccupied': false, 'beds.$.patient': null }, $inc: { occupiedBeds: -1 } } );
        }
        if (newRoomId && newBed) {
          await Room.findOneAndUpdate( { _id: newRoomId, 'beds.bedNumber': newBed }, { $set: { 'beds.$.isOccupied': true, 'beds.$.patient': updatedPatient._id }, $inc: { occupiedBeds: 1 } } );
        }
      } catch (syncErr) { console.error('خطأ مزامنة نقل', syncErr); }
    }
    res.json(updatedPatient); 
  } catch (error) { res.status(400).json({ error: error.message }); } 
});

app.patch('/api/patients/:id/discharge', auth, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({error: 'Patient not found'});
    if (patient.room && patient.bedNumber) {
      await Room.findOneAndUpdate( { _id: patient.room, 'beds.bedNumber': patient.bedNumber }, { $set: { 'beds.$.isOccupied': false, 'beds.$.patient': null }, $inc: { occupiedBeds: -1 } } );
    }
    patient.status = 'discharged'; patient.dischargeDate = new Date();
    patient.room = null; patient.bedNumber = null;
    await patient.save(); res.json(patient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/reports/shift', auth, async (req, res) => {
  try {
    const { shiftDate } = req.body;
    const startOfShift = new Date(shiftDate); startOfShift.setHours(8, 0, 0, 0);
    const endOfShift = new Date(startOfShift); endOfShift.setDate(endOfShift.getDate() + 1);
    const startOfNextShift = new Date(endOfShift);
    const endOfNextShift = new Date(startOfNextShift); endOfNextShift.setDate(endOfNextShift.getDate() + 1);

    const patients = await Patient.find({
      admissionDate: { $lt: endOfShift },
      $or: [ { dischargeDate: null }, { dischargeDate: { $exists: false } }, { dischargeDate: { $gte: endOfShift } } ]
    }).populate('room');

    const reportData = [];
    for (const p of patients) {
      const notes = await NursingNote.find({ patient: p._id, recordedAt: { $gte: startOfShift, $lt: endOfShift } }).populate('createdBy', 'name').sort('recordedAt');
      const tasks = await Task.find({ patient: p._id, targetDate: { $gte: startOfNextShift, $lt: endOfNextShift } }).populate('createdBy', 'name').sort('createdAt');
      reportData.push({ patient: p, notes, tasks });
    }
    res.json(reportData);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// Routes related to user tracking insertion
app.get('/api/vitals/patient/:patientId', auth, async (req, res) => { res.json(await VitalSigns.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort('-recordedAt')); });
app.post('/api/vitals', auth, async (req, res) => { try { const v = new VitalSigns({...req.body, createdBy: req.user.id}); await v.save(); res.status(201).json(v); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/vitals/:id', auth, async (req, res) => { await VitalSigns.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/medications/patient/:patientId', auth, async (req, res) => { res.json(await Medication.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort('-addedAt')); });
app.post('/api/medications', auth, async (req, res) => { try { const m = new Medication({...req.body, createdBy: req.user.id}); await m.save(); res.status(201).json(m); } catch (e) { res.status(400).json({ error: e.message }); } });
app.put('/api/medications/:id', auth, async (req, res) => { try { res.json(await Medication.findByIdAndUpdate(req.params.id, req.body, {new: true})); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/medications/:id', auth, async (req, res) => { await Medication.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/rooms', auth, async (req, res) => { res.json(await Room.find().populate('beds.patient').populate('createdBy', 'name')); });
app.post('/api/rooms', auth, async (req, res) => { 
  try { 
    const roomData = req.body;
    if (!roomData.beds || roomData.beds.length === 0) {
      roomData.beds = [];
      const bedsCount = parseInt(roomData.totalBeds) || 1;
      for (let i = 1; i <= bedsCount; i++) {
        roomData.beds.push({ bedNumber: `${roomData.roomNumber}-${i}`, isOccupied: false, patient: null });
      }
    }
    const r = new Room({...roomData, createdBy: req.user.id}); 
    await r.save(); 
    res.status(201).json(r); 
  } catch (e) { res.status(400).json({ error: e.message }); } 
});
app.put('/api/rooms/:id', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    const newTotal = parseInt(req.body.totalBeds);
    if (newTotal < room.occupiedBeds) return res.status(400).json({error: 'لا يمكن تقليل الأسرة لعدد أقل من المرضى المحجوزين'});
    room.roomNumber = req.body.roomNumber || room.roomNumber;
    room.floor = req.body.floor || room.floor;
    if (newTotal > room.totalBeds) {
      for (let i = room.totalBeds + 1; i <= newTotal; i++) {
        room.beds.push({ bedNumber: `${room.roomNumber}-${i}`, isOccupied: false, patient: null });
      }
    } else if (newTotal < room.totalBeds) {
      let diff = room.totalBeds - newTotal;
      for (let i = room.beds.length - 1; i >= 0 && diff > 0; i--) {
        if (!room.beds[i].isOccupied) { room.beds.splice(i, 1); diff--; }
      }
    }
    room.totalBeds = newTotal;
    await room.save(); res.json(room);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/rooms/:id', auth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (room.occupiedBeds > 0) return res.status(400).json({error: 'لا يمكن حذف غرفة بها مرضى محجوزين'});
    await Room.findByIdAndDelete(req.params.id); res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/notes/patient/:patientId', auth, async (req, res) => { res.json(await NursingNote.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort('-recordedAt')); });
app.post('/api/notes', auth, async (req, res) => { try { const n = new NursingNote({...req.body, createdBy: req.user.id}); await n.save(); res.status(201).json(n); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/notes/:id', auth, async (req, res) => { await NursingNote.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/tasks/patient/:patientId', auth, async (req, res) => { res.json(await Task.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort('createdAt')); });
app.post('/api/tasks', auth, async (req, res) => { try { const t = new Task({...req.body, createdBy: req.user.id}); await t.save(); res.status(201).json(t); } catch (e) { res.status(400).json({ error: e.message }); } });
app.put('/api/tasks/:id', auth, async (req, res) => { try { res.json(await Task.findByIdAndUpdate(req.params.id, req.body, {new: true})); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/tasks/:id', auth, async (req, res) => { await Task.findByIdAndDelete(req.params.id); res.json({ success: true }); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));