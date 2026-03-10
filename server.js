// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ==========================================
// 1. الإعدادات الأساسية (Setup)
// ==========================================
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
// 🌐 تم إرجاع رابط قاعدة بيانات MongoDB Atlas الخاص بك
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://abulmagd:Abulmagd610@cluster0.blq59le.mongodb.net/hospital_ward?appName=Cluster0';
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// الاتصال بقاعدة البيانات
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ تم الاتصال بقاعدة بيانات Atlas بنجاح'))
  .catch((err) => console.log('❌ خطأ في الاتصال بقاعدة البيانات:', err));

// ==========================================
// 2. النماذج (Mongoose Models)
// ==========================================

// --- موديل المستخدم ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  theme: { type: String, default: 'light' }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

// --- موديل الغرف ---
const bedSchema = new mongoose.Schema({
  bedNumber: { type: String, required: true },
  isOccupied: { type: Boolean, default: false }
});
const roomSchema = new mongoose.Schema({
  roomNumber: { type: String, required: true, unique: true },
  floor: { type: String, required: true },
  totalBeds: { type: Number, required: true, min: 1 },
  beds: [bedSchema]
}, { timestamps: true });
const Room = mongoose.model('Room', roomSchema);

// --- موديل المرضى ---
const tubeSchema = new mongoose.Schema({
  type: String,
  location: String,
  insertionDate: Date,
  removalDate: Date
});
const patientSchema = new mongoose.Schema({
  name: { type: String, required: true },
  medicalNumber: { type: String, required: true, unique: true },
  diagnosis: { type: String, required: true },
  doctorName: { type: String, required: true },
  admissionDate: { type: Date, default: Date.now },
  
  // ==========================================
  // الإضافات الجديدة
  // ==========================================
  dateOfBirth: { type: Date },
  admissionSource: { type: String, enum: ['الطوارئ', 'مكتب الدخول'], default: 'الطوارئ' },
  phoneNumber: { type: String },
  nationalId: { type: String },
  // ==========================================

  nutrition: { type: String, default: 'اعتيادي' },
  medicalHistory: [String],
  tubes: [tubeSchema],
  room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
  bedNumber: String,
  status: { type: String, enum: ['active', 'discharged'], default: 'active' }
}, { timestamps: true });
const Patient = mongoose.model('Patient', patientSchema);

// --- موديل العلامات الحيوية ---
const vitalSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  heartRate: String,
  systolicBP: String,
  diastolicBP: String,
  temperature: String,
  respiratoryRate: String,
  oxygenSaturation: String,
  bloodSugar: String,
  recordedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Vital = mongoose.model('Vital', vitalSchema);

// --- موديل الأدوية ---
const medicationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  name: { type: String, required: true },
  dose: { type: String, required: true },
  route: { type: String, required: true },
  frequency: { type: Number, required: true },
  doseTimes: [Date],
  addedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Medication = mongoose.model('Medication', medicationSchema);

// --- موديل الملاحظات التمريضية ---
const noteSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  text: { type: String, required: true },
  recordedAt: { type: Date, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Note = mongoose.model('Note', noteSchema);

// --- موديل المهام ---
const taskSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  text: { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
  targetDate: { type: Date, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });
const Task = mongoose.model('Task', taskSchema);

// ==========================================
// 3. ميدل وير الحماية (Auth Middleware)
// ==========================================
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');
      next();
    } catch (error) {
      return res.status(401).json({ error: 'غير مصرح لك، التوكن غير صالح' });
    }
  }
  if (!token) {
    return res.status(401).json({ error: 'غير مصرح لك، لا يوجد توكن' });
  }
};

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

// ==========================================
// 4. المسارات والعمليات (Routes & Controllers)
// ==========================================

// ----- المصادقة والمستخدمين -----
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        user: { _id: user._id, name: user.name, username: user.username, theme: user.theme },
        token: generateToken(user._id)
      });
    } else {
      res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/users/theme', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (user) {
      user.theme = req.body.theme;
      await user.save();
      res.json({ message: 'تم تحديث المظهر' });
    } else { res.status(404).json({ error: 'المستخدم غير موجود' }); }
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/users/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });

    const { name, username, password } = req.body;
    
    if (name) user.name = name;
    if (username) user.username = username.toLowerCase();
    
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(password, salt);
    }

    await user.save();
    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      theme: user.theme,
      token: generateToken(user._id) 
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً، اختر اسماً آخر' });
    }
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث البيانات' });
  }
});

