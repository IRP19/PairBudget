const express = require('express');
const { pool } = require('./db');

const app = express();
app.use(express.json({ limit: '2mb' }));

const entrySelect = `SELECT e.id, e.account_id AS owner, c.name AS category, e.type,
  e.name, e.amount::float AS amount, e.period, to_char(e.date, 'YYYY-MM-DD') AS date, e.note
  FROM financial_entries e JOIN accounts a ON a.id=e.account_id
  LEFT JOIN categories c ON c.id=e.category_id`;
const transferSelect = `SELECT t.id, t.source_account_id AS source, t.destination_account_id AS destination,
  t.amount::float AS amount, t.period, to_char(t.date, 'YYYY-MM-DD') AS date, t.note FROM transfers t`;
const accountIds = new Set(['persona-a', 'persona-b', 'comun']);

app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (error) { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});
app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (error) { res.status(503).json({ status: 'error', database: 'unavailable' }); }
});

function typeRouter(type) {
  const router = express.Router();
  router.get('/', async (_req, res, next) => {
    try { const result = await pool.query(`${entrySelect} WHERE e.type=$1 ORDER BY e.date DESC, e.id`, [type]); res.json(result.rows); }
    catch (error) { next(error); }
  });
  router.post('/', async (req, res, next) => {
    try { const row = await saveEntry(type, req.body); res.status(201).json(row); }
    catch (error) { next(error); }
  });
  router.put('/:id', async (req, res, next) => {
    try {
      const existing = await pool.query('SELECT 1 FROM financial_entries WHERE id=$1 AND type=$2', [req.params.id, type]);
      if (!existing.rowCount) return res.sendStatus(404);
      const row = await saveEntry(type, req.body, req.params.id); res.json(row);
    }
    catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try { const result = await pool.query('DELETE FROM financial_entries WHERE id=$1 AND type=$2', [req.params.id, type]); result.rowCount ? res.sendStatus(204) : res.sendStatus(404); }
    catch (error) { next(error); }
  });
  return router;
}

async function saveEntry(type, body, id = body.id) {
  const owner = body.owner;
  const name = String(body.name || '').trim();
  const amount = Number(body.amount);
  const period = String(body.period || '');
  const date = String(body.date || `${period}-01`).slice(0, 10);
  if (!accountIds.has(owner) || !name || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('Datos de movimiento no válidos'); error.status = 400; throw error;
  }
  const category = String(body.category || '').trim() || null;
  const params = [id || `entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, owner, category, type, name, amount, period, date, String(body.note || '')];
  const result = await pool.query(`INSERT INTO financial_entries (id, account_id, category_id, type, name, amount, period, date, note)
    VALUES ($1,$2,(SELECT id FROM categories WHERE name=$3),$4,$5,$6,$7,$8,$9)
    ON CONFLICT (id) DO UPDATE SET account_id=EXCLUDED.account_id, category_id=EXCLUDED.category_id,
    type=EXCLUDED.type, name=EXCLUDED.name, amount=EXCLUDED.amount, period=EXCLUDED.period, date=EXCLUDED.date, note=EXCLUDED.note
    RETURNING id`, params);
  const row = await pool.query(`${entrySelect} WHERE e.id=$1`, [result.rows[0].id]);
  return row.rows[0];
}

app.use('/api/expenses', typeRouter('expense'));
app.use('/api/incomes', typeRouter('income'));

app.get('/api/transfers', async (_req, res, next) => {
  try { res.json((await pool.query(`${transferSelect} ORDER BY t.date DESC, t.id`)).rows); } catch (error) { next(error); }
});
app.post('/api/transfers', async (req, res, next) => {
  try { const row = await saveTransfer(req.body); res.status(201).json(row); } catch (error) { next(error); }
});
app.put('/api/transfers/:id', async (req, res, next) => {
  try {
    const existing = await pool.query('SELECT 1 FROM transfers WHERE id=$1', [req.params.id]);
    if (!existing.rowCount) return res.sendStatus(404);
    const row = await saveTransfer(req.body, req.params.id); res.json(row);
  } catch (error) { next(error); }
});
async function saveTransfer(body, id = body.id) {
  const { source, destination } = body;
  const amount = Number(body.amount); const period = String(body.period || '');
  const date = String(body.date || `${period}-01`).slice(0, 10);
  if (!accountIds.has(source) || !accountIds.has(destination) || source === destination || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const error = new Error('Datos de transferencia no válidos'); error.status = 400; throw error;
  }
  const key = id || `transfer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await pool.query(`INSERT INTO transfers (id, source_account_id, destination_account_id, amount, period, date, note)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET source_account_id=EXCLUDED.source_account_id,
    destination_account_id=EXCLUDED.destination_account_id, amount=EXCLUDED.amount, period=EXCLUDED.period, date=EXCLUDED.date, note=EXCLUDED.note`,
  [key, source, destination, amount, period, date, String(body.note || '')]);
  return (await pool.query(`${transferSelect} WHERE t.id=$1`, [key])).rows[0];
}
app.delete('/api/transfers/:id', async (req, res, next) => {
  try { const result = await pool.query('DELETE FROM transfers WHERE id=$1', [req.params.id]); result.rowCount ? res.sendStatus(204) : res.sendStatus(404); }
  catch (error) { next(error); }
});

// One-time, non-destructive browser-data bootstrap: only fills a truly empty financial store.
app.post('/api/bootstrap', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const count = await client.query('SELECT (SELECT count(*) FROM financial_entries) + (SELECT count(*) FROM transfers) AS total');
    if (Number(count.rows[0].total) > 0) { await client.query('ROLLBACK'); return res.json({ imported: false }); }
    for (const [type, rows] of [['expense', req.body.expenses], ['income', req.body.incomes]]) {
      for (const item of (Array.isArray(rows) ? rows : [])) {
        const period = String(item.period || String(item.date || '').slice(0, 7));
        const date = item.date || `${period}-01`;
        await client.query(`INSERT INTO financial_entries (id, account_id, category_id, type, name, amount, period, date, note)
          VALUES ($1,$2,(SELECT id FROM categories WHERE name=$3),$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO NOTHING`,
        [String(item.id || `${type}-${Date.now()}-${Math.random()}`), item.owner || 'comun', item.category || null, type, item.name || item.category || type, Number(item.amount) || 0.01, period, date, item.note || '']);
      }
    }
    await client.query('COMMIT'); res.json({ imported: true });
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Error interno de la API' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => console.log(`PairBudget API listening on ${port}`));
