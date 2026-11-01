/** Guardian request validation, prototype only. */
function mdValidateGuardianRequest_(data) {
  if (!data || typeof data !== 'object') throw Error('Missing input');
  const food = String(data.foodBrought || '');
  const belt = String(data.mannerBelt || '');
  const condition = String(data.condition || '');
  const notes = String(data.notes || '');
  if (!['yes','no'].includes(food)) throw Error('Invalid food');
  if (!['yes','no','na'].includes(belt)) throw Error('Invalid manner belt');
  if (!['normal','caution'].includes(condition)) throw Error('Invalid condition');
  if (notes.length > 500) throw Error('Notes too long');
  return {food,belt,condition,notes};
}
function mdGuardianRequestFeatureStatus(){return {ready:false,reason:'Authentication and test storage are not configured'};}
