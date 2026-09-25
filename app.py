import sqlite3
import datetime
import csv
import os
import shutil
from functools import wraps
from flask import Flask, render_template, request, jsonify, session, redirect, url_for

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "emp_details.csv")

app = Flask(
    __name__,
    static_folder=os.path.join(BASE_DIR, "static"),
    template_folder=os.path.join(BASE_DIR, "templates")
)

app.secret_key = os.environ.get('SECRET_KEY', 'hr-rms-secret-key-2025-xk9z')

# ---------- Auth Helpers ----------
ADMIN_EMAIL    = 'admin@rms.com'
ADMIN_PASSWORD = 'Admin@012'
ADMIN_EM_CODE  = 'RMS250024'

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_email' not in session:
            return redirect(url_for('login_page'))
        return f(*args, **kwargs)
    return decorated


import urllib.parse
import ssl

class PgCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor
        self.lastrowid = None

    def _convert_query(self, query):
        query = query.replace('?', '%s')
        if 'INSERT OR REPLACE INTO employees' in query:
            update_clause = '''
            ON CONFLICT (em_code) DO UPDATE SET
            first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, full_name = EXCLUDED.full_name,
            em_email = EXCLUDED.em_email, em_pan_no = EXCLUDED.em_pan_no, em_pf_no = EXCLUDED.em_pf_no,
            em_uan = EXCLUDED.em_uan, em_esi_no = EXCLUDED.em_esi_no, em_role = EXCLUDED.em_role,
            status = EXCLUDED.status, em_gender = EXCLUDED.em_gender, em_phone = EXCLUDED.em_phone,
            em_birthday = EXCLUDED.em_birthday, em_blood_group = EXCLUDED.em_blood_group,
            em_joining_date = EXCLUDED.em_joining_date, des_name = EXCLUDED.des_name, dep_name = EXCLUDED.dep_name
            '''
            query = query.replace('INSERT OR REPLACE INTO employees', 'INSERT INTO employees')
            if 'ON CONFLICT' not in query:
                query = query + update_clause
        query = query.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'SERIAL PRIMARY KEY')
        return query

    def execute(self, query, params=None):
        sql = self._convert_query(query)
        if 'INSERT INTO trainings' in sql and 'RETURNING id' not in sql:
            sql += ' RETURNING id'
        if params is None:
            params = ()
        self.cursor.execute(sql, params)
        if 'RETURNING id' in sql:
            res = self.cursor.fetchone()
            if res:
                self.lastrowid = res[0]
        return self

    def fetchone(self):
        res = self.cursor.fetchone()
        if not res:
            return None
        if hasattr(self.cursor, 'description') and self.cursor.description:
            colnames = [col[0] for col in self.cursor.description]
            return dict(zip(colnames, res))
        return res

    def fetchall(self):
        rows = self.cursor.fetchall()
        if not rows:
            return []
        if hasattr(self.cursor, 'description') and self.cursor.description:
            colnames = [col[0] for col in self.cursor.description]
            return [dict(zip(colnames, r)) for r in rows]
        return rows


class PgConnWrapper:
    def __init__(self, conn):
        self.conn = conn

    def cursor(self):
        return PgCursorWrapper(self.conn.cursor())

    def execute(self, query, params=None):
        cur = self.cursor()
        cur.execute(query, params)
        return cur

    def commit(self):
        self.conn.commit()

    def close(self):
        self.conn.close()


def get_db_path():
    # If running in Vercel or serverless environment, use /tmp for writable SQLite DB
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        tmp_db = os.path.join("/tmp", "hr_app.db")
        orig_db = os.path.join(BASE_DIR, "hr_app.db")
        if not os.path.exists(tmp_db):
            if os.path.exists(orig_db):
                try:
                    shutil.copy2(orig_db, tmp_db)
                except Exception as e:
                    print(f"Error copying DB to /tmp: {e}")
        return tmp_db
    return os.path.join(BASE_DIR, "hr_app.db")

