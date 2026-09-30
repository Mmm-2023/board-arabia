import { BANNER_VERSION, NOTICE_VERSION } from '../../supabase/functions/_shared/consent_versions.ts'

export const NOTICE_VERSION_LABEL = NOTICE_VERSION
export const BANNER_VERSION_LABEL = BANNER_VERSION

export type NoticeBlock = {
  heading: string
  paragraphs: string[]
}

export type PrivacyNotice = {
  kicker: string
  title: string
  version: string
  intro: string
  sections: NoticeBlock[]
  unchanged: string[]
}

const PLACEHOLDER_ENTITY = '[BOARD ARABIA LEGAL ENTITY]'
const PLACEHOLDER_CONFIRM = '[TO CONFIRM]'
const PLACEHOLDER_TRANSFER = '[TRANSFER SAFEGUARDS TO CONFIRM]'

export const PRIVACY_NOTICE_EN: PrivacyNotice = {
  kicker: 'Privacy',
  title: 'Privacy notice.',
  version: `Notice version ${NOTICE_VERSION}. Dated 30 September 2026.`,
  intro:
    'This notice explains what Board Arabia collects, why, and how long it is kept. The legal entity name, commercial registration, address, privacy contact, and transfer wording below stay as placeholders until they are confirmed.',
  sections: [
    {
      heading: 'Who controls this data',
      paragraphs: [
        `Controller: ${PLACEHOLDER_ENTITY}.`,
        `Commercial registration: ${PLACEHOLDER_CONFIRM}.`,
        `Address: ${PLACEHOLDER_CONFIRM}.`,
        `Privacy contact: ${PLACEHOLDER_CONFIRM}.`,
        `Data protection officer: ${PLACEHOLDER_CONFIRM}.`,
      ],
    },
    {
      heading: 'What we collect',
      paragraphs: [
        'Application and member data: name, email, LinkedIn, title, company, turnover or AUM band, optional phone, commercial registration number, sector tags, statement, first-touch campaign values, and referrer host.',
        'Site analytics: pages, engaged time, scroll depth, coarse location taken from an IP address that is not stored, campaign source, and named events.',
        'If you leave the public-totals box checked, a verified capacity figure can be added into a platform sum after you are admitted. The public site shows that sum only. It does not show your name, your company, or your amount.',
      ],
    },
    {
      heading: 'Why we use it',
      paragraphs: [
        'We use this data to assess applications, run membership, and measure and improve the site and campaigns.',
      ],
    },
    {
      heading: 'Legal basis',
      paragraphs: [
        'Consent: analytics cookies and tracking after you choose Accept.',
        'Legitimate interest: anonymous aggregate visit counts before a choice, with no identifier.',
        'Contract, or steps before a contract: processing an application.',
      ],
    },
    {
      heading: 'Who receives it',
      paragraphs: [
        'PostHog processes site analytics. Supabase hosts application and member data. We do not sell personal data.',
      ],
    },
    {
      heading: 'Where it is processed',
      paragraphs: [
        'Application data and site analytics are stored and processed in Frankfurt, Germany (European Union).',
        PLACEHOLDER_TRANSFER,
      ],
    },
    {
      heading: 'How long we keep it',
      paragraphs: [
        'Basic accounts that never submit a request are deleted at 120 days, with a reminder at 90 days.',
        'Rejected, declined, withdrawn, or closed requests, and legacy applications, are deleted 12 months after the decision.',
        'Members who leave are deleted or anonymised within 24 months of exit, unless a legal hold applies.',
        'Analytics events are kept for 13 months maximum. The consent log is kept for 13 months. The marketing stats cache is kept for 24 hours.',
      ],
    },
    {
      heading: 'Your rights',
      paragraphs: [
        'You can ask to be informed, to access your data, to obtain a copy, to correct it, and to have it destroyed. You can withdraw consent at any time. You can complain to SDAIA (the Saudi Data and AI Authority).',
        `To exercise these rights, write to the privacy contact in the first section once it is published. Until then the contact remains ${PLACEHOLDER_CONFIRM}.`,
      ],
    },
    {
      heading: 'Date and changes',
      paragraphs: [
        'This version is dated 30 September 2026. When the notice changes, the version and date on this page change with it. A new banner version asks you to choose again.',
      ],
    },
  ],
  unchanged: [
    'This site does not publish a member directory, does not sell personal information, and does not open a public calendar.',
    'There is no checkout on these pages, so they do not take a card.',
  ],
}

