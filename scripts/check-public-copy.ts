import {readFileSync,readdirSync} from 'node:fs';import {join,relative} from 'node:path';import ts from 'typescript';import {parse} from 'yaml';import {assertNoEarningsTalk,assertPublicCopy} from '../src/lib/public-copy';
function files(root:string):string[]{return readdirSync(root,{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(join(root,item.name)):[join(root,item.name)]);}
export function checkPublicCopy(root=process.cwd()){
 let contentFiles=0,sourceFiles=0,offlineFiles=0;
 for(const file of files(join(root,'content')).filter(file=>/\.(yaml|json)$/.test(file))){const content=parse(readFileSync(file,'utf8'));assertPublicCopy(content,relative(root,file));assertNoEarningsTalk(content,relative(root,file));contentFiles++;}
 for(const file of [...files(join(root,'src')).filter(file=>/\.(ts|tsx)$/.test(file)),...files(join(root,'public','v')).filter(file=>/\.js$/.test(file))]){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);const name=relative(root,file);
  function scan(node:ts.Node){if(ts.isStringLiteral(node)||ts.isNoSubstitutionTemplateLiteral(node)||ts.isTemplateHead(node)||ts.isTemplateMiddle(node)||ts.isTemplateTail(node)||ts.isJsxText(node))assertPublicCopy(node.text,`${name}:${source.getLineAndCharacterOfPosition(node.pos).line+1}`);ts.forEachChild(node,scan);}scan(source);
  if(file.endsWith('.js'))offlineFiles++;else sourceFiles++;
 }
 return {contentFiles,sourceFiles,offlineFiles};
}
