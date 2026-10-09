export const PLATFORMS = ['instagram', 'facebook', 'x', 'tiktok', 'linkedin'];
export const LABELS = {instagram:'Instagram',facebook:'Facebook',x:'X',tiktok:'TikTok',linkedin:'LinkedIn'};
export const numeric = value => value === '' || value == null || typeof value === 'boolean' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
export function day(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function normalizeSocial(data) {
  const unique = new Map();
  for (const row of data.posts || []) {
    const platform = String(row.Platform || '').toLowerCase(), id = String(row['Post ID'] || '');
    if (!PLATFORMS.includes(platform) || !id) continue;
    const likes=numeric(row.Likes), comments=numeric(row.Comments), shares=numeric(row.Shares);
    unique.set(`${platform}:${id}`, {platform,id,published:row['Publish date'],date:day(row['Publish date']),content:String(row.Content || ''),url:String(row['Post URL'] || ''),likes,comments,shares,interactions:[likes,comments,shares].every(v=>v!==null)?likes+comments+shares:null,views:numeric(row.Views),reach:numeric(row.Reach),impressions:numeric(row.Impressions),saves:numeric(row.Saves),status:String(row['Metric status'] || 'Unavailable'),readAt:row['Metrics read at'] || '',source:row.Source || ''});
  }
  const accounts = (data.accounts || []).map(r=>({platform:String(r.Platform || '').toLowerCase(),date:day(r.Date),followers:numeric(r.Followers),captured:r['Captured at'] || ''})).filter(r=>PLATFORMS.includes(r.platform) && r.date);
  const logs=(data.logs || []).map(r=>({time:r.Time,service:r['Service / platform'],status:r.Status,details:r.Details}));
  return {posts:[...unique.values()],accounts,logs,generatedAt:data.generatedAt};
}
export function metricTotal(rows, key) {
  const known=rows.filter(r=>numeric(r[key])!==null);
  return {value:known.length ? known.reduce((s,r)=>s+r[key],0) : null,known:known.length,total:rows.length};
}
export function accountSummary(accounts, platforms, start='',end='') {
  return platforms.map(platform=>{
    const rows=accounts.filter(r=>r.platform===platform && r.followers!==null && (!end || r.date<=end)).sort((a,b)=>a.date.localeCompare(b.date));
    const latest=rows.at(-1);
    const before=rows.filter(r=>start && r.date<start).at(-1);
    const baseline=before || rows.find(r=>!start || r.date>=start);
    return {platform,followers:latest?.followers ?? null,date:latest?.date || '',growth:latest && baseline && latest.date>baseline.date ? latest.followers-baseline.followers : null,baseline:baseline?.date || '',partial:!before && Boolean(start && baseline && baseline.date>=start)};
  });
}
export function bucket(date,period) {
  if (period==='month') return date.slice(0,7);
  if(period==='week') {const d=new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)); return d.toISOString().slice(0,10);}
  return date;
}
export function postTrend(posts,period) {
  const groups=new Map();
  posts.filter(r=>r.date).forEach(r=>{const key=bucket(r.date,period); if(!groups.has(key)) groups.set(key,[]); groups.get(key).push(r);});
  return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([date,rows])=>({date,posts:rows.length,interactions:metricTotal(rows,'interactions').value}));
}
export function followerTrend(accounts,platforms,start,end) {
  const groups=new Map();
  accounts.filter(r=>platforms.includes(r.platform) && (!start || r.date>=start) && (!end || r.date<=end)).forEach(r=>{if(!groups.has(r.date))groups.set(r.date,{date:r.date});groups.get(r.date)[r.platform]=r.followers;});
  return [...groups.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
export function csv(rows,columns) {
  const cell=value=>{let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
  return '\uFEFF'+[columns.map(c=>cell(c.label)).join(','),...rows.map(r=>columns.map(c=>cell(r[c.key])).join(','))].join('\r\n');
}
