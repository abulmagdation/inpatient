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
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Abulmagd:Abulmagd610@cluster0.fac4uzx.mongodb.net/inpatient?appName=Cluster0';
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// ==========================================
// 2. النماذج (Mongoose Models)
// ==========================================

// --- موديل المستخدم ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  theme: { type: String, default: 'light' },
  // التعديل هنا ضفنا admin_owner
  role: { type: String, enum: ['admin_owner', 'admin', 'charge_nurse', 'staff_nurse'], default: 'staff_nurse' },
  floor: { type: String, default: '' },
  token: { type: String, default: null } 
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
  dateOfBirth: { type: Date }, // ضفنا تاريخ الميلاد
  admissionSource: { type: String, default: 'الطوارئ' }, // ضفنا جهة الدخول
  phoneNumber: { type: String }, // ضفنا رقم التليفون
  nationalId: { type: String }, // ضفنا الرقم القومي
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

// --- موديل الأقسام ---
const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
}, { timestamps: true });
const Department = mongoose.model('Department', departmentSchema);

// ==========================================
// 3. إنشاء حساب المدير الافتراضي
// ==========================================
const createDefaultAdmin = async () => {
  try {
    const adminExists = await User.findOne({ username: 'Abulmagd' });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('123', salt); // الباسورد الافتراضي

      const adminUser = new User({
        name: 'عبدالرحمن أبو المجد',
        username: 'Abulmagd',
        password: hashedPassword,
        theme: 'dark', 
        role: 'admin_owner', // <--- هنا التعديل
        floor: ''
      });

      await adminUser.save();
      console.log('✅ تم إنشاء حساب المدير (أبو المجد) بنجاح!');
      console.log('🔹 اسم المستخدم: abo_elmagd');
      console.log('🔹 كلمة المرور: admin123');
    }
  } catch (error) {
    console.log('❌ خطأ في إنشاء حساب المدير:', error);
  }
};

// ==========================================
// الاتصال بقاعدة البيانات وتشغيل السيرفر
// ==========================================
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ تم الاتصال بقاعدة البيانات بنجاح');
    createDefaultAdmin(); // استدعاء دالة الكريت بعد الاتصال مباشرة
  })
  .catch((err) => console.log('❌ خطأ في الاتصال بقاعدة البيانات:', err));


// في ملف السيرفر (Node.js)

// الإصدار الإجباري اللي السيرفر متوقعه
const REQUIRED_APP_VERSION = '1.0.0'; 

// Middleware للتحقق من الإصدار
const checkAppVersion = (req, res, next) => {
  // ممكن نستثني مسارات معينة زي الدخول لو حابب، بس الأفضل تطبقه على كل حاجة
  const clientVersion = req.headers['x-app-version'];

  // لو الإصدار مبعوت ومختلف عن الإصدار المطلوب
  if (clientVersion && clientVersion !== REQUIRED_APP_VERSION) {
    // 426 تعني Upgrade Required
    return res.status(426).json({ 
      error: 'إصدار التطبيق قديم، برجاء التحديث للنسخة الأحدث.' 
    });
  }

  next();
};

// تشغيل الـ Middleware على كل الطلبات
app.use(checkAppVersion);

// ==========================================
// 4. ميدل وير الحماية (Auth Middleware)
// ==========================================
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user || user.token !== token) {
        return res.status(401).json({ error: 'الجلسة انتهت، برجاء تسجيل الدخول مجدداً' });
      }
      
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ error: 'غير مصرح لك، التوكن غير صالح' });
    }
  }
  if (!token) {
    return res.status(401).json({ error: 'غير مصرح لك، لا يوجد توكن' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'admin_owner')) {
    next();
  } else {
    res.status(403).json({ error: 'غير مصرح! هذه الصلاحية لمدير النظام فقط.' });
  }
};

const requireChargeOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'admin_owner' || req.user.role === 'charge_nurse')) {
    next();
  } else {
    res.status(403).json({ error: 'غير مصرح! هذه الصلاحية لمشرف القسم أو المدير فقط.' });
  }
};

const generateToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });
};

// ==========================================
// 5. المسارات والعمليات (Routes & Controllers)
// ==========================================

