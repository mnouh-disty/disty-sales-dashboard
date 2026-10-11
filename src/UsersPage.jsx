import React,{useEffect,useRef,useState} from 'react';
import {Plus,RefreshCw,X} from 'lucide-react';

const empty={name:'',email:'',role:'viewer',password:'',active:true};
export default function UsersPage({currentUser,onUserChanged,onSessionExpired}){
  const [users,setUsers]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[editing,setEditing]=useState(null),[form,setForm]=useState(empty),[saving,setSaving]=useState(false),[dialogError,setDialogError]=useState('');
  const dialog=useRef(null);
  async function load(){setLoading(true);setError('');try{const r=await fetch('/api/users');const body=await r.json();if(r.status===401){onSessionExpired();return;}if(!r.ok)throw Error(body.error||'Could not load users.');setUsers(body.users);}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  useEffect(()=>{if(editing&&!dialog.current.open)dialog.current.showModal();else if(!editing&&dialog.current.open)dialog.current.close();},[editing]);
  function open(user){setDialogError('');setForm(user?{...user,password:''}:{...empty,role:currentUser.bootstrap?'admin':'viewer'});setEditing(user||{new:true});}
  async function save(e){e.preventDefault();setSaving(true);setDialogError('');try{
    const r=await fetch('/api/users',{method:editing.new?'POST':'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...form,id:editing.id})});const body=await r.json();
    if(r.status===401){onSessionExpired();return;}if(!r.ok)throw Error(body.error||'Could not save user.');
    setUsers(previous=>editing.new?[...previous,body.user]:previous.map(u=>u.id===body.user.id?body.user:u));
    if(body.currentUser)onUserChanged(body.currentUser);
    setNotice(editing.new?'Account created. Share the email and password with this person.':'Account updated. Their previous sessions have been signed out.');setEditing(null);setForm(empty);
  }catch(e){setDialogError(e.message);}finally{setSaving(false);}}
  const set=(key,value)=>setForm(f=>({...f,[key]:value}));
  return <section className="card users-page"><header className="card-head"><div><h2>Team access</h2><p>Admins manage accounts. Viewers can use all analytics and filters.</p></div><button className="refresh" onClick={()=>open()} disabled={loading||!!error}><Plus size={15}/>{currentUser.bootstrap?'Create admin account':'Add user'}</button></header>
    {currentUser.bootstrap&&!error&&<p className="users-notice">Create your own Admin account first. You’ll stay signed in, and future logins will use individual emails and passwords.</p>}
    {error&&<div className="inline-error"><div><strong>Users could not be loaded</strong><span>{error}</span></div><button onClick={load}>Retry</button></div>}
    {notice&&<p className="users-notice" role="status">{notice}</p>}
    {loading?<p className="muted"><RefreshCw size={16} className="spin"/> Loading users…</p>:!error&&<div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{users.map(user=><tr key={user.id}><td>{user.name}{user.id===currentUser.id?' (you)':''}</td><td>{user.email}</td><td>{user.role==='admin'?'Admin':'Viewer'}</td><td>{user.active?'Active':'Disabled'}</td><td><button className="filter-tool-button" onClick={()=>open(user)}>Edit / reset password</button></td></tr>)}{!users.length&&<tr><td colSpan={5}>No individual accounts yet.</td></tr>}</tbody></table></div>}
    <dialog ref={dialog} className="view-dialog" aria-labelledby="user-dialog-title" onCancel={e=>{if(!saving)setEditing(null);else e.preventDefault();}}>
      <form onSubmit={save}><div className="view-dialog-heading"><h2 id="user-dialog-title">{editing?.new?'Add user':'Edit user'}</h2><button type="button" className="filter-tool-button" disabled={saving} aria-label="Close" onClick={()=>setEditing(null)}><X size={16}/></button></div>
        <label className="view-name"><span>Name</span><input autoFocus required maxLength={80} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
        <label className="view-name"><span>Email</span><input type="email" required maxLength={254} autoComplete="off" value={form.email} onChange={e=>set('email',e.target.value)}/></label>
        <label className="select-field"><span>Role</span><select value={form.role} disabled={!!currentUser.bootstrap} onChange={e=>set('role',e.target.value)}><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
        <label className="view-name"><span>{editing?.new?'Password':'New password (leave blank to keep current)'}</span><input type="password" autoComplete="new-password" required={!!editing?.new} minLength={12} maxLength={256} value={form.password} onChange={e=>set('password',e.target.value)}/></label>
        {!editing?.new&&<label className="user-active"><input type="checkbox" checked={form.active} disabled={form.id===currentUser.id} onChange={e=>set('active',e.target.checked)}/>Account active</label>}
        <p>At least 12 characters. Disabling a user removes their access immediately. Passwords are stored as salted hashes.</p>
        {dialogError&&<p className="saved-view-error" role="alert">{dialogError}</p>}
        <div className="view-dialog-actions"><button type="button" className="filter-tool-button" disabled={saving} onClick={()=>setEditing(null)}>Cancel</button><button className="refresh" disabled={saving}>{saving?'Saving…':editing?.new?'Create account':'Save changes'}</button></div>
      </form>
    </dialog>
  </section>;
}
