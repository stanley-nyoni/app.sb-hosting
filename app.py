from flask import Flask, jsonify, request, render_template, send_from_directory, g
from database import init_db, get_db, close_db
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
import os

app = Flask(__name__)
app.teardown_appcontext(close_db)

with app.app_context():
    init_db()


# ─────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────

CYCLE_MONTHS = {
    'monthly': 1,
    'quarterly': 3,
    'semi-annual': 6,
    'annual': 12,
}


def calculate_next_due(payment_date_str: str, billing_cycle: str) -> str:
    payment_date = datetime.strptime(payment_date_str, '%Y-%m-%d')
    months = CYCLE_MONTHS.get(billing_cycle, 1)
    next_date = payment_date + relativedelta(months=months)
    return next_date.strftime('%Y-%m-%d')


def payment_status(next_due_date_str: str | None, threshold_days: int = 7) -> str:
    if not next_due_date_str:
        return 'pending'
    today = date.today()
    due = datetime.strptime(next_due_date_str, '%Y-%m-%d').date()
    delta = (due - today).days
    if delta < 0:
        return 'overdue'
    if delta <= threshold_days:
        return 'due_soon'
    return 'active'


def enrich_website(w: dict) -> dict:
    ndd = w.get('next_due_date')
    w['payment_status'] = payment_status(ndd)
    if ndd:
        today = date.today()
        due = datetime.strptime(ndd, '%Y-%m-%d').date()
        w['days_delta'] = (due - today).days
    else:
        w['days_delta'] = None
    return w


# ─────────────────────────────────────────────
#  PWA Static Routes
# ─────────────────────────────────────────────

@app.route('/')
def index():
    return render_template('index.html')


@app.route('/sw.js')
def sw():
    return send_from_directory('static/js', 'sw.js',
                               mimetype='application/javascript')


# ─────────────────────────────────────────────
#  Dashboard
# ─────────────────────────────────────────────

@app.route('/api/dashboard')
def dashboard():
    db = get_db()
    threshold = int(request.args.get('threshold', 7))

    rows = db.execute('''
        SELECT
            w.id AS website_id, w.domain, w.billing_cycle, w.price,
            w.status AS website_status,
            c.id AS client_id, c.name AS client_name,
            c.phone, c.email, c.business_name,
            p.next_due_date, p.amount AS last_payment,
            p.payment_date AS last_payment_date
        FROM websites w
        JOIN clients c ON w.client_id = c.id
        LEFT JOIN payments p ON p.id = (
            SELECT id FROM payments
            WHERE website_id = w.id
            ORDER BY payment_date DESC, id DESC
            LIMIT 1
        )
        WHERE w.status = "active"
        ORDER BY p.next_due_date ASC
    ''').fetchall()

    overdue, due_soon, active = [], [], []
    for r in rows:
        item = dict(r)
        item = enrich_website(item)
        s = item['payment_status']
        if s == 'overdue':
            overdue.append(item)
        elif s == 'due_soon':
            due_soon.append(item)
        else:
            active.append(item)

    total_clients = db.execute('SELECT COUNT(*) FROM clients').fetchone()[0]
    total_websites = db.execute(
        'SELECT COUNT(*) FROM websites WHERE status="active"').fetchone()[0]
    monthly_revenue = db.execute('''
        SELECT SUM(
            CASE billing_cycle
                WHEN "monthly"     THEN price
                WHEN "quarterly"   THEN price / 3.0
                WHEN "semi-annual" THEN price / 6.0
                WHEN "annual"      THEN price / 12.0
                ELSE price
            END
        ) FROM websites WHERE status="active"
    ''').fetchone()[0] or 0

    return jsonify({
        'overdue': overdue,
        'due_soon': due_soon,
        'active': active,
        'stats': {
            'total_clients': total_clients,
            'total_websites': total_websites,
            'monthly_revenue': round(monthly_revenue, 2),
            'overdue_count': len(overdue),
            'due_soon_count': len(due_soon),
        }
    })


