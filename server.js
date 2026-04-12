require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://Abulmagd:Abulmagd610@cluster0.fac4uzx.mongodb.net/inpatient_db?appName=Cluster0';
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_key';

// ================= Middleware =================
// 🚀 التحقق من إصدار التطبيق
const checkAppVersion = (req, res, next) => {
  // بنستثني مسار اللينك عشان لو اليوزر إصداره قديم يقدر يجيب اللينك
  if (req.path === '/api/app-link') return next(); 
  
  const clientVersion = req.headers['x-app-version'];
  if (clientVersion && clientVersion !== '1.0.0') {
    return res.status(426).json({ error: 'إصدار قديم، برجاء التحديث.' });
  }
  next();
};
app.use(checkAppVersion);

const protect = async (req, res, next) => { 
  let token; 
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) { 
    try { 
      token = req.headers.authorization.split(' ')[1]; 
      const decoded = jwt.verify(token, JWT_SECRET); 
      const user = await User.findById(decoded.id).select('-password'); 
      if (!user || user.token !== token || user.isDeleted) return res.status(401).json({ error: 'الجلسة انتهت أو الحساب موقوف' }); 
      req.user = user; 
      next(); 
    } catch (error) { 
      return res.status(401).json({ error: 'التوكن غير صالح' }); 
    } 
  } 
  if (!token) return res.status(401).json({ error: 'لا يوجد توكن' }); 
};

const authorizeRoles = (...roles) => (req, res, next) => { 
  if (req.user && roles.includes(req.user.role)) next(); 
  else res.status(403).json({ error: 'غير مصرح لك' }); 
};

const requireAdmin = authorizeRoles('admin', 'admin_owner'); 
const requireChargeOrAdmin = authorizeRoles('admin', 'admin_owner', 'charge_nurse'); 
const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

