const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado ao MongoDB Atlas com sucesso!'))
  .catch(err => console.error('❌ Erro ao conectar ao MongoDB:', err));

// --- SCHEMAS ---

const StoreSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: String,
  apiKey: String, // Store specific API Key
  pixFeePercentage: { type: Number, default: 0 },
  pixFeeFixed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  description: { type: String, default: '' },
  status: { type: String, default: 'pending' },

  // Store Association
  store_id: { type: String, index: true },
  store_name: String,

  // Customer Data
  customer_name: String,
  customer_cpf: String,
  customer_email: String,
  customer_phone: String,

  // Payment Data
  pixgo_payment_id: String,
  qr_code: String,
  qr_image_url: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Store = mongoose.model('Store', StoreSchema);
const Order = mongoose.model('Order', OrderSchema);

// --- API ROUTES ---

// STORE ROUTES
app.get('/api/stores', async (req, res) => {
  try {
    const stores = await Store.find().sort({ createdAt: -1 });
    res.json(stores);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Single Store (Internal use for checkout/dashboard)
app.get('/api/stores/:id', async (req, res) => {
  try {
    const store = await Store.findOne({ id: req.params.id });
    if (!store) return res.status(404).json({ message: 'Store not found' });
    res.json(store);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stores', async (req, res) => {
  try {
    const newStore = new Store(req.body);
    const savedStore = await newStore.save();
    res.json(savedStore);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Store Settings (API Key, Fees)
app.put('/api/stores/:id', async (req, res) => {
  try {
    const updatedStore = await Store.findOneAndUpdate(
      { id: req.params.id },
      req.body,
      { new: true }
    );
    res.json(updatedStore);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ORDER ROUTES

// 1. Get Orders (Optional Filter by Store)
app.get('/api/orders', async (req, res) => {
  try {
    const { storeId } = req.query;
    const query = storeId ? { store_id: storeId } : {};

    const orders = await Order.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Order by ID
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await Order.findOne({ id: req.params.id });
    if (!order) return res.status(404).json({ message: 'Pedido não encontrado' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Create or Update Order (Upsert)
app.post('/api/orders', async (req, res) => {
  try {
    const { id } = req.body;
    const updateData = { ...req.body, updatedAt: new Date() };

    const order = await Order.findOneAndUpdate(
      { id: id },
      updateData,
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Update Status
app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findOneAndUpdate(
      { id: req.params.id },
      { status: status, updatedAt: new Date() },
      { new: true }
    );
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Dashboard Metrics (With Store Filter)
app.get('/api/dashboard/metrics', async (req, res) => {
  try {
    const { storeId } = req.query;
    const query = storeId ? { store_id: storeId } : {};

    const totalOrders = await Order.countDocuments(query);
    const pendingOrders = await Order.countDocuments({ ...query, status: 'pending' });

    // Sum revenue for completed orders
    const revenueAgg = await Order.aggregate([
      { $match: { ...query, status: 'completed' } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalRevenue = revenueAgg.length > 0 ? revenueAgg[0].total : 0;

    // Calculate conversion
    const completedCount = await Order.countDocuments({ ...query, status: 'completed' });
    const conversionRate = totalOrders > 0
      ? ((completedCount / totalOrders) * 100).toFixed(1)
      : '0.0';

    res.json({
      totalOrders,
      totalRevenue,
      pendingOrders,
      conversionRate
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});