def get_db_connection():
    db_url = os.environ.get("POSTGRES_URL") or os.environ.get("DATABASE_URL")
    if db_url:
        try:
            import pg8000
            if db_url.startswith("postgres://"):
                db_url = db_url.replace("postgres://", "postgresql://", 1)
            
            parsed = urllib.parse.urlparse(db_url)
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE

            conn = pg8000.connect(
                user=parsed.username,
                password=parsed.password,
                host=parsed.hostname,
                port=parsed.port or 5432,
                database=parsed.path.lstrip('/'),
                ssl_context=ssl_ctx
            )
            return PgConnWrapper(conn)
        except Exception as e:
            print(f"Postgres connection error: {e}, falling back to SQLite")

    db_path = get_db_path()
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Create trainings table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trainings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            topic TEXT NOT NULL,
            faculty TEXT NOT NULL,
            program_duration REAL NOT NULL,
            hours_completed REAL NOT NULL,
            attendees TEXT NOT NULL,
            status TEXT NOT NULL,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create employees table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS employees (
            em_code TEXT PRIMARY KEY,
            first_name TEXT,
            last_name TEXT,
            full_name TEXT,
            em_email TEXT,
            em_pan_no TEXT,
            em_pf_no TEXT,
            em_uan TEXT,
            em_esi_no TEXT,
            em_role TEXT,
            status TEXT,
            em_gender TEXT,
            em_phone TEXT,
            em_birthday TEXT,
            em_blood_group TEXT,
            em_joining_date TEXT,
            des_name TEXT,
            dep_name TEXT
        )
    ''')
    
    # Create leave_requests table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leave_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            em_code TEXT NOT NULL,
            leave_type TEXT NOT NULL,
            duration REAL NOT NULL,
            start_date TEXT NOT NULL,
            end_date TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create helpdesk_tickets table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS helpdesk_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            em_code TEXT NOT NULL,
            priority TEXT NOT NULL,
            subject TEXT NOT NULL,
            description TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create payroll table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS payroll (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            em_code TEXT NOT NULL,
            month TEXT NOT NULL,
            gross REAL NOT NULL,
            deductions REAL NOT NULL,
            net_pay REAL NOT NULL,
            status TEXT NOT NULL DEFAULT 'Paid',
            processed_date TEXT NOT NULL
        )
    ''')
    
    conn.commit()
    conn.close()
    
    # Import CSV data into SQLite DB
    import_employees_csv()

    # Seed initial sample data for trainings, leaves, tickets, payroll if empty
    seed_initial_data()

