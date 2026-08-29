-- ERP HR Module Migration
-- Migration: 20260830010000_erp_00032_hr_module.sql
-- Employees, designations, employment, attendance, leave, holidays, documents, skills, training.
-- Idempotent.

CREATE TABLE IF NOT EXISTS hr_designations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    designation_code VARCHAR(50) NOT NULL,
    designation_name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, designation_code)
);

CREATE TABLE IF NOT EXISTS hr_employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    employee_code VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(30),
    date_of_birth DATE,
    gender VARCHAR(20),
    address TEXT,
    department_id UUID,
    designation_id UUID REFERENCES hr_designations(id),
    manager_id UUID REFERENCES hr_employees(id),
    employment_type VARCHAR(30) DEFAULT 'FULL_TIME',
    join_date DATE,
    termination_date DATE,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    job_title VARCHAR(255),
    monthly_salary DECIMAL(19,4),
    currency VARCHAR(3) DEFAULT 'USD',
    UNIQUE(company_id, employee_code)
);
CREATE INDEX IF NOT EXISTS idx_hr_emp_company ON hr_employees(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_emp_dept ON hr_employees(department_id);
CREATE INDEX IF NOT EXISTS idx_hr_emp_desig ON hr_employees(designation_id);

CREATE TABLE IF NOT EXISTS hr_employee_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    document_name VARCHAR(255),
    document_type VARCHAR(50),
    file_url TEXT,
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_hr_doc_emp ON hr_employee_documents(employee_id);

CREATE TABLE IF NOT EXISTS hr_employee_skills (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    skill_name VARCHAR(255) NOT NULL,
    skill_level VARCHAR(20) DEFAULT 'BEGINNER',
    years_experience DECIMAL(5,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_hr_skill_emp ON hr_employee_skills(employee_id);

CREATE TABLE IF NOT EXISTS hr_employee_training (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    training_name VARCHAR(255) NOT NULL,
    provider VARCHAR(255),
    training_date DATE,
    expiry_date DATE,
    certificate_url TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_hr_train_emp ON hr_employee_training(employee_id);

CREATE TABLE IF NOT EXISTS hr_employee_histories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL,
    from_value VARCHAR(255),
    to_value VARCHAR(255),
    change_date DATE,
    remarks TEXT
);
CREATE INDEX IF NOT EXISTS idx_hr_hist_emp ON hr_employee_histories(employee_id);

CREATE TABLE IF NOT EXISTS hr_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    shift_code VARCHAR(50) NOT NULL,
    shift_name VARCHAR(255) NOT NULL,
    start_time TIME,
    end_time TIME,
    working_hours DECIMAL(5,2) DEFAULT 8,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, shift_code)
);

CREATE TABLE IF NOT EXISTS hr_attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    attendance_date DATE NOT NULL,
    shift_id UUID REFERENCES hr_shifts(id),
    check_in TIMESTAMP WITH TIME ZONE,
    check_out TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'PRESENT' CHECK (status IN ('PRESENT','ABSENT','LEAVE','HALF_DAY','HOLIDAY','WEEKEND')),
    overtime_minutes INTEGER DEFAULT 0,
    remarks TEXT,
    UNIQUE(employee_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_hr_att_emp ON hr_attendance(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_att_date ON hr_attendance(attendance_date);

CREATE TABLE IF NOT EXISTS hr_leave_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    leave_code VARCHAR(50) NOT NULL,
    leave_name VARCHAR(255) NOT NULL,
    days_per_year INTEGER DEFAULT 0,
    is_paid BOOLEAN DEFAULT true,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    UNIQUE(company_id, leave_code)
);

CREATE TABLE IF NOT EXISTS hr_leave_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    employee_id UUID NOT NULL REFERENCES hr_employees(id) ON DELETE CASCADE,
    leave_type_id UUID NOT NULL REFERENCES hr_leave_types(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    days DECIMAL(5,2),
    reason TEXT,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
    approved_by UUID,
    approved_at TIMESTAMP WITH TIME ZONE,
    remarks TEXT
);
CREATE INDEX IF NOT EXISTS idx_hr_leave_emp ON hr_leave_requests(employee_id);

CREATE TABLE IF NOT EXISTS hr_holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID, updated_by UUID, is_active BOOLEAN DEFAULT true,
    company_id UUID NOT NULL,
    holiday_name VARCHAR(255) NOT NULL,
    holiday_date DATE NOT NULL,
    is_recurring BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE'
);
CREATE INDEX IF NOT EXISTS idx_hr_hol_company ON hr_holidays(company_id);

-- RLS (tables with company_id column)
DO $$ DECLARE
  t TEXT;
  tables TEXT[] := ARRAY['hr_designations','hr_employees','hr_shifts','hr_attendance','hr_leave_types','hr_leave_requests','hr_holidays'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_select ON %I FOR SELECT USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_insert ON %I FOR INSERT WITH CHECK (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_update ON %I FOR UPDATE USING (erp_core.company_in_scope(company_id))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_delete ON %I FOR DELETE USING (erp_core.company_in_scope(company_id))', t, t);
  END LOOP;
END $$;

-- Employee child tables (scope via parent employee)
CREATE OR REPLACE FUNCTION erp_core.hr_child_company_id(p_employee_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER
AS $$ SELECT company_id FROM hr_employees WHERE id = p_employee_id; $$;

DO $$ DECLARE
  t TEXT;
  child_tables TEXT[] := ARRAY['hr_employee_documents','hr_employee_skills','hr_employee_training','hr_employee_histories'];
BEGIN
  FOREACH t IN ARRAY child_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_parent_select ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_parent_select ON %I FOR SELECT USING (erp_core.company_in_scope(erp_core.hr_child_company_id(employee_id)))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_parent_insert ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_parent_insert ON %I FOR INSERT WITH CHECK (erp_core.company_in_scope(erp_core.hr_child_company_id(employee_id)))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_parent_update ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_parent_update ON %I FOR UPDATE USING (erp_core.company_in_scope(erp_core.hr_child_company_id(employee_id)))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_parent_delete ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_parent_delete ON %I FOR DELETE USING (erp_core.company_in_scope(erp_core.hr_child_company_id(employee_id)))', t, t);
  END LOOP;
END $$;

-- Permissions
INSERT INTO permissions (permission_code, name, module, resource, action, description, status)
SELECT * FROM (VALUES
  ('hr.employee.view','View Employees','hr','employee','VIEW','View employees','ACTIVE'),
  ('hr.employee.create','Create Employee','hr','employee','CREATE','Create employees','ACTIVE'),
  ('hr.employee.update','Update Employee','hr','employee','UPDATE','Update employees','ACTIVE'),
  ('hr.employee.delete','Delete Employee','hr','employee','DELETE','Delete employees','ACTIVE'),
  ('hr.attendance.view','View Attendance','hr','attendance','VIEW','View attendance','ACTIVE'),
  ('hr.attendance.manage','Manage Attendance','hr','attendance','MANAGE','Record attendance','ACTIVE'),
  ('hr.leave.view','View Leave','hr','leave','VIEW','View leave requests','ACTIVE'),
  ('hr.leave.manage','Manage Leave','hr','leave','MANAGE','Approve/reject leave','ACTIVE'),
  ('hr.designation.view','View Designations','hr','designation','VIEW','View designations','ACTIVE'),
  ('hr.designation.manage','Manage Designations','hr','designation','MANAGE','Create designations','ACTIVE'),
  ('hr.report.view','HR Reports','hr','report','VIEW','View HR reports','ACTIVE')
) AS v(permission_code, name, module, resource, action, description, status)
WHERE NOT EXISTS (SELECT 1 FROM permissions p WHERE p.permission_code = v.permission_code);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.role_code = 'SUPER_ADMIN' AND p.module = 'hr'
  AND NOT EXISTS (SELECT 1 FROM role_permissions rp WHERE rp.role_id = r.id AND rp.permission_id = p.id);

-- Demo data
DO $$
DECLARE v_company_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies WHERE company_code = 'COMP-001';
  IF v_company_id IS NULL THEN RETURN; END IF;

  INSERT INTO hr_designations (company_id, designation_code, designation_name) VALUES
    (v_company_id,'D-001','General Manager'),(v_company_id,'D-002','Production Manager'),
    (v_company_id,'D-003','Maintenance Supervisor'),(v_company_id,'D-004','Quality Engineer'),
    (v_company_id,'D-005','Store Keeper'),(v_company_id,'D-006','Machine Operator')
  ON CONFLICT (company_id, designation_code) DO NOTHING;

  INSERT INTO hr_employees (company_id, employee_code, first_name, last_name, email, designation_id, employment_type, join_date, status)
  SELECT v_company_id, e.code, e.first, e.last, e.email, d.id, 'FULL_TIME', '2024-01-15', 'ACTIVE'
  FROM (VALUES
    ('EMP-001','Ahmed','Raza','ahmed.raza@erp.test','D-002'),
    ('EMP-002','Fatima','Khan','fatima.khan@erp.test','D-003'),
    ('EMP-003','Bilal','Ahmed','bilal.ahmed@erp.test','D-004'),
    ('EMP-004','Sana','Tariq','sana.tariq@erp.test','D-005'),
    ('EMP-005','Usman','Ali','usman.ali@erp.test','D-006')
  ) AS e(code, first, last, email, desig)
  JOIN hr_designations d ON d.designation_code = e.desig AND d.company_id = v_company_id
  WHERE NOT EXISTS (SELECT 1 FROM hr_employees h WHERE h.employee_code = e.code AND h.company_id = v_company_id);

  INSERT INTO hr_shifts (company_id, shift_code, shift_name, start_time, end_time, working_hours) VALUES
    (v_company_id,'S-1','Morning','08:00','16:00',8),
    (v_company_id,'S-2','Evening','16:00','00:00',8),
    (v_company_id,'S-3','Night','00:00','08:00',8)
  ON CONFLICT (company_id, shift_code) DO NOTHING;

  INSERT INTO hr_leave_types (company_id, leave_code, leave_name, days_per_year, is_paid) VALUES
    (v_company_id,'L-1','Casual Leave',10,true),
    (v_company_id,'L-2','Sick Leave',8,true),
    (v_company_id,'L-3','Annual Leave',20,true),
    (v_company_id,'L-4','Unpaid Leave',0,false)
  ON CONFLICT (company_id, leave_code) DO NOTHING;

  INSERT INTO hr_holidays (company_id, holiday_name, holiday_date, is_recurring) VALUES
    (v_company_id,'Eid ul Fitr','2026-03-20',true),
    (v_company_id,'Eid ul Adha','2026-05-27',true),
    (v_company_id,'Independence Day','2026-08-14',true)
  ON CONFLICT DO NOTHING;
END $$;