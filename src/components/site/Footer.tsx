import Link from 'next/link';
import type {HomeContent} from '@/lib/content';
import type {RouteRegistry} from '@/lib/catalog/types';
import {pathFor} from '@/lib/catalog/routes';
import {ui} from '@/lib/i18n';
import {categoryIds, categoryNames, isLaunched} from '@/lib/routes';
import {CookieSettingsButton} from './SiteInteractions';
import {analyticsEnabled} from '@/lib/consent';
import {Brand} from './Header';

const groupNames = {
  zh: {explore: '逛一逛', about: '了解与帮助', business: '商家与条款', legal: '条款与政策', merchant: '商家登录'},
  it: {explore: 'Esplora', about: 'Chi siamo e aiuto', business: 'Ristoranti e termini', legal: 'Termini e informative', merchant: 'Area ristoranti'},
  en: {explore: 'Explore', about: 'About and help', business: 'Business and terms', legal: 'Terms and policies', merchant: 'Restaurant login'},
};

export function Footer({content, registry}: {content: HomeContent; registry: RouteRegistry}) {
  const locale = content.locale, text = ui[locale], names = groupNames[locale];
  const about = [['about', text.about], ['editorial-policy', text.editorial], ['help', text.help], ['support', text.support]];
  const links = (items: string[][]) => items.map(([id, label]) => {
    const href = pathFor(registry, `info:${id}`, locale);
    return href ? <li key={id}><Link className="footer-link" href={href}>{label}</Link></li> : null;
  });
  // Only sections that are open: the header and bottom tabs already show every category.
  const explore = categoryIds.filter(isLaunched).map(id => ({id, href: pathFor(registry, `category:florence:${id}`, locale)})).filter(item => item.href);

  return <footer className="site-footer"><div className="container footer-inner">
    <div className="footer-top">
      <div className="footer-brand"><Brand locale={locale} /><p className="footer-tagline">{content.footer.description}</p></div>
      <nav className="footer-nav" aria-label={text.footerNavigation}>
        {/* The bottom tabs already lead to the sections on phones; this group shows from tablet width up. */}
        <div className="footer-group footer-group--explore"><p className="footer-heading">{names.explore}</p><ul>{explore.map(item => <li key={item.id}><Link className="footer-link" href={item.href!}>{categoryNames[locale][item.id]}</Link></li>)}{links([['subscribe', text.subscribe]])}</ul></div>
        <div className="footer-group"><p className="footer-heading">{names.about}</p><ul>{links(about)}</ul></div>
        <div className="footer-group"><p className="footer-heading">{names.business}</p><ul>{links([['partners', text.partners]])}<li><Link className="footer-link" href="/it/merchant/login/" hrefLang="it">{names.merchant}</Link></li>{links([['legal', names.legal]])}{analyticsEnabled&&<li><CookieSettingsButton className="footer-link" /></li>}</ul></div>
      </nav>
    </div>
    <div className="footer-bottom"><p className="company-info">{content.footer.company}</p></div>
  </div></footer>;
}