export const PRIVACY_NOTICE_AR: PrivacyNotice = {
  kicker: 'الخصوصية',
  title: 'إشعار الخصوصية.',
  version: `إصدار الإشعار ${NOTICE_VERSION}. التاريخ 30 سبتمبر 2026.`,
  intro:
    'يوضح هذا الإشعار ما الذي تجمعه Board Arabia، ولماذا، ومدة الاحتفاظ به. يبقى اسم الكيان القانوني والسجل التجاري والعنوان وجهة تواصل الخصوصية وصياغة النقل عناصر نائبة إلى أن يتم تأكيدها.',
  sections: [
    {
      heading: 'من يتحكم في هذه البيانات',
      paragraphs: [
        `الجهة المتحكمة: ${PLACEHOLDER_ENTITY}.`,
        `السجل التجاري: ${PLACEHOLDER_CONFIRM}.`,
        `العنوان: ${PLACEHOLDER_CONFIRM}.`,
        `جهة تواصل الخصوصية: ${PLACEHOLDER_CONFIRM}.`,
        `مسؤول حماية البيانات: ${PLACEHOLDER_CONFIRM}.`,
      ],
    },
    {
      heading: 'ماذا نجمع',
      paragraphs: [
        'بيانات الطلب والعضوية: الاسم، والبريد الإلكتروني، ولينكدإن، والمسمى، والشركة، ونطاق حجم الأعمال أو الأصول المدارة، والهاتف الاختياري، ورقم السجل التجاري، ووسوم القطاعات، والنص التعريفي، وقيم أول زيارة للحملة، ومضيف صفحة الإحالة.',
        'تحليلات الموقع: الصفحات، ووقت التفاعل، وعمق التمرير، والموقع التقريبي المستمد من عنوان شبكة لا يُخزَّن، ومصدر الحملة، والأحداث المسماة.',
        'إذا أبقيت خانة المجاميع العامة محددة، يمكن إضافة رقم القدرة المتحقق منه إلى مجموع المنصة بعد قبولك. يعرض الموقع العام ذلك المجموع فقط. لا يعرض اسمك ولا شركتك ولا مبلغك.',
      ],
    },
    {
      heading: 'لماذا نستخدمها',
      paragraphs: [
        'نستخدم هذه البيانات لتقييم الطلبات، وإدارة العضوية، وقياس الموقع والحملات وتحسينها.',
      ],
    },
    {
      heading: 'الأساس النظامي',
      paragraphs: [
        'الموافقة: ملفات تعريف الارتباط للتحليلات والتتبع بعد اختيار موافق.',
        'المصلحة المشروعة: عدّ الزيارات المجمعة المجهولة قبل الاختيار، من غير معرّف.',
        'العقد، أو الخطوات السابقة للعقد: معالجة طلب الانضمام.',
      ],
    },
    {
      heading: 'من يستلمها',
      paragraphs: [
        'تعالج PostHog تحليلات الموقع. تستضيف Supabase بيانات الطلبات والأعضاء. لا نبيع البيانات الشخصية.',
      ],
    },
    {
      heading: 'أين تُعالج',
      paragraphs: [
        'تُخزَّن بيانات الطلبات وتحليلات الموقع وتُعالج في فرانكفورت، ألمانيا (الاتحاد الأوروبي).',
        PLACEHOLDER_TRANSFER,
      ],
    },
    {
      heading: 'كم نحتفظ بها',
      paragraphs: [
        'تُحذف الحسابات الأساسية التي لا يُقدَّم معها طلب بعد 120 يوما، مع تذكير عند 90 يوما.',
        'تُحذف الطلبات المرفوضة أو المغلقة أو المنسحبة، وطلبات النموذج السابق، بعد 12 شهرا من القرار.',
        'يُحذف الأعضاء الذين يغادرون أو تُخفى هويتهم خلال 24 شهرا من المغادرة، ما لم يُطبَّق حفظ نظامي.',
        'تُحفظ أحداث التحليلات 13 شهرا كحد أقصى. يُحفظ سجل الموافقة 13 شهرا. تُحفظ ذاكرة إحصاءات التسويق المؤقتة 24 ساعة.',
      ],
    },
    {
      heading: 'حقوقك',
      paragraphs: [
        'يمكنك أن تطلب العلم، والوصول إلى بياناتك، والحصول على نسخة، وتصحيحها، وإتلافها. يمكنك سحب الموافقة في أي وقت. يمكنك التقدم بشكوى إلى سدايا (الهيئة السعودية للبيانات والذكاء الاصطناعي).',
        `لممارسة هذه الحقوق، راسل جهة تواصل الخصوصية في القسم الأول عندما تُنشر. إلى ذلك الحين تبقى جهة التواصل ${PLACEHOLDER_CONFIRM}.`,
      ],
    },
    {
      heading: 'التاريخ والتغييرات',
      paragraphs: [
        'تاريخ هذا الإصدار 30 سبتمبر 2026. عند تغيير الإشعار يتغير رقم الإصدار والتاريخ في هذه الصفحة. إذا تغيّر إصدار الشريط نطلب منك الاختيار من جديد.',
      ],
    },
  ],
  unchanged: [
    'لا ينشر هذا الموقع دليلا عاما للأعضاء، ولا يبيع المعلومات الشخصية، ولا يفتح تقويما عاما.',
    'لا يوجد دفع في هذه الصفحات، فهي لا تأخذ بطاقة.',
  ],
}

export const CONSENT_COPY = {
  en: {
    body: 'We use analytics to understand how boardarabia.com is used and to improve it. With your permission we set cookies to measure visits, time on page and which campaigns brought you here. Without it we only count anonymous visits. Data is hosted in Frankfurt, Germany.',
    accept: 'Accept',
    reject: 'Reject',
    notice: 'Privacy notice',
    settings: 'Cookie settings',
    label: 'Analytics cookies',
  },
  ar: {
    body: 'نستخدم أدوات التحليل لفهم كيفية استخدام موقع boardarabia.com وتحسينه. بإذنك، نضع ملفات تعريف الارتباط لقياس الزيارات ووقت التصفح في كل صفحة والحملات التي أوصلتك إلينا. ومن دون إذنك نكتفي بعدّ الزيارات بشكل مجهول الهوية. تُستضاف البيانات في فرانكفورت، ألمانيا.',
    accept: 'موافق',
    reject: 'رفض',
    notice: 'إشعار الخصوصية',
    settings: 'إعدادات ملفات تعريف الارتباط',
    label: 'ملفات تعريف ارتباط التحليلات',
  },
} as const
