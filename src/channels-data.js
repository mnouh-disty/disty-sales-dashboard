// Channel report normalization. Monetary amounts are merchandise values, not payouts.
const str = x => String(x ?? '').trim();
const num = x => {const s=str(x).replace(/,/g,'');if(!s)return 0;const n=Number(s);if(!Number.isFinite(n))throw Error('Invalid numeric value');return n;};
export const localDay = x => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
export function statusGroup(s) {
  s=str(s).toLowerCase();
  if(/cancel|void/.test(s))return 'Cancelled';
  if(/return|refund|undeliver/.test(s))return 'Returned';
  if(/delivered/.test(s))return 'Delivered';
  if(/shipped|in transit|dispatch/.test(s)&&!s.includes('unshipped'))return 'Shipped';
  if(/waiting for payment|unpaid|payment pending/.test(s))return 'Awaiting payment';
  if(/pending|processing|created|preparing|unshipped|invoiced|picking|approved|confirmed|packed/.test(s))return 'Pending';
  return 'Other';
}
export const active = r => !['Cancelled','Returned','Awaiting payment','Other'].includes(statusGroup(r.status));
export const fulfilled = r => ['Shipped','Delivered'].includes(statusGroup(r.status));
export const keyOf = r => JSON.stringify([r.channel,r.orderId,r.lineId]);
export function normalizeReport(matrix) {
  const at=matrix.findIndex(r=>r.includes('amazon-order-id')||r.includes('Order Number')&&r.includes('Package No')&&r.includes('Barcode'));
  if(at<0)throw Error('Unsupported report. Upload an Amazon All Orders TSV or Trendyol Orders XLSX.');
  const headers=matrix[at].map(str);const amazon=headers.includes('amazon-order-id');
  const required=amazon?['amazon-order-id','order-item-id','purchase-date','last-updated-date','order-status','quantity','item-price','sales-channel','currency']:['Order Number','Package No','Barcode','Order Date','Order Status','Quantity','Sales Amount','Country'];
  if(required.some(h=>!headers.includes(h)))throw Error('Report is missing required columns.');
  const seen=new Map();let duplicates=0;
  for(const cells of matrix.slice(at+1)){
    if(!cells.some(c=>str(c)))continue;
    const v=Object.fromEntries(headers.map((h,i)=>[h,str(cells[i])]));
    let row;
    if(amazon){
      if(v['sales-channel']!=='Amazon.sa'||(v.currency&&v.currency!=='SAR'))throw Error('Only Amazon Saudi Arabia (SAR) is supported.');
      const d=new Date(v['purchase-date']),u=new Date(v['last-updated-date']);
      row={channel:'Amazon.sa',orderId:v['amazon-order-id'],lineId:v['order-item-id'],day:localDay(d),sourceUpdated:u.toISOString(),status:v['item-status']==='Cancelled'?'Cancelled':v['order-status'],sku:v.sku,product:v['product-name'],brand:'',city:v['ship-city'],qty:num(v.quantity),revenue:num(v['item-price'])-num(v['item-promotion-discount'])};
    }else{
      if(!/^(saudi arabia|sa|ksa)$/i.test(v.Country))throw Error('Only Trendyol Saudi Arabia is supported.');
      const match=v['Order Date'].match(/^(\d{2})\.(\d{2})\.(\d{4})/);
      let day=match?match[3]+'-'+match[2]+'-'+match[1]:v['Order Date'].slice(0,10);
      if(/^\d+(\.\d+)?$/.test(v['Order Date']))day=new Date(Date.UTC(1899,11,30)+Math.floor(Number(v['Order Date']))*86400000).toISOString().slice(0,10);
      if(!v['Package No']||!v.Barcode)throw Error('Trendyol package and barcode are required.');
      row={channel:'Trendyol',orderId:v['Order Number'],lineId:JSON.stringify([v['Package No'],v.Barcode]),day,sourceUpdated:'',status:v['Order Status'],sku:v['Stock Code']||v.Barcode,product:v['Product Name'],brand:v.Brand,city:v.City,qty:num(v.Quantity),revenue:num(v['Sales Amount'])};
    }
    if(!row.orderId||!row.lineId||!row.status||!/^\d{4}-\d{2}-\d{2}$/.test(row.day)||!Number.isInteger(row.qty)||row.qty<0||row.revenue<0)throw Error('Missing or invalid order details.');
    row.revenue=Math.round(row.revenue*100)/100;
    const key=keyOf(row),prior=seen.get(key);
    if(prior){
      if(JSON.stringify(prior)===JSON.stringify(row)){duplicates++;continue;}
      if(amazon&&prior.sourceUpdated!==row.sourceUpdated){if(prior.sourceUpdated>row.sourceUpdated)continue;}
      else throw Error('Conflicting repeated order line '+row.orderId+'. Resolve this in the source report before importing.');
    }
    seen.set(key,row);
  }
  if(!seen.size)throw Error('No order lines found.');
  return {rows:[...seen.values()],duplicates,channel:amazon?'Amazon.sa':'Trendyol'};
}
export function summarize(rows){
  const orders=new Set(),sold=new Set(),cancelled=new Set();let qty=0,revenue=0,fulfilledRevenue=0,awaiting=0;
  for(const r of rows){const id=JSON.stringify([r.channel,r.orderId]);orders.add(id);if(active(r)){sold.add(id);qty+=r.qty;revenue+=r.revenue;}if(fulfilled(r))fulfilledRevenue+=r.revenue;if(statusGroup(r.status)==='Cancelled')cancelled.add(id);if(statusGroup(r.status)==='Awaiting payment')awaiting+=r.revenue;}
  return {orders:orders.size,sold:sold.size,qty,revenue,fulfilledRevenue,awaiting,cancelled:cancelled.size,aov:sold.size?revenue/sold.size:0,cancelRate:orders.size?cancelled.size/orders.size:0};
}
export function groupRows(rows,fn){const groups=new Map();for(const r of rows){const k=fn(r)||'Unknown';if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}return [...groups].map(([name,list])=>({name,...summarize(list)}));}
export function periodOf(day,period){if(period==='month')return day.slice(0,7);if(period==='week'){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}return day;}
