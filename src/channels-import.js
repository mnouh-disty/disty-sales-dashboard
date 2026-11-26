import { normalizeReport } from './channels-data.js';
// Read only report worksheets from standard XLSX ZIP containers. No external scripts or uploads of raw PII.
function tsv(text){const result=[];let row=[],value='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quote&&text[i+1]==='"'){value+='"';i++;}else if(c==='"'&&(quote||!value)){quote=!quote;}else if(!quote&&(c==='\t'||c==='\n'||c==='\r')){row.push(value);value='';if(c!=='\t'){result.push(row);row=[];if(c==='\r'&&text[i+1]==='\n')i++;}}else value+=c;}if(value||row.length){row.push(value);result.push(row);}return result;}
const xml=text=>{const d=new DOMParser().parseFromString(text,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('Invalid XLSX XML');return d;};
const tags=(n,tag)=>Array.from(n.getElementsByTagNameNS('*',tag));
async function workbook(buffer){
  const v=new DataView(buffer),u=new Uint8Array(buffer);let end=-1;for(let i=u.length-22;i>=Math.max(0,u.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('Invalid XLSX archive');
  const files=new Map(),decoder=new TextDecoder();let p=v.getUint32(end+16,true);
  for(let i=0;i<v.getUint16(end+10,true);i++){
    if(v.getUint32(p,true)!==0x02014b50)throw Error('Invalid XLSX directory');
    const n=v.getUint16(p+28,true),e=v.getUint16(p+30,true),c=v.getUint16(p+32,true);
    files.set(decoder.decode(u.subarray(p+46,p+46+n)),{method:v.getUint16(p+10,true),size:v.getUint32(p+20,true),expanded:v.getUint32(p+24,true),offset:v.getUint32(p+42,true)});p+=46+n+e+c;
  }
  async function read(path){const f=files.get(path);if(!f)return null;if(f.expanded>40*1024*1024)throw Error('Worksheet too large. Export a smaller date range.');const o=f.offset;if(v.getUint32(o,true)!==0x04034b50)throw Error('Invalid XLSX entry');const start=o+30+v.getUint16(o+26,true)+v.getUint16(o+28,true);const bytes=u.subarray(start,start+f.size);if(f.method===0)return decoder.decode(bytes);if(f.method!==8)throw Error('Unsupported XLSX compression');return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();}
  const shared=await read('xl/sharedStrings.xml');const strings=shared?tags(xml(shared),'si').map(si=>tags(si,'t').map(t=>t.textContent).join('')):[];
  const book=xml(await read('xl/workbook.xml')),rels=xml(await read('xl/_rels/workbook.xml.rels'));
  const sheet=tags(book,'sheet').find(s=>s.getAttribute('name')==='Orders')||tags(book,'sheet')[0];
  const id=sheet.getAttribute('r:id');const rel=tags(rels,'Relationship').find(r=>r.getAttribute('Id')===id);
  const target=rel.getAttribute('Target');const path=target.startsWith('/')?target.slice(1):'xl/'+target;
  const data=xml(await read(path));
  return tags(data,'row').map(r=>{const row=[];for(const cell of tags(r,'c')){const ref=cell.getAttribute('r')||'A1';let col=0;for(const ch of ref.match(/^[A-Z]+/)[0])col=col*26+ch.charCodeAt(0)-64;if(col>200)continue;const type=cell.getAttribute('t'),val=tags(cell,'v')[0]?.textContent||'';row[col-1]=type==='s'?strings[Number(val)]||'':type==='inlineStr'?tags(cell,'t').map(t=>t.textContent).join(''):val;}return Array.from(row,c=>c??'');});
}
export async function parseFile(file){
  if(file.size>15*1024*1024)throw Error('File exceeds 15 MB. Export a smaller date range.');
  let matrix;
  if(/\.xlsx$/i.test(file.name))matrix=await workbook(await file.arrayBuffer());
  else if(/\.(txt|tsv)$/i.test(file.name))matrix=tsv((await file.text()).replace(/^\uFEFF/,''));
  else throw Error('Use an Amazon TXT/TSV or Trendyol XLSX report.');
  return normalizeReport(matrix);
}
