'use strict';

// Header-only evidence captured from the named source tab A1:AY1 on 2026-11-28.
// These are export column labels, not Tally question IDs or conditional rules.
const headers = Object.freeze([
  'Submission ID', 'Respondent ID', 'Submitted at',
  '보호자 성함을 입력해 주세요.', '보호자 휴대전화 번호를 입력해 주세요.', '비상연락처를 입력해 주세요.', '비상연락자와의 관계를 입력해 주세요.',
  '반려견 이름을 입력해 주세요.', '반려견 품종을 입력해 주세요.', '반려견 생년월일(또는 입양일)을 입력해 주세요.', '반려견 성별을 선택해 주세요.',
  '중성화 여부를 선택해 주세요.', '반려견 현재 체중(kg)을 입력해 주세요.', '반려견 털 색상을 입력해 주세요.', '반려견 동물등록번호를 입력해 주세요.(선택)',
  '과거 사람이나 다른 강아지를 실제로 문 적이 있나요?', '물림사고가 발생한 시기, 상대(사람 또는 강아지), 당시 상황 및 상처 발생 여부를 구체적으로 작성해 주세요.',
  '다른 강아지나 사람을 실제로 물지는 않았지만, 물려고 하거나 공격적으로 달려든 적이 있나요?', '공격을 시도한 상대, 당시 상황, 행동 및 발생 횟수를 구체적으로 작성해 주세요.',
  '다른 강아지가 가까이 오거나 접촉하려 할 때 으르렁거리거나 이빨을 드러낸 적이 있나요?',
  '음식, 장난감, 휴식공간 등을 다른 강아지가 건드리거나 가까이 올 때 으르렁거리거나 공격적인 행동을 하나요?',
  '어떤 물건이나 상황에서 해당 행동이 나타나는지 구체적으로 작성해 주세요.', '다른 강아지들과 함께 있을 때 주로 어떤 모습을 보이나요?',
  '사람이 몸을 만지거나 안아 올리려고 할 때 물려고 하거나 강하게 거부한 적이 있나요?', '어떤 접촉이나 상황에서 거부 행동이 나타나는지 구체적으로 작성해 주세요.',
  '보호자와 떨어졌을 때 심한 불안, 지속적인 짖음, 탈출 시도 등의 행동을 보이나요?', '어떤 행동이 나타나며, 보통 얼마나 지속되는지 작성해 주세요.',
  '현재 앓고 있거나 치료 중인 질병이 있나요?', '질병명, 진단 시기 및 현재 상태를 작성해 주세요.', '현재 복용 중인 약이 있나요?',
  '약 이름, 복용 목적 및 복용 방법을 작성해 주세요.', '음식이나 약물에 대한 알레르기가 있나요?', '알레르기 원인과 나타나는 증상을 작성해 주세요.',
  '최근 7일 이내 구토, 설사, 기침, 발열 등의 증상이 있었나요?', '증상의 종류, 발생일 및 현재 회복 여부를 작성해 주세요.',
  '반려견의 예방접종 상태는 어떻게 되나요?', '유치원 생활 중 특별히 주의하거나 관리해야 할 사항이 있나요?', '유치원에서 주의해야 할 사항을 구체적으로 작성해 주세요.',
  '위 멍더랜드 이용계약서 제1조부터 제8조까지의 내용을 확인하고 동의합니다.',
  '위 멍더랜드 이용계약서 제1조부터 제8조까지의 내용을 확인하고 동의합니다. (동의합니다)',
  '반려견 간 물림사고 발생 시 유치원이 합리적인 안전관리 의무를 이행하였고 고의·과실이 없는 경우, 관련 보호자들의 법적 책임관계에 따라 손해배상을 해결하는 것을 원칙으로 하며, 유치원에 고의·과실이 있는 경우에는 법적 책임이 면제되지 않음을 확인하였습니다.',
  '반려견 간 물림사고 발생 시 유치원이 합리적인 안전관리 의무를 이행하였고 고의·과실이 없는 경우, 관련 보호자들의 법적 책임관계에 따라 손해배상을 해결하는 것을 원칙으로 하며, 유치원에 고의·과실이 있는 경우에는 법적 책임이 면제되지 않음을 확인하였습니다. (확인하였습니다)',
  '본인은 반려견의 과거 물림·공격 이력, 행동 특성, 질병 및 건강상태를 사실대로 작성하였으며, 중요한 정보를 고의 또는 과실로 누락하여 사고가 발생한 경우 관계 법령에 따라 책임을 부담할 수 있음을 확인합니다.',
  '본인은 반려견의 과거 물림·공격 이력, 행동 특성, 질병 및 건강상태를 사실대로 작성하였으며, 중요한 정보를 고의 또는 과실로 누락하여 사고가 발생한 경우 관계 법령에 따라 책임을 부담할 수 있음을 확인합니다. (확인하였습니다)',
  '반려견에게 부상 또는 건강 이상이 발생한 경우 유치원이 보호자에게 연락하고 필요한 조치를 실시하며, 긴급상황에서 보호자와 연락이 닿지 않을 경우 동물병원 이송 및 필요한 응급진료를 의뢰할 수 있음에 동의합니다. 진료비는 사고 원인과 귀책사유에 따라 부담합니다.',
  '반려견에게 부상 또는 건강 이상이 발생한 경우 유치원이 보호자에게 연락하고 필요한 조치를 실시하며, 긴급상황에서 보호자와 연락이 닿지 않을 경우 동물병원 이송 및 필요한 응급진료를 의뢰할 수 있음에 동의합니다. 진료비는 사고 원인과 귀책사유에 따라 부담합니다. (동의합니다)',
  '멍더랜드의 입소 신청, 계약 체결 및 이행, 반려견 관리, 보호자 연락, 사고 대응을 위한 개인정보 수집·이용 내용을 확인하고 동의합니다.',
  '멍더랜드의 입소 신청, 계약 체결 및 이행, 반려견 관리, 보호자 연락, 사고 대응을 위한 개인정보 수집·이용 내용을 확인하고 동의합니다. (동의합니다)',
  '멍더랜드의 인스타그램, 블로그 등 홍보 채널에 반려견의 사진·영상을 게시하는 데 동의하시나요?',
  '본인은 위 신청서의 내용을 사실대로 작성하였으며, 멍더랜드 이용계약 및 필수 동의사항을 확인하고 이에 서명합니다.',
  '계약서에 서명하는 보호자 성함을 다시 입력해 주세요.'
]);

