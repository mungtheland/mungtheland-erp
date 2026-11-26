'use strict';

const {createPassLedgerReader}=require('./staff-pass-ledger-read');
const {analyzePassLedger}=require('./staff-pass-ledger-audit');
const {createSyntheticDryRunFixture,createSyntheticLedgerOptions}=require('./run-staff-pass-dry-run.cjs');

async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--synthetic')throw Error('Use --synthetic');
 const fixture=createSyntheticDryRunFixture();
 const options=createSyntheticLedgerOptions(fixture);
 const target={workbookId:options.approval.workbookId,bookingId:fixture.booking[0]};
 const workbook=await createPassLedgerReader(options)(target);
 const result=analyzePassLedger({workbook,source:'synthetic',firestoreEvidence:[],productCatalog:fixture.ports.binding.productKinds});
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}

if(require.main===module)main().catch(()=>{
 process.stderr.write('Synthetic pass-ledger audit failed. No cloud access was attempted.\n');
 process.exitCode=1;
});

module.exports={main};
