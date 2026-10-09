import React,{useEffect,useRef,useState} from 'react';
import {Plus,Settings2,X} from 'lucide-react';
import {VIEWS_KEY,SELECTED_VIEW_KEY,readViews,saveView,applyView,sameViewCriteria,readSelectedView,browserStorage} from './filter-views.js';

export default function SavedFilterViews({filters,period,setFilters,setPeriod,storageError,onConfigure}) {
  const [views,setViews]=useState(()=>readViews(browserStorage()));
  const [selected,setSelected]=useState(()=>readSelectedView(browserStorage(),views,{filters,period}));
  const [name,setName]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[mode,setMode]=useState('');
  const dialog=useRef(null),menu=useRef(null);
  const active=views.find(v=>v.id===selected);
  const modified=active&&!sameViewCriteria(active,{filters,period});
  useEffect(()=>{try{window.localStorage.setItem(SELECTED_VIEW_KEY,selected);}catch{setError('The selected view could not be remembered. Allow site storage.');}},[selected]);
  useEffect(()=>{const handle=e=>{if(e.key===VIEWS_KEY){setViews(readViews(browserStorage()));setSelected('');setMode('');}};window.addEventListener('storage',handle);return()=>window.removeEventListener('storage',handle);},[]);
  useEffect(()=>{if(mode&&!dialog.current.open)dialog.current.showModal();else if(!mode&&dialog.current.open)dialog.current.close();},[mode]);
  const persist=next=>{try{window.localStorage.setItem(VIEWS_KEY,JSON.stringify(next));setViews(next);setError('');return true;}catch{setError('Your browser could not save the view. Allow site storage or free some space, then try again.');return false;}};
  function open(next){if(menu.current)menu.current.open=false;setName(next==='new'?'':active?.name||'');setError('');setMessage('');setMode(next);}
  function save(event){
    event.preventDefault();
    if(mode==='delete'){
      if(active&&persist(views.filter(v=>v.id!==selected))){setSelected('');setMode('');setMessage('View deleted. Current filters kept.');}return;
    }
    if(mode!=='new'&&!active){setError('This view is no longer available.');return;}
    try{
      const id=mode==='new'?crypto.randomUUID():selected;
      const criteria=mode==='rename'?active:{filters,period};
      const next=saveView(views,{id,name,filters:criteria.filters,period:criteria.period});
      if(persist(next)){setSelected(id);setMode('');setMessage(mode==='new'?'View saved.':'View updated.');}
    }catch(e){setError(e.message);}
  }
  function apply(view){const copy=applyView(view,filters);setFilters(copy.filters);setPeriod(copy.period);setSelected(view.id);setError('');setMessage('');}
  const title={new:'New filter view',update:'Update filter view',rename:'Rename filter view',delete:'Delete filter view'}[mode]||'Filter view';
  return <div className="saved-views" aria-label="Saved filter views">
    <div className="saved-view-picker">
      <select aria-label="Saved filter view" value={selected} onChange={e=>{const view=views.find(v=>v.id===e.target.value);if(view)apply(view);else {setSelected('');setMessage('');}}}>
        <option value="">Custom filters</option>{views.map(v=><option key={v.id} value={v.id}>{v.name}{selected===v.id&&modified?' · modified':''}</option>)}
      </select>
      {modified&&<button type="button" className="filter-tool-button" onClick={()=>apply(active)}>Reapply</button>}
      <button type="button" className="filter-tool-button" onClick={()=>open('new')}><Plus size={14}/>New view</button>
      {active&&<details className="view-menu" ref={menu}><summary aria-label="Manage selected view" title="Manage view"><Settings2 size={15}/></summary><div>
        <button type="button" onClick={()=>open('update')}>Update with current filters</button><button type="button" onClick={()=>open('rename')}>Rename</button><button type="button" onClick={()=>open('delete')}>Delete</button>
      </div></details>}
    </div>
    {!mode&&(error||storageError)&&<p className="saved-view-error" role="alert">{error||storageError}</p>}
    {message&&<span className="saved-view-message" role="status">{message}</span>}
    <dialog ref={dialog} className="view-dialog" aria-labelledby="view-dialog-title" onCancel={()=>setMode('')} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setMode('');}}}>
      <form onSubmit={save}><div className="view-dialog-heading"><h2 id="view-dialog-title">{title}</h2><button type="button" className="filter-tool-button" aria-label="Close dialog" onClick={()=>setMode('')}><X size={16}/></button></div>
        {mode==='delete'?<p>Delete “{active?.name}”? Your current filters will stay in place.</p>:<><label className="view-name"><span>View name</span><input autoFocus required maxLength={80} value={name} placeholder="e.g. Marketplace fulfilled" onChange={e=>setName(e.target.value)}/></label><p>{mode==='rename'?'Only the name changes.': 'Saves your current filters and time grouping. Dates stay independent. Views are saved in this browser.'}</p>{mode==='new'&&<button type="button" className="filter-tool-button" onClick={()=>{setMode('');onConfigure();}}>Choose filters first</button>}</>}
        {(error||storageError)&&<p className="saved-view-error" role="alert">{error||storageError}</p>}
        <div className="view-dialog-actions"><button type="button" className="filter-tool-button" onClick={()=>setMode('')}>Cancel</button><button type="submit" className="refresh">{mode==='delete'?'Delete view':mode==='new'?'Save view':'Save changes'}</button></div>
      </form>
    </dialog>
  </div>;
}