const candidates = Object.freeze([
  'sourceSubmissionId', 'sourceRespondentId_NO_AUTO_LINK', 'receivedAt', 'guardianName', 'phone', 'emergencyPhone', 'emergencyContactRelationship',
  'dogName', 'breed', 'birthDateOrAdoptionDate', 'sex', 'neutered', 'weightKg', 'coatColor', 'animalRegistrationNumber_OPTIONAL',
  'biteHistory', 'biteDetails', 'aggressionAttemptHistory', 'aggressionAttemptDetails', 'dogApproachWarningBehavior', 'resourceGuarding',
  'resourceGuardingDetails', 'dogGroupBehavior', 'humanHandlingRefusalOrBite', 'handlingDetails', 'separationAnxiety', 'separationDetails',
  'currentDisease', 'diseaseDetails', 'currentMedication', 'medicationDetails', 'allergy', 'allergyDetails', 'recentSymptomsSevenDays',
  'symptomDetails', 'vaccinationStatus', 'daycareCautions', 'daycareCautionDetails', 'consent.contractTerms.statement',
  'consent.contractTerms.response', 'consent.incidentLiability.statement', 'consent.incidentLiability.response',
  'consent.truthfulSafetyDisclosure.statement', 'consent.truthfulSafetyDisclosure.response', 'consent.emergencyCare.statement',
  'consent.emergencyCare.response', 'consent.personalDataUse.statement', 'consent.personalDataUse.response',
  'consent.photoVideoMarketing', 'signatureEvidenceCandidate_PENDING_TYPE_VERIFICATION', 'signerName'
]);

const consentGroups = Object.freeze([
  Object.freeze({ id: 'contractTerms', columns: Object.freeze([39, 40]), responseMeaning: 'PENDING_VERIFICATION' }),
  Object.freeze({ id: 'incidentLiability', columns: Object.freeze([41, 42]), responseMeaning: 'PENDING_VERIFICATION' }),
  Object.freeze({ id: 'truthfulSafetyDisclosure', columns: Object.freeze([43, 44]), responseMeaning: 'PENDING_VERIFICATION' }),
  Object.freeze({ id: 'emergencyCare', columns: Object.freeze([45, 46]), responseMeaning: 'PENDING_VERIFICATION' }),
  Object.freeze({ id: 'personalDataUse', columns: Object.freeze([47, 48]), responseMeaning: 'PENDING_VERIFICATION' })
]);

const HEADER_MANIFEST = Object.freeze({
  version: 'tally-sheets-intake-v1', sourceEvidence: 'CONNECTED_SHEETS_HEADER_RANGE_A1_AY1',
  spreadsheetId: '1p_kj7avwmGvF-QST3Az6-FXo-sQoin6MvwChOKZphbo', tabName: '시트1', range: 'A1:AY1', columnCount: 51,
  tallyQuestionIds: 'PENDING_VERIFICATION', conditionalRules: 'PENDING_VERIFICATION', requiredness: 'PENDING_VERIFICATION',
  headers, columns: Object.freeze(headers.map((header, index) => Object.freeze({
    columnNumber: index + 1, header, erpCandidate: candidates[index], mappingStatus: 'HEADER_CONFIRMED_CANDIDATE',
    tallyQuestionId: 'PENDING_VERIFICATION'
  }))), consentGroups
});

if (headers.length !== 51 || candidates.length !== 51 || new Set(headers).size !== 51) {
  throw new Error('SHEETS_HEADER_MANIFEST_INVALID');
}

module.exports = { HEADER_MANIFEST };
