-- ERP-00022: Safe, repeatable Maintenance demo data.
-- Uses existing master records only; skips dependent demo data when a required
-- company, machine, ERP user, item, UOM, or warehouse is not available.
DO $$
DECLARE
  v_company uuid;
  v_machine uuid;
  v_department uuid;
  v_user uuid;
  v_uom uuid;
  v_item uuid;
  v_warehouse uuid;
  v_team uuid;
  v_cat_mech uuid;
  v_cat_elec uuid;
  v_root uuid;
  v_failure uuid;
  v_job uuid;
  v_job_no text;
  v_name text;
  v_code text;
  v_sort integer;
  v_i integer;
  v_status text;
BEGIN
  SELECT id INTO v_company FROM companies ORDER BY created_at NULLS LAST LIMIT 1;
  SELECT id, company_id, department_id INTO v_machine, v_company, v_department
    FROM machines WHERE is_active = true ORDER BY created_at NULLS LAST LIMIT 1;
  SELECT id INTO v_user FROM erp_users WHERE status = 'ACTIVE' ORDER BY created_at NULLS LAST LIMIT 1;

  -- Lookup data is company-scoped and clearly marked as demo data.
  IF v_company IS NOT NULL THEN
    v_sort := 1;
    FOREACH v_name IN ARRAY ARRAY['Electrical Failure','Mechanical Failure','Hydraulic Failure','Pneumatic Failure','Instrumentation Failure','Abnormal Noise','Excessive Vibration','Temperature High','Lubrication Required','Safety Issue'] LOOP
      v_code := 'DEMO-COMP-' || lpad(v_sort::text, 2, '0');
      INSERT INTO maintenance_complaint_categories(company_id, code, name, description, sort_order)
      SELECT v_company, v_code, v_name, 'DEMO maintenance complaint category', v_sort
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_complaint_categories x WHERE x.code = v_code);
      v_sort := v_sort + 1;
    END LOOP;
    v_sort := 1;
    FOREACH v_name IN ARRAY ARRAY['Bearing Wear','Lubrication Failure','Electrical Connection Loose','Motor Overload','Misalignment','Component Fatigue','Improper Adjustment','Operator Error','Preventive Maintenance Missed','Normal Wear and Tear'] LOOP
      v_code := 'DEMO-ROOT-' || lpad(v_sort::text, 2, '0');
      INSERT INTO maintenance_root_cause_categories(company_id, code, name, description, sort_order)
      SELECT v_company, v_code, v_name, 'DEMO maintenance root cause category', v_sort
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_root_cause_categories x WHERE x.code = v_code);
      v_sort := v_sort + 1;
    END LOOP;
    v_sort := 1;
    FOREACH v_name IN ARRAY ARRAY['Bearing Failure','Motor Failure','Gearbox Failure','Belt Failure','Sensor Failure','Electrical Panel Failure','Pump Failure','Valve Failure','Pneumatic Failure','Control System Failure'] LOOP
      v_code := 'DEMO-FAIL-' || lpad(v_sort::text, 2, '0');
      INSERT INTO maintenance_failure_categories(company_id, code, name, description, sort_order)
      SELECT v_company, v_code, v_name, 'DEMO maintenance failure category', v_sort
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_failure_categories x WHERE x.code = v_code);
      v_sort := v_sort + 1;
    END LOOP;
    SELECT id INTO v_cat_mech FROM maintenance_complaint_categories WHERE company_id = v_company AND code = 'DEMO-COMP-02' LIMIT 1;
    SELECT id INTO v_cat_elec FROM maintenance_complaint_categories WHERE company_id = v_company AND code = 'DEMO-COMP-01' LIMIT 1;
    SELECT id INTO v_root FROM maintenance_root_cause_categories WHERE company_id = v_company AND code = 'DEMO-ROOT-01' LIMIT 1;
    SELECT id INTO v_failure FROM maintenance_failure_categories WHERE company_id = v_company AND code = 'DEMO-FAIL-01' LIMIT 1;
  END IF;

  IF v_company IS NOT NULL AND v_department IS NOT NULL THEN
    FOREACH v_code IN ARRAY ARRAY['MECH-TEAM','ELEC-TEAM','INST-TEAM','UTILITY-TEAM'] LOOP
      INSERT INTO maintenance_teams(company_id, code, name, description, department_id)
      SELECT v_company, v_code, 'DEMO ' || replace(initcap(lower(replace(v_code, '-TEAM', ''))), '-', ' ') || ' Maintenance Team', 'DEMO maintenance team', v_department
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_teams x WHERE x.code = v_code);
    END LOOP;
    SELECT id INTO v_team FROM maintenance_teams WHERE company_id = v_company AND code = 'MECH-TEAM' LIMIT 1;
    IF v_team IS NOT NULL AND v_user IS NOT NULL THEN
      INSERT INTO maintenance_team_members(team_id, user_id, role)
      SELECT v_team, v_user, 'LEAD TECHNICIAN'
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_team_members x WHERE x.team_id = v_team AND x.user_id = v_user);
    END IF;
  END IF;

  -- Five demo cards cover the real workflow states without touching real cards.
  IF v_company IS NOT NULL AND v_machine IS NOT NULL AND v_user IS NOT NULL THEN
    FOR v_i IN 1..5 LOOP
      v_job_no := 'DEMO-JC-' || lpad(v_i::text, 4, '0');
      INSERT INTO maintenance_job_cards(company_id, job_card_no, machine_id, assigned_department_id, complaint_category_id, complaint, priority, requested_by, created_by, updated_by, description, diagnosis, root_cause_category_id, failure_category_id, corrective_action, current_status, requested_at, assigned_at, started_at, completed_at, closed_at, verified_at, approved_at, started_by, completed_by, closed_by, verified_by, approved_by, remarks)
      SELECT v_company, v_job_no, v_machine, v_department,
        CASE v_i WHEN 1 THEN v_cat_mech WHEN 2 THEN v_cat_elec ELSE v_cat_mech END,
        CASE v_i WHEN 1 THEN 'DEMO: Abnormal vibration detected during machine operation.' WHEN 2 THEN 'DEMO: Machine control panel push button is not responding.' WHEN 3 THEN 'DEMO: Drive motor temperature is higher than normal.' WHEN 4 THEN 'DEMO: Worn bearing found during inspection.' ELSE 'DEMO: Machine stopped due to bearing failure.' END,
        CASE WHEN v_i IN (1,3,5) THEN 'HIGH' ELSE 'MEDIUM' END, v_user, v_user, v_user,
        'DEMO sample maintenance work order', CASE WHEN v_i >= 4 THEN 'DEMO inspection identified bearing wear.' END, CASE WHEN v_i >= 4 THEN v_root END, CASE WHEN v_i >= 4 THEN v_failure END, CASE WHEN v_i >= 4 THEN 'DEMO bearing replaced and alignment checked.' END,
        CASE v_i WHEN 1 THEN 'OPEN' WHEN 2 THEN 'ASSIGNED' WHEN 3 THEN 'IN_PROGRESS' WHEN 4 THEN 'COMPLETED' ELSE 'APPROVED' END,
        NOW() - ((6-v_i) || ' days')::interval, CASE WHEN v_i >= 2 THEN NOW() - ((6-v_i) || ' days')::interval END, CASE WHEN v_i >= 3 THEN NOW() - ((6-v_i) || ' days')::interval END, CASE WHEN v_i >= 4 THEN NOW() - ((6-v_i) || ' days')::interval END, CASE WHEN v_i >= 4 THEN NOW() - ((5-v_i) || ' days')::interval END, CASE WHEN v_i = 5 THEN NOW() - interval '1 day' END, CASE WHEN v_i = 5 THEN NOW() END,
        CASE WHEN v_i >= 3 THEN v_user END, CASE WHEN v_i >= 4 THEN v_user END, CASE WHEN v_i >= 4 THEN v_user END, CASE WHEN v_i = 5 THEN v_user END, CASE WHEN v_i = 5 THEN v_user END, 'DEMO/SAMPLE DATA'
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_job_cards x WHERE x.job_card_no = v_job_no);
      SELECT id INTO v_job FROM maintenance_job_cards WHERE job_card_no = v_job_no;
      IF v_i >= 2 THEN
        INSERT INTO maintenance_job_card_technicians(job_card_id, technician_user_id, role)
        SELECT v_job, v_user, 'LEAD TECHNICIAN' WHERE NOT EXISTS (SELECT 1 FROM maintenance_job_card_technicians x WHERE x.job_card_id=v_job AND x.technician_user_id=v_user);
      END IF;
      FOREACH v_status IN ARRAY CASE v_i WHEN 1 THEN ARRAY['OPEN'] WHEN 2 THEN ARRAY['OPEN','ASSIGNED'] WHEN 3 THEN ARRAY['OPEN','ASSIGNED','IN_PROGRESS'] WHEN 4 THEN ARRAY['OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CLOSED'] ELSE ARRAY['OPEN','ASSIGNED','IN_PROGRESS','COMPLETED','CLOSED','PENDING_VERIFICATION','VERIFIED','APPROVED'] END LOOP
        INSERT INTO maintenance_job_card_status_history(job_card_id, from_status, to_status, changed_by, changed_at, remarks)
        SELECT v_job, NULL, v_status, v_user, NOW(), 'DEMO workflow history' WHERE NOT EXISTS (SELECT 1 FROM maintenance_job_card_status_history x WHERE x.job_card_id=v_job AND x.to_status=v_status AND x.remarks='DEMO workflow history');
      END LOOP;
      IF v_i >= 3 THEN
        INSERT INTO maintenance_job_card_work_logs(job_card_id, technician_user_id, started_at, ended_at, duration_minutes, work_description, remarks)
        SELECT v_job, v_user, NOW() - interval '2 hours', NOW() - interval '30 minutes', 90, 'DEMO inspected drive assembly and maintenance condition.', 'DEMO work log' WHERE NOT EXISTS (SELECT 1 FROM maintenance_job_card_work_logs x WHERE x.job_card_id=v_job AND x.remarks='DEMO work log');
      END IF;
    END LOOP;
  END IF;

  SELECT i.id, i.base_uom_id INTO v_item, v_uom FROM items i WHERE i.company_id=v_company AND i.item_type='SPARE_PART' AND i.is_active=true ORDER BY i.created_at NULLS LAST LIMIT 1;
  SELECT id INTO v_warehouse FROM warehouses WHERE company_id=v_company AND is_active=true ORDER BY created_at NULLS LAST LIMIT 1;
  SELECT id INTO v_job FROM maintenance_job_cards WHERE job_card_no='DEMO-JC-0003';
  IF v_job IS NOT NULL AND v_item IS NOT NULL AND v_uom IS NOT NULL AND v_user IS NOT NULL THEN
    INSERT INTO maintenance_job_card_parts(job_card_id,item_id,quantity,uom_id,unit_cost,total_cost,issued_from,issued_at,issued_by,remarks)
    SELECT v_job,v_item,1,v_uom,100,100,v_warehouse,NOW(),v_user,'DEMO part consumption' WHERE NOT EXISTS (SELECT 1 FROM maintenance_job_card_parts x WHERE x.job_card_id=v_job AND x.remarks='DEMO part consumption');
  END IF;
  SELECT id INTO v_job FROM maintenance_job_cards WHERE job_card_no='DEMO-JC-0001';
  IF v_job IS NOT NULL AND v_user IS NOT NULL THEN
    INSERT INTO maintenance_job_card_attachments(job_card_id,file_name,file_url,mime_type,file_size,uploaded_by,description)
    SELECT v_job,'DEMO-machine-fault.jpg','https://example.com/demo/maintenance/DEMO-machine-fault.jpg','image/jpeg',0,v_user,'DEMO attachment metadata' WHERE NOT EXISTS (SELECT 1 FROM maintenance_job_card_attachments x WHERE x.job_card_id=v_job AND x.file_name='DEMO-machine-fault.jpg');
  END IF;

  IF v_company IS NOT NULL AND v_machine IS NOT NULL AND v_user IS NOT NULL AND v_team IS NOT NULL THEN
    FOR v_i IN 1..3 LOOP
      v_code := 'DEMO-PM-00' || v_i;
      INSERT INTO maintenance_pm_plans(company_id,plan_code,plan_name,description,machine_id,frequency_type,frequency_value,checklist,assigned_team_id,created_by,updated_by)
      SELECT v_company,v_code,CASE v_i WHEN 1 THEN 'DEMO Monthly Bearing Inspection' WHEN 2 THEN 'DEMO Weekly Safety Inspection' ELSE 'DEMO Quarterly Electrical Inspection' END,'DEMO preventive maintenance plan',v_machine,CASE v_i WHEN 1 THEN 'MONTHLY' WHEN 2 THEN 'WEEKLY' ELSE 'QUARTERLY' END,1,'["DEMO inspect and record findings"]'::jsonb,v_team,v_user,v_user
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_pm_plans x WHERE x.plan_code=v_code);
      SELECT id INTO v_job FROM maintenance_pm_plans WHERE plan_code=v_code;
      INSERT INTO maintenance_pm_schedules(pm_plan_id,machine_id,scheduled_date,status)
      SELECT v_job,v_machine,CURRENT_DATE + v_i,CASE v_i WHEN 1 THEN 'SCHEDULED' WHEN 2 THEN 'DUE' ELSE 'OVERDUE' END
      WHERE NOT EXISTS (SELECT 1 FROM maintenance_pm_schedules x WHERE x.pm_plan_id=v_job AND x.scheduled_date=CURRENT_DATE+v_i);
    END LOOP;
  END IF;
END $$;
