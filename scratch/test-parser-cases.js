// Test script for nlQueryParser
// Since nlQueryParser is in TS, let's test running it with ts-node or a compiled check

const queriesToTest = [
  "Show operator-wise production for this month.",
  "Show machine-wise production for September.",
  "Show department-wise target vs actual production.",
  "Show operator efficiency for the last 3 months.",
  "Which operators worked on each machine?",
  "Show operator-wise production for each shift.",
  "Compare production between August and September.",
  "Show item-wise production for the current month.",
  "Show customer-wise dispatch this month.",
  "Show machine-wise downtime.",
  "Show department-wise downtime and efficiency.",
  "Show scrap/reject by operator.",
  "Show production by day for the last 30 days.",
  "Show weekly production trend.",
  "Show quarterly production.",
  "Show yearly production.",
  "Show operator + machine-wise production.",
  "Show machine + item-wise production.",
  "Show department + machine-wise production.",
  "Show operator + shift-wise production.",
  "Only Flattening",
  "Now show it machine-wise",
  "Change production quantity from 500 to 550"
];

console.log("Total test query strings:", queriesToTest.length);
