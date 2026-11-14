const keys=['area','price','tag','offer']as const;
type FilterKey=typeof keys[number];
export function filterCategoryHref(path:string,query:string):string{
 const current=new URLSearchParams(query),next=new URLSearchParams();
 for(const key of keys){const value=current.get(key);if(value)next.set(key,value);}
 return path+(next.size?'?'+next.toString():'');
}
function navigate(url:URL){
 if(url.href===window.location.href)return;
 window.history.pushState(window.history.state,'',url.pathname+url.search+url.hash);
 window.dispatchEvent(new Event('pci:filters'));
}
export function setPlaceFilter(key:FilterKey,value:string){const url=new URL(window.location.href);if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);navigate(url);}
export function clearPlaceFilters(){const url=new URL(window.location.href);for(const key of keys)url.searchParams.delete(key);navigate(url);}
