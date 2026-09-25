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
    
    conn.commit()
    conn.close()
    
    # Import CSV data into SQLite DB
    import_employees_csv()

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

@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    total = cursor.execute('SELECT COUNT(*) FROM trainings').fetchone()[0]
    in_progress = cursor.execute('SELECT COUNT(*) FROM trainings WHERE status = "In Progress"').fetchone()[0]
    completed = cursor.execute('SELECT COUNT(*) FROM trainings WHERE status = "Completed"').fetchone()[0]
    upcoming = cursor.execute('SELECT COUNT(*) FROM trainings WHERE status = "Upcoming"').fetchone()[0]
    
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

if __name__ == '__main__':
    init_db()
    print("HR App starting on http://127.0.0.1:5000 ...")
    app.run(host='0.0.0.0', port=5000, debug=True)