def seed_initial_data():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Get sample employee codes
    rows = cursor.execute("SELECT em_code, full_name FROM employees LIMIT 10").fetchall()
    emp_list = [dict(r) for r in rows]
    if not emp_list:
        conn.close()
        return

    emp1 = emp_list[0]['em_code']
    emp2 = emp_list[1]['em_code'] if len(emp_list) > 1 else emp1
    emp3 = emp_list[2]['em_code'] if len(emp_list) > 2 else emp1

    # Seed Trainings if empty
    cnt_trainings = cursor.execute("SELECT COUNT(*) FROM trainings").fetchone()[0]
    if cnt_trainings == 0:
        sample_trainings = [
            ('2025-10-01', 'Advanced Python & Data Architecture', 'Dr. Aris Thorne', 40.0, 32.0, 'Sarah Jenkins, John Doe, Rita K.', 'In Progress', 'Deep dive into async patterns & Postgres optimization'),
            ('2025-09-15', 'Corporate Cyber Security & Compliance', 'Marcus Vance', 20.0, 20.0, 'Alex M., Rita K., Michael Chen', 'Completed', 'Mandatory ISO27001 compliance and phishing prevention'),
            ('2025-10-10', 'Agile Leadership & Scrum Essentials', 'Elena Rostova', 15.0, 0.0, 'John Doe, Sarah Jenkins', 'Upcoming', 'Interactive workshop on Sprint planning & retrospective'),
            ('2025-08-20', 'UI/UX Design Systems & Micro-Interactions', 'Clara Oswald', 30.0, 30.0, 'Rita K., Alex M.', 'Completed', 'Figma components and dynamic CSS animations'),
            ('2025-10-05', 'Cloud Infrastructure & DevOps Best Practices', 'David Kim', 25.0, 10.0, 'Sarah Jenkins, Marcus Vance', 'In Progress', 'AWS Lambda, Docker containers, and CI/CD pipelines')
        ]
        for t in sample_trainings:
            cursor.execute('''
                INSERT INTO trainings (date, topic, faculty, program_duration, hours_completed, attendees, status, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', t)

    # Seed Leave Requests if < 4
    cnt_leaves = cursor.execute("SELECT COUNT(*) FROM leave_requests").fetchone()[0]
    if cnt_leaves < 4:
        sample_leaves = [
            (emp1, 'Sick Leave', 2.0, '2025-10-12', '2025-10-13', 'Pending'),
            (emp2, 'Casual Leave', 1.0, '2025-10-15', '2025-10-15', 'Approved'),
            (emp3, 'Earned Leave', 5.0, '2025-11-01', '2025-11-05', 'Approved'),
            (emp1, 'Maternity/Paternity Leave', 3.0, '2025-10-20', '2025-10-22', 'Rejected')
        ]
        for l in sample_leaves:
            cursor.execute('''
                INSERT INTO leave_requests (em_code, leave_type, duration, start_date, end_date, status)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', l)

    # Seed Helpdesk Tickets if < 4
    cnt_tickets = cursor.execute("SELECT COUNT(*) FROM helpdesk_tickets").fetchone()[0]
    if cnt_tickets < 4:
        sample_tickets = [
            (emp1, 'High', 'Tax Deduction Clarification (TDS)', 'Need detailed breakdown of TDS deduction for September paycheck.', 'Open'),
            (emp2, 'Low', 'Replacement Access ID Badge', 'My physical RFID access card was misplaced yesterday.', 'Open'),
            (emp3, 'Medium', 'Developer Workstation Upgrade', 'RAM upgrade required for running multi-container local dev server.', 'In Progress'),
            (emp1, 'Low', 'PF Account UAN Transfer', 'Transfer request from previous employer UAN number to current entity.', 'Resolved')
        ]
        for tk in sample_tickets:
            cursor.execute('''
                INSERT INTO helpdesk_tickets (em_code, priority, subject, description, status)
                VALUES (?, ?, ?, ?, ?)
            ''', tk)

    # Seed Payroll if empty
    cnt_payroll = cursor.execute("SELECT COUNT(*) FROM payroll").fetchone()[0]
    if cnt_payroll == 0:
        sample_payroll = [
            (emp1, 'September 2025', 84500.0, 12300.0, 72200.0, 'Paid', '2025-10-01'),
            (emp2, 'September 2025', 92000.0, 13500.0, 78500.0, 'Paid', '2025-10-01'),
            (emp3, 'September 2025', 68000.0, 9200.0, 58800.0, 'Paid', '2025-10-01'),
            (emp1, 'August 2025', 84500.0, 12300.0, 72200.0, 'Paid', '2025-09-01'),
            (emp2, 'August 2025', 92000.0, 13500.0, 78500.0, 'Paid', '2025-09-01'),
            (emp3, 'August 2025', 68000.0, 9200.0, 58800.0, 'Paid', '2025-09-01'),
            (emp1, 'July 2025', 82100.0, 11800.0, 70300.0, 'Paid', '2025-08-01')
        ]
        for p in sample_payroll:
            cursor.execute('''
                INSERT INTO payroll (em_code, month, gross, deductions, net_pay, status, processed_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', p)

    conn.commit()
    conn.close()


def import_employees_csv():
    if not os.path.exists(CSV_PATH):
        print(f"CSV file not found at {CSV_PATH}")
        return
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        with open(CSV_PATH, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            count = 0
            for row in reader:
                em_code = (row.get('em_code') or '').strip()
                if not em_code:
                    continue
                    
                first_name = (row.get('first_name') or '').strip()
                last_name = (row.get('last_name') or '').strip()
                full_name = f"{first_name} {last_name}".strip()
                
                clean_val = lambda v: '' if (not v or v.strip().upper() == 'NULL') else v.strip()
                
                cursor.execute('''
                    INSERT OR REPLACE INTO employees (
                        em_code, first_name, last_name, full_name, em_email,
                        em_pan_no, em_pf_no, em_uan, em_esi_no, em_role,
                        status, em_gender, em_phone, em_birthday, em_blood_group,
                        em_joining_date, des_name, dep_name
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    em_code,
                    first_name,
                    last_name,
                    full_name,
                    clean_val(row.get('em_email')),
                    clean_val(row.get('em_pan_no')),
                    clean_val(row.get('em_pf_no')),
                    clean_val(row.get('em_uan')),
                    clean_val(row.get('em_esi_no')),
                    clean_val(row.get('em_role')),
                    clean_val(row.get('status')),
                    clean_val(row.get('em_gender')),
                    clean_val(row.get('em_phone')),
                    clean_val(row.get('em_birthday')),
                    clean_val(row.get('em_blood_group')),
                    clean_val(row.get('em_joining_date')),
                    clean_val(row.get('des_name')),
                    clean_val(row.get('dep_name'))
                ))
                count += 1
            conn.commit()
            print(f"Successfully uploaded {count} employee records from CSV into DB!")
    except Exception as e:
        print(f"Error reading CSV: {e}")
    finally:
        conn.close()

# ---------- Auth Routes ----------
@app.route('/login', methods=['GET', 'POST'])
def login_page():
    if 'user_email' in session:
        return redirect(url_for('index'))

    error = None
    username_val = ''

    if request.method == 'POST':
        email    = (request.form.get('username') or '').strip().lower()
        password = (request.form.get('password') or '').strip()
        username_val = email

        # --- Admin login ---
        if email == ADMIN_EMAIL.lower() and password == ADMIN_PASSWORD:
            session['user_email'] = ADMIN_EMAIL
            session['user_role']  = 'admin'
            session['user_name']  = 'HR Admin'
            session['em_code']    = ADMIN_EM_CODE
            return redirect(url_for('index'))

        # --- Employee login: email + em_code as password ---
        conn = get_db_connection()
        emp = conn.execute(
            'SELECT * FROM employees WHERE LOWER(em_email) = ?', (email,)
        ).fetchone()
        conn.close()

        if emp and password == emp['em_code']:
            session['user_email'] = emp['em_email']
            session['user_role']  = 'user'
            session['user_name']  = emp['full_name']
            session['em_code']    = emp['em_code']
            return redirect(url_for('index'))

        error = 'Invalid email or password. Please try again.'

    return render_template('login.html', error=error, username=username_val)


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login_page'))


@app.route('/')
@login_required
def index():
    return render_template(
        'index.html',
        user_name=session.get('user_name', 'User'),
        user_role=session.get('user_role', 'user'),
        em_code=session.get('em_code', '')
    )

@app.route('/api/employees', methods=['GET'])
def get_employees():
    conn = get_db_connection()
    search = request.args.get('search', '').strip()
    dep = request.args.get('department', 'All').strip()
    status_filter = request.args.get('status', 'All').strip()
    
    query = 'SELECT * FROM employees WHERE 1=1'
    params = []
    
    if search:
        query += ' AND (full_name LIKE ? OR em_code LIKE ? OR em_email LIKE ? OR des_name LIKE ?)'
        pattern = f'%{search}%'
        params.extend([pattern, pattern, pattern, pattern])
        
    if dep != 'All':
        query += ' AND dep_name = ?'
        params.append(dep)
        
    if status_filter != 'All':
        query += ' AND status = ?'
        params.append(status_filter)
        
    query += ' ORDER BY full_name ASC'
    
    cursor = conn.cursor()
    rows = cursor.execute(query, params).fetchall()
    employees = [dict(row) for row in rows]
    conn.close()
    return jsonify(employees)

@app.route('/api/employees/<em_code>/status', methods=['PUT'])
def toggle_employee_status(em_code):
    data = request.json or {}
    conn = get_db_connection()
    cursor = conn.cursor()
    
    emp = cursor.execute('SELECT * FROM employees WHERE em_code = ?', (em_code,)).fetchone()
    if not emp:
        conn.close()
        return jsonify({'error': 'Employee not found'}), 404
        
    new_status = data.get('status')
    if not new_status:
        new_status = 'INACTIVE' if emp['status'] == 'ACTIVE' else 'ACTIVE'
        
    cursor.execute('UPDATE employees SET status = ? WHERE em_code = ?', (new_status, em_code))
    conn.commit()
    conn.close()
    return jsonify({'message': f'Employee status updated to {new_status}', 'status': new_status})

@app.route('/api/employees/<em_code>/trainings', methods=['GET'])
def get_employee_trainings(em_code):
    conn = get_db_connection()
    cursor = conn.cursor()
    emp = cursor.execute('SELECT * FROM employees WHERE em_code = ?', (em_code,)).fetchone()
    if not emp:
        conn.close()
        return jsonify([])
        
    full_name = emp['full_name']
    first_name = emp['first_name']
    clean_first = first_name.replace('.', '').strip()
    
    query = '''
        SELECT * FROM trainings 
        WHERE (attendees LIKE ? OR attendees LIKE ? OR attendees LIKE ? OR attendees LIKE ? OR faculty LIKE ? OR faculty LIKE ?)
        ORDER BY date DESC, id DESC
    '''
    params = [
        f'%{full_name}%',
        f'%{first_name}%',
        f'%{clean_first}%',
        f'%{em_code}%',
        f'%{full_name}%',
        f'%{first_name}%'
    ]
    
    rows = cursor.execute(query, params).fetchall()
    trainings = [dict(row) for row in rows]
    conn.close()
    return jsonify(trainings)

@app.route('/api/employees/departments', methods=['GET'])
def get_departments():
    conn = get_db_connection()
    cursor = conn.cursor()
    rows = cursor.execute("SELECT DISTINCT dep_name FROM employees WHERE dep_name != '' ORDER BY dep_name ASC").fetchall()
    deps = [row['dep_name'] for row in rows]
    conn.close()
    return jsonify(deps)

@app.route('/api/trainings', methods=['GET'])
def get_trainings():
    conn = get_db_connection()
    search = request.args.get('search', '')
    status_filter = request.args.get('status', 'All')
    
    query = 'SELECT * FROM trainings WHERE 1=1'
    params = []
    
    if search:
        query += ' AND (topic LIKE ? OR faculty LIKE ? OR attendees LIKE ?)'
        pattern = f'%{search}%'
        params.extend([pattern, pattern, pattern])
        
    if status_filter != 'All':
        query += ' AND status = ?'
        params.append(status_filter)
        
    query += ' ORDER BY date DESC, id DESC'
    
    cursor = conn.cursor()
    rows = cursor.execute(query, params).fetchall()
    trainings = [dict(row) for row in rows]
    conn.close()
    return jsonify(trainings)

@app.route('/api/trainings', methods=['POST'])
def add_training():
    data = request.json or {}
    
    date_val = data.get('date') or datetime.date.today().strftime('%Y-%m-%d')
    topic = data.get('topic', '').strip()
    faculty = data.get('faculty', '').strip()
    try:
        program_duration = float(data.get('program_duration', 0))
    except (ValueError, TypeError):
        program_duration = 0.0
        
    try:
        hours_completed = float(data.get('hours_completed', 0))
    except (ValueError, TypeError):
        hours_completed = 0.0
        
    attendees = data.get('attendees', '').strip()
    notes = data.get('notes', '').strip()
    
    if not topic or not faculty or program_duration <= 0:
        return jsonify({'error': 'Please provide valid Topic, Faculty, and Program Duration (>0)'}), 400
        
    if hours_completed >= program_duration:
        status = "Completed"
    elif hours_completed > 0:
        status = "In Progress"
    else:
        status = "Upcoming"
        
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        INSERT INTO trainings (date, topic, faculty, program_duration, hours_completed, attendees, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (date_val, topic, faculty, program_duration, hours_completed, attendees, status, notes))
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    
    return jsonify({'message': 'Training added successfully', 'id': new_id}), 201

@app.route('/api/trainings/<int:training_id>', methods=['PUT'])
def update_training(training_id):
    data = request.json or {}
    conn = get_db_connection()
    cursor = conn.cursor()
    
    existing = cursor.execute('SELECT * FROM trainings WHERE id = ?', (training_id,)).fetchone()
    if not existing:
        conn.close()
        return jsonify({'error': 'Training record not found'}), 404
        
    date_val = data.get('date', existing['date'])
    topic = data.get('topic', existing['topic'])
    faculty = data.get('faculty', existing['faculty'])
    program_duration = float(data.get('program_duration', existing['program_duration']))
    hours_completed = float(data.get('hours_completed', existing['hours_completed']))
    attendees = data.get('attendees', existing['attendees'])
    notes = data.get('notes', existing['notes'])
    
    if hours_completed >= program_duration:
        status = "Completed"
    elif hours_completed > 0:
        status = "In Progress"
    else:
        status = "Upcoming"
        
    cursor.execute('''
        UPDATE trainings
        SET date=?, topic=?, faculty=?, program_duration=?, hours_completed=?, attendees=?, status=?, notes=?
        WHERE id=?
    ''', (date_val, topic, faculty, program_duration, hours_completed, attendees, status, notes, training_id))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Training updated successfully'})

@app.route('/api/trainings/<int:training_id>', methods=['DELETE'])
def delete_training(training_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('DELETE FROM trainings WHERE id = ?', (training_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Training deleted successfully'})

# --- Leaves API ---
@app.route('/api/leaves', methods=['GET'])
def get_leaves():
    conn = get_db_connection()
    cursor = conn.cursor()
    query = '''
        SELECT l.*, e.full_name, e.first_name, e.last_name 
        FROM leave_requests l 
        LEFT JOIN employees e ON l.em_code = e.em_code 
        ORDER BY l.id DESC
    '''
    rows = cursor.execute(query).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/leaves', methods=['POST'])
def add_leave():
    data = request.json or {}
    em_code = session.get('em_code', 'RMS250024')
    leave_type = data.get('leave_type', 'Casual Leave')
    duration = float(data.get('duration', 1))
    start_date = data.get('start_date', datetime.date.today().strftime('%Y-%m-%d'))
    end_date = data.get('end_date', start_date)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO leave_requests (em_code, leave_type, duration, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
        (em_code, leave_type, duration, start_date, end_date)
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Leave request submitted successfully'}), 201

@app.route('/api/leaves/<int:leave_id>/status', methods=['PUT'])
def update_leave_status(leave_id):
    data = request.json or {}
    new_status = data.get('status', 'Approved')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE leave_requests SET status = ? WHERE id = ?', (new_status, leave_id))
    conn.commit()
    conn.close()
    return jsonify({'message': f'Leave status updated to {new_status}'})

# --- Tickets API ---
@app.route('/api/tickets', methods=['GET'])
def get_tickets():
    conn = get_db_connection()
    cursor = conn.cursor()
    query = '''
        SELECT t.*, e.full_name, e.first_name, e.last_name 
        FROM helpdesk_tickets t 
        LEFT JOIN employees e ON t.em_code = e.em_code 
        ORDER BY t.id DESC
    '''
    rows = cursor.execute(query).fetchall()
    conn.close()
    return jsonify([dict(row) for row in rows])

@app.route('/api/tickets', methods=['POST'])
def add_ticket():
    data = request.json or {}
    em_code = session.get('em_code', 'RMS250024')
    priority = data.get('priority', 'Low')
    subject = data.get('subject', '')
    description = data.get('description', '')
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        'INSERT INTO helpdesk_tickets (em_code, priority, subject, description) VALUES (?, ?, ?, ?)',
        (em_code, priority, subject, description)
    )
    conn.commit()
    conn.close()
    return jsonify({'message': 'Ticket submitted successfully'}), 201

@app.route('/api/tickets/<int:ticket_id>/status', methods=['PUT'])
def update_ticket_status(ticket_id):
    data = request.json or {}
    new_status = data.get('status', 'Resolved')
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('UPDATE helpdesk_tickets SET status = ? WHERE id = ?', (new_status, ticket_id))
    conn.commit()
    conn.close()
    return jsonify({'message': f'Ticket status updated to {new_status}'})

@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    total = cursor.execute('SELECT COUNT(*) FROM trainings').fetchone()[0]
    in_progress = cursor.execute("SELECT COUNT(*) FROM trainings WHERE status = 'In Progress'").fetchone()[0]
    completed = cursor.execute("SELECT COUNT(*) FROM trainings WHERE status = 'Completed'").fetchone()[0]
    upcoming = cursor.execute("SELECT COUNT(*) FROM trainings WHERE status = 'Upcoming'").fetchone()[0]
    
    total_hours = cursor.execute('SELECT SUM(hours_completed) FROM trainings').fetchone()[0] or 0.0
    total_target_hours = cursor.execute('SELECT SUM(program_duration) FROM trainings').fetchone()[0] or 0.0
    
    completion_rate = round((total_hours / total_target_hours * 100), 1) if total_target_hours > 0 else 0
    total_emp = cursor.execute('SELECT COUNT(*) FROM employees').fetchone()[0]
    
    conn.close()
    return jsonify({
        'total': total,
        'in_progress': in_progress,
        'completed': completed,
        'upcoming': upcoming,
        'total_hours_completed': total_hours,
        'total_target_hours': total_target_hours,
        'completion_rate': completion_rate,
        'total_employees': total_emp
    })

# --- Dashboard Overview Stats API ---
@app.route('/api/dashboard_stats', methods=['GET'])
def get_dashboard_overview():
    conn = get_db_connection()
    cursor = conn.cursor()

    total_headcount = cursor.execute("SELECT COUNT(*) FROM employees").fetchone()[0]
    active_employees = cursor.execute("SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE'").fetchone()[0]
    on_leave_today = cursor.execute("SELECT COUNT(*) FROM leave_requests WHERE status = 'Approved'").fetchone()[0]
    open_tickets = cursor.execute("SELECT COUNT(*) FROM helpdesk_tickets WHERE status IN ('Open', 'In Progress')").fetchone()[0]
    high_priority_tickets = cursor.execute("SELECT COUNT(*) FROM helpdesk_tickets WHERE priority = 'High' AND status != 'Resolved'").fetchone()[0]
    pending_approvals = cursor.execute("SELECT COUNT(*) FROM leave_requests WHERE status = 'Pending'").fetchone()[0]

    # Department breakdown for workforce chart
    dept_rows = cursor.execute('''
        SELECT dep_name, COUNT(*) as count 
        FROM employees 
        WHERE dep_name != '' 
        GROUP BY dep_name 
        ORDER BY count DESC 
        LIMIT 6
    ''').fetchall()
    dept_stats = [dict(r) for r in dept_rows]

    # Recent activity stream
    recent_leaves = cursor.execute('''
        SELECT l.id, 'leave' as type, l.leave_type as title, l.status, l.created_at, e.full_name 
        FROM leave_requests l 
        LEFT JOIN employees e ON l.em_code = e.em_code 
        ORDER BY l.id DESC LIMIT 3
    ''').fetchall()

    recent_tickets = cursor.execute('''
        SELECT t.id, 'ticket' as type, t.subject as title, t.status, t.created_at, e.full_name 
        FROM helpdesk_tickets t 
        LEFT JOIN employees e ON t.em_code = e.em_code 
        ORDER BY t.id DESC LIMIT 3
    ''').fetchall()

    recent_trainings = cursor.execute('''
        SELECT id, 'training' as type, topic as title, status, created_at, faculty as full_name 
        FROM trainings 
        ORDER BY id DESC LIMIT 3
    ''').fetchall()

    activities = []
    for r in recent_leaves:
        activities.append({
            'icon': 'fa-plane', 'color': '#d97706', 'bg': '#fef3c7',
            'title': f"Leave Request ({dict(r)['title']})",
            'sub': f"{dict(r)['full_name'] or 'Employee'} - Status: {dict(r)['status']}"
        })
    for r in recent_tickets:
        activities.append({
            'icon': 'fa-headset', 'color': '#0284c7', 'bg': '#e0f2fe',
            'title': f"Ticket: {dict(r)['title']}",
            'sub': f"Raised by {dict(r)['full_name'] or 'User'} - {dict(r)['status']}"
        })
    for r in recent_trainings:
        activities.append({
            'icon': 'fa-graduation-cap', 'color': '#16a34a', 'bg': '#dcfce7',
            'title': f"Training: {dict(r)['title']}",
            'sub': f"Faculty: {dict(r)['full_name']} - {dict(r)['status']}"
        })

    conn.close()

    return jsonify({
        'total_headcount': total_headcount,
        'active_employees': active_employees,
        'on_leave_today': on_leave_today,
        'open_tickets': open_tickets,
        'high_priority_tickets': high_priority_tickets,
        'pending_approvals': pending_approvals,
        'departments': dept_stats,
        'recent_activities': activities[:6]
    })

# --- Payroll API ---
@app.route('/api/payroll', methods=['GET'])
def get_payroll():
    conn = get_db_connection()
    cursor = conn.cursor()
    query = '''
        SELECT p.*, e.full_name, e.des_name, e.dep_name 
        FROM payroll p 
        LEFT JOIN employees e ON p.em_code = e.em_code 
        ORDER BY p.id DESC
    '''
    rows = cursor.execute(query).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/payroll/run', methods=['POST'])
def run_payroll():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    month_name = datetime.date.today().strftime('%B %Y')
    emp_rows = cursor.execute("SELECT em_code FROM employees WHERE status = 'ACTIVE'").fetchall()
    
    processed_count = 0
    for emp in emp_rows:
        em_code = emp['em_code']
        existing = cursor.execute("SELECT id FROM payroll WHERE em_code = ? AND month = ?", (em_code, month_name)).fetchone()
        if not existing:
            gross = 75000.0
            deductions = 10500.0
            net = gross - deductions
            today_str = datetime.date.today().strftime('%Y-%m-%d')
            cursor.execute('''
                INSERT INTO payroll (em_code, month, gross, deductions, net_pay, status, processed_date)
                VALUES (?, ?, ?, ?, ?, 'Paid', ?)
            ''', (em_code, month_name, gross, deductions, net, today_str))
            processed_count += 1
            
    conn.commit()
    conn.close()
    return jsonify({'message': f'Payroll successfully processed for {processed_count} active employees for {month_name}'})

# --- Analytics API ---
@app.route('/api/analytics', methods=['GET'])
def get_analytics():
    conn = get_db_connection()
    cursor = conn.cursor()

    total_emp = cursor.execute("SELECT COUNT(*) FROM employees").fetchone()[0] or 1

    # Department breakdown
    dept_rows = cursor.execute('''
        SELECT dep_name, COUNT(*) as count 
        FROM employees 
        WHERE dep_name != '' 
        GROUP BY dep_name 
        ORDER BY count DESC
    ''').fetchall()

    departments = []
    colors = ['#0284c7', '#00a884', '#a855f7', '#ea580c', '#ec4899', '#6366f1', '#14b8a6']
    for idx, r in enumerate(dept_rows):
        cnt = r['count']
        pct = round((cnt / total_emp) * 100, 1)
        departments.append({
            'name': r['dep_name'],
            'count': cnt,
            'percentage': pct,
            'color': colors[idx % len(colors)]
        })

    # Gender breakdown
    gender_rows = cursor.execute('''
        SELECT em_gender, COUNT(*) as count 
        FROM employees 
        WHERE em_gender != '' 
        GROUP BY em_gender 
        ORDER BY count DESC
    ''').fetchall()

    gender_data = {}
    for r in gender_rows:
        g = r['em_gender'].strip()
        gender_data[g] = r['count']

    male_cnt = gender_data.get('Male', gender_data.get('MALE', 0))
    female_cnt = gender_data.get('Female', gender_data.get('FEMALE', 0))
    other_cnt = total_emp - (male_cnt + female_cnt)
    if other_cnt < 0: other_cnt = 0

    male_pct = round((male_cnt / total_emp) * 100, 1)
    female_pct = round((female_cnt / total_emp) * 100, 1)
    other_pct = round(100.0 - male_pct - female_pct, 1) if total_emp > 0 else 0

    # Status breakdown
    active_cnt = cursor.execute("SELECT COUNT(*) FROM employees WHERE status = 'ACTIVE'").fetchone()[0]
    inactive_cnt = total_emp - active_cnt

    conn.close()

    return jsonify({
        'total_employees': total_emp,
        'departments': departments,
        'gender': {
            'male_count': male_cnt,
            'female_count': female_cnt,
            'other_count': other_cnt,
            'male_pct': male_pct,
            'female_pct': female_pct,
            'other_pct': other_pct
        },
        'status': {
            'active_count': active_cnt,
            'inactive_count': inactive_cnt,
            'active_pct': round((active_cnt / total_emp) * 100, 1)
        }
    })

# --- User Profile API ---
@app.route('/api/user/profile', methods=['GET', 'PUT'])
def user_profile():
    if request.method == 'GET':
        em_code = session.get('em_code', ADMIN_EM_CODE)
        conn = get_db_connection()
        cursor = conn.cursor()
        emp = cursor.execute("SELECT * FROM employees WHERE em_code = ?", (em_code,)).fetchone()
        conn.close()

        if emp:
            return jsonify(dict(emp))
        else:
            return jsonify({
                'em_code': session.get('em_code', ADMIN_EM_CODE),
                'full_name': session.get('user_name', 'HR Admin'),
                'first_name': 'HR',
                'last_name': 'Admin',
                'em_email': session.get('user_email', ADMIN_EMAIL),
                'em_role': session.get('user_role', 'admin'),
                'bio': 'System Administrator for HR App.'
            })

    elif request.method == 'PUT':
        data = request.json or {}
        first_name = data.get('first_name', '').strip()
        last_name = data.get('last_name', '').strip()
        full_name = f"{first_name} {last_name}".strip()
        em_code = session.get('em_code', ADMIN_EM_CODE)

        if full_name:
            session['user_name'] = full_name
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE employees 
                SET first_name = ?, last_name = ?, full_name = ? 
                WHERE em_code = ?
            ''', (first_name, last_name, full_name, em_code))
            conn.commit()
            conn.close()

        return jsonify({'message': 'Profile updated successfully', 'user_name': session['user_name']})


if __name__ == '__main__':
    init_db()
    print("HR App starting on http://127.0.0.1:5000 ...")
    app.run(host='0.0.0.0', port=5000, debug=True)
