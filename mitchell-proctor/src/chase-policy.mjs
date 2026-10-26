// Three weekly office reminders after the client has been issued a fee proposal.
// All dates are UTC. A daily Worker cron checks individual proposal due dates.
export const CHASE_ROUNDS=3;
export const CHASE_INTERVAL_DAYS=7;
export function chaseDate(value){
  if(!value)return null;
  const text=String(value).trim();
  const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)?text.replace(' ','T')+'Z':text;
  const time=new Date(iso);
  return Number.isFinite(time.getTime())?time:null;
}
export function nextChaseDate(startedAt,sentCount){
  const date=chaseDate(startedAt);
  if(!date||sentCount>=CHASE_ROUNDS||sentCount<0)return null;
  return new Date(date.getTime()+CHASE_INTERVAL_DAYS*(sentCount+1)*86400000);
}
export function chaseIsDue(startedAt,sentCount,now){
  const next=nextChaseDate(startedAt,sentCount);
  return Boolean(next&&next.getTime()<=new Date(now).getTime());
}
export function officeChaseSubject(reference,round){
  return '[MP follow-up '+round+'/3] '+String(reference||'Fee proposal')+' - client quotation to chase';
}
export function officeChaseBody(row,round,siteOrigin){
  const url=siteOrigin+'/job?id='+encodeURIComponent(row.id);
  return [
    'MITCHELL PROCTOR ARCHITECTS - WEEKLY QUOTATION FOLLOW-UP',
    '',
    'Reminder '+round+' of 3. This email goes to the practice office only; it has NOT been sent to the client.',
    '',
    'Job: '+row.reference,
    'Client: '+row.client,
    'Site: '+row.site_address,
    'Client email: '+row.client_email,
    '',
    'Action: Contact the client to follow up the outstanding architectural fee proposal.',
    'Open Job File and choose Send client chase email, or record a telephone/other chase and attach the email copy:',
    url,
    '',
    'A copy of a chase email SENT THROUGH THE APP will be BCCed to enquiries@ukestimates.com and logged on this job.',
    'Emails sent outside the app require the team member to record the chase and upload the message as .eml/.msg if needed.',
    '',
    'This reminder series stops automatically after three office reminders or if the quotation is marked Won/Lost.',
    '',
    'Mitchell Proctor Architects | Fee Proposal Studio'
  ].join('\n');
}
export function clientChaseBody(row){
  return 'Dear '+row.client+',\n\nFurther to our architectural fee proposal '+row.reference+' for '+row.site_address+', I wanted to check whether you have had an opportunity to review it.\n\nWe would be pleased to discuss the proposed services, answer any questions, or progress the appointment at your convenience.\n\nIf you have already responded, please disregard this follow-up.\n\nKind regards,\nMitchell Proctor Architects\n01246 203196';
}
