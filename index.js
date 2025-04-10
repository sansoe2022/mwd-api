require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

// ============================
// Schema Definitions (Models)
// ============================

// User Schema
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// Pre-save hook to hash password
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', UserSchema);

// Data Schema
const DataSchema = new mongoose.Schema({
  thRate: { type: Number, required: true },
  mmRate: { type: Number, required: true },
  versionCode: { type: Number, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: { type: String, required: true },
  items: [{
    thbBill: { type: String, required: true },
    mmkBill: { type: String, required: true }
  }]
});

const Data = mongoose.model('Data', DataSchema);

// ============================
// MongoDB Connection & Admin User Check
// ============================
mongoose.connect(MONGODB_URI)
  .then(async () => {
    console.log('MongoDB connected');

    // Check if admin user exists
    const adminUser = await User.findOne({ username: 'admin' });
    if (!adminUser) {
      // Create admin user (pre-save hook မှာ password ကို hash လုပ်ပါလိမ့်မည်)
      const newAdminUser = new User({
        username: 'admin',
        password: 'sansoe4455',
      });
      await newAdminUser.save();
      console.log('Default admin user created.');
    } else {
      console.log('Default admin user already exists.');
    }
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
  });

// ============================
// Express App & Routes
// ============================
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Optional: Root route မှာ index.html ကို serve လုပ်ရန်
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
   });

// Register Route
app.post('/rate/registers', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = new User({ username, password });
    await user.save();
    res.json({ message: 'User registered successfully!' });
  } catch (err) {
    console.error('Error registering user:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Login Route
app.post('/rate/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.json({ token });
  } catch (err) {
    console.error('Error logging in:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Create New Data
app.post('/rate/datas', async (req, res) => {
  try {
    const { thRate, mmRate, versionCode, title, message, link, items } = req.body;
    const newData = new Data({ thRate, mmRate, versionCode, title, message, link, items });
    await newData.save();
    res.json({ message: 'Data saved successfully!' });
  } catch (err) {
    console.error('Error saving data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get Data (if not exists, create default one)
app.get('/rate/datas', async (req, res) => {
  try {
    let data = await Data.findOne();
    if (!data) {
      data = await Data.create({
        thRate: 785,
        mmRate: 760,
        versionCode: 1,
        title: "အပ်ဒိပ် အသစ်ရရှိပါပြီ",
        message: "အက်ပ်၏ ဗားရှင်းအသစ်ကို ရနိုင်ပါပြီ။ ဆက်လုပ်ရန် ကျေးဇူးပြု၍ အပ်ဒိတ်လုပ်ပါ။",
        link: "https://play.google.com/store/apps/details?id=com.svpnmm.mmdev",
        items: [
          { thbBill: "50฿", mmkBill: "5000Ks" },
          { thbBill: "100฿", mmkBill: "10000ks" }
        ]
      });
    }
    res.json(data);
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update Existing Data
app.put('/rate/datas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { thRate, mmRate, versionCode, title, message, link, items } = req.body;
    const updatedData = await Data.findByIdAndUpdate(
      id,
      { thRate, mmRate, versionCode, title, message, link, items },
      { new: true }
    );
    if (!updatedData) {
      return res.status(404).json({ error: 'Data not found' });
    }
    res.json({ message: 'Data updated successfully!', data: updatedData });
  } catch (err) {
    console.error('Error updating data:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Delete an Item from Data's Items Array
app.delete('/rate/datas/:id/items/:itemId', async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const updatedData = await Data.findByIdAndUpdate(
      id,
      { $pull: { items: { _id: itemId } } },
      { new: true }
    );
    if (!updatedData) {
      return res.status(404).json({ error: 'Data not found' });
    }
    res.json({ message: 'Item deleted successfully!', data: updatedData });
  } catch (err) {
    console.error('Error deleting item:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Users count check route
app.get('/rate/users/check', async (req, res) => {
  try {
    // token verify logic (လိုအပ်သလို ရေးနိုင်)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, JWT_SECRET); // JWT_SECRET ကို သင့် env variable အတိုင်း ပြင်ပါ

    // User မရှိ/ရှိ စစ်
    const userCount = await User.countDocuments({});
    if (userCount === 0) {
      return res.status(404).json({ message: 'No users found' });
    }
    return res.json({ message: 'Users exist' });
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
});


// Admin Route (Protected)
app.get('/rate/admin', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  const token = authHeader.split(' ')[1];
  try {
    jwt.verify(token, JWT_SECRET);
    const data = await Data.findOne();
    if (!data) {
      return res.status(404).json({ message: 'Data not found' });
    }
    res.json(data);
  } catch (err) {
    console.error('Error verifying token:', err);
    res.status(401).json({ message: 'Unauthorized' });
  }
});

// ===========================
const PORT = process.env.PORT || 1000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
