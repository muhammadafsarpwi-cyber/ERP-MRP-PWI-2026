async function main() {
  const loginRes = await fetch('http://localhost:3001/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'system.admin@erp.com',
      password: 'Admin#2026!Secure',
    }),
  });
  const loginJson = await loginRes.json();
  const token = loginJson.token || loginJson.data?.token || loginJson.data?.session?.access_token;
  console.log('Login result token present:', !!token);

  // 1. Verify Read and Audit Name Resolution
  const deptsRes = await fetch('http://localhost:3001/api/v1/departments', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const deptsJson = await deptsRes.json();
  console.log('Depts total:', deptsJson.total);
  const sample = deptsJson.data?.[0];
  console.log('Sample dept audit:', {
    code: sample?.departmentCode,
    createdBy: sample?.createdBy,
    createdByName: sample?.createdByName,
    updatedBy: sample?.updatedBy,
    updatedByName: sample?.updatedByName,
    createdAt: sample?.createdAt,
    updatedAt: sample?.updatedAt,
  });

  // 2. Test Hierarchy Validation: Section from wrong division
  console.log('\n--- Testing Hierarchy Validation ---');
  const invalidPayload = {
    companyId: '7725aa04-a270-4314-9e82-90949cbe7791',
    divisionId: '50824516-9c24-4122-86e7-c8e6fa1c5869', // DIV-001 Manufacturing Division
    sectionId: 'd2000000-0000-0000-0000-000000000007', // SEC-016 (belongs to DIV-CCD, NOT DIV-001)
    departmentCode: 'TEST-HIER-ERR',
    name: 'Invalid Hierarchy Dept',
  };
  const invalidRes = await fetch('http://localhost:3001/api/v1/departments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(invalidPayload),
  });
  console.log('Invalid hierarchy POST status (expected 400):', invalidRes.status);
  const invalidJson = await invalidRes.json();
  console.log('Invalid hierarchy error message:', invalidJson.message);

  // 3. Test Create temporary department with correct hierarchy
  console.log('\n--- Testing Create Department ---');
  const testCode = 'TEST-D-' + Date.now().toString().slice(-4);
  const createPayload = {
    companyId: '7725aa04-a270-4314-9e82-90949cbe7791',
    divisionId: 'd1000000-0000-0000-0000-000000000002', // DIV-CCD
    sectionId: 'd2000000-0000-0000-0000-000000000007',  // SEC-016
    departmentCode: testCode,
    name: 'Temporary QA Dept',
    description: 'Automated test department',
  };
  const createRes = await fetch('http://localhost:3001/api/v1/departments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(createPayload),
  });
  console.log('Create POST status (expected 201):', createRes.status);
  const createJson = await createRes.json();
  const createdDept = createJson.data;
  console.log('Created Dept:', {
    id: createdDept?.id,
    code: createdDept?.departmentCode,
    sectionId: createdDept?.sectionId,
    sectionName: createdDept?.section?.name,
    createdBy: createdDept?.createdBy,
    createdByName: createdDept?.createdByName,
    createdAt: createdDept?.createdAt,
  });

  if (!createdDept?.id) {
    console.error('Failed to create test department');
    return;
  }

  // 4. Test Update Section persistence (change from SEC-016 to SEC-111)
  console.log('\n--- Testing Section Change Persistence ---');
  const targetSectionId = '2eabc3e1-a4c3-426d-9b5c-60e48d9d30fe'; // SEC-111 (CCD Raw Material Store)
  const patchSecRes = await fetch(`http://localhost:3001/api/v1/departments/${createdDept.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sectionId: targetSectionId }),
  });
  console.log('Patch Section status (expected 200):', patchSecRes.status);
  const patchSecJson = await patchSecRes.json();
  console.log('Patch response sectionId:', patchSecJson.data?.sectionId, 'sectionName:', patchSecJson.data?.section?.name);

  // Re-read with GET to verify database persistence
  const getVerifyRes = await fetch(`http://localhost:3001/api/v1/departments/${createdDept.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const getVerifyJson = await getVerifyRes.json();
  console.log('Re-read from DB: sectionId =', getVerifyJson.data?.sectionId, 'sectionName =', getVerifyJson.data?.section?.name);
  console.log('Section Change Verified:', getVerifyJson.data?.sectionId === targetSectionId ? 'PASS' : 'FAIL');

  // 5. Test Update Name & Audit fields
  console.log('\n--- Testing Update Name & Audit Fields ---');
  const patchNameRes = await fetch(`http://localhost:3001/api/v1/departments/${createdDept.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Updated QA Dept Name' }),
  });
  const patchNameJson = await patchNameRes.json();
  console.log('Updated Dept Audit:', {
    name: patchNameJson.data?.name,
    createdBy: patchNameJson.data?.createdBy,
    createdByName: patchNameJson.data?.createdByName,
    updatedBy: patchNameJson.data?.updatedBy,
    updatedByName: patchNameJson.data?.updatedByName,
    createdAt: patchNameJson.data?.createdAt,
    updatedAt: patchNameJson.data?.updatedAt,
  });

  // 6. Test Delete
  console.log('\n--- Testing Delete Department ---');
  const delRes = await fetch(`http://localhost:3001/api/v1/departments/${createdDept.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Delete status (expected 204):', delRes.status);

  // Verify deletion with GET
  const verifyDelRes = await fetch(`http://localhost:3001/api/v1/departments/${createdDept.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log('Re-read deleted dept status (expected 404):', verifyDelRes.status);
  console.log('Delete Verified:', verifyDelRes.status === 404 ? 'PASS' : 'FAIL');
}

main().catch(console.error);