// ================= Models =================
const userSchema = new mongoose.Schema({ name: { type: String, required: true }, username: { type: String, required: true, unique: true, lowercase: true }, password: { type: String, required: true }, theme: { type: String, default: 'light' }, role: { type: String, enum: ['staff_nurse', 'charge_nurse', 'admin', 'admin_owner', 'admission', 'doctor'], default: 'staff_nurse' }, specialty: { type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' }, floor: { type: String, default: '' }, token: { type: String, default: null }, expoPushToken: { type: String, default: null }, isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const User = mongoose.model('User', userSchema);

const notificationSchema = new mongoose.Schema({ title: { type: String, required: true }, message: { type: String, required: true }, user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, isRead: { type: Boolean, default: false }, isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const Notification = mongoose.model('Notification', notificationSchema);

const roomSchema = new mongoose.Schema({ roomNumber: { type: String, required: true }, floor: { type: String, required: true }, totalBeds: { type: Number, required: true, min: 1 }, beds: [{ bedNumber: { type: String, required: true }, isOccupied: { type: Boolean, default: false } }], isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const Room = mongoose.model('Room', roomSchema);

const specialtySchema = new mongoose.Schema({ name: { type: String, required: true, unique: true }, isDeleted: { type: Boolean, default: false } }, { timestamps: true });
const Specialty = mongoose.model('Specialty', specialtySchema);

const pastAdmissionSchema = new mongoose.Schema({ admissionDate: Date, dischargeDate: Date, diagnosis: String, doctorName: String, admissionSource: String, dischargeReason: String, nutrition: [{ type: { type: String }, addedAt: Date }], roomInfo: String });

const patientSchema = new mongoose.Schema({ 
  name: { type: String, required: true }, medicalNumber: { type: String, required: true, unique: true }, diagnosis: { type: [String], required: true }, gender: { type: String, enum: ['ذكر', 'أنثى'], default: 'ذكر' }, specialty: { type: mongoose.Schema.Types.ObjectId, ref: 'Specialty' }, doctorName: { type: String, required: true }, admissionDate: { type: Date, default: Date.now }, dateOfBirth: { type: Date }, admissionSource: { type: String, default: 'الطوارئ' }, phoneNumber: { type: String }, nationalId: { type: String }, address: { type: String }, nutrition: { type: [{ type: { type: String }, addedAt: { type: Date, default: Date.now } }], default: () => [{ type: 'اعتيادي', addedAt: Date.now() }] }, medicalHistory: [String], tubes: [{ type: String, location: String, insertionDate: Date, removalDate: Date }], room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' }, bedNumber: String, status: { type: String, enum: ['active', 'discharged', 'transferred'], default: 'active' }, dischargeReason: { type: String }, pastAdmissions: [pastAdmissionSchema], createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, isDeleted: { type: Boolean, default: false } 
}, { timestamps: true }); 
const Patient = mongoose.model('Patient', patientSchema);

const vitalSchema = new mongoose.Schema({ patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true }, heartRate: String, systolicBP: String, diastolicBP: String, temperature: String, respiratoryRate: String, oxygenSaturation: String, bloodSugar: String, recordedAt: { type: Date, default: Date.now }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const Vital = mongoose.model('Vital', vitalSchema);

const medicationSchema = new mongoose.Schema({ patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true }, name: { type: String, required: true }, dose: { type: String, required: true }, route: { type: String, required: true }, frequencyType: { type: String, enum: ['scheduled', 'prn', 'stat', 'continuous'], default: 'scheduled' }, frequencyInterval: { type: String, default: '' }, doseTimes: [Date], administeredDoses: [{ timeString: String, givenAt: { type: Date, default: Date.now }, givenBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, notes: String }], logs: [{ action: String, details: String, date: { type: Date, default: Date.now }, changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }], addedAt: { type: Date, default: Date.now }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const Medication = mongoose.model('Medication', medicationSchema);

const noteSchema = new mongoose.Schema({ patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true }, text: { type: String, required: true }, recordedAt: { type: Date, default: Date.now }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const Note = mongoose.model('Note', noteSchema);

const orderSchema = new mongoose.Schema({ patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true }, text: { type: String, required: true }, recordedAt: { type: Date, default: Date.now }, createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const Order = mongoose.model('Order', orderSchema);

const departmentSchema = new mongoose.Schema({ name: { type: String, required: true, unique: true }, type: { type: String, enum: ['inpatient', 'icu'], default: 'inpatient' }, isDeleted: { type: Boolean, default: false } }, { timestamps: true }); 
const Department = mongoose.model('Department', departmentSchema);

// ================= Utils =================
const sendPushNotification = async (tokens, title, body) => { 
  if (!tokens || tokens.length === 0) return; 
  const messages = tokens.map(token => ({ to: token, sound: 'default', title, body })); 
  try { 
    await fetch('https://exp.host/--/api/v2/push/send', { 
      method: 'POST', 
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' }, 
      body: JSON.stringify(messages) 
    }); 
  } catch (error) {
    console.log('Error sending push notification:', error);
  } 
};

const checkRoomGenderAllowed = async (roomId, patientGender) => { 
  if (!roomId || !patientGender) return true; 
  const targetRoom = await Room.findById(roomId); 
  if (!targetRoom) throw new Error('الغرفة غير موجودة'); 
  const dept = await Department.findOne({ name: targetRoom.floor, isDeleted: false }); 
  if (dept && dept.type === 'icu') return true; 
  const occupants = await Patient.find({ room: roomId, status: { $in: ['active', 'transferred'] }, isDeleted: false }); 
  if (occupants.length > 0) { 
    const roomGender = occupants[0].gender; 
    if (roomGender !== patientGender) { 
      throw new Error(`ممنوع التسكين: الغرفة مخصصة للـ (${roomGender}) حالياً.`); 
    } 
  } 
  return true; 
};

// ================= Routes =================

// 🚀 مسار جلب لينك تحديث التطبيق
app.get('/api/app-link', async (req, res) => {
  try {
    res.json({ url: 'https://expo.dev/accounts/abulmagdation/projects/hospital-frontend/builds/966f833b-5f4d-4844-ba21-b79332318bd1' }); 
  } catch (error) {
    res.status(500).json({ error: 'تعذر جلب الرابط' });
  }
});

// Auth Routes
app.post('/api/login', async (req, res) => { 
  try { 
    const { username, password } = req.body; 
    const user = await User.findOne({ username: username.toLowerCase(), isDeleted: false }); 
    if (user && (await bcrypt.compare(password, user.password))) { 
      const token = generateToken(user._id); 
      user.token = token; 
      await user.save(); 
      res.json({ user: { _id: user._id, name: user.name, username: user.username, theme: user.theme, role: user.role, floor: user.floor, specialty: user.specialty }, token }); 
    } else res.status(401).json({ error: 'بيانات غير صحيحة' }); 
  } catch (e) { res.status(500).json({ error: e.message }); } 
});
app.post('/api/logout', protect, async (req, res) => { try { req.user.token = null; req.user.expoPushToken = null; await req.user.save(); res.json({ message: 'تم الخروج' }); } catch (e) {} });
app.put('/api/users/push-token', protect, async (req, res) => { try { const user = await User.findById(req.user._id); if (user) { user.expoPushToken = req.body.token; await user.save(); res.json({ message: 'Token saved' }); } } catch (e) {} });
app.put('/api/users/theme', protect, async (req, res) => { try { const user = await User.findById(req.user._id); if (user) { user.theme = req.body.theme; await user.save(); res.json({ message: 'تم' }); } } catch (e) {} });
app.put('/api/users/profile', protect, async (req, res) => { try { const user = await User.findById(req.user._id); if (!user) return res.status(404).json({ error: 'غير موجود' }); const { name, username, password } = req.body; if (name) user.name = name; if (username) user.username = username.toLowerCase(); if (password && password.trim() !== '') { const salt = await bcrypt.genSalt(10); user.password = await bcrypt.hash(password, salt); } const token = generateToken(user._id); user.token = token; await user.save(); res.json({ _id: user._id, name: user.name, username: user.username, theme: user.theme, role: user.role, floor: user.floor, specialty: user.specialty, token }); } catch (e) { res.status(500).json({ error: 'خطأ' }); } });

// Users Routes
app.get('/api/users', protect, requireAdmin, async (req, res) => { res.json(await User.find({ isDeleted: false }).select('-password').populate('specialty')); });
app.post('/api/users', protect, requireAdmin, async (req, res) => { try { const { name, username, password, role, floor, specialty } = req.body; if (await User.findOne({ username: username.toLowerCase(), isDeleted: false })) return res.status(400).json({ error: 'موجود' }); const salt = await bcrypt.genSalt(10); const hashedPassword = await bcrypt.hash(password, salt); const newUser = new User({ name, username: username.toLowerCase(), password: hashedPassword, role: role || 'staff_nurse', specialty: role === 'doctor' ? specialty : null, floor: (role === 'admin' || role === 'admission' || role === 'doctor') ? '' : (floor || '') }); await newUser.save(); res.status(201).json(newUser); } catch (e) { res.status(400).json({ error: e.message }); } });
app.put('/api/users/:id', protect, requireAdmin, async (req, res) => { try { const { name, username, password, role, floor, specialty } = req.body; const updateData = { name, username: username.toLowerCase(), role, specialty: role === 'doctor' ? specialty : null, floor: (role === 'admin' || role === 'admission' || role === 'doctor') ? '' : floor }; if (password && password.trim() !== '') { const salt = await bcrypt.genSalt(10); updateData.password = await bcrypt.hash(password, salt); } res.json(await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password')); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/users/:id', protect, requireAdmin, async (req, res) => { await User.findByIdAndUpdate(req.params.id, { isDeleted: true, token: null }); res.json({ message: 'تم' }); });

// System Routes
app.get('/api/specialties', protect, async (req, res) => { res.json(await Specialty.find({ isDeleted: false }).sort({ name: 1 })); });
app.post('/api/specialties', protect, requireAdmin, async (req, res) => {
  try {
    if (await Specialty.findOne({ name: req.body.name, isDeleted: false })) {
      return res.status(400).json({ error: 'التخصص موجود مسبقاً' });
    }
    const newSpec = new Specialty({ name: req.body.name });
    await newSpec.save();
    res.status(201).json(newSpec);
  } catch (e) { 
    res.status(400).json({ error: e.message }); 
  }
});
app.delete('/api/specialties/:id', protect, requireAdmin, async (req, res) => {
  await Specialty.findByIdAndUpdate(req.params.id, { isDeleted: true });
  res.json({ message: 'تم الحذف بنجاح' });
});

app.get('/api/departments', protect, async (req, res) => { res.json(await Department.find({ isDeleted: false })); });
app.post('/api/departments', protect, requireAdmin, async (req, res) => { try { if (await Department.findOne({ name: req.body.name, isDeleted: false })) return res.status(400).json({ error: 'القسم موجود' }); const newDept = new Department({ name: req.body.name, type: req.body.type || 'inpatient' }); await newDept.save(); res.status(201).json(newDept); } catch (e) { res.status(400).json({ error: e.message }); } });
app.get('/api/rooms', protect, async (req, res) => { res.json(await Room.find({ isDeleted: false })); });
app.post('/api/rooms', protect, requireAdmin, async (req, res) => {
  try {
    const newRoom = new Room(req.body);
    await newRoom.save();
    res.status(201).json(newRoom);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.put('/api/rooms/:id', protect, requireAdmin, async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(room);
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.delete('/api/rooms/:id', protect, requireAdmin, async (req, res) => {
  await Room.findByIdAndUpdate(req.params.id, { isDeleted: true });
  res.json({ message: 'تم' });
});

// Patients Routes
app.get('/api/patients', protect, async (req, res) => { 
  let query = { status: { $in: ['active', 'transferred'] }, isDeleted: false };
  if (req.user.role === 'doctor') { query.specialty = req.user.specialty; }
  res.json(await Patient.find(query).populate('room specialty')); 
});

app.post('/api/patients', protect, authorizeRoles('admin', 'admin_owner', 'admission', 'charge_nurse', 'staff_nurse'), async (req, res) => { 
  try { 
    const isGlobal = ['admin', 'admin_owner', 'admission'].includes(req.user.role); 
    if (!isGlobal && req.user.floor) { const room = await Room.findById(req.body.room); if (room && room.floor !== req.user.floor) return res.status(403).json({ error: 'لا يمكنك التسكين في قسم آخر' }); } 
    let existingPatient = await Patient.findOne({ medicalNumber: req.body.medicalNumber, isDeleted: false });
    const patientGender = req.body.gender || (existingPatient ? existingPatient.gender : 'ذكر');
    await checkRoomGenderAllowed(req.body.room, patientGender);

    if (existingPatient) {
      if (existingPatient.status !== 'discharged') return res.status(400).json({ error: 'المريض محجوز بالفعل في المستشفى ولم يتم تسجيل خروجه!' });
      existingPatient.diagnosis.push(req.body.diagnosis); existingPatient.status = 'active'; existingPatient.doctorName = req.body.doctorName; existingPatient.specialty = req.body.specialty; existingPatient.room = req.body.room; existingPatient.bedNumber = req.body.bedNumber; existingPatient.admissionSource = req.body.admissionSource || 'الطوارئ'; existingPatient.admissionDate = Date.now(); existingPatient.nutrition = [{ type: 'اعتيادي', addedAt: Date.now() }]; existingPatient.dischargeReason = null;
      if (req.body.name) existingPatient.name = req.body.name; if (req.body.phoneNumber) existingPatient.phoneNumber = req.body.phoneNumber; if (req.body.nationalId) existingPatient.nationalId = req.body.nationalId; if (req.body.address) existingPatient.address = req.body.address; if (req.body.dateOfBirth) existingPatient.dateOfBirth = req.body.dateOfBirth; if (req.body.gender) existingPatient.gender = req.body.gender;
      await existingPatient.save(); return res.status(200).json(existingPatient);
    }
    const patient = new Patient({ ...req.body, diagnosis: [req.body.diagnosis], nutrition: [{ type: 'اعتيادي', addedAt: Date.now() }], createdBy: req.user._id }); await patient.save(); res.status(201).json(patient); 
  } catch (e) { res.status(400).json({ error: e.message }); } 
});

app.put('/api/patients/:id', protect, authorizeRoles('admin', 'admin_owner', 'admission', 'charge_nurse', 'staff_nurse', 'doctor'), async (req, res) => { 
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ error: 'غير موجود' });
    if (req.body.room && req.body.room !== patient.room?.toString()) await checkRoomGenderAllowed(req.body.room, req.body.gender || patient.gender);
    const { diagnosis, nutrition, ...restData } = req.body; Object.assign(patient, restData);
    if (diagnosis) { if (patient.diagnosis.length > 0) patient.diagnosis[patient.diagnosis.length - 1] = diagnosis; else patient.diagnosis.push(diagnosis); }
    if (nutrition) patient.nutrition.push({ type: nutrition, addedAt: Date.now() });
    await patient.save(); res.json(patient);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.patch('/api/patients/:id/discharge', protect, authorizeRoles('admin', 'admin_owner', 'admission'), async (req, res) => { try { const patient = await Patient.findById(req.params.id).populate('room'); if (!patient) return res.status(404).json({ error: 'المريض غير موجود' }); const currentDiag = Array.isArray(patient.diagnosis) ? patient.diagnosis[patient.diagnosis.length - 1] : patient.diagnosis; const roomInfo = patient.room ? `قسم: ${patient.room.floor} - غرفة: ${patient.room.roomNumber} - سرير: ${patient.bedNumber}` : 'غير محدد'; const historyRecord = { admissionDate: patient.admissionDate, dischargeDate: new Date(), diagnosis: currentDiag, doctorName: patient.doctorName, admissionSource: patient.admissionSource, dischargeReason: req.body.dischargeReason || 'خروج تحسن', nutrition: patient.nutrition, roomInfo: roomInfo }; patient.pastAdmissions.push(historyRecord); patient.status = 'discharged'; patient.dischargeReason = req.body.dischargeReason || 'خروج تحسن'; patient.room = null; patient.bedNumber = null; await patient.save(); res.json(patient); } catch (e) { res.status(400).json({ error: e.message }); } });

app.patch('/api/patients/:id/transfer', protect, authorizeRoles('admin', 'admin_owner', 'admission'), async (req, res) => { try { const patient = await Patient.findById(req.params.id); if (!patient) return res.status(404).json({ error: 'المريض غير موجود' }); await checkRoomGenderAllowed(req.body.room, patient.gender); patient.room = req.body.room; patient.bedNumber = req.body.bedNumber; await patient.save(); res.json(patient); } catch (e) { res.status(400).json({ error: e.message }); } });

// Vitals Routes
// Vitals Routes
app.get('/api/vitals/patient/:patientId', protect, async (req, res) => { 
  res.json(await Vital.find({ patient: req.params.patientId, isDeleted: false }).populate('createdBy', 'name').sort({ recordedAt: -1 })); 
});

app.post('/api/vitals', protect, authorizeRoles('staff_nurse', 'charge_nurse', 'admin', 'admin_owner'), async (req, res) => { 
  try { 
    const vital = new Vital({ ...req.body, createdBy: req.user._id }); 
    await vital.save(); 

    // 🚀 إضافة منطق إشعارات العلامات الحيوية الحرجة المنفصلة
    // بنفترض إنك هتبعت من الفرونت إند isCritical: true لو الـ NEWS Score عالي
    if (req.body.isCritical) {
      const patient = await Patient.findById(req.body.patient).populate('room');
      
      if (patient) {
        const title = '⚠️ علامات حيوية حرجة';
        const message = `تم تسجيل علامات حيوية حرجة للمريض ${patient.name} (غرفة ${patient.room?.roomNumber || 'غير محددة'}) بواسطة التمريض.`;

        // 1. هنجيب كل الناس اللي المفروض يوصلهم الإشعار:
        // (المديرين) + (مشرف التمريض بتاع نفس القسم) + (دكاترة نفس التخصص)
        const targetUsers = await User.find({
          $or: [
            { role: { $in: ['admin', 'admin_owner'] } }, // الإدارة
            { role: 'charge_nurse', floor: patient.room?.floor }, // مشرف القسم
            { role: 'doctor', specialty: patient.specialty } // أطباء نفس تخصص المريض
          ],
          isDeleted: false
        });

        // 2. نعمل نسخة مستقلة من الإشعار لكل مستخدم فيهم
        const notificationsToInsert = targetUsers.map(user => ({
          user: user._id, // 🚀 السر هنا: كل واحد بياخد نسخة خاصة بيه
          title,
          message,
          isRead: false,
          createdAt: new Date()
        }));

        // 3. نحفظ الإشعارات في الداتابيز
        if (notificationsToInsert.length > 0) {
          await Notification.insertMany(notificationsToInsert);
        }

        // 4. نبعت الـ Push Notifications للموبايلات
        const tokens = targetUsers.map(u => u.expoPushToken).filter(t => t != null && t !== '');
        if (tokens.length > 0) {
          sendPushNotification(tokens, title, message);
        }
      }
    }

    res.status(201).json(vital); 
  } catch (e) { 
    res.status(400).json({ error: e.message }); 
  } 
});
// Medications Routes
app.get('/api/medications/patient/:patientId', protect, async (req, res) => { res.json(await Medication.find({ patient: req.params.patientId, isDeleted: false }).populate('createdBy', 'name').populate('logs.changedBy', 'name').populate('administeredDoses.givenBy', 'name').sort({ addedAt: -1 })); });

app.post('/api/medications', protect, authorizeRoles('doctor', 'admin', 'admin_owner'), async (req, res) => { 
  const med = new Medication({ ...req.body, createdBy: req.user._id }); 
  let typeLabel = med.frequencyType === 'prn' ? 'عند اللزوم' : med.frequencyType === 'stat' ? 'مرة واحدة' : med.frequencyType === 'continuous' ? 'مستمر' : `مجدول كل ${med.frequencyInterval} س`;
  med.logs.push({ action: 'إضافة', details: `دواء: ${med.name} | الجرعة: ${med.dose} | النوع: ${typeLabel}`, changedBy: req.user._id });
  await med.save(); 
  res.status(201).json(med); 
});

app.put('/api/medications/:id', protect, authorizeRoles('doctor', 'admin', 'admin_owner'), async (req, res) => { 
  const med = await Medication.findById(req.params.id);
  const oldDetails = `${med.name} - ${med.dose} - ${med.route}`;
  Object.assign(med, req.body);
  const newDetails = `${med.name} - ${med.dose} - ${med.route}`;
  med.logs.push({ action: 'تعديل', details: `تعديل من (${oldDetails}) إلى (${newDetails})`, changedBy: req.user._id });
  await med.save(); 
  res.json(med); 
});

app.delete('/api/medications/:id', protect, authorizeRoles('doctor', 'admin', 'admin_owner'), async (req, res) => { 
  const med = await Medication.findById(req.params.id);
  med.isDeleted = true;
  med.logs.push({ action: 'إيقاف', details: `تم إيقاف الدواء نهائياً`, changedBy: req.user._id });
  await med.save();
  res.json({ message: 'تم إيقاف الدواء' }); 
});

app.post('/api/medications/:id/administer', protect, authorizeRoles('staff_nurse', 'charge_nurse', 'admin', 'admin_owner'), async (req, res) => {
  try {
    const med = await Medication.findById(req.params.id);
    med.administeredDoses.push({ 
      timeString: req.body.timeString, 
      notes: req.body.notes || '', 
      givenBy: req.user._id, 
      givenAt: Date.now() 
    });
    await med.save();
    res.json(med);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Notes Routes
app.get('/api/notes/patient/:patientId', protect, async (req, res) => { res.json(await Note.find({ patient: req.params.patientId, isDeleted: false }).populate('createdBy', 'name').sort({ recordedAt: -1 })); });
app.post('/api/notes', protect, authorizeRoles('staff_nurse', 'charge_nurse', 'admin', 'admin_owner'), async (req, res) => { const note = new Note({ ...req.body, createdBy: req.user._id }); await note.save(); res.status(201).json(note); });

// Orders Routes (أوامر الطبيب وإرسال الإشعارات المستقلة)
app.get('/api/orders/patient/:patientId', protect, async (req, res) => { 
  res.json(await Order.find({ patient: req.params.patientId, isDeleted: false }).populate('createdBy', 'name').sort({ recordedAt: -1 })); 
});

app.post('/api/orders', protect, authorizeRoles('doctor', 'admin', 'admin_owner'), async (req, res) => { 
  try {
    const order = new Order({ ...req.body, createdBy: req.user._id }); 
    await order.save(); 

    // إرسال إشعار للممرضين في نفس القسم بشكل منفصل
    const patient = await Patient.findById(req.body.patient).populate('room');
    if (patient && patient.room && patient.room.floor) {
      const floor = patient.room.floor;
      const title = 'أوامر طبيب جديدة 📝';
      const message = `تم إضافة أوامر طبية جديدة للمريض ${patient.name} (غرفة ${patient.room.roomNumber})`;
      
      // جلب جميع الممرضين في القسم المحدد
      const nurses = await User.find({ role: { $in: ['staff_nurse', 'charge_nurse'] }, floor: floor, isDeleted: false });
      
      // 🚀 استخدام insertMany لإنشاء إشعارات منفصلة بشكل أسرع وأفضل للأداء
      const notificationsToInsert = nurses.map(nurse => ({
        user: nurse._id,
        title,
        message,
        isRead: false,
        createdAt: new Date()
      }));

      if (notificationsToInsert.length > 0) {
        await Notification.insertMany(notificationsToInsert);
      }
      
      // إرسال Push Notification للهواتف المسجلة
      const tokens = nurses.map(n => n.expoPushToken).filter(t => t != null && t !== '');
      if(tokens.length > 0) {
         sendPushNotification(tokens, title, message);
      }
    }
    
    res.status(201).json(order); 
  } catch (e) { 
    res.status(400).json({ error: e.message }); 
  }
});

// Notifications Routes
app.get('/api/notifications', protect, async (req, res) => { 
  res.json(await Notification.find({ user: req.user._id, isDeleted: false }).sort({ createdAt: -1 })); 
});

app.put('/api/notifications/:id/read', protect, async (req, res) => { 
  res.json(await Notification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true })); 
});

app.put('/api/notifications/read-all', protect, async (req, res) => { 
  await Notification.updateMany({ user: req.user._id, isRead: false }, { isRead: true }); 
  res.json({ message: 'تم التحديد كمقروء' }); 
});

app.delete('/api/notifications/:id', protect, async (req, res) => { 
  await Notification.findByIdAndUpdate(req.params.id, { isDeleted: true }); 
  res.json({ message: 'تم الحذف' }); 
});

// Reports
app.post('/api/reports/shift', protect, async (req, res) => {
  const { shiftDate } = req.body;
  const shiftStart = new Date(shiftDate);
  shiftStart.setHours(8, 0, 0, 0);
  const shiftEnd = new Date(shiftStart);
  shiftEnd.setDate(shiftEnd.getDate() + 1);

  let pQuery = { isDeleted: false };
  if (req.user.role === 'staff_nurse' || req.user.role === 'charge_nurse') {
    const userFloor = req.user.floor;
    const floorRooms = await Room.find({ floor: userFloor, isDeleted: false });
    const floorRoomIds = floorRooms.map(r => r._id);
    pQuery.room = { $in: floorRoomIds };
  } else if (req.user.role === 'doctor') {
    pQuery.specialty = req.user.specialty;
  }
  
  const patients = await Patient.find(pQuery).populate('room specialty');
  let reportData = [];

  for (let patient of patients) {
    const admDate = patient.admissionDate ? new Date(patient.admissionDate) : new Date(0);
    if (admDate.getTime() >= shiftEnd.getTime()) continue;

    const notes = await Note.find({ patient: patient._id, recordedAt: { $gte: shiftStart, $lt: shiftEnd }, isDeleted: false }).sort({ recordedAt: 1 });
    reportData.push({ patient, notes });
  }

  res.json(reportData);
});

// ================= Initialization =================
const seedSpecialties = async () => { 
  try { 
    const count = await Specialty.countDocuments(); 
    if (count === 0) { 
      const defaults = ['باطنة عامة', 'جراحة عامة', 'أطفال', 'نساء وتوليد', 'عظام', 'قلب وأوعية دموية', 'صدرية', 'مخ وأعصاب', 'مسالك بولية', 'رعاية مركزة', 'طوارئ', 'أورام']; 
      for (let name of defaults) { await Specialty.create({ name }); } 
      console.log('✅ تم إضافة التخصصات الطبية بنجاح'); 
    } 
  } catch (error) { 
    console.log('خطأ في حقن التخصصات:', error); 
  } 
};

mongoose.connect(MONGO_URI).then(() => { 
  console.log('✅ تم الاتصال بقاعدة البيانات'); 
  seedSpecialties(); 
}).catch((err) => {
  console.error('❌ خطأ في الاتصال بقاعدة البيانات', err);
});

app.listen(PORT, () => { 
  console.log(`🚀 السيرفر يعمل على بورت ${PORT}`); 
});
