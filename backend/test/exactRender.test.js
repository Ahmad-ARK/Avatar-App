import test from 'node:test'; import assert from 'node:assert/strict'; import os from 'os'; import path from 'path'; import fs from 'fs-extra'; import { spawn } from 'child_process'; import ffmpegStatic from 'ffmpeg-static';
import { runFFmpeg, probeMedia } from '../src/utils/ffmpegHelpers.js'; import { SegmentRenderer } from '../src/compositor/SegmentRenderer.js';
import { FinalCompositor } from '../src/compositor/FinalCompositor.js';

function sample(pathname, second) { return new Promise((resolve,reject)=>{ const p=spawn(ffmpegStatic,['-ss',String(second),'-i',pathname,'-vf','scale=1:1','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']); const chunks=[]; p.stdout.on('data',d=>chunks.push(d)); p.on('close',c=>c===0?resolve(Buffer.concat(chunks).subarray(0,3)):reject(new Error('sample failed'))); }); }

test('exact render keeps neutral intervals non-avatar and preserves total duration', {timeout:30000}, async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avatar-render-')); const input=path.join(dir,'avatar.mp4');
  await runFFmpeg(['-f','lavfi','-i','color=c=red:s=160x90:r=10:d=4','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=4','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-y',input],'test fixture');
  const renderer=new SegmentRenderer(); const opts={exactVisibility:true,output:{resolution:'160x90',fps:10}};
  const pieces=[
    await renderer.render({id:1,start_time:0,end_time:1.5,layout:'visual_only',avatarAppearanceId:null},input,dir,null,opts),
    await renderer.render({id:2,start_time:1.5,end_time:2.5,layout:'full_avatar',avatarAppearanceId:1,motion:'none'},input,dir,null,opts),
    await renderer.render({id:3,start_time:2.5,end_time:4,layout:'visual_only',avatarAppearanceId:null},input,dir,null,opts),
  ];
  const list=path.join(dir,'list.txt'); await fs.writeFile(list,pieces.map(p=>`file '${p.replace(/\\/g,'/')}'`).join('\n')); const out=path.join(dir,'out.mp4'); await runFFmpeg(['-f','concat','-safe','0','-i',list,'-c','copy','-y',out],'test concat');
  const info=await probeMedia(out); assert.ok(Math.abs(info.duration-4)<0.15);
  const neutral=await sample(out,.5), avatar=await sample(out,2); assert.ok(neutral[0]<80 && neutral[2]<100,'outside interval should be dark neutral card'); assert.ok(avatar[0]>150 && avatar[1]<80,'inside interval should show red avatar');
});

test('video asset source offset is honored while narration audio stays primary', {timeout:30000}, async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'avatar-offset-')); const avatar=path.join(dir,'avatar.mp4'); const red=path.join(dir,'red.mp4'), blue=path.join(dir,'blue.mp4'), asset=path.join(dir,'asset.mp4');
  await runFFmpeg(['-f','lavfi','-i','color=c=black:s=160x90:r=10:d=1','-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=1','-shortest','-c:v','libx264','-c:a','aac','-y',avatar]);
  await runFFmpeg(['-f','lavfi','-i','color=c=red:s=160x90:r=10:d=1','-c:v','libx264','-y',red]); await runFFmpeg(['-f','lavfi','-i','color=c=blue:s=160x90:r=10:d=1','-c:v','libx264','-y',blue]);
  const list=path.join(dir,'asset-list.txt'); await fs.writeFile(list,`file '${red.replace(/\\/g,'/')}'\nfile '${blue.replace(/\\/g,'/')}'`); await runFFmpeg(['-f','concat','-safe','0','-i',list,'-c','copy','-y',asset]);
  const renderer=new SegmentRenderer(); const out=await renderer.render({id:1,start_time:0,end_time:.8,layout:'visual_only',assetPath:asset,sourceInSeconds:1},avatar,dir,null,{exactVisibility:true,output:{resolution:'160x90',fps:10}}); const pixel=await sample(out,.3); assert.ok(pixel[2]>120 && pixel[0]<100,'trimmed excerpt should start in blue section'); const info=await probeMedia(out); assert.equal(info.hasAudio,true);
});

test('exact finalization maps the uninterrupted source narration track',()=>{ const args=new FinalCompositor().buildFinalizeArgs({concatPath:'visual.mp4',outPath:'out.mp4',captionsPath:null,gradeFilter:'',musicPath:null,narrationPath:'narration.mp4',encoder:{codec:'libx264',preset:'fast'}}); const maps=args.reduce((out,v,i)=>v==='-map'?[...out,args[i+1]]:out,[]); assert.deepEqual(maps,['[vout]','1:a']); });
test('SFX track is mixed after continuous narration',()=>{ const args=new FinalCompositor().buildFinalizeArgs({concatPath:'visual.mp4',outPath:'out.mp4',captionsPath:null,gradeFilter:'',musicPath:null,narrationPath:'narration.mp4',sfxPath:'sfx.wav',encoder:{codec:'libx264',preset:'fast'}}); const maps=args.reduce((out,v,i)=>v==='-map'?[...out,args[i+1]]:out,[]); assert.deepEqual(maps,['[vout]','[sfxout]']); assert.match(args[args.indexOf('-filter_complex')+1],/\[1:a\]\[2:a\]amix/); });