# ─────────────────────────────────────────────
#  Clients
# ─────────────────────────────────────────────

@app.route('/api/clients', methods=['GET', 'POST'])
def clients():
    db = get_db()

    if request.method == 'GET':
        q = request.args.get('search', '').strip()
        like = f'%{q}%'
        rows = db.execute('''
            SELECT c.*,
                (SELECT COUNT(*) FROM websites WHERE client_id = c.id) AS website_count,
                (SELECT COUNT(*) FROM websites w
                    LEFT JOIN payments p ON p.id = (
                        SELECT id FROM payments WHERE website_id = w.id
                        ORDER BY payment_date DESC LIMIT 1
                    )
                    WHERE w.client_id = c.id AND w.status="active"
                      AND (p.next_due_date IS NULL OR p.next_due_date < date("now"))
                ) AS overdue_count
            FROM clients c
            WHERE c.name LIKE ? OR c.business_name LIKE ?
               OR c.email LIKE ? OR c.phone LIKE ?
            ORDER BY c.name
        ''', (like, like, like, like)).fetchall()
        return jsonify([dict(r) for r in rows])

    data = request.get_json()
    db.execute(
        'INSERT INTO clients (name, business_name, phone, email, notes) VALUES (?,?,?,?,?)',
        (data['name'], data.get('business_name', ''), data.get('phone', ''),
         data.get('email', ''), data.get('notes', ''))
    )
    db.commit()
    cid = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    return jsonify(dict(db.execute('SELECT * FROM clients WHERE id=?', (cid,)).fetchone())), 201


@app.route('/api/clients/<int:cid>', methods=['GET', 'PUT', 'DELETE'])
def client_detail(cid):
    db = get_db()
    client = db.execute('SELECT * FROM clients WHERE id=?', (cid,)).fetchone()
    if not client:
        return jsonify({'error': 'Not found'}), 404

    if request.method == 'GET':
        c = dict(client)
        websites = db.execute('''
            SELECT w.*,
                p.next_due_date, p.amount AS last_payment,
                p.payment_date AS last_payment_date
            FROM websites w
            LEFT JOIN payments p ON p.id = (
                SELECT id FROM payments WHERE website_id = w.id
                ORDER BY payment_date DESC LIMIT 1
            )
            WHERE w.client_id = ?
            ORDER BY w.domain
        ''', (cid,)).fetchall()
        c['websites'] = [enrich_website(dict(w)) for w in websites]
        return jsonify(c)

    if request.method == 'PUT':
        data = request.get_json()
        db.execute(
            'UPDATE clients SET name=?,business_name=?,phone=?,email=?,notes=? WHERE id=?',
            (data['name'], data.get('business_name', ''), data.get('phone', ''),
             data.get('email', ''), data.get('notes', ''), cid)
        )
        db.commit()
        return jsonify(dict(db.execute('SELECT * FROM clients WHERE id=?', (cid,)).fetchone()))

    # DELETE
    db.execute('DELETE FROM payments WHERE website_id IN (SELECT id FROM websites WHERE client_id=?)', (cid,))
    db.execute('DELETE FROM websites WHERE client_id=?', (cid,))
    db.execute('DELETE FROM clients WHERE id=?', (cid,))
    db.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
#  Websites
# ─────────────────────────────────────────────

@app.route('/api/clients/<int:cid>/websites', methods=['POST'])
def add_website(cid):
    db = get_db()
    if not db.execute('SELECT id FROM clients WHERE id=?', (cid,)).fetchone():
        return jsonify({'error': 'Client not found'}), 404
    data = request.get_json()
    db.execute(
        'INSERT INTO websites (client_id,domain,hosting_provider,start_date,billing_cycle,price,status) VALUES (?,?,?,?,?,?,?)',
        (cid, data['domain'], data.get('hosting_provider', ''),
         data.get('start_date', date.today().isoformat()),
         data.get('billing_cycle', 'monthly'),
         data.get('price', 0),
         data.get('status', 'active'))
    )
    db.commit()
    wid = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    return jsonify(dict(db.execute('SELECT * FROM websites WHERE id=?', (wid,)).fetchone())), 201


