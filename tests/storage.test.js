import test from 'node:test';
import assert from 'node:assert/strict';
import {writeProject} from '../src/storage.js';
import {emptyProject,parseProject} from '../src/engine.js';

test('save to existing file writes complete reopenable JSON and closes stream',async()=>{
  globalThis.window={showSaveFilePicker:()=>{throw Error('Should reuse the open file');}};
  let text,closed=false;
  const handle={createWritable:async()=>({write:async s=>{text=s;},close:async()=>{closed=true;}})};
  const p=emptyProject();const result=await writeProject(p,handle);
  assert.equal(closed,true);assert.equal(result.handle,handle);assert.equal(result.download,false);
  const reopened=parseProject(text);assert.equal(reopened.name,p.name);assert.deepEqual(reopened.tasks,p.tasks);assert.equal(reopened.savedAt,result.savedAt);
});
test('Save As selects a new file and leaves the old handle untouched',async()=>{
  let asked=false,written=false;
  const target={createWritable:async()=>({write:async()=>{written=true;},close:async()=>{}})};
  globalThis.window={showSaveFilePicker:async()=>{asked=true;return target;}};
  const old={createWritable:async()=>{throw Error('Old file must not be changed');}};
  const result=await writeProject(emptyProject(),old,true);
  assert.ok(asked&&written);assert.equal(result.handle,target);
});
test('write failures propagate so the UI keeps unsaved changes',async()=>{
  globalThis.window={showSaveFilePicker:async()=>{}};
  const handle={createWritable:async()=>({write:async()=>{throw Error('Disk full');},close:async()=>{}})};
  await assert.rejects(()=>writeProject(emptyProject(),handle),/Disk full/);
});
test('picker cancellation propagates without writing',async()=>{
  globalThis.window={showSaveFilePicker:async()=>{throw new DOMException('Cancelled','AbortError');}};
  await assert.rejects(()=>writeProject(emptyProject(),null),{name:'AbortError'});
});

test('read-only mode rejects file writes before opening a picker or touching a file',async()=>{
  globalThis.window={showSaveFilePicker:()=>{throw Error('Picker must not open');}};
  const handle={createWritable:()=>{throw Error('File must not open');}};
  await assert.rejects(()=>writeProject(emptyProject(),handle,false,{readOnly:true}),/kijkversie/);
});
