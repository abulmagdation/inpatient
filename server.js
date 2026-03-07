// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// 1. Database Connection (MongoDB Atlas)
// ==========================================
mongoose.connect(process.env.MONGO_URI || 'mongodb+srv://abulmagd:Abulmagd610@cluster0.blq59le.mongodb.net/hospital_ward?appName=Cluster0')
  .then(() => console.log('✅ Connected to MongoDB Atlas'))
  .catch(err => console.error(err));

// ==========================================
// 2. Models
// ==========================================
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
  beds: [bedSchema]
}, { timestamps: true });

// 💡 تم إزالة الـ roomSchema.pre('save') نهائياً لحل مشكلة next

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
  tubes: [tubeSchema] 
}, { timestamps: true });
const Patient = mongoose.model('Patient', patientSchema);

const vitalSignsSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  recordedAt: { type: Date, required: true },
  heartRate: { type: Number, required: true }, systolicBP: { type: Number, required: true },
  diastolicBP: { type: Number, required: true }, temperature: { type: Number, required: true },
  oxygenSaturation: { type: Number, required: true }, respiratoryRate: { type: Number, required: true },
  bloodSugar: { type: Number } 
});
const VitalSigns = mongoose.model('VitalSigns', vitalSignsSchema);

const medicationSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  name: { type: String, required: true }, dose: { type: String, required: true }, route: { type: String, required: true },
  addedAt: { type: Date, required: true }, frequency: { type: Number, required: true }, doseTimes: [{ type: Date, required: true }]
});
const Medication = mongoose.model('Medication', medicationSchema);

const nursingNoteSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  text: { type: String, required: true },
  recordedAt: { type: Date, required: true }
});
const NursingNote = mongoose.model('NursingNote', nursingNoteSchema);

const taskSchema = new mongoose.Schema({
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  text: { type: String, required: true },
  isCompleted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  targetDate: { type: Date, required: true } 
});
const Task = mongoose.model('Task', taskSchema);

// ==========================================
// 3. API Routes
// ==========================================

app.get('/api/patients', async (req, res) => { res.json(await Patient.find().populate('room').sort('-createdAt')); });

app.post('/api/patients', async (req, res) => {
  try {
    const newPatient = new Patient(req.body); await newPatient.save();
    if (req.body.room && req.body.bedNumber) {
      await Room.findOneAndUpdate({ _id: req.body.room, 'beds.bedNumber': req.body.bedNumber }, { $set: { 'beds.$.isOccupied': true, 'beds.$.patient': newPatient._id }, $inc: { occupiedBeds: 1 } });
    }
    res.status(201).json(newPatient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/patients/:id', async (req, res) => { try { res.json(await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true })); } catch (error) { res.status(400).json({ error: error.message }); } });

app.patch('/api/patients/:id/discharge', async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({error: 'Patient not found'});
    if (patient.room && patient.bedNumber) {
      await Room.findOneAndUpdate({ _id: patient.room, 'beds.bedNumber': patient.bedNumber }, { $set: { 'beds.$.isOccupied': false, 'beds.$.patient': null }, $inc: { occupiedBeds: -1 } });
    }
    patient.status = 'discharged'; patient.dischargeDate = new Date();
    await patient.save(); res.json(patient);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/reports/shift', async (req, res) => {
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
      const notes = await NursingNote.find({ patient: p._id, recordedAt: { $gte: startOfShift, $lt: endOfShift } }).sort('recordedAt');
      const tasks = await Task.find({ patient: p._id, targetDate: { $gte: startOfNextShift, $lt: endOfNextShift } }).sort('createdAt');
      reportData.push({ patient: p, notes, tasks });
    }
    res.json(reportData);
  } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/vitals/patient/:patientId', async (req, res) => { res.json(await VitalSigns.find({ patient: req.params.patientId }).sort('-recordedAt')); });
app.post('/api/vitals', async (req, res) => { try { const v = new VitalSigns(req.body); await v.save(); res.status(201).json(v); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/vitals/:id', async (req, res) => { await VitalSigns.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/medications/patient/:patientId', async (req, res) => { res.json(await Medication.find({ patient: req.params.patientId }).sort('-addedAt')); });
app.post('/api/medications', async (req, res) => { try { const m = new Medication(req.body); await m.save(); res.status(201).json(m); } catch (e) { res.status(400).json({ error: e.message }); } });
app.put('/api/medications/:id', async (req, res) => { try { res.json(await Medication.findByIdAndUpdate(req.params.id, req.body, {new: true})); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/medications/:id', async (req, res) => { await Medication.findByIdAndDelete(req.params.id); res.json({ success: true }); });

// ==========================================
// مسارات الغرف
// ==========================================
app.get('/api/rooms', async (req, res) => { res.json(await Room.find().populate('beds.patient')); });

// 💡 التعديل الجذري هنا: توليد السراير بيحصل مباشرة وقت الـ POST
app.post('/api/rooms', async (req, res) => { 
  try { 
    const roomData = req.body;
    
    // لو الغرفة بتتبعت من غير سراير، ننشئهم أوتوماتيك بناءً على totalBeds
    if (!roomData.beds || roomData.beds.length === 0) {
      roomData.beds = [];
      const bedsCount = parseInt(roomData.totalBeds) || 1;
      for (let i = 1; i <= bedsCount; i++) {
        roomData.beds.push({ bedNumber: `${roomData.roomNumber}-${i}`, isOccupied: false, patient: null });
      }
    }

    const r = new Room(roomData); 
    await r.save(); 
    res.status(201).json(r); 
  } catch (e) { 
    res.status(400).json({ error: e.message }); 
  } 
});

app.put('/api/rooms/:id', async (req, res) => {
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
    await room.save();
    res.json(room);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.delete('/api/rooms/:id', async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (room.occupiedBeds > 0) return res.status(400).json({error: 'لا يمكن حذف غرفة بها مرضى محجوزين'});
    await Room.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/notes/patient/:patientId', async (req, res) => { res.json(await NursingNote.find({ patient: req.params.patientId }).sort('-recordedAt')); });
app.post('/api/notes', async (req, res) => { try { const n = new NursingNote(req.body); await n.save(); res.status(201).json(n); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/notes/:id', async (req, res) => { await NursingNote.findByIdAndDelete(req.params.id); res.json({ success: true }); });

app.get('/api/tasks/patient/:patientId', async (req, res) => { res.json(await Task.find({ patient: req.params.patientId }).sort('createdAt')); });
app.post('/api/tasks', async (req, res) => { try { const t = new Task(req.body); await t.save(); res.status(201).json(t); } catch (e) { res.status(400).json({ error: e.message }); } });
app.put('/api/tasks/:id', async (req, res) => { try { res.json(await Task.findByIdAndUpdate(req.params.id, req.body, {new: true})); } catch (e) { res.status(400).json({ error: e.message }); } });
app.delete('/api/tasks/:id', async (req, res) => { await Task.findByIdAndDelete(req.params.id); res.json({ success: true }); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));