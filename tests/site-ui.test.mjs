import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSearchItems} from '../src/site-search.mjs';

test('search keeps matching docs and roadmap items visible',()=>{
  const items=[
    {text:'Approve the exact outcome.',visible:true},
    {text:'Token status.',visible:true},
    {text:'Independent security review.',visible:true}
  ];

  assert.deepEqual(filterSearchItems(items,'security'),[false,false,true]);
});
