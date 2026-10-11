const express = require('express');
const { Pool } = require('pg');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json({ limit: '1mb' }));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    })
  : null;

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      "imageUrl" TEXT
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      "storeName" TEXT NOT NULL,
      "storePhone" TEXT,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      "totalAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Pending',
      "paymentMethod" TEXT NOT NULL DEFAULT 'Cash on Delivery',
      "cashCollected" BOOLEAN NOT NULL DEFAULT FALSE,
      "placedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  // Intentionally do not seed sample products. An empty inventory must stay empty.
  await pool.query(
    "INSERT INTO app_meta (key,value) VALUES ('initial_products_seeded','true') ON CONFLICT (key) DO NOTHING"
  );
}

function requireDb(req,res,next) {
  if (!pool) return res.status(503).json({ error: 'Database not configured. Set DATABASE_URL in Render.' });
  next();
}
app.get('/api/health', async (req,res) => {
  if (!pool) return res.status(503).json({ status:'offline', error:'DATABASE_URL is not configured' });
  try { await pool.query('SELECT 1'); res.json({ status:'ok' }); }
  catch (e) { res.status(503).json({ status:'offline', error:'Database connection failed' }); }
});
app.get('/api/products', requireDb, async (req,res) => {
  try { const r=await pool.query('SELECT id,name,category,price,stock,"imageUrl" FROM products ORDER BY id'); res.json(r.rows.map(p=>({...p,id:Number(p.id),price:Number(p.price)}))); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not load products'}); }
});
app.post('/api/products', requireDb, async (req,res) => {
  const {name,category,price,stock,imageUrl=null}=req.body||{};
  if (!String(name||'').trim() || !String(category||'').trim() || !Number.isFinite(Number(price)) || Number(price)<0 || !Number.isInteger(Number(stock)) || Number(stock)<0)
    return res.status(400).json({error:'Valid name, category, price and stock are required'});
  try { const r=await pool.query('INSERT INTO products (name,category,price,stock,"imageUrl") VALUES ($1,$2,$3,$4,$5) RETURNING id,name,category,price,stock,"imageUrl"',[String(name).trim(),String(category).trim(),Number(price),Number(stock),imageUrl||null]); const p=r.rows[0]; res.status(201).json({...p,id:Number(p.id),price:Number(p.price)}); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not save product'}); }
});
app.delete('/api/products/:id', requireDb, async (req,res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({error:'Invalid product id'});
  try { const r=await pool.query('DELETE FROM products WHERE id=$1 RETURNING id',[req.params.id]); if(!r.rowCount) return res.status(404).json({error:'Product not found'}); res.json({ok:true}); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not delete product'}); }
});
app.get('/api/orders', requireDb, async (req,res) => {
  try { const r=await pool.query('SELECT id,"storeName","storePhone",items,"totalAmount",status,"paymentMethod","cashCollected","placedAt" FROM orders ORDER BY id'); res.json(r.rows.map(o=>({...o,id:Number(o.id),totalAmount:Number(o.totalAmount),items:typeof o.items==='string'?JSON.parse(o.items):o.items,placedAt:new Date(o.placedAt).toISOString()}))); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not load orders'}); }
});
app.post('/api/orders', requireDb, async (req,res) => {
  const o=req.body||{};
  if (!String(o.storeName||'').trim() || !Array.isArray(o.items) || o.items.length===0 || !Number.isFinite(Number(o.totalAmount)) || Number(o.totalAmount)<0)
    return res.status(400).json({error:'Valid store name, items and total are required'});
  try { const r=await pool.query('INSERT INTO orders ("storeName","storePhone",items,"totalAmount",status,"paymentMethod","cashCollected","placedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8::timestamptz,NOW())) RETURNING id,"storeName","storePhone",items,"totalAmount",status,"paymentMethod","cashCollected","placedAt"',
    [String(o.storeName).trim(),o.storePhone||null,JSON.stringify(o.items),Number(o.totalAmount),o.status||'Pending',o.paymentMethod||'Cash on Delivery',Boolean(o.cashCollected),o.placedAt||null]);
    const v=r.rows[0]; res.status(201).json({...v,id:Number(v.id),totalAmount:Number(v.totalAmount),items:v.items,placedAt:new Date(v.placedAt).toISOString()});
  } catch(e) { console.error(e); res.status(500).json({error:'Could not save order'}); }
});
app.put('/api/orders/:id', requireDb, async (req,res) => {
  const {status,cashCollected}=req.body||{};
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({error:'Invalid order id'});
  try { const r=await pool.query('UPDATE orders SET status=COALESCE($2,status),"cashCollected"=COALESCE($3,"cashCollected") WHERE id=$1 RETURNING id,status,"cashCollected"',[req.params.id,status||null,typeof cashCollected==='boolean'?cashCollected:null]); if(!r.rowCount)return res.status(404).json({error:'Order not found'}); res.json({...r.rows[0],id:Number(r.rows[0].id)}); }
  catch(e) { console.error(e); res.status(500).json({error:'Could not update order'}); }
});
app.use(express.static(__dirname));
app.get('*', (req,res) => res.sendFile(path.join(__dirname,'index.html')));
initDb().then(()=>app.listen(PORT,'0.0.0.0',()=>console.log('Lasya Traders server listening on '+PORT)))
  .catch(e=>{ console.error('Database initialization failed:',e.message); app.listen(PORT,'0.0.0.0',()=>console.log('Server started without database; set DATABASE_URL')); });
