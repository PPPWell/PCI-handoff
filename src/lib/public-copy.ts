// Reader-facing text policy. Lowercase Italian prepositions are intentionally valid.
const forbidden = /\b(?:AI|IA|ChatGPT|OpenAI|GPT(?:-\d[^\s]*)?)\b|\b(?:A\.I\.|I\.A\.)(?=\s|$)|人工智能|生成式|大语言模型|大模型|智能助手|intelligenza\s+artificiale|artificial\s+intelligence/;
const namedTechnology = /chatgpt|openai|intelligenza\s+artificiale|artificial\s+intelligence/i;
export function assertPublicCopy(value:unknown,source:string):void{
 if(typeof value==='string'){if(forbidden.test(value)||namedTechnology.test(value))throw Error(`${source}: wording is not permitted in public copy`);return;}
 if(Array.isArray(value)){value.forEach((item,index)=>assertPublicCopy(item,`${source}[${index}]`));return;}
 if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))assertPublicCopy(item,`${source}.${key}`);
}

// The site does not explain how it earns money: no commission, revenue-share or business-model wording in content files.
const earningsTalk = /佣金|抽成|分成|怎么赚钱|盈利|商业模式|commission(?![_a-z])|commissions\b|commission[ei]\b|how we (?:earn|make money)|come guadagniamo|revenue[- ]share|affiliate|modello di business/i;
export function assertNoEarningsTalk(value:unknown,source:string):void{
 if(typeof value==='string'){if(earningsTalk.test(value))throw Error(`${source}: the site does not describe how it earns money`);return;}
 if(Array.isArray(value)){value.forEach((item,index)=>assertNoEarningsTalk(item,`${source}[${index}]`));return;}
 if(value&&typeof value==='object')for(const [key,item] of Object.entries(value))assertNoEarningsTalk(item,`${source}.${key}`);
}
