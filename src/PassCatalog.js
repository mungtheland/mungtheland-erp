/** Explicit, versioned product catalog contract. This module never reads or writes a workbook. */
const MD_PASS_CATALOG_TYPES_=['PASS','DAYCARE_DAILY','HOTEL','TEST_ONLY'];
const MD_PASS_CATALOG_POLICIES_=['REGULAR_PASS','NOT_APPLICABLE'];
const MD_PASS_CATALOG_FIELDS_=['productId','productType','displayName','totalUses','active','deductionPolicy','source','approvalStatus','version'];

function mdValidatePassCatalog_(catalog,expectedVersion){
  const blocked=reason=>({valid:false,status:'BLOCKED',reason});
  if(!catalog||typeof catalog!=='object'||Array.isArray(catalog)||
    Object.keys(catalog).length!==2||!Object.prototype.hasOwnProperty.call(catalog,'catalogVersion')||
    !Object.prototype.hasOwnProperty.call(catalog,'products')||
    !Number.isSafeInteger(catalog.catalogVersion)||catalog.catalogVersion<1||
    !Array.isArray(catalog.products)||
    (expectedVersion!==undefined&&catalog.catalogVersion!==expectedVersion))
    return blocked('CATALOG_VERSION_OR_SHAPE_INVALID');

  const seen=new Set();
  const products=new Map();
  for(const product of catalog.products){
    if(!product||typeof product!=='object'||Array.isArray(product)||
      Object.keys(product).length!==MD_PASS_CATALOG_FIELDS_.length||
      !MD_PASS_CATALOG_FIELDS_.every(field=>Object.prototype.hasOwnProperty.call(product,field))||
      typeof product.productId!=='string'||!/^[-A-Za-z0-9._]{1,80}$/.test(product.productId)||
      !MD_PASS_CATALOG_TYPES_.includes(product.productType)||
      typeof product.displayName!=='string'||!product.displayName.trim()||product.displayName.length>120||
      typeof product.active!=='boolean'||!MD_PASS_CATALOG_POLICIES_.includes(product.deductionPolicy)||
      typeof product.source!=='string'||!product.source.trim()||product.source.length>160||
      !['APPROVED','DRAFT'].includes(product.approvalStatus)||
      !Number.isSafeInteger(product.version)||product.version!==catalog.catalogVersion)
      return blocked('CATALOG_ENTRY_INVALID');
    if(seen.has(product.productId))return blocked('CATALOG_DUPLICATE_PRODUCT_ID');
    seen.add(product.productId);
    if(product.productType==='PASS'){
      if(![8,12,16,20].includes(product.totalUses)||product.deductionPolicy!=='REGULAR_PASS')
        return blocked('CATALOG_PASS_POLICY_INVALID');
    }else if(product.deductionPolicy!=='NOT_APPLICABLE'||
      (product.productType==='TEST_ONLY'&&product.totalUses!==null&&
       (!Number.isSafeInteger(product.totalUses)||product.totalUses<1||product.totalUses>1000))||
      (product.productType!=='TEST_ONLY'&&product.totalUses!==null)){
      return blocked('CATALOG_NON_PASS_POLICY_INVALID');
    }
    products.set(product.productId,product);
  }
  return {valid:true,status:'PASS',catalogVersion:catalog.catalogVersion,products};
}

function mdResolvePassCatalogDeduction_({catalog,productId,totalUses,expectedVersion}={}){
  const validated=mdValidatePassCatalog_(catalog,expectedVersion);
  if(!validated.valid)return validated;
  if(typeof productId!=='string'||!productId.trim())
    return {valid:true,status:'NEEDS_REVIEW',reason:'PRODUCT_ID_MISSING'};
  const product=validated.products.get(productId);
  if(!product)return {valid:true,status:'NEEDS_REVIEW',reason:'PRODUCT_NOT_IN_CATALOG'};
  if(product.productType==='TEST_ONLY')
    return {valid:true,status:'BLOCKED',reason:'TEST_ONLY_PRODUCT'};
  if(product.approvalStatus!=='APPROVED'||product.active!==true)
    return {valid:true,status:'NEEDS_REVIEW',reason:'PRODUCT_NOT_APPROVED_OR_INACTIVE'};
  if(product.productType==='DAYCARE_DAILY'||product.productType==='HOTEL')
    return {valid:true,status:'NOT_REQUIRED',reason:product.productType};
  if(product.productType!=='PASS'||product.deductionPolicy!=='REGULAR_PASS')
    return {valid:true,status:'NEEDS_REVIEW',reason:'PRODUCT_POLICY_UNCONFIRMED'};
  if(totalUses!==product.totalUses)
    return {valid:true,status:'NEEDS_REVIEW',reason:'PRODUCT_TOTAL_USES_MISMATCH'};
  return {valid:true,status:'ELIGIBLE',reason:'APPROVED_RECURRING_PASS',catalogVersion:validated.catalogVersion};
}

if(typeof module!=='undefined')module.exports={mdValidatePassCatalog_,mdResolvePassCatalogDeduction_};