// ----- الغرف -----
app.get('/api/rooms', protect, async (req, res) => {
  try { const rooms = await Room.find(); res.json(rooms); } 
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/rooms', protect, async (req, res) => {
  try {
    const { roomNumber, floor, totalBeds } = req.body;
    const beds = [];
    for (let i = 1; i <= totalBeds; i++) { beds.push({ bedNumber: `${roomNumber}-${i}` }); }
    const room = new Room({ roomNumber, floor, totalBeds, beds });
    await room.save();
    res.status(201).json(room);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/rooms/:id', protect, async (req, res) => {
  try {
    const { roomNumber, floor, totalBeds } = req.body;
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ error: 'الغرفة غير موجودة' });
    
    room.roomNumber = roomNumber || room.roomNumber;
    room.floor = floor || room.floor;
    
    if (totalBeds && totalBeds > room.beds.length) {
      const diff = totalBeds - room.beds.length;
      for (let i = 1; i <= diff; i++) {
        room.beds.push({ bedNumber: `${room.roomNumber}-${room.beds.length + 1}` });
      }
      room.totalBeds = totalBeds;
    }
    await room.save();
    res.json(room);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/rooms/:id', protect, async (req, res) => {
  try {
    await Room.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الغرفة' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ----- المرضى -----
app.get('/api/patients', protect, async (req, res) => {
  try {
    const patients = await Patient.find({ status: 'active' }).populate('room');
    res.json(patients);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/patients', protect, async (req, res) => {
  try {
    const patient = new Patient(req.body);
    await patient.save();
    res.status(201).json(patient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/patients/:id', protect, async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(patient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.patch('/api/patients/:id/discharge', protect, async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(req.params.id, { status: 'discharged', room: null, bedNumber: null }, { new: true });
    res.json(patient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// ----- العلامات الحيوية -----
app.get('/api/vitals/patient/:patientId', protect, async (req, res) => {
  try {
    const vitals = await Vital.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort({ recordedAt: -1 });
    res.json(vitals);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/vitals', protect, async (req, res) => {
  try {
    const vital = new Vital({ ...req.body, createdBy: req.user._id });
    await vital.save();
    res.status(201).json(vital);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/vitals/:id', protect, async (req, res) => {
  try {
    await Vital.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف القراءة' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ----- الأدوية -----
app.get('/api/medications/patient/:patientId', protect, async (req, res) => {
  try {
    const meds = await Medication.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort({ addedAt: -1 });
    res.json(meds);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/medications', protect, async (req, res) => {
  try {
    const med = new Medication({ ...req.body, createdBy: req.user._id });
    await med.save();
    res.status(201).json(med);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/medications/:id', protect, async (req, res) => {
  try {
    await Medication.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف الدواء' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ----- الملاحظات التمريضية -----
app.get('/api/notes/patient/:patientId', protect, async (req, res) => {
  try {
    const notes = await Note.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort({ recordedAt: -1 });
    res.json(notes);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/notes', protect, async (req, res) => {
  try {
    const note = new Note({ ...req.body, createdBy: req.user._id });
    await note.save();
    res.status(201).json(note);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

// ----- المهام -----
app.get('/api/tasks/patient/:patientId', protect, async (req, res) => {
  try {
    const tasks = await Task.find({ patient: req.params.patientId }).populate('createdBy', 'name').sort({ targetDate: 1 });
    res.json(tasks);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/tasks', protect, async (req, res) => {
  try {
    const task = new Task({ ...req.body, createdBy: req.user._id });
    await task.save();
    res.status(201).json(task);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/tasks/:id', protect, async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ error: 'المهمة غير موجودة' });
    task.isCompleted = req.body.isCompleted;
    await task.save();
    res.json(task);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/tasks/:id', protect, async (req, res) => {
  try {
    await Task.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف المهمة' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ----- التقارير -----
app.post('/api/reports/shift', protect, async (req, res) => {
  try {
    const { shiftDate } = req.body;
    const targetDate = new Date(shiftDate);
    targetDate.setHours(8, 0, 0, 0);
    const endDate = new Date(targetDate);
    endDate.setDate(endDate.getDate() + 1);

    const patients = await Patient.find({ status: 'active' }).populate('room');
    
    const reportData = await Promise.all(patients.map(async (p) => {
      const notes = await Note.find({
        patient: p._id,
        recordedAt: { $gte: targetDate, $lt: endDate }
      }).populate('createdBy', 'name').sort({ recordedAt: 1 });

      const tasks = await Task.find({
        patient: p._id,
        $or: [
          { createdAt: { $gte: targetDate, $lt: endDate } },
          { targetDate: { $gte: targetDate, $lt: endDate } }
        ]
      }).populate('createdBy', 'name');

      return { patient: p, notes, tasks };
    }));

    res.json(reportData);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ==========================================
// 5. تشغيل السيرفر
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل على بورت ${PORT}`);
});
