export const IDLE_MINUTES = [5,15,30];

// Check expiry at every guarded action as well as on a timer. Background tabs
// may throttle timers; an expired session must not be revived by a new click.
export function createIdleSession({onExpire,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}) {
  let active=false,minutes=5,last=0,timer=null;
  function stop(){active=false;if(timer!==null)clearTimer(timer);timer=null;}
  function check(){
    if(active && now()-last>=minutes*60000){stop();onExpire();return false;}
    return active;
  }
  function schedule(){
    if(timer!==null)clearTimer(timer);
    if(active)timer=setTimer(()=>{if(check())schedule();},Math.max(1,minutes*60000-(now()-last)));
  }
  return {
    start(){stop();active=true;last=now();schedule();},
    stop,check,
    touch(){if(!check())return;last=now();schedule();},
    setMinutes(value){if(!IDLE_MINUTES.includes(value))throw new Error('Choose 5, 15 or 30 minutes.');check();minutes=value;if(active){check();schedule();}},
    getMinutes(){return minutes;},
  };
}
