import type {Locale} from '@/lib/i18n';
import paths from './social-icons.json';
// Exact Simple Icons v14.0.0 paths; CC0 license: public/licenses/simple-icons-14.0.0.md.
const names={xiaohongshu:'Xiaohongshu',instagram:'Instagram',facebook:'Facebook',tiktok:'TikTok',youtube:'YouTube'};
export function SocialIcons({locale}:{locale:Locale}){
 const pending=locale==='zh'?'账号即将公布':locale==='it'?'Profili in arrivo':'Profiles coming soon';
 return <div className="footer-follow"><div className="social-links" aria-label={locale==='zh'?'关注我们':locale==='it'?'Seguici':'Follow us'}>{(Object.keys(names)as(keyof typeof names)[]).map(id=><span className="social-mark" role="img" aria-label={`${id==='xiaohongshu'&&locale==='zh'?'小红书':names[id]} · ${pending}`} key={id}><svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{paths[id].map((d,index)=><path key={index} d={d} />)}</svg></span>)}</div></div>;
}
