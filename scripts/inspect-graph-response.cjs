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
  const token = loginJson.token || loginJson.data?.token;

  const graphRes = await fetch('http://localhost:3001/api/v1/production/routings/a6f9ce93-2769-4b99-b1ea-784d240c1081/graph', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const graphJson = await graphRes.json();
  const data = graphJson.data || graphJson;
  console.log('Graph data nodes count:', data.nodes?.length);
  console.log('Graph data edges count:', data.edges?.length);
  console.log('Nodes:');
  data.nodes?.forEach(n => console.log(`  - #${n.sequenceNo} ${n.operationCode} (${n.operationName}) inDegree=${n.inDegree} outDegree=${n.outDegree} isBranch=${n.isBranch} isMerge=${n.isMerge}`));
  console.log('Edges:');
  data.edges?.forEach(e => console.log(`  - ${e.fromOperationId} -> ${e.toOperationId} (${e.connectionType}) label=${e.branchLabel}`));
}

main().catch(console.error);
