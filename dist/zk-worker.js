importScripts('/vendor/snarkjs.min.js');
let key;
self.onmessage=async({data})=>{
  const {id,action,input,proof,signals}=data;
  try{
    if(action==='prove'){
      const result=await snarkjs.groth16.fullProve(input,new URL('/zk/reputation.wasm',self.location.href).href,new URL('/zk/reputation.zkey',self.location.href).href,undefined,undefined,{singleThread:true});
      self.postMessage({id,ok:true,result});
    }else if(action==='verify'){
      if(!key){const response=await fetch('/zk/verification_key.json');if(!response.ok)throw new Error('Verification key unavailable');key=await response.json();}
      const accepted=await snarkjs.groth16.verify(key,signals,proof);
      self.postMessage({id,ok:true,result:{accepted}});
    }else throw new Error('Unknown worker action');
  }catch(error){self.postMessage({id,ok:false,error:String(error.message||error)});}
};
