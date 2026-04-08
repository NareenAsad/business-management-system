const express = require('express');
const db = require('../database/db');

const app = express();
app.use(express.json());

// Create Sales Table
db.run(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    amount REAL,
    type TEXT
  )
`);

// Create Inventory Table
db.run(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT,
    quantity INTEGER,
    purchase_price REAL,
    sale_price REAL
  )
`);

// API: Add Sale
app.post('/sales/add', (req, res) => {
    const { date, amount, type, product_id, quantity } = req.body;

    // 1. Insert Sale
    const saleQuery = `
    INSERT INTO sales (date, amount, type)
    VALUES (?, ?, ?)
  `;

    db.run(saleQuery, [date, amount, type], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        // 2. Reduce Inventory
        const updateQuery = `
      UPDATE inventory
      SET quantity = quantity - ?
      WHERE id = ?
    `;

        db.run(updateQuery, [quantity, product_id], function (err2) {
            if (err2) {
                return res.status(500).json({ error: err2.message });
            }

            res.json({
                message: "Sale added & inventory updated",
                sale_id: this.lastID
            });
        });
    });
});

app.get('/sales/list', (req, res) => {
    db.all(`SELECT * FROM sales`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// API: Add Product
app.post('/inventory/add', (req, res) => {
    const { product_name, quantity, purchase_price, sale_price } = req.body;

    const query = `
    INSERT INTO inventory (product_name, quantity, purchase_price, sale_price)
    VALUES (?, ?, ?, ?)
  `;

    db.run(query, [product_name, quantity, purchase_price, sale_price], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({ message: "Product added", id: this.lastID });
    });
});

app.get('/inventory/list', (req, res) => {
    db.all(`SELECT * FROM inventory`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// Start Server
app.listen(5000, () => {
    console.log("Server running on port 5000");
});