// ----- المصادقة -----
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username: username.toLowerCase() });
    if (user && (await bcrypt.compare(password, user.password))) {
      const token = generateToken(user._id);
      user.token = token; 
      await user.save();
      
      res.json({
        user: { _id: user._id, name: user.name, username: user.username, theme: user.theme, role: user.role, floor: user.floor },
        token: token
      });
    } else {
      res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    }
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/logout', protect, async (req, res) => {
  try {
    req.user.token = null;
    await req.user.save();
    res.json({ message: 'تم تسجيل الخروج' });
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

    const token = generateToken(user._id);
    user.token = token;
    await user.save();
    
    res.json({
      _id: user._id,
      name: user.name,
      username: user.username,
      theme: user.theme,
      role: user.role,
      floor: user.floor,
      token: token 
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'اسم المستخدم هذا مسجل مسبقاً، اختر اسماً آخر' });
    }
    res.status(500).json({ error: 'حدث خطأ أثناء تحديث البيانات' });
  }
});

// ----- إدارة المستخدمين (للمدير فقط) -----
app.get('/api/users', protect, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/users', protect, requireAdmin, async (req, res) => {
  try {
    const { name, username, password, role, floor } = req.body;
    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) return res.status(400).json({ error: 'اسم المستخدم موجود بالفعل' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({ 
      name, 
      username: username.toLowerCase(), 
      password: hashedPassword, 
      role: role || 'staff_nurse', 
      floor: role === 'admin' ? '' : (floor || '') 
    });
    
    await newUser.save();
    const userResponse = newUser.toObject();
    delete userResponse.password;
    res.status(201).json(userResponse);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/users/:id', protect, requireAdmin, async (req, res) => {
  try {
    const { name, username, password, role, floor } = req.body;
    const updateData = { 
      name, 
      username: username.toLowerCase(), 
      role, 
      floor: role === 'admin' ? '' : floor 
    };
    
    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }
    
    const updatedUser = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    res.json(updatedUser);
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: 'اسم المستخدم مسجل مسبقاً' });
    res.status(400).json({ error: error.message }); 
  }
});

app.delete('/api/users/:id', protect, requireAdmin, async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);
    if(userToDelete.role === 'admin_owner') return res.status(403).json({ error: 'لا يمكن حذف المالك الأساسي للنظام' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف المستخدم' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/users/:id/logout', protect, requireAdmin, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { token: null });
    res.json({ message: 'تم طرد المستخدم بنجاح' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ----- إدارة الأقسام (للمدير فقط) -----
app.get('/api/departments', protect, async (req, res) => {
  try {
    const depts = await Department.find();
    res.json(depts);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/departments', protect, requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    const existingDept = await Department.findOne({ name });
    if (existingDept) return res.status(400).json({ error: 'هذا القسم موجود بالفعل' });

    const newDept = new Department({ name });
    await newDept.save();
    res.status(201).json(newDept);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/departments/:id', protect, requireAdmin, async (req, res) => {
  try {
    await Department.findByIdAndDelete(req.params.id);
    res.json({ message: 'تم حذف القسم' });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ----- الغرف -----
app.get('/api/rooms', protect, async (req, res) => {
  try { const rooms = await Room.find(); res.json(rooms); } 
  catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/rooms', protect, requireChargeOrAdmin, async (req, res) => {
  try {
    const { roomNumber, floor, totalBeds } = req.body;
    const beds = [];
    for (let i = 1; i <= totalBeds; i++) { beds.push({ bedNumber: `${roomNumber}-${i}` }); }
    const room = new Room({ roomNumber, floor, totalBeds, beds });
    await room.save();
    res.status(201).json(room);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/rooms/:id', protect, requireChargeOrAdmin, async (req, res) => {
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

app.delete('/api/rooms/:id', protect, requireChargeOrAdmin, async (req, res) => {
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

app.post('/api/patients', protect, requireChargeOrAdmin, async (req, res) => {
  try {
    const patient = new Patient(req.body);
    await patient.save();
    res.status(201).json(patient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/patients/:id', protect, requireChargeOrAdmin, async (req, res) => {
  try {
    const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(patient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.patch('/api/patients/:id/discharge', protect, requireChargeOrAdmin, async (req, res) => {
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
// 6. تشغيل السيرفر
// ==========================================
app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل على بورت ${PORT}`);
});
