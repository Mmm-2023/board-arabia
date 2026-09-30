import { Link } from 'react-router-dom'
import { MarketingLayout } from '../components/MarketingLayout'
import { useSiteLanguage, type SiteLang } from '../components/SiteLanguage'
import { PARTNER_EMAIL } from '../content/marketing'
import { PRIVACY_NOTICE_AR, PRIVACY_NOTICE_EN, type PrivacyNotice } from '../content/privacyNotice'

export function PrivacyPage() {
  const { lang, setLang } = useSiteLanguage()
  const notice = lang === 'ar' ? PRIVACY_NOTICE_AR : PRIVACY_NOTICE_EN
  return (
    <MarketingLayout path="/privacy">
      <article
        className="ba-privacy mx-auto max-w-3xl px-5 pt-12 pb-20 md:px-10 md:pt-20"
        lang={lang}
        dir={lang === 'ar' ? 'rtl' : 'ltr'}
      >
        <div className="ba-notice-switch">
          <LangButton current={lang} lang="en" label="English" onPick={setLang} />
          <LangButton current={lang} lang="ar" label="العربية" onPick={setLang} />
        </div>
        <NoticeBody notice={notice} />
        <div className="mt-8 space-y-5 text-[1.08rem] leading-relaxed text-ink/70">
          {notice.unchanged.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
            {lang === 'ar' ? 'اهتمام الشركاء' : 'Partner interest'}
          </h2>
          <p>
            {lang === 'ar'
              ? 'يفتح نموذج الشريك مسودة في تطبيق البريد إلى '
              : 'The partner form opens a draft in your mail app to '}
            <a className="border-b border-brass text-ink" href={`mailto:${PARTNER_EMAIL}`}>
              {PARTNER_EMAIL}
            </a>
            {lang === 'ar'
              ? '. لا تُخزَّن الملاحظة على هذا الموقع، وإرسالها لا يحجز مقعد شريك مؤسس.'
              : '. The note is not stored on this website, and sending it does not reserve a Founding Ecosystem Partner seat.'}
          </p>
          <p>
            {lang === 'ar' ? 'اقرأ ' : 'Read the '}
            <Link to="/terms" className="border-b border-brass text-ink">
              {lang === 'ar' ? 'الشروط' : 'terms'}
            </Link>
            {lang === 'ar' ? ' لمعرفة ما تعد به هذه الصفحات وما لا تعد به.' : ' for what these pages do and do not promise.'}
          </p>
        </div>
      </article>
    </MarketingLayout>
  )
}

function NoticeBody({ notice }: { notice: PrivacyNotice }) {
  return (
    <>
      <p className="mb-4 font-serif text-[1.2rem] italic text-ink-soft/70">{notice.kicker}</p>
      <h1 className="font-display text-[clamp(2.5rem,5.5vw,4.2rem)] font-bold leading-[1.02] tracking-[-0.04em] text-balance text-ink">
        {notice.title}
      </h1>
      <p className="mt-4 text-[0.95rem] text-ink/60">{notice.version}</p>
      <div className="mt-8 space-y-5 text-[1.08rem] leading-relaxed text-ink/70">
        <p>{notice.intro}</p>
        {notice.sections.map((section) => (
          <section key={section.heading}>
            <h2 className="pt-4 font-display text-[1.6rem] font-semibold tracking-[-0.03em] text-ink">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3">
                <NoticeText text={paragraph} />
              </p>
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

function NoticeText({ text }: { text: string }) {
  const parts = text.split(/(\[[^[\]]+\])/g)
  return parts.map((part, index) =>
    part.startsWith('[') && part.endsWith(']') ? (
      <bdi key={index} dir="ltr">
        {part}
      </bdi>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

function LangButton({
  current,
  lang,
  label,
  onPick,
}: {
  current: SiteLang
  lang: SiteLang
  label: string
  onPick: (lang: SiteLang) => void
}) {
  return (
    <button type="button" aria-pressed={current === lang} onClick={() => onPick(lang)}>
      {label}
    </button>
  )
}
