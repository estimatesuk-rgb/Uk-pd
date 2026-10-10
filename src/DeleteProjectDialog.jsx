import React,{useEffect,useState} from 'react';
import {createClient} from '@supabase/supabase-js';

async function listProjectFilePaths(db,projectId){
  const storage=db.storage.from('project-files');
  const found=[];
  async function walk(folder,depth=0){
    if(depth>15)throw new Error('Project file folders are too deeply nested to delete safely.');
    const pageSize=100;
    for(let offset=0;;offset+=pageSize){
      const{data,error}=await storage.list(folder,{limit:pageSize,offset});
      if(error)throw new Error('Could not check uploaded files: '+error.message);
      const items=data||[];
      for(const item of items){
        const path=folder+'/'+item.name;
        if(item.id==null)await walk(path,depth+1);
        else found.push(path);
      }
      if(items.length<pageSize)break;
    }
  }
  await walk(projectId);
  return found;
}

export default function DeleteProjectDialog({project,db,supabaseUrl,publishableKey,onCancel,onDeleted}){
  const[password,setPassword]=useState('');
  const[busy,setBusy]=useState(false);
  const[error,setError]=useState('');
  useEffect(()=>{setPassword('');setError('')},[project?.id]);
  if(!project)return null;

  async function confirmDelete(event){
    event.preventDefault();
    if(busy||!password)return;
    setBusy(true);
    setError('');
    // A separate, non-persistent client checks the password without changing
    // the active app login or causing the app to display its intro again.
    const verifier=createClient(supabaseUrl,publishableKey,{
      auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
    });
    try{
      const{data:current,error:sessionError}=await db.auth.getUser();
      if(sessionError||!current?.user?.email)throw new Error('Your login has expired. Sign in again before deleting a project.');
      const{data:verified,error:passwordError}=await verifier.auth.signInWithPassword({
        email:current.user.email,password
      });
      if(passwordError||verified?.user?.id!==current.user.id)
        throw new Error('Incorrect app password. The project has not been deleted.');

      const filePaths=await listProjectFilePaths(db,project.id);
      const{data:deleted,error:deleteError}=await db.from('projects').delete().eq('id',project.id).select('id');
      if(deleteError)throw new Error('Project could not be deleted: '+deleteError.message);
      if(!deleted?.some(row=>row.id===project.id))
        throw new Error('The database did not confirm deletion. Check your access permissions.');

      // The project's related database records cascade on deletion. Storage
      // objects are separate and must be removed via the Storage API.
      let fileFailures=0;
      for(let i=0;i<filePaths.length;i+=100){
        const{error:removeError}=await db.storage.from('project-files').remove(filePaths.slice(i,i+100));
        if(removeError)fileFailures+=Math.min(100,filePaths.length-i);
      }
      onDeleted(project,{filesFound:filePaths.length,fileFailures});
    }catch(err){
      setError(err?.message||'Unable to delete this project.');
    }finally{
      setPassword('');
      try{await verifier.auth.signOut({scope:'local'})}catch{}
      setBusy(false);
    }
  }

  return <div className="shade">
    <section className="modal deleteProjectDialog" role="dialog" aria-modal="true" aria-labelledby="deleteProjectTitle">
      <div className="modalHead">
        <h2 id="deleteProjectTitle">Delete project</h2>
        <button type="button" className="x" onClick={onCancel} disabled={busy} aria-label="Close delete confirmation">×</button>
      </div>
      <p>You are about to permanently delete <strong>{project.name}</strong>{project.project_no?' ('+project.project_no+')':''}.</p>
      <p className="deleteProjectWarning">The project, related records, RAMS and uploaded project files will be removed. <strong>This cannot be undone.</strong></p>
      <form onSubmit={confirmDelete}>
        <label htmlFor="confirmDeletePassword">Enter your app login password to confirm deletion</label>
        <input id="confirmDeletePassword" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy} autoFocus/>
        {error&&<p className="deleteProjectError" role="alert">{error}</p>}
        <div className="deleteProjectActions">
          <button type="button" className="outline" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="submit" className="danger" disabled={busy||!password}>{busy?'Verifying and deleting…':'Confirm Delete'}</button>
        </div>
      </form>
    </section>
  </div>;
}
