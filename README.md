# Client Hosting Manager PWA

A mobile-first Progressive Web App for managing client websites and hosting billing cycles. Built with Flask + SQLite.

---

## Quick Start

```bash
# 1. Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Run the app
python app.py
```

Open **http://localhost:5000** in your browser.

To install as a PWA on mobile: open the URL in Chrome/Safari and tap **Add to Home Screen**.

---

## Features

| Feature | Description |
|---|---|
| 📋 Client Management | Full CRUD — name, business, phone, email, notes |
| 🌐 Website Tracking | Multiple sites per client, provider, billing cycle, price |
| 💰 Payment Records | Auto-calculates next due date based on billing cycle |
| 📊 Smart Dashboard | Overdue / Due Soon / Active with estimated monthly revenue |
| 🔔 Notifications | Browser push alerts for overdue & upcoming renewals |
| 💬 WhatsApp | One-tap reminder link with pre-filled message |
| 📋 Copy Reminder | Copy message to clipboard for any channel |
| 🔍 Search | Search clients by name, business, domain |
| 📴 Offline | Service Worker caches static assets & last API responses |

---

## Billing Cycles

| Cycle | Months Added on Payment |
|---|---|
| Monthly | +1 month |
| Quarterly | +3 months |
| Semi-Annual | +6 months |
| Annual | +12 months |

---

## Status Logic

- **Active** → next due date is more than 7 days away
- **Due Soon** → next due date is within 7 days
- **Overdue** → next due date has passed
- **Pending** → no payment has been recorded yet

---

## API Endpoints

```
GET  /api/dashboard          Dashboard stats + grouped websites
GET  /api/clients            List clients (optional ?search=)
POST /api/clients            Create client
GET  /api/clients/:id        Client detail with websites
PUT  /api/clients/:id        Update client
DEL  /api/clients/:id        Delete client (cascade)

POST /api/clients/:id/websites    Add website to client
GET  /api/websites/:id            Website detail + payments
PUT  /api/websites/:id            Update website
DEL  /api/websites/:id            Delete website

GET  /api/websites/:id/payments   List payments
POST /api/websites/:id/payments   Record payment (auto-calculates next due)
DEL  /api/payments/:id            Delete payment

GET  /api/search?q=           Search clients + websites
```

---

## File Structure

```
client-hosting-manager/
├── app.py                  Flask application + routes
├── database.py             SQLite init + connection helper
├── requirements.txt
├── hosting_manager.db      Auto-created on first run
├── templates/
│   └── index.html          PWA shell + full CSS
└── static/
    ├── manifest.json       PWA manifest
    ├── icons/
    │   └── icon.svg        App icon
    └── js/
        ├── app.js          Complete SPA frontend
        └── sw.js           Service Worker
```

---

## Future Enhancements

- PDF invoice generation
- Multi-device sync (move from SQLite to PostgreSQL)
- Email reminder automation
- Monthly revenue analytics charts
- Client portal (client-facing login)
