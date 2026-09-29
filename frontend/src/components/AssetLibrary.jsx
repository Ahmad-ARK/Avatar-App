import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FolderUp, Image, Video } from 'lucide-react';

export default function AssetLibrary({ backendUrl, settings, setSettings }) {
  const [assets,setAssets]=useState([]); const [scope,setScope]=useState('project'); const refresh=()=>axios.get(`${backendUrl}/api/assets`,{params:{scope}}).then(r=>setAssets(r.data.assets)).catch(()=>setAssets([]));
  // An effect may only return a cleanup function. Returning Axios' Promise made React
  // attempt to call that Promise as cleanup when leaving the generator tab, crashing the
  // whole root exactly when Settings was opened.
  useEffect(()=>{ refresh(); },[backendUrl,scope]);
  const upload=async e=>{ const body=new FormData(); [...e.target.files].forEach(f=>body.append('assets',f)); body.append('scope',scope); body.append('projectId','draft'); body.append('collectionId','default'); await axios.post(`${backendUrl}/api/assets/import`,body); await refresh(); };
  const toggle=async a=>{ const next=!a.enabled; await axios.patch(`${backendUrl}/api/assets/${a.id}`,{enabled:next}); await refresh(); if(scope==='project') setSettings(p=>({...p,projectAssetIds: next ? [...new Set([...(p.projectAssetIds||[]),a.id])] : (p.projectAssetIds||[]).filter(id=>id!==a.id)})); };
  return <section className="settings-section"><div className="flex-between"><h3 className="section-title" style={{margin:0}}><FolderUp size={16}/> Asset library</h3><select className="form-input" style={{width:190}} value={scope} onChange={e=>setScope(e.target.value)}><option value="project">This project</option><option value="library">Reusable defaults</option></select></div>
    <label className="btn btn-primary" style={{marginTop:'1rem'}}><FolderUp size={16}/> Import images/videos<input type="file" multiple accept="image/*,video/*" onChange={upload} style={{display:'none'}}/></label>
    <div className="asset-list">{assets.map(a=><div className="asset-row" key={a.id}>{a.kind==='image'?<img src={`${backendUrl}${a.previewUrl}`} className="asset-thumb"/>:<video src={`${backendUrl}${a.previewUrl}`} className="asset-thumb" muted/>}<span>{a.kind==='video'?<Video size={16}/>:<Image size={16}/>} {a.originalName}</span><span className="setting-note">{a.analysisState}</span><button className="btn" onClick={()=>toggle(a)}>{a.enabled?'Enabled':'Disabled'}</button></div>)}{!assets.length&&<p className="setting-note">No assets in this collection yet.</p>}</div>
  </section>;
}
