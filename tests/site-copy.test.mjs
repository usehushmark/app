import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('copy controls fall back when the browser clipboard rejects the request',async()=>{
  const script=await readFile('dist/site.js','utf8');
  let handler;
  let fallbackUsed=false;
  const status={textContent:'',dataset:{}};
  const control={
    dataset:{contractAddress:'F1vfNJ5QiGP5j8P7pMUaCCVJterQVn9WdzgbHQgGpump',copySuccess:'CA copied',copyError:'Copy failed.'},
    querySelector:()=>status,
  };
  const button={
    closest:()=>control,
    addEventListener:(_type,next)=>{handler=next;},
  };
  const document={
    querySelectorAll:selector=>selector==='[data-copy-contract]'?[button]:[],
    createElement:()=>({style:{},setAttribute:()=>{},select:()=>{},remove:()=>{}}),
    body:{append:()=>{}},
    execCommand:command=>{fallbackUsed=command==='copy';return true;},
  };
  vm.runInNewContext(script,{document,navigator:{clipboard:{writeText:async()=>{throw new Error('Permission denied');}}},setTimeout:fn=>{fn();return 1;},clearTimeout:()=>{}});

  await handler();

  assert.equal(fallbackUsed,true);
  assert.equal(status.textContent,'CA copied');
});