const express = require('express');
const db = require('../database/db');

const app = express();
app.use(express.json());

//   TABLES

// Sales Table
db.run(`
  CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    amount REAL,
    type TEXT
  )
`);

// Inventory Table
db.run(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT,
    quantity INTEGER,
    purchase_price REAL,
    sale_price REAL
  )
`);

// Day Book Table
db.run(`
  CREATE TABLE IF NOT EXISTS daybook (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    type TEXT,
    category TEXT,
    amount REAL,
    reference_id INTEGER
  )
`);

// Cheque Table
db.run(`
  CREATE TABLE IF NOT EXISTS cheques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    party_name TEXT,
    amount REAL,
    date TEXT,
    status TEXT DEFAULT 'pending'
  )
`);

//   SALES API

app.post('/sales/add', (req, res) => {
    const { date, amount, type, product_id, quantity } = req.body;

    // Check stock
    db.get(`SELECT quantity FROM inventory WHERE id = ?`, [product_id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (!row) {
            return res.status(404).json({ message: "Product not found" });
        }

        if (row.quantity < quantity) {
            return res.status(400).json({
                message: "Not enough stock",
                available: row.quantity
            });
        }

        // Insert Sale
        db.run(
            `INSERT INTO sales (date, amount, type) VALUES (?, ?, ?)`,
            [date, amount, type],
            function (err2) {
                if (err2) return res.status(500).json({ error: err2.message });

                const saleId = this.lastID;

                // Update Inventory
                db.run(
                    `UPDATE inventory SET quantity = quantity - ? WHERE id = ?`,
                    [quantity, product_id],
                    function (err3) {
                        if (err3) return res.status(500).json({ error: err3.message });

                        // Insert Day Book Entry
                        db.run(
                            `INSERT INTO daybook (date, type, category, amount, reference_id)
               VALUES (?, 'income', 'sale', ?, ?)`,
                            [date, amount, saleId],
                            function (err4) {
                                if (err4) return res.status(500).json({ error: err4.message });

                                res.json({
                                    message: "Sale + DayBook entry added",
                                    sale_id: saleId
                                });
                            }
                        );
                    }
                );
            }
        );
    });
});

//   SALES LIST

app.get('/sales/list', (req, res) => {
    db.all(`SELECT * FROM sales`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

//   INVENTORY APIs

// Add Product
app.post('/inventory/add', (req, res) => {
    const { product_name, quantity, purchase_price, sale_price } = req.body;

    db.run(
        `INSERT INTO inventory (product_name, quantity, purchase_price, sale_price)
     VALUES (?, ?, ?, ?)`,
        [product_name, quantity, purchase_price, sale_price],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            res.json({ message: "Product added", id: this.lastID });
        }
    );
});

// Get Inventory
app.get('/inventory/list', (req, res) => {
    db.all(`SELECT * FROM inventory`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

//   DAY BOOK API

app.get('/daybook', (req, res) => {
    db.all(`SELECT * FROM daybook ORDER BY date DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

//   EXPENSE API

app.post('/expense/add', (req, res) => {
    const { date, amount, category } = req.body;

    if (!date || !amount || !category) {
        return res.status(400).json({ message: "All fields are required" });
    }

    const query = `
    INSERT INTO daybook (date, type, category, amount, reference_id)
    VALUES (?, 'expense', ?, ?, NULL)
  `;

    db.run(query, [date, category, amount], function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        res.json({
            message: "Expense added successfully",
            id: this.lastID
        });
    });
});

app.get('/daybook/summary', (req, res) => {
    const query = `
    SELECT 
      SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as total_expense
    FROM daybook
  `;

    db.get(query, [], (err, row) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }

        const profit = (row.total_income || 0) - (row.total_expense || 0);

        res.json({
            total_income: row.total_income || 0,
            total_expense: row.total_expense || 0,
            profit
        });
    });
});

//   CHEQUES API

// Add Cheque
app.post('/cheques/add', (req, res) => {
    const { party_name, amount, date } = req.body;

    if (!party_name || !amount || !date) {
        return res.status(400).json({ message: "All fields are required" });
    }

    db.run(
        `INSERT INTO cheques (party_name, amount, date)
     VALUES (?, ?, ?)`,
        [party_name, amount, date],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
                message: "Cheque added (Pending)",
                id: this.lastID
            });
        }
    );
});

// Get Cheques List
app.get('/cheques', (req, res) => {
    db.all(`SELECT * FROM cheques ORDER BY date DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

//   GET CHEQUES BY STATUS

app.get('/cheques/:status', (req, res) => {
    const { status } = req.params;

    // validate status
    if (!['pending', 'cleared', 'dishonored'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    db.all(
        `SELECT * FROM cheques WHERE status = ? ORDER BY date DESC`,
        [status],
        (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        }
    );
});

//   UPDATE CHEQUE STATUS

app.put('/cheques/update/:id', (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'cleared', 'dishonored'].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
    }

    db.run(
        `UPDATE cheques SET status = ? WHERE id = ?`,
        [status, id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
                message: `Cheque updated to ${status}`
            });
        }
    );
});

//   SERVER

app.listen(5000, () => {
    console.log("Server running on port 5000");
});