@app.route('/api/websites/<int:wid>', methods=['GET', 'PUT', 'DELETE'])
def website_detail(wid):
    db = get_db()
    website = db.execute('SELECT * FROM websites WHERE id=?', (wid,)).fetchone()
    if not website:
        return jsonify({'error': 'Not found'}), 404

    if request.method == 'GET':
        w = enrich_website(dict(website))
        w['payments'] = [dict(p) for p in db.execute(
            'SELECT * FROM payments WHERE website_id=? ORDER BY payment_date DESC', (wid,)
        ).fetchall()]
        return jsonify(w)

    if request.method == 'PUT':
        data = request.get_json()
        db.execute(
            'UPDATE websites SET domain=?,hosting_provider=?,start_date=?,billing_cycle=?,price=?,status=? WHERE id=?',
            (data['domain'], data.get('hosting_provider', ''),
             data.get('start_date'), data.get('billing_cycle', 'monthly'),
             data.get('price', 0), data.get('status', 'active'), wid)
        )
        db.commit()
        return jsonify(enrich_website(dict(db.execute('SELECT * FROM websites WHERE id=?', (wid,)).fetchone())))

    # DELETE
    db.execute('DELETE FROM payments WHERE website_id=?', (wid,))
    db.execute('DELETE FROM websites WHERE id=?', (wid,))
    db.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
#  Payments
# ─────────────────────────────────────────────

@app.route('/api/websites/<int:wid>/payments', methods=['GET', 'POST'])
def payments(wid):
    db = get_db()
    website = db.execute('SELECT * FROM websites WHERE id=?', (wid,)).fetchone()
    if not website:
        return jsonify({'error': 'Website not found'}), 404

    if request.method == 'GET':
        rows = db.execute(
            'SELECT * FROM payments WHERE website_id=? ORDER BY payment_date DESC', (wid,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])

    data = request.get_json()
    pdate = data.get('payment_date', date.today().isoformat())
    next_due = calculate_next_due(pdate, website['billing_cycle'])
    db.execute(
        'INSERT INTO payments (website_id,amount,payment_date,next_due_date,notes) VALUES (?,?,?,?,?)',
        (wid, data.get('amount', website['price']), pdate, next_due, data.get('notes', ''))
    )
    db.commit()
    pid = db.execute('SELECT last_insert_rowid()').fetchone()[0]
    return jsonify(dict(db.execute('SELECT * FROM payments WHERE id=?', (pid,)).fetchone())), 201


@app.route('/api/payments/<int:pid>', methods=['DELETE'])
def delete_payment(pid):
    db = get_db()
    db.execute('DELETE FROM payments WHERE id=?', (pid,))
    db.commit()
    return jsonify({'success': True})


# ─────────────────────────────────────────────
#  Search
# ─────────────────────────────────────────────

@app.route('/api/search')
def search():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify({'clients': [], 'websites': []})
    db = get_db()
    like = f'%{q}%'
    clients = db.execute(
        'SELECT id,name,business_name,phone,email FROM clients WHERE name LIKE ? OR business_name LIKE ? OR email LIKE ?',
        (like, like, like)
    ).fetchall()
    websites = db.execute('''
        SELECT w.id,w.domain,w.billing_cycle,w.price,
               c.id AS client_id, c.name AS client_name
        FROM websites w JOIN clients c ON w.client_id = c.id
        WHERE w.domain LIKE ? OR c.name LIKE ?
    ''', (like, like)).fetchall()
    return jsonify({
        'clients': [dict(r) for r in clients],
        'websites': [dict(r) for r in websites],
    })


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
