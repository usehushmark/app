export function filterSearchItems(items,query){
  const normalized=query.trim().toLocaleLowerCase();
  return items.map(item=>normalized===''||item.text.toLocaleLowerCase().includes(normalized));
}
