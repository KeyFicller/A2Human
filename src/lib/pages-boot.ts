// Runs before hydration on the static export. GitHub Pages serves index.html
// for unknown agent and task URLs, so park the real path and let Next hydrate
// the home document. The client restores the address after paint.
export const PAGES_BOOT = `(function(){
  var base="/A2Human";
  var key="a2h-path";
  var path=location.pathname;
  if(path===base||path.indexOf(base+"/")===0) path=path.slice(base.length)||"/";
  if(path.length>1&&path.charAt(path.length-1)==="/") path=path.slice(0,-1);
  try { path=decodeURIComponent(path); } catch (e) {}
  var aliases={"/bench":"/publish","/post":"/me","/board":"/me"};
  if(aliases[path]) { location.replace(base+aliases[path]+"/"); return; }
  if(path.indexOf("/board/")===0) path="/tasks/"+path.slice("/board/".length);
  var known={"/":1,"/agents":1,"/me":1,"/publish":1,"/agents/_":1,"/tasks/_":1};
  try {
    if(known[path]) sessionStorage.removeItem(key);
    else {
      sessionStorage.setItem(key, path);
      history.replaceState(null, "", base+"/");
    }
  } catch (e) {}
})();`
