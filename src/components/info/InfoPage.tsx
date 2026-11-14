import {SubscriptionPanel} from "@/components/coupons/SubscriptionPanel";
import {SubscribeForm} from "@/components/coupons/SubscribeForm";
import Link from "next/link";
import { getInfoContent } from "@/lib/info/load";
import { legalPageIds, type InfoPageId } from "@/lib/info/routes";
import type { InfoContent, InfoSection } from "@/lib/info/types";
import type { Locale } from "@/lib/i18n";
import { ui } from "@/lib/i18n";
import type { RouteRegistry } from "@/lib/catalog/types";
import { Breadcrumbs, Section } from "@/components/content/ContentShared";
import { Icon } from "@/components/ui/Icon";
import { CookieSettingsButton } from "@/components/site/SiteInteractions";

/** Info copy may carry links written as [label](/path) or [label](mailto:…); everything else stays plain text. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\((?:\/|mailto:)[^)\s]*\))/g);
  return <>{parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (!link) return part;
    return link[2].startsWith("mailto:") ? <a key={index} className="text-link" href={link[2]}>{link[1]}</a> : <Link key={index} className="text-link" href={link[2]}>{link[1]}</Link>;
  })}</>;
}

function ContentSections({ sections, faq = false, numbered = false }: { sections: InfoSection[]; faq?: boolean; numbered?: boolean }) {
  return <div className={`info-sections ${numbered ? "info-sections--numbered" : ""}`}>{sections.map((section, index) => <Section key={section.id} id={section.id} title={section.heading}>
    {numbered && <span className="section-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>}
    {section.paragraphs.map((text, index) => <p key={index}><RichText text={text} /></p>)}
    {section.bullets && <ul>{section.bullets.map((text) => <li key={text}><RichText text={text} /></li>)}</ul>}
    {faq && section.questions?.map((item) => <details className="faq-item" key={item.question}><summary>{item.question}<Icon name="chevron" /></summary><p>{item.answer}</p></details>)}
  </Section>)}</div>;
}

// Partners and support are reached by email; the address is the one the legal pages name.
function ContactByEmail({ content, partnership }: { content: InfoContent; partnership: boolean }) {
  const l = content.labels, email = partnership ? l.partnerEmail : l.supportEmail;
  return <section id="contact" className="contact-email-section" aria-labelledby="contact-heading"><h2 id="contact-heading">{l.contactHeading}</h2><p>{partnership ? l.contactPartners : l.contactSupport}</p>
    <a className="button button--primary" href={`mailto:${email}`}>{email}</a>
  </section>;
}

/** Policies: one list of the four documents. On a policy page it sits in a side column with the page's own contents
 * (from 960px); below that the header's back arrow leads to the list, so the page carries no second navigation. */
function LegalPage({ id, locale, content }: { id: InfoPageId; locale: Locale; content: InfoContent }) {
  const page = content.pages[id], l = content.labels, index = id === "legal";
  const policies = <ul>{legalPageIds.map((other) => <li key={other}><Link href={`/${locale}/${other}/`} aria-current={other === id ? "page" : undefined}>{content.pages[other].title}</Link></li>)}</ul>;
  return <main id="main-content" className="content-page info-page legal-page container" tabIndex={-1}>
    <Breadcrumbs wide locale={locale} items={[{ text: ui[locale].home, href: `/${locale}/` }, index ? { text: page.title } : { text: content.pages.legal.title, href: `/${locale}/legal/` }]} />
    <div className={index ? "legal-layout legal-layout--index" : "legal-layout"}>
      {!index && <aside className="legal-aside">
        <nav aria-label={content.pages.legal.title}><p className="legal-aside__heading">{content.pages.legal.title}</p>{policies}</nav>
        <nav aria-label={l.legalOnThisPage}><p className="legal-aside__heading">{l.legalOnThisPage}</p><ol>{page.sections.map((section) => <li key={section.id}><a href={`#${section.id}`}>{section.heading}</a></li>)}</ol></nav>
      </aside>}
      <div className="legal-body">
        <header className="info-heading"><h1>{page.title}</h1><p>{page.description}</p>{!index && <p className="legal-effective">{l.legalEffective}</p>}</header>
        {index && <ul className="policy-list">{legalPageIds.map((other) => <li key={other}><Link href={`/${locale}/${other}/`}><span className="policy-list__title">{content.pages[other].title}</span><span className="policy-list__note">{content.pages[other].description}</span><Icon name="arrow" /></Link></li>)}</ul>}
        <ContentSections sections={page.sections} />
        {id === "legal/cookies" && <CookieSettingsButton />}
      </div>
    </div>
  </main>;
}

export function InfoPage({ id, locale }: { id: InfoPageId; locale: Locale; registry?: RouteRegistry }) {
  const content = getInfoContent(locale), page = content.pages[id], l = content.labels, legal = id === "legal" || id.startsWith("legal/"), status = id === "subscribe/confirm" || id === "subscribe/unsubscribe";
  if (legal) return <LegalPage id={id} locale={locale} content={content} />;
  return <main id="main-content" className={`content-page info-page container ${id === "subscribe" ? "auth-page" : ""}`} tabIndex={-1}>
    <Breadcrumbs wide locale={locale} items={[{ text: ui[locale].home, href: `/${locale}/` }, { text: page.title }]} />
    <header className="info-heading"><h1>{page.title}</h1><p>{page.description}</p></header>
    {page.status === "preview" && !status && id !== "subscribe" && <p className="preview-notice">{l.preview}</p>}
    <ContentSections sections={status ? [] : id === "subscribe" ? [] : page.sections} faq={id === "help"} numbered={id === "partners" || id === "editorial-policy"} />
    {(id === "partners" || id === "support") && <ContactByEmail content={content} partnership={id === "partners"} />}
    {id === "subscribe" && <div className="auth-card"><SubscribeForm locale={locale} source="subscribe-page" /></div>}
    {status && <SubscriptionPanel locale={locale} mode={id === "subscribe/unsubscribe" ? "unsubscribe" : id === "subscribe/confirm" ? "confirm" : "subscribe"} />}
  </main>;